/**
 * What every charged model call cost, by route, logged once an hour
 * (2026-10-17, server.js chargeCall).
 *
 * The point is the PROMPT CACHE. OpenAI reports how much of each prompt it read
 * from its cache (`cached`, priced at a tenth of input) and how much it wrote
 * to it (`cacheWrite`, 1.25x input — shared/prices.js), and nothing recorded
 * either, so whether a caching lever saves money or costs it was unknowable:
 * eval/models/FINDINGS.md left the check-side levers waiting for exactly this.
 * One line per route: calls, tokens in, the share read from and written to the
 * cache, tokens out, web searches, dollars.
 *
 * Counts and dollars only — never a word of anyone's text, and no caller id.
 * In memory: a restart loses at most an hour of a statistic, never a limit.
 */
import { MICRO_CENTS_PER_USD } from "./spend.js";

const tally = new Map(); // route -> { calls, input, cached, cacheWrite, output, searches, microCents }
/* How often the server's own result cache (appCall's `cache`, lib/db.js
 * request_cache: the desktop's routes) answered instead of a model, per cache
 * kind (2026-10-22). A hit costs nothing and never reaches tallyCall, so
 * without this the routes that cache looked dearer per answer than they are,
 * and whether the extension's source search should cache was unanswerable. */
const cacheTally = new Map(); // kind -> { hits, misses }

export function tallyCache(kind, hit) {
  const key = typeof kind === "string" && /^[a-z-]+$/.test(kind) ? kind : "other";
  const t = cacheTally.get(key) ?? { hits: 0, misses: 0 };
  if (hit) t.hits += 1; else t.misses += 1;
  cacheTally.set(key, t);
}
const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

export function tallyCall(route, { usage, webSearchCalls = 0, cost = 0 } = {}) {
  const key = typeof route === "string" && /^\/api\/[a-z/-]+$/.test(route) ? route : "other";
  const t = tally.get(key) ?? { calls: 0, input: 0, cached: 0, cacheWrite: 0, output: 0, searches: 0, microCents: 0 };
  t.calls += 1;
  t.input += n(usage?.input);
  t.cached += n(usage?.cached);
  t.cacheWrite += n(usage?.cacheWrite);
  t.output += n(usage?.output);
  t.searches += n(webSearchCalls);
  t.microCents += n(cost);
  tally.set(key, t);
}

/** The log lines for everything tallied since the last take, and a fresh start. */
export function takeUsageLines() {
  const lines = [...tally].sort(([a], [b]) => a.localeCompare(b)).map(([route, t]) => {
    const pct = (part) => (t.input > 0 ? `${Math.round((100 * part) / t.input)}%` : "-");
    const usd = (t.microCents / MICRO_CENTS_PER_USD).toFixed(4);
    return `[tracely] usage route=${route} calls=${t.calls} in=${t.input} cached=${t.cached} (${pct(t.cached)}) write=${t.cacheWrite} (${pct(t.cacheWrite)}) out=${t.output} searches=${t.searches} cost=$${usd}`;
  });
  for (const [kind, t] of [...cacheTally].sort(([a], [b]) => a.localeCompare(b))) {
    const asked = t.hits + t.misses;
    lines.push(`[tracely] cache kind=${kind} hits=${t.hits} of ${asked} (${Math.round((100 * t.hits) / asked)}%)`);
  }
  tally.clear();
  cacheTally.clear();
  return lines;
}
