/* What each action costs (2026-10-24). Owner: "can we create a system so I
 * can see how much api credits weve used on each look up or action that
 * tracely uses?"
 *
 * The spend ledger (lib/spend.js) keeps one total per pool per day, and the
 * hourly lines (lib/usageTally.js, lib/searchTally.js) live only in the logs,
 * counted in memory and lost on every deploy. This keeps one row per action a
 * caller asked for (a check, a lookup, a source search, a desktop critique)
 * with what it cost: every model call it made (a check's citeFit call
 * included), its web searches, its tokens, how long it took, and whether it
 * failed. A billed failure counts: chargeCall in server.js is the one place
 * every charge passes, and it notes each one here (noteActionCost). The
 * request's `finally` writes the row (recordAction).
 *
 * No caller and no text. A row holds a time, an action name, the pool that
 * paid, the model and numbers. Rows are kept KEEP_DAYS. Read by
 * GET /api/admin/costs (TRACELY_ADMIN_TOKEN) and the page at /admin/costs.
 *
 * The cost is the server's own estimate (shared/prices.js for tokens, plus the
 * web-search fee), the same arithmetic as the spend cap. OpenAI's usage page
 * is the bill. */
import { db } from "./db.js";
import { usageDay } from "../shared/plan.js";

export const KEEP_DAYS = 90;
const DAY_MS = 86_400_000;

/* The action a request was: its route without "/api/", and for a source
 * search its mode ("sources:lookup", "sources:search", "sources:correction").
 * The live search is the same action as the plain one. */
