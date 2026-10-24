/* What each action costs (lib/costLedger.js, GET /api/admin/costs, the page
 * at /admin/costs). Owner, 2026-10-24: "can we create a system so I can see
 * how much api credits weve used on each look up or action that tracely
 * uses?" One row per charged action, with no caller and no text, read only
 * with TRACELY_ADMIN_TOKEN. */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Before db.js opens anything: this file's own database.
process.env.TRACELY_DATA_DIR = mkdtempSync(path.join(tmpdir(), "tracely-costs-"));
const { actionOf, noteActionCost, recordAction, costReport, KEEP_DAYS } = await import("../lib/costLedger.js");
const { db } = await import("../lib/db.js");

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 24, 18, 0, 0);
const charged = (pool, calls) => {
  const gate = { pool };
  for (const c of calls) noteActionCost(gate, c);
  return gate;
};

test("each request is one action: its route, and a source search's mode", () => {
  assert.equal(actionOf("/api/check", {}), "check");
  assert.equal(actionOf("/api/sources", { searchTally: { mode: "lookup" } }), "sources:lookup");
  assert.equal(actionOf("/api/sources/stream", { searchTally: { mode: "search" } }), "sources:search", "the live search is the same action");
  assert.equal(actionOf("/api/demo/sources", { searchTally: { mode: "correction" } }), "demo/sources:correction");
  assert.equal(actionOf("/api/find-sources", {}), "find-sources");
  assert.equal(actionOf("/api/sources", { searchTally: { mode: "Lookup; DROP" } }), "sources", "an odd mode is never written");
  assert.equal(actionOf("../../etc", {}), "other");
});

