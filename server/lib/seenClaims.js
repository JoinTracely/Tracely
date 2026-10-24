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
export function resetSeen() { seen.clear(); counts.clear(); buckets.clear(); bucketCounts.clear(); }

/* ── candidate buckets (cost counters, 2026-10-24) ─────────────────────────
 * Would sources found for an EARLIER search serve this claim? A looser match
 * than the exact repeat above (claimFeatures):
 * - A claim that states a figure and names someone ("73% … National
 *   Education Association") is bucketed by its figures, names, negation and
 *   direction alone, so another student's wording of the same statistic
 *   lands in the same bucket.
 * - Any other claim is bucketed by those and its longer content words,
 *   ignoring word order, short words and word endings.
 * - Fewer than three features (a short, generic sentence) gets no bucket.
 * Counted only; nothing is reused. Every claim would still be judged afresh
 * against such sources, so a hit is an upper bound on what judging known
 * sources first could serve. `otherBacked`: the bucket was searched by
 * ANOTHER caller and that search ended with a backing source, the case where
 * a shared candidate could have replaced the paid search.
 *
 *   [tracely] candidates scope=lookup|search|correction searches=…
 *             bucketed=… seen=… (n%) other=… (n%) otherBacked=… (n%)
 *
 * The same rules as the repeats: an HMAC under the boot key, in memory, a
 * fortnight, forgotten on restart.
 */
const NEGATION = /\b(?:not|no|never|none|nor|neither|without|cannot)\b|n['’]t\b/i;
const UP = /\b(?:increas\w*|rise|rises|rising|rose|grow\w*|grew|more|higher|raise[sd]?|gain\w*|improv\w*)\b/i;
const DOWN = /\b(?:decreas\w*|fall\w*|fell|drop\w*|fewer|less|lower\w*|reduc\w*|declin\w*)\b/i;
const FIGURE = /(\d[\d,]*(?:\.\d+)?)\s*(%|percent|per cent|times|million|billion|thousand|hours?|years?|days?|minutes?)?/gi;
const FEATURE_STOP = new Set(["according", "between", "because", "however", "therefore", "through", "without", "within", "around", "should", "would", "could", "become", "becomes", "people", "really", "rather", "others", "another", "whether", "during", "before", "almost", "always", "itself", "themselves"]);

// As in the extension (extension/CLAUDE.md, "An acronym is a name"): these are words, not names.
const NOT_NAMES = new Set(["ai", "us", "uk", "eu"]);

export function claimFeatures(claim) {
  // A citation in brackets ("(NEA, 2024)") says who, not what: its year is not the claim's.
  const s = String(claim ?? "").replace(/\([^()]*\d{4}[^()]*\)/g, " ");
  const figures = [...s.matchAll(FIGURE)].map((m) => `#${m[1].replace(/,/g, "")}${String(m[2] ?? "").toLowerCase().replace(/^(?:percent|per cent)$/, "%").replace(/s$/, "")}`);
  const words = (s.match(/\p{L}[\p{L}'’]*/gu) ?? []); // a hyphen splits: "AI-powered" is "AI" and "powered"
  // A name: an acronym anywhere, or a capitalised word that does not start the sentence.
  const names = words.filter((w, i) => (/^\p{Lu}{2,}$/u.test(w) || (i > 0 && /^\p{Lu}\p{Ll}/u.test(w))) && !NOT_NAMES.has(w.toLowerCase())).map((w) => `@${w.toLowerCase()}`);
  const marks = [NEGATION.test(s) && "!not", UP.test(s) && "^up", DOWN.test(s) && "^down"].filter(Boolean);
  const named = figures.length > 0 && names.length > 0;
  const content = named ? [] : words.map((w) => w.toLowerCase()).filter((w) => w.length >= 6 && !FEATURE_STOP.has(w) && !names.includes(`@${w}`)).map((w) => w.replace(/(?:ing|ed|es|s)$/, ""));
  return [...new Set([...figures, ...names, ...marks, ...content])].sort();
}

const buckets = new Map(); // keyed bucket → { t, callers: [keyed callers], backedBy: [keyed callers] }
const bucketCounts = new Map(); // scope → { searches, bucketed, seen, other, otherBacked }

/** Counts the claim's bucket as searched now; returns the handle noteBucketOutcome needs, or null (no bucket). */
export function noteBucket(claim, now = Date.now(), { scope = "search", caller = null } = {}) {
  const c = bucketCounts.get(scope) ?? { searches: 0, bucketed: 0, seen: 0, other: 0, otherBacked: 0 };
  c.searches += 1;
  bucketCounts.set(scope, c);
  const features = claimFeatures(claim);
  if (features.length < 3) return null;
  c.bucketed += 1;
  const h = keyed(`bucket\n${scope}\n${features.join(" ")}`);
  const who = caller ? keyed(`caller\n${caller}`) : "anyone";
  const entry = buckets.get(h);
  const live = entry != null && now - entry.t < SEEN_TTL_MS;
  if (live) {
    c.seen += 1;
    if (entry.callers.some((x) => x !== who)) c.other += 1;
    if (entry.backedBy.some((x) => x !== who)) c.otherBacked += 1;
  }
  const callers = live ? entry.callers.filter((x) => x !== who) : [];
  callers.push(who);
  buckets.delete(h); // re-insert so Map order is least-recent first
  buckets.set(h, { t: now, callers: callers.slice(-CALLERS_KEPT), backedBy: live ? entry.backedBy : [] });
  if (buckets.size > SEEN_MAX) {
    for (const [k, e] of buckets) {
      if (buckets.size <= SEEN_MAX && now - e.t < SEEN_TTL_MS) break;
      buckets.delete(k);
    }
  }
  return { h, who };
}

/** How that search ended: a backing source makes the bucket a candidate for the next caller. */
export function noteBucketOutcome(handle, backed) {
  if (!handle || !backed) return;
  const entry = buckets.get(handle.h);
  if (entry && !entry.backedBy.includes(handle.who)) entry.backedBy = [...entry.backedBy, handle.who].slice(-CALLERS_KEPT);
}

/** One line per scope since the last take, then the counts start again (the buckets are kept). */
export function takeCandidateLines() {
  const pct = (part, whole) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : "-");
  const lines = [...bucketCounts].sort(([a], [b]) => a.localeCompare(b)).map(([scope, c]) =>
    `[tracely] candidates scope=${scope} searches=${c.searches} bucketed=${c.bucketed} seen=${c.seen} (${pct(c.seen, c.searches)}) other=${c.other} (${pct(c.other, c.searches)}) otherBacked=${c.otherBacked} (${pct(c.otherBacked, c.searches)}) remembered=${buckets.size}`);
  bucketCounts.clear();
  return lines;
}
