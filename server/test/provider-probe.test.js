/**
 * Can the provider actually answer? /api/status?probe=1 and healthcheck.sh.
 *
 * healthcheck.sh said healthy through two outages, because `hasKey` only says
 * a key is set: OpenAI refusing the key (2026-10-13) and an empty balance
 * (2026-10-29, every check a 503). Pinned here:
 *   - the probe is one tiny real call, with no one's text in it;
 *   - out of credit and a refused key are false, anything else unknown is null;
 *   - it runs at most once a minute, and concurrent askers share one call;
 *   - only ?probe=1 asks, never a plain /api/status (the extension's 1.5 s read);
 *   - healthcheck.sh fails, warns or passes on each of those answers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { probeProvider, resetProviderProbe, DEFAULT_MODEL } from "../lib/llm.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = readFileSync(path.join(HERE, "..", "server.js"), "utf8");
const SCRIPT = path.join(HERE, "..", "scripts", "healthcheck.sh").replace(/\\/g, "/");

const realFetch = globalThis.fetch;
const realKey = process.env.OPENAI_API_KEY;
test.beforeEach(() => { resetProviderProbe(); process.env.OPENAI_API_KEY = "sk-unit-probe"; });
test.afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = realKey;
});

function stubFetch(answer) {
  const sent = [];
  globalThis.fetch = async (url, init = {}) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    const [status, json] = await answer();
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  };
  return sent;
}
const COMPLETED = { status: "completed", output: [], usage: { input_tokens: 9, output_tokens: 3 } };
const NO_CREDIT = { error: { message: "You exceeded your current quota.", type: "insufficient_quota", code: "insufficient_quota" } };
const HARD_LIMIT = { error: { message: "Billing hard limit has been reached.", code: "billing_hard_limit_reached" } };
const BAD_KEY = { error: { message: "Incorrect API key provided.", type: "invalid_request_error", code: "invalid_api_key" } };

test("the probe is one tiny real call on the fast model, with no one's text and nothing stored", async () => {
  const sent = stubFetch(() => [200, COMPLETED]);
  const r = await probeProvider();
  assert.equal(r.ok, true);
  assert.ok(Date.parse(r.checkedAt));
  assert.equal(r.reason, undefined);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://api.openai.com/v1/responses");
  assert.equal(sent[0].body.model, DEFAULT_MODEL);
  assert.equal(sent[0].body.max_output_tokens, 16);
  assert.equal(sent[0].body.input, "Reply with ok.");
  assert.equal(sent[0].body.store, false);
});

test("out of credit and a refused key are false, and say which", async () => {
  for (const [status, json, reason] of [[429, NO_CREDIT, "out_of_credit"], [429, HARD_LIMIT, "out_of_credit"], [401, BAD_KEY, "no_key"]]) {
    resetProviderProbe();
    stubFetch(() => [status, json]);
    const r = await probeProvider();
    assert.deepEqual([r.ok, r.reason], [false, reason], reason);
  }
});

test("anything that says nothing about the key or the balance is null, never false", async () => {
  for (const [status, json, reason] of [[429, { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }, "rate_limit"], [500, { error: { message: "boom" } }, "server"], [503, {}, "server"]]) {
    resetProviderProbe();
    stubFetch(() => [status, json]);
    const r = await probeProvider();
    assert.deepEqual([r.ok, r.reason], [null, reason], `${status}`);
  }
  resetProviderProbe();
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  assert.deepEqual([(await probeProvider()).ok, (await probeProvider()).reason], [null, "network"]);
});

test("at most one call a minute, however many ask, and concurrent askers share it", async () => {
  let release;
  const held = new Promise((r) => { release = r; });
  const sent = stubFetch(async () => { await held; return [200, COMPLETED]; });
  const three = [probeProvider(), probeProvider(), probeProvider()];
  release();
  const answers = await Promise.all(three);
  assert.equal(sent.length, 1, "three askers, one call");
  assert.ok(answers.every((a) => a.ok === true));
  await probeProvider();
  assert.equal(sent.length, 1, "the same minute: the answer it already has");
  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  try {
    await probeProvider();
    assert.equal(sent.length, 2, "a minute later: asked again");
  } finally {
    Date.now = realNow;
  }
});

test("a failed probe is remembered for the minute too, so a public route cannot hammer the provider", async () => {
  const sent = stubFetch(() => [429, NO_CREDIT]);
  await probeProvider();
  await probeProvider();
  assert.equal(sent.length, 1);
});

test("/api/status asks only with ?probe=1, never in mock mode, and the field is additive", () => {
  assert.match(SERVER, /const probe = url\.searchParams\.get\("probe"\) === "1" && !MOCK && hasApiKey\(\) \? await probeProvider\(\) : null;/);
  assert.match(SERVER, /\.\.\.\(probe \? \{ probe \} : \{\}\),/);
  assert.equal((SERVER.match(/probeProvider\(/g) ?? []).length, 1, "the status route is the only caller");
  assert.doesNotMatch(readFileSync(path.join(HERE, "..", "..", "extension", "background.js"), "utf8"), /probe=1/);
});

/* healthcheck.sh against a stand-in server: the routes it reads, and /api/status as given. */
const EXT_OK = new Set(["pkaihmliboboiafoodfaoflflcpipcnd", "dffmoeebkkghhgcklkbmaibfhgiegmdm"]);
function standIn(extra) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/status") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ hasKey: true, mock: false, budget: { enforced: true }, paidBudget: {}, ...extra }));
    }
    if (url.pathname === "/api/entitlement") return res.end(JSON.stringify({ plan: "free" }));
    if (req.method === "OPTIONS") {
      const id = String(req.headers.origin ?? "").replace("chrome-extension://", "");
      res.statusCode = EXT_OK.has(id) ? 204 : 403;
      return res.end();
    }
    if (req.method === "PUT") { res.statusCode = 403; return res.end(); }
    res.statusCode = 404;
    res.end();
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
function healthcheck(base) {
  return new Promise((resolve) => {
    const c = spawn("bash", [SCRIPT, base], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    c.stdout.on("data", (d) => { out += d; });
    c.stderr.on("data", (d) => { out += d; });
    c.on("error", (e) => resolve({ code: -1, out: String(e) }));
    c.on("close", (code) => resolve({ code, out }));
  });
}
const CASES = [
  ["the probe answered", { probe: { ok: true } }, 0, /ok +OpenAI answered a real call/],
  ["out of credit", { probe: { ok: false, reason: "out_of_credit" } }, 1, /FAIL +OpenAI is OUT OF CREDIT/],
  ["a refused key", { probe: { ok: false, reason: "no_key" } }, 1, /FAIL +OpenAI REJECTS the API key \(no_key\)/],
  ["OpenAI down", { probe: { ok: null, reason: "server" } }, 0, /WARN +OpenAI could not be asked \(server\)/],
  ["OpenAI down, and a real call refused for credit minutes ago", { probe: { ok: null, reason: "timeout" }, upstream: { outOfCreditAt: "2026-10-30T07:00:00.000Z" } }, 1, /FAIL +OpenAI is OUT OF CREDIT/],
  ["credit added since: the probe outranks the old refusal", { probe: { ok: true }, upstream: { outOfCreditAt: "2026-10-30T07:00:00.000Z" } }, 0, /ok +OpenAI answered a real call/],
  ["a build with no probe", {}, 0, /WARN +this server has no probe/],
];
for (const [name, extra, code, line] of CASES) {
  test(`healthcheck.sh: ${name}`, async (t) => {
    const server = await standIn(extra);
    t.after(() => server.close());
    const r = await healthcheck(`http://127.0.0.1:${server.address().port}`);
    if (r.code === -1) return t.skip("no bash here");
    assert.match(r.out, line, r.out);
    assert.equal(r.code, code, r.out);
  });
}