export function actionOf(route, gate) {
  const r = String(route ?? "").replace(/^\/api\//, "").replace(/\/stream$/, "");
  if (!/^[a-z][a-z/-]*$/.test(r)) return "other";
  const mode = gate?.searchTally?.mode;
  return /(^|\/)sources$/.test(r) && typeof mode === "string" && /^[a-z]+$/.test(mode) ? `${r}:${mode}` : r;
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/* One model call's charge, added to the request it belongs to. */
export function noteActionCost(gate, { model, usage, webSearchCalls = 0, cost = 0 } = {}) {
  if (!gate || typeof gate !== "object") return;
  const a = (gate.costAction ??= { calls: 0, cost: 0, input: 0, cached: 0, write: 0, output: 0, searches: 0, models: [] });
  a.calls += 1;
  a.cost += num(cost);
  a.input += num(usage?.input);
  a.cached += num(usage?.cached);
  a.write += num(usage?.cacheWrite);
  a.output += num(usage?.output);
  a.searches += num(webSearchCalls);
  const m = String(model ?? "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (m && !a.models.includes(m)) a.models.push(m);
}

let insert = null;
let purge = null;
let lastPurge = 0;

/* The request is over: one row for it, if it was charged anything. A joiner
 * (lib/inFlight.js) and a request refused before its call were not, and
 * write nothing. */
export function recordAction(gate, route, { ok = true, ms = 0, at = Date.now() } = {}) {
  const a = gate?.costAction;
  if (!a || !a.calls) return false;
  insert ??= db.prepare(
    "INSERT INTO cost_actions (at, action, pool, model, calls, input, cached, cache_write, output, searches, cost_ucents, ok, ms, via) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  // `via`: which search answered a source search (server.js sets gate.costVia; lib/searchApi.js).
  const via = ["cheap", "fallback", "openai"].includes(gate.costVia) ? gate.costVia : null;
  insert.run(at, actionOf(route, gate), String(gate.pool ?? ""), a.models.join(",").slice(0, 120), a.calls,
    Math.round(a.input), Math.round(a.cached), Math.round(a.write), Math.round(a.output), Math.round(a.searches),
    Math.round(a.cost), ok ? 1 : 0, Math.max(0, Math.round(num(ms))), via);
  if (at - lastPurge > 3_600_000) {
    lastPurge = at;
    purge ??= db.prepare("DELETE FROM cost_actions WHERE at < ?");
    purge.run(at - KEEP_DAYS * DAY_MS);
  }
  return true;
}

// Nearest rank, on a sorted list.
function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}
// Micro-cents (a millionth of a cent, the ledger's unit) as cents, to a ten-thousandth.
const cents = (ucents) => Math.round(ucents / 100) / 10_000;

/* What the last `days` cost, by action and by day, and the `recent` latest
 * actions, newest first. Every cost is in cents. */
export function costReport({ days = 7, recent = 50, now = Date.now() } = {}) {
  const since = now - days * DAY_MS;
  const rows = db.prepare(
    "SELECT at, action, pool, model, calls, input, cached, cache_write, output, searches, cost_ucents, ok, ms, via " +
    "FROM cost_actions WHERE at >= ? ORDER BY at, rowid").all(since);
  const total = rows.reduce((s, r) => s + r.cost_ucents, 0);
  const groups = new Map();
  for (const r of rows) {
    const g = groups.get(r.action) ?? { rows: [] };
    g.rows.push(r);
    groups.set(r.action, g);
  }
  const actions = [...groups.entries()].map(([action, { rows: rs }]) => {
    const costs = rs.map((r) => r.cost_ucents).sort((x, y) => x - y);
    const sum = costs.reduce((s, c) => s + c, 0);
    const avg = (f) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
    return {
      action,
      count: rs.length,
      failed: rs.filter((r) => !r.ok).length,
      totalCents: cents(sum),
      share: total ? Math.round((sum / total) * 1000) / 1000 : 0,
      avgCents: cents(sum / rs.length),
      medianCents: cents(pct(costs, 50)),
      p95Cents: cents(pct(costs, 95)),
      maxCents: cents(costs[costs.length - 1]),
      avgSearches: Math.round(avg((r) => r.searches) * 100) / 100,
      avgInputTokens: Math.round(avg((r) => r.input)),
      avgOutputTokens: Math.round(avg((r) => r.output)),
      cachedShare: (() => { const i = rs.reduce((s, r) => s + r.input, 0); return i ? Math.round((rs.reduce((s, r) => s + r.cached, 0) / i) * 1000) / 1000 : 0; })(),
      avgMs: Math.round(avg((r) => r.ms)),
      models: [...new Set(rs.flatMap((r) => String(r.model).split(",").filter(Boolean)))],
      // A source search's answer: how many the cheaper search gave, how many fell back to OpenAI's, how many were OpenAI's alone.
      via: rs.reduce((v, r) => (r.via ? { ...v, [r.via]: (v[r.via] ?? 0) + 1 } : v), {}),
    };
  }).sort((x, y) => y.totalCents - x.totalCents || y.count - x.count);
  const byDay = new Map();
  for (const r of rows) {
    const d = usageDay(r.at);
    const e = byDay.get(d) ?? { day: d, count: 0, ucents: 0, actions: {} };
    e.count += 1;
    e.ucents += r.cost_ucents;
    e.actions[r.action] = (e.actions[r.action] ?? 0) + r.cost_ucents;
    byDay.set(d, e);
  }
  return {
    since: new Date(since).toISOString(),
    days,
    count: rows.length,
    totalCents: cents(total),
    actions,
    byDay: [...byDay.values()].map((e) => ({ day: e.day, count: e.count, totalCents: cents(e.ucents),
      actions: Object.fromEntries(Object.entries(e.actions).map(([k, v]) => [k, cents(v)])) })),
    recent: rows.slice(-Math.max(0, recent)).reverse().map((r) => ({
      at: new Date(r.at).toISOString(), action: r.action, pool: r.pool, model: r.model, calls: r.calls,
      inputTokens: r.input, cachedTokens: r.cached, outputTokens: r.output, searches: r.searches,
      cents: cents(r.cost_ucents), ok: Boolean(r.ok), ms: r.ms, via: r.via ?? null,
    })),
  };
}
