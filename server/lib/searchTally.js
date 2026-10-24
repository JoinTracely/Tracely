/**
 * What each source search cost and what it came to, per pool and mode, and
 * what the extension's lookups were tagged with, logged once an hour (cost
 * counters, 2026-10-24).
 *
 * Lookups (`verify: true`, extension 2.21.73) are now most of the search
 * traffic. Two ways to cut their cost wait on numbers no line gave: judging
 * the sources a document already has before searching again, and remembering
 * lookups across documents on the writer's computer. So, per route, pool and
 * mode, once an hour:
 *
 *   [tracely] searches route=… pool=… mode=lookup|search|correction n=…
 *             failed=… cost=$… backed=… refuted=… unverified=… unread=…
 *             perBacked=$…
 *   [tracely] lookup-tags pool=… rank=… pick=… doc=… elsewhere=…
 *
 * `cost` is everything charged for those searches, a billed failure included
 * (server.js chargeCall), so `perBacked` (cost over backed) is the cost of an
 * answer that found a backing source. The outcome is the extension's own
 * (searchOutcome mirrors content.js lookupOutcome). A lookup's tags are what
 * the extension says about it (content.js lookupTagsFor): the kind of claim
 * (lookupRank 0-3), its place in the check's picks, whether the document
 * already had sources for another sentence ("some") or for a related one
 * ("related"), and whether another Doc on the same computer had looked it up
 * ("looked") or only checked it ("checked"). In a tag, `n/b/r/u` is
 * searches, then how many ended backed, refuted and unverified; the rest
 * were unread or failed.
 *
 * Numbers and fixed labels only: never a word of anyone's text, a URL or a
 * caller id. In memory: a restart loses at most an hour.
 */
import { MICRO_CENTS_PER_USD } from "./spend.js";

export const SEARCH_OUTCOMES = ["backed", "refuted", "unverified", "unread"];
export const SEARCH_MODES = ["lookup", "search", "correction"];
export const LOOKUP_TAGS = {
  rank: ["0", "1", "2", "3"],
  pick: ["1", "2", "3", "4", "5"],
  doc: ["none", "some", "related"],
  elsewhere: ["looked", "checked", "no"],
};

/* What a search's sources say about its sentence: content.js lookupOutcome,
 * without the writer's own source filters. A source the server read (a
 * server without receipts sends no `verified`) that supports it, else one
 * that refutes it; found sources but read none is "unread"; else "unverified". */
export function searchOutcome(sources) {
  const all = Array.isArray(sources) ? sources.filter((s) => s && typeof s === "object") : [];
  const read = all.filter((s) => s.verified !== false);
  if (read.some((s) => s.stance === "supports")) return "backed";
  if (read.some((s) => s.stance === "refutes")) return "refuted";
  if (all.length && !read.length) return "unread";
  return "unverified";
}

/** A lookup's tags as sent, each kept only when it is one of its fixed values, else "?". */
export function lookupTags(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  const keep = (k) => (LOOKUP_TAGS[k].includes(String(t[k])) ? String(t[k]) : "?");
  return { rank: keep("rank"), pick: keep("pick"), doc: keep("doc"), elsewhere: keep("elsewhere") };
}

const searches = new Map(); // "route pool mode" -> { route, pool, mode, n, failed, microCents, outcomes }
const tags = new Map(); // pool -> { rank: { value: [n, backed, refuted, unverified] }, pick, doc, elsewhere }
const label = (v, re) => (typeof v === "string" && re.test(v) ? v : "other");

/** A search starts: the handle its route keeps on the gate, for noteSearchCost and endSearch. */
export function startSearch({ route = "/api/sources", pool, mode, tags: sent = null } = {}) {
  const m = SEARCH_MODES.includes(mode) ? mode : "other";
  return { route: label(route, /^\/api\/[a-z/-]+$/), pool: label(pool, /^[a-z]+$/), mode: m, tags: m === "lookup" ? lookupTags(sent) : null, done: false };
}

function entry(h) {
  const key = `${h.route} ${h.pool} ${h.mode}`;
  let e = searches.get(key);
  if (!e) searches.set(key, (e = { route: h.route, pool: h.pool, mode: h.mode, n: 0, failed: 0, microCents: 0, outcomes: {} }));
  return e;
}

/** What chargeCall charged for this search (a billed failure too). */
export function noteSearchCost(h, microCents) {
  if (!h || !Number.isFinite(microCents) || microCents <= 0) return;
  entry(h).microCents += microCents;
}

/** How it ended: one of SEARCH_OUTCOMES, or "failed". Counted once. */
export function endSearch(h, outcome) {
  if (!h || h.done) return;
  h.done = true;
  const e = entry(h);
  e.n += 1;
  if (SEARCH_OUTCOMES.includes(outcome)) e.outcomes[outcome] = (e.outcomes[outcome] ?? 0) + 1;
  else e.failed += 1;
  if (!h.tags) return;
  const t = tags.get(h.pool) ?? { rank: {}, pick: {}, doc: {}, elsewhere: {} };
  for (const k of Object.keys(LOOKUP_TAGS)) {
    const c = t[k][h.tags[k]] ?? [0, 0, 0, 0];
    c[0] += 1;
    const i = ["backed", "refuted", "unverified"].indexOf(outcome);
    if (i >= 0) c[i + 1] += 1;
    t[k][h.tags[k]] = c;
  }
  tags.set(h.pool, t);
}

/** The log lines for everything tallied since the last take, and a fresh start. */
export function takeSearchLines() {
  const usd = (mc) => (mc / MICRO_CENTS_PER_USD).toFixed(4);
  const lines = [];
  for (const e of [...searches.values()].sort((a, b) => a.route.localeCompare(b.route) || a.pool.localeCompare(b.pool) || a.mode.localeCompare(b.mode))) {
    const o = (k) => e.outcomes[k] ?? 0;
    const per = o("backed") > 0 ? `$${usd(e.microCents / o("backed"))}` : "-";
    lines.push(`[tracely] searches route=${e.route} pool=${e.pool} mode=${e.mode} n=${e.n} failed=${e.failed} cost=$${usd(e.microCents)} backed=${o("backed")} refuted=${o("refuted")} unverified=${o("unverified")} unread=${o("unread")} perBacked=${per}`);
  }
  for (const [pool, t] of [...tags].sort(([a], [b]) => a.localeCompare(b))) {
    const dim = (k) => [...LOOKUP_TAGS[k], "?"].filter((v) => t[k][v]).map((v) => `${v}:${t[k][v].join("/")}`).join(",") || "-";
    lines.push(`[tracely] lookup-tags pool=${pool} rank=${dim("rank")} pick=${dim("pick")} doc=${dim("doc")} elsewhere=${dim("elsewhere")} (n/backed/refuted/unverified)`);
  }
  searches.clear();
  tags.clear();
  return lines;
}
