/**
 * The same request from the same caller while the first is still running,
 * counted before anyone builds coalescing for the extension's routes (cost
 * counters, 2026-10-24). The desktop's /api/verify-sources already joins
 * such a request to the running one (lib/inFlight.js). /api/check and
 * /api/sources do not, and whether they should turns on how often it
 * happens: two tabs on one Doc, or the same text in two fields.
 *
 *   [tracely] dupes route=… arrivals=… dupes=… (n%) cost=$…
 *
 * `cost` is what the duplicates were charged: what coalescing would have
 * saved. A request's key is an HMAC, under a key made at boot and never kept,
 * of the route, the caller and a digest of its effective input, held only
 * while it runs. Only an identified caller ("user:" or "install:") is
 * counted. Numbers and fixed labels only, in memory.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { MICRO_CENTS_PER_USD } from "./spend.js";

const KEY = randomBytes(32); // this process only: never written, never logged
const running = new Map(); // keyed request -> how many are in flight
const tally = new Map(); // route -> { arrivals, dupes, microCents }

/** A request arrives: its token, or null when the caller is not identified. */
export function noteArrival(route, caller, input) {
  if (typeof caller !== "string" || !caller) return null;
  const r = typeof route === "string" && /^\/api\/[a-z/-]+$/.test(route) ? route : "other";
  const digest = createHash("sha256").update(JSON.stringify(input ?? null)).digest("hex");
  const key = createHmac("sha256", KEY).update(`${r}\n${caller}\n${digest}`).digest("hex");
  const t = tally.get(r) ?? { arrivals: 0, dupes: 0, microCents: 0 };
  t.arrivals += 1;
  const dupe = (running.get(key) ?? 0) > 0;
  if (dupe) t.dupes += 1;
  tally.set(r, t);
  running.set(key, (running.get(key) ?? 0) + 1);
  return { key, route: r, dupe, done: false };
}

/** What a duplicate was charged. */
export function noteDupeCost(token, microCents) {
  if (!token?.dupe || !Number.isFinite(microCents) || microCents <= 0) return;
  const t = tally.get(token.route) ?? { arrivals: 0, dupes: 0, microCents: 0 };
  t.microCents += microCents;
  tally.set(token.route, t);
}

/** The request is over, however it ended. */
export function noteDone(token) {
  if (!token || token.done) return;
  token.done = true;
  const n = (running.get(token.key) ?? 1) - 1;
  if (n > 0) running.set(token.key, n);
  else running.delete(token.key);
}

export function runningCount() { return running.size; }

/** One line per route since the last take, then the counts start again. */
export function takeDupeLines() {
  const lines = [...tally].sort(([a], [b]) => a.localeCompare(b)).map(([route, t]) =>
    `[tracely] dupes route=${route} arrivals=${t.arrivals} dupes=${t.dupes} (${t.arrivals ? Math.round((100 * t.dupes) / t.arrivals) : 0}%) cost=$${(t.microCents / MICRO_CENTS_PER_USD).toFixed(4)}`);
  tally.clear();
  return lines;
}