test("an action's calls add up, and one row is written when it ends", () => {
  db.exec("DELETE FROM cost_actions");
  // A check and its citeFit call: two charges, one action.
  const gate = charged("extension", [
    { model: "gpt-5.6-luna-2026-08-01", usage: { input: 2000, cached: 500, cacheWrite: 0, output: 900 }, cost: 150_000 },
    { model: "gpt-5.6-luna", usage: { input: 300, output: 40 }, cost: 12_000 },
  ]);
  assert.equal(recordAction(gate, "/api/check", { ok: true, ms: 1834.6, at: NOW }), true);
  const row = db.prepare("SELECT * FROM cost_actions").get();
  assert.equal(row.action, "check");
  assert.equal(row.calls, 2);
  assert.equal(row.cost_ucents, 162_000);
  assert.equal(row.input, 2300);
  assert.equal(row.cached, 500);
  assert.equal(row.output, 940);
  assert.equal(row.model, "gpt-5.6-luna", "a dated snapshot is the same model");
  assert.equal(row.ms, 1835);
  assert.equal(row.pool, "extension");
  // Nothing charged (refused before its call, or a joiner): no row.
  assert.equal(recordAction({ pool: "extension" }, "/api/check", { at: NOW }), false);
  assert.equal(recordAction(null, "/api/check", { at: NOW }), false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cost_actions").get().n, 1);
});

test("a row holds no caller and no text: only these columns", () => {
  const cols = db.prepare("PRAGMA table_info(cost_actions)").all().map((c) => c.name);
  assert.deepEqual(cols, ["at", "action", "pool", "model", "calls", "input", "cached", "cache_write", "output", "searches", "cost_ucents", "ok", "ms", "via"]);
});

test("the report: per action count, total, share, average, median, p95 and most; per day; the latest first", () => {
  db.exec("DELETE FROM cost_actions");
  // Ten lookups at 1.1¢ to 2.0¢ (one search each), three checks at 0.2¢, one failed search.
  for (let i = 1; i <= 10; i++) {
    const lookup = charged("extension", [{ model: "gpt-5.6-luna", usage: { input: 1000, output: 200 }, webSearchCalls: 1, cost: (100 + i * 10) * 10_000 }]);
    lookup.searchTally = { mode: "lookup" };
    recordAction(lookup, "/api/sources", { ok: true, ms: 9000, at: NOW - i * 60_000 });
  }
  for (let i = 0; i < 3; i++) recordAction(charged("paid", [{ model: "gpt-5.6-luna", usage: { input: 3000, output: 800 }, cost: 200_000 }]), "/api/check", { at: NOW - DAY - i * 1000 });
  const failed = charged("extension", [{ model: "gpt-5.6-luna", usage: { input: 500, output: 0 }, webSearchCalls: 1, cost: 1_050_000 }]);
  failed.searchTally = { mode: "search" };
  recordAction(failed, "/api/sources", { ok: false, at: NOW - 5000 });
  // Outside a 7-day window.
  recordAction(charged("extension", [{ model: "gpt-5.6-luna", usage: {}, cost: 9_999_999 }]), "/api/check", { at: NOW - 8 * DAY });

  const r = costReport({ days: 7, recent: 3, now: NOW });
  assert.equal(r.count, 14, "the old row is outside the window");
  const lk = r.actions.find((a) => a.action === "sources:lookup");
  assert.equal(lk.count, 10);
  assert.equal(lk.totalCents, 15.5, "1.1¢ + 1.2¢ … + 2.0¢");
  assert.equal(lk.avgCents, 1.55);
  assert.equal(lk.medianCents, 1.5, "nearest rank");
  assert.equal(lk.p95Cents, 2.0);
  assert.equal(lk.maxCents, 2.0);
  assert.equal(lk.avgSearches, 1);
  assert.equal(r.actions[0].action, "sources:lookup", "the most expensive action first");
  const ck = r.actions.find((a) => a.action === "check");
  assert.equal(ck.count, 3);
  assert.equal(ck.avgCents, 0.2);
  const fs = r.actions.find((a) => a.action === "sources:search");
  assert.equal(fs.failed, 1, "a billed failure is counted, and costs what it cost");
  assert.equal(fs.totalCents, 1.05);
  assert.equal(r.totalCents, 17.15, "15.5¢ + 0.6¢ + 1.05¢");
  assert.ok(Math.abs(r.actions.reduce((s, a) => s + a.share, 0) - 1) < 0.01);
  assert.equal(r.byDay.length, 2, "today and yesterday");
  assert.equal(r.recent.length, 3);
  assert.equal(r.recent[0].action, "sources:search", "newest first");
  assert.equal(r.recent[0].ok, false);
  for (const x of r.recent) assert.deepEqual(Object.keys(x).sort(), ["action", "at", "cachedTokens", "calls", "cents", "inputTokens", "model", "ms", "ok", "outputTokens", "pool", "searches", "via"]);
});

test(`rows older than ${KEEP_DAYS} days are deleted as new ones arrive`, () => {
  db.exec("DELETE FROM cost_actions");
  db.prepare("INSERT INTO cost_actions (at, action, cost_ucents, ok) VALUES (?, 'check', 1, 1)").run(NOW - (KEEP_DAYS + 1) * DAY);
  recordAction(charged("extension", [{ model: "gpt-5.6-luna", usage: {}, cost: 5 }]), "/api/check", { at: NOW + 2 * 3_600_000 });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cost_actions").get().n, 1, "only the new row is left");
});

test("wiring: every charge is noted, every request ends with its row, a failure is marked", () => {
  const src = readFileSync(path.join(HERE, "..", "server.js"), "utf8");
  const charge = src.slice(src.indexOf("function chargeCall("), src.indexOf("\n}\n", src.indexOf("function chargeCall(")));
  assert.match(charge, /noteActionCost\(gate, \{ model, usage, webSearchCalls, cost: /);
  assert.match(src, /\} catch \(err\) \{\n\s+if \(gate\) gate\.failed = true;/);
  assert.match(src, /noteDone\(gate\?\.dupe\);[^\n]*\n[^\n]*\n\s+try \{ recordAction\(gate, route, \{ ok: !gate\?\.failed/);
});

/* ── the route and the page, on a real server ───────────────────────────── */
const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.unref();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const TOKEN = "t".repeat(20) + "-admin-test-token-0123456789";
async function boot(env) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    let exited = false;
    const child = spawn(process.execPath, [path.join(HERE, "..", "server.js")], {
      env: { ...process.env, TRACELY_MOCK: "1", PORT: String(port), TRACELY_LLM_PROVIDER: "", TRACELY_ADMIN_TOKEN: "",
        TRACELY_DATA_DIR: mkdtempSync(path.join(tmpdir(), "tracely-costs-http-")), ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("exit", () => { exited = true; });
    for (let i = 0; i < 100 && !exited; i++) {
      try { if ((await fetch(`${base}/api/status`)).ok && !exited) return { base, child }; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 50));
    }
    child.kill();
    if (!exited) break;
  }
  throw new Error("server did not start");
}

test("without TRACELY_ADMIN_TOKEN there is no route; a short one counts as none", async () => {
  for (const t of ["", "too-short"]) {
    const { base, child } = await boot({ TRACELY_ADMIN_TOKEN: t });
    try {
      const r = await fetch(`${base}/api/admin/costs`, { headers: { Authorization: `Bearer ${t || "x"}` } });
      assert.equal(r.status, 404, JSON.stringify(t));
    } finally { child.kill(); }
  }
});

test("with the token: refused without it or with a wrong one; with it, a check shows as an action", async () => {
  const { base, child } = await boot({ TRACELY_ADMIN_TOKEN: TOKEN });
  try {
    // Its own page reads it same-origin, and a browser sends a same-origin GET with no Origin.
    const get = (auth, q = "", origin = null) => fetch(`${base}/api/admin/costs${q}`, { headers: { ...(auth ? { Authorization: auth } : {}), ...(origin ? { Origin: origin } : {}) } });
    assert.equal((await get(`Bearer ${TOKEN}`, "", "https://evil.example")).status, 403, "another site's page is refused before the route runs, token or not");
    assert.equal((await get(null)).status, 401);
    assert.equal((await get(`Bearer ${TOKEN}x`)).status, 401);
    assert.equal((await get(TOKEN)).status, 401, "a bearer token only");
    const check = await fetch(`${base}/api/check`, { method: "POST", headers: { "Content-Type": "application/json", "X-Tracely-Install": "cost-test" },
      body: JSON.stringify({ text: "Water boils at 100 degrees at sea level.", sentences: [{ id: "s1", text: "Water boils at 100 degrees at sea level." }] }) });
    assert.equal(check.status, 200);
    const r = await get(`Bearer ${TOKEN}`, "?days=1&recent=5");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("access-control-allow-origin"), null, "no CORS: only its own page reads it");
    assert.equal(r.headers.get("cache-control"), "no-store");
    const body = await r.json();
    const ck = body.actions.find((a) => a.action === "check");
    assert.ok(ck && ck.count >= 1, JSON.stringify(body.actions));
    assert.equal(body.recent[0].action, "check");
    assert.ok(body.pools && "extension" in body.pools);
    assert.equal(body.keepDays, KEEP_DAYS);
    assert.doesNotMatch(JSON.stringify(body), /Water boils|cost-test/, "no text, no caller");
  } finally { child.kill(); }
});

test("the page: served with its own locked-down headers, and it holds no secret", async () => {
  const { base, child } = await boot({ TRACELY_ADMIN_TOKEN: TOKEN });
  try {
    const r = await fetch(`${base}/admin/costs`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
    assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.match(r.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
    const html = await r.text();
    assert.doesNotMatch(html, new RegExp(TOKEN));
    assert.match(html, /\/api\/admin\/costs/);
    assert.match(html, /sessionStorage/, "the token stays in the tab");
    assert.doesNotMatch(html, /localStorage/, "never saved");
  } finally { child.kill(); }
});
