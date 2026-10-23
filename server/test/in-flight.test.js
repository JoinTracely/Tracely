/* One run for identical work from one caller (lib/inFlight.js, Codex review
 * S3). The route-level proof, over HTTP, is in verify-sources.test.js; this
 * is the leaf: keys, joins, failures and cleanup. */
import test from "node:test";
import assert from "node:assert/strict";
import { once, workKey, takeJoinLines, runningCount } from "../lib/inFlight.js";
import { CheckError } from "../lib/errors.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIST = { claim: "Spending on youth facilities fell by 73%.", sources: [{ id: "a", title: "Youth Matters" }] };

test("the key: same caller, route, choice and input; never an address-only caller; never the text", () => {
  const k = workKey("user:u1", "verifySources", ["gpt-5.6-luna", "low", null, LIST]);
  assert.match(k, /^[0-9a-f]{64}$/, "a hash, not the input");
  assert.equal(workKey("user:u1", "verifySources", ["gpt-5.6-luna", "low", null, structuredClone(LIST)]), k, "the same input, the same key");
  assert.notEqual(workKey("user:u2", "verifySources", ["gpt-5.6-luna", "low", null, LIST]), k, "another person");
  assert.notEqual(workKey("user:u1", "verifySources", ["gpt-6-astra", "low", null, LIST]), k, "another model");
  assert.notEqual(workKey("user:u1", "verifySources", ["gpt-5.6-luna", "medium", null, LIST]), k, "another effort");
  assert.notEqual(workKey("user:u1", "verifySources", ["gpt-5.6-luna", "low", null, { ...LIST, context: "a paragraph" }]), k, "another context");
  assert.notEqual(workKey("user:u1", "critique", ["gpt-5.6-luna", "low", null, LIST]), k, "another route");
  assert.ok(workKey("install:abc", "verifySources", [LIST]), "an install id is one caller");
  assert.equal(workKey("addr:abc", "verifySources", [LIST]), null, "an address can be many people");
  assert.equal(workKey(null, "verifySources", [LIST]), null);
});

test("two at once: the work runs once, both get the answer, each its own copy", async () => {
  takeJoinLines();
  let runs = 0;
  const key = workKey("user:u1", "verifySources", [LIST]);
  const work = async () => { runs++; await sleep(30); return { receipts: [{ id: "a", verdict: "backs" }] }; };
  let joinedSeen = 0;
  const [a, b] = await Promise.all([once(key, "/api/verify-sources", work), once(key, "/api/verify-sources", work, { onJoin: () => { joinedSeen++; } })]);
  assert.equal(runs, 1);
  assert.deepEqual(b, a);
  assert.notEqual(b, a, "a copy: neither can change the other's");
  assert.equal(joinedSeen, 1);
  assert.equal(runningCount(), 0, "cleared once it settled");
  assert.deepEqual(takeJoinLines(), ["[tracely] joined route=/api/verify-sources n=1"]);
  assert.deepEqual(takeJoinLines(), [], "a take starts the hour afresh");

  await once(key, "/api/verify-sources", work);
  assert.equal(runs, 2, "asked again afterwards: a fresh run");
});

test("no key: every call runs (another person, or no coalescing asked)", async () => {
  let runs = 0;
  await Promise.all([once(null, "/api/x", async () => { runs++; await sleep(10); }), once(null, "/api/x", async () => { runs++; await sleep(10); })]);
  assert.equal(runs, 2);
});

test("a failure reaches the joiner as the same refusal, without the leader's billing tag", async () => {
  const key = workKey("user:u1", "verifySources", ["fail", LIST]);
  const work = async () => {
    await sleep(20);
    const err = new CheckError("server", "Tracely could not check these sources just now.", { status: 502, retryAfter: 5 });
    err.feature = "receipts";
    Object.defineProperty(err, "llm", { value: { model: "gpt-5.6-luna", usage: { input: 900, output: 0 } }, enumerable: false });
    throw err;
  };
  const [lead, join] = await Promise.allSettled([once(key, "/api/verify-sources", work), once(key, "/api/verify-sources", work)]);
  assert.equal(lead.status, "rejected");
  assert.equal(join.status, "rejected");
  assert.ok(lead.reason.llm, "the leader's error carries its cost: the central handler charges it once");
  assert.equal(join.reason.llm, undefined, "the joiner's does not, so it is not charged again");
  assert.ok(join.reason instanceof CheckError);
  assert.deepEqual([join.reason.kind, join.reason.message, join.reason.status, join.reason.retryAfter, join.reason.feature],
    [lead.reason.kind, lead.reason.message, lead.reason.status, lead.reason.retryAfter, lead.reason.feature], "what the client is told is the same");
  assert.equal(runningCount(), 0, "a failure clears too");

  // Anything else is an internal error for both, never the leader's object.
  const odd = workKey("user:u1", "verifySources", ["odd", LIST]);
  const boom = async () => { await sleep(10); throw Object.assign(new TypeError("boom"), { llm: { usage: { input: 1 } } }); };
  const [, j] = await Promise.allSettled([once(odd, "/api/x", boom), once(odd, "/api/x", boom)]);
  assert.equal(j.reason.message, "boom");
  assert.equal(j.reason.llm, undefined);
});

test("labels on the hourly line are routes only", async () => {
  takeJoinLines();
  const key = workKey("user:u9", "r", ["label"]);
  const work = async () => { await sleep(10); return 1; };
  await Promise.all([once(key, "a student's sentence", work), once(key, "a student's sentence", work)]);
  assert.deepEqual(takeJoinLines(), ["[tracely] joined route=other n=1"]);
});
