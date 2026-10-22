/**
 * Would a shared source cache have answered this search? A yes/no per call,
 * counted before anyone builds the cache.
 *
 * Why a counter and not a cache: PRIVACY.md promises no record of the text a
 * student checks, and a cache of search results keyed on a claim is a record
 * of which claims were searched. The judgement that decides it — how often
 * two people search the same claim — needs no such record: a keyed hash of
 * the normalised claim, kept in memory for a fortnight, says whether this
 * claim has been seen without saying what it was. Nothing here touches the
 * disk, and a restart forgets everything.
 *
 * Since 2026-10-22 (owner: "start the repeat counter"):
 * - The hash is an HMAC under a key made at boot and never stored or logged.
 *   A plain SHA-256 of a common sentence could be matched by hashing guesses;
 *   without the key, it cannot.
 * - It tells a repeat by ANOTHER caller from the same caller searching again.
 *   Only the first is what a cache shared between people would save; the
 *   second is a re-press, which the extension's own per-document cache and
 *   the caller's hourly window already deal with.
 * - It keeps counts per scope since the last hourly line (`takeRepeatLines`,
 *   printed with the usage lines in server.js), so the rate needs no grep.
 *
 * A restart (every deploy) forgets what was seen, so the rate is a lower bound
 * while deploys are frequent. The log line on /api/sources still carries
 * `wouldHit=1|0` per call.
 */
import { createHmac, randomBytes } from "node:crypto";

export const SEEN_TTL_MS = 14 * 24 * 3600_000;
export const SEEN_MAX = 20_000;
const CALLERS_KEPT = 4; // per claim: enough to tell "someone else" from "the same one again"

const KEY = randomBytes(32); // this process only: never written, never logged
const seen = new Map(); // keyed hash → { t: last seen (ms), callers: [keyed caller hashes] }
const counts = new Map(); // scope → { searches, seen, other } since the last take

// Quotes dropped, anything but letters, digits, % $ and the decimal point
// becomes a space, runs of space collapse, and the sentence's own final
// period goes — "…is 100%." and "…is 100%" are one claim.
export const normalizeClaim = (claim) => String(claim ?? "").toLowerCase().replace(/[“”"'‘’]/g, "").replace(/[^\p{L}\p{N}%.$ ]+/gu, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
const keyed = (s) => createHmac("sha256", KEY).update(s).digest("hex").slice(0, 32);
export const claimHash = (claim, scope = "sources") => keyed(`${scope}\n${normalizeClaim(claim)}`);

/**
 * Records the claim as searched now, in `scope` (one search route's kind of
 * answer, so the extension's and the desktop's never count as each other's),
 * by `caller` (a caller id; hashed, never kept as given). Returns whether the
 * claim had been seen in that scope within SEEN_TTL_MS, by anyone.
 */
export function noteClaimSeen(claim, now = Date.now(), { scope = "sources", caller = null } = {}) {
  const h = claimHash(claim, scope);
  const who = caller ? keyed(`caller\n${caller}`) : null;
  const entry = seen.get(h);
  const hit = entry != null && now - entry.t < SEEN_TTL_MS;
  const other = hit && who != null && !entry.callers.includes(who);

  const c = counts.get(scope) ?? { searches: 0, seen: 0, other: 0 };
  c.searches += 1;
  if (hit) c.seen += 1;
  if (other) c.other += 1;
  counts.set(scope, c);

  const callers = hit ? entry.callers.filter((x) => x !== who) : [];
  if (who) callers.push(who);
  seen.delete(h); // re-insert so Map order is least-recent first
  seen.set(h, { t: now, callers: callers.slice(-CALLERS_KEPT) });
  if (seen.size > SEEN_MAX) {
    for (const [k, e] of seen) {
      if (seen.size <= SEEN_MAX && now - e.t < SEEN_TTL_MS) break;
      seen.delete(k);
    }
  }
  return hit;
}

/** One line per scope searched since the last take, then the counts start again (what was seen is kept). */
export function takeRepeatLines() {
  const pct = (part, whole) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : "-");
  const lines = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([scope, c]) =>
    `[tracely] repeats scope=${scope} searches=${c.searches} seen=${c.seen} (${pct(c.seen, c.searches)}) other=${c.other} (${pct(c.other, c.searches)}) remembered=${seen.size}`);
  counts.clear();
  return lines;
}

export function seenSize() { return seen.size; }
export function resetSeen() { seen.clear(); counts.clear(); }
