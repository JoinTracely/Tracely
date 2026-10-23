/**
 * How long each stage of a source search took, and why sources went unread,
 * logged once an hour (Codex review S1, 2026-10-22).
 *
 * A search's own log line gave its total `ms=` and nothing else, so a slow
 * search could not be told apart: the model's web search, completing the
 * citation fields (Crossref, the pages' metadata), reading the sources, the
 * judge, the detail check, or the wait before any of it (the body, the
 * account lookup, the gates). Per route and pool, once an hour:
 *
 *   [tracely] stages route=… pool=… n=… backed=… wait=… search=… complete=…
 *             read=… judge=… trim=… total=…   (each p50/p95/max, ms)
 *   [tracely] reads route=… pool=… abstract=… page=… pdf=… blocked=… …
 *
 * `backed` is how many searches ended with a source that backs the sentence,
 * so the usage lines' cost over it is the cost per backed answer. The reads
 * count each source's outcome (sourceVerify.js READ_OUTCOMES). A stage that
 * did not run counts as 0 (most searches never trim). The client's own time
 * to its first result is not here; the live search's `found` event goes out
 * when `search` ends.
 *
 * Numbers only — never a word of anyone's text, a URL or a caller id, and
 * every label from a fixed list. In memory: a restart loses at most an hour.
 */
import { READ_OUTCOMES } from "./sourceVerify.js";

export const STAGES = ["wait", "search", "complete", "read", "judge", "trim", "total"];
const READ_ORDER = [...READ_OUTCOMES, "other"];
const KNOWN_READS = new Set(READ_OUTCOMES);
/* Kept per stage and route; past it, a reservoir sample, so an hour's lines
 * stay a fixed size however busy the hour. */
const MAX_SAMPLES = 2_000;

const tally = new Map(); // "route pool" -> { route, pool, n, backed, samples: { stage: ms[] }, reads: { outcome: count } }

export function tallyStages(route, pool, stages, { reads = {}, backed = false } = {}) {
  const r = typeof route === "string" && /^\/api\/[a-z/-]+$/.test(route) ? route : "other";
  const p = typeof pool === "string" && /^[a-z]+$/.test(pool) ? pool : "other";
  const key = `${r} ${p}`;
  const t = tally.get(key) ?? { route: r, pool: p, n: 0, backed: 0, samples: Object.fromEntries(STAGES.map((s) => [s, []])), reads: {} };
  t.n += 1;
  if (backed) t.backed += 1;
  for (const s of STAGES) {
    const v = stages?.[s];
    if (!Number.isFinite(v) || v < 0) continue;
    const list = t.samples[s];
    if (list.length < MAX_SAMPLES) list.push(Math.round(v));
    else {
      const j = Math.floor(Math.random() * t.n);
      if (j < MAX_SAMPLES) list[j] = Math.round(v);
    }
  }
  for (const [k, v] of Object.entries(reads ?? {})) {
    if (!Number.isFinite(v) || v <= 0) continue;
    const o = KNOWN_READS.has(k) ? k : "other";
    t.reads[o] = (t.reads[o] ?? 0) + v;
  }
  tally.set(key, t);
}

/* Nearest rank: the smallest value with at least q of the samples at or below it. */
const rank = (sorted, q) => sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];

/** The log lines for everything tallied since the last take, and a fresh start. */
export function takeStageLines() {
  const lines = [];
  for (const t of [...tally.values()].sort((a, b) => a.route.localeCompare(b.route) || a.pool.localeCompare(b.pool))) {
    const where = `route=${t.route} pool=${t.pool}`;
    const parts = STAGES.filter((s) => t.samples[s].length).map((s) => {
      const v = [...t.samples[s]].sort((a, b) => a - b);
      return `${s}=${rank(v, 0.5)}/${rank(v, 0.95)}/${v[v.length - 1]}`;
    });
    lines.push(`[tracely] stages ${where} n=${t.n} backed=${t.backed} ${parts.join(" ")} (ms p50/p95/max)`);
    const reads = READ_ORDER.filter((o) => t.reads[o]).map((o) => `${o}=${t.reads[o]}`);
    if (reads.length) lines.push(`[tracely] reads ${where} ${reads.join(" ")}`);
  }
  tally.clear();
  return lines;
}
