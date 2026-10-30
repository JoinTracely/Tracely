/* The sharded, objective check (lib/factcheck.js runFactCheck).
 *
 *  - A list longer than one shard runs as concurrent calls, and the findings
 *    come back in the INPUT order whatever order the calls answered in.
 *  - The route's admission hook is asked once, for the extra calls; refused
 *    (or throwing), the check runs as ONE call, exactly as before.
 *  - A shard that fails still reports what the other shards were billed.
 *  - The model's two finding shapes both flatten to the wire shape, and a
 *    "false" that names no basis is demoted to "questionable".
 *  - The union schema passes the strict-mode walker, and a non-strict branch
 *    does not. */
import test from "node:test";
import assert from "node:assert/strict";

process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
process.env.TRACELY_CHECK_SHARD = "3";

const { runFactCheck, shardSentences, normalizeFinding, CHECK_SHARD_SENTENCES } = await import("../lib/factcheck.js");
const { assertStrictSchema } = await import("../lib/llm.js");

const sentence = (i) => ({ id: `s${i}`, text: `Sentence ${i}.` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Answers each call with one finding per sentence it was sent. `delayFor`
 * lets a later shard answer FIRST, to prove the merge keeps input order. */
function stubFetch({ delayFor = () => 0, fail = () => false, shape = "union", omit = () => false } = {}) {
  const calls = [];
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    // The Responses body carries the user prompt as a plain string (providers/openai.js structuredBody).
    const user = typeof body.input === "string" ? body.input : JSON.stringify(body.input);
    const ids = [...user.matchAll(/^\[(s\d+)\]/gm)].map((m) => m[1]);
    calls.push(ids);
    await sleep(delayFor(ids));
    if (fail(ids)) {
      return { ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) };
    }
    const findings = ids.filter((id) => !omit(id, calls.length)).map((id) => {
      const n = Number(id.slice(1));
      if (shape === "flat") return { id, verdict: n % 2 ? "accurate" : "false", explanation: "x", revision: "y", confidence: "high" };
      return n % 2
        ? { id, verdict: "accurate" }
        : { id, verdict: "false", basis: `Fact ${n} is otherwise.`, explanation: `Wrong ${n}.`, revision: `Right ${n}.`, confidence: "high" };
    });
    return {
      ok: true,
      json: async () => ({ status: "completed", model: body.model, output_text: JSON.stringify({ findings }), output: [], usage: { input_tokens: 10, output_tokens: 5 } }),
    };
  };
  return calls;
}

test("shardSentences: near-equal shards, never more than the shard size, input order kept", () => {
  assert.equal(CHECK_SHARD_SENTENCES, 3);
  assert.deepEqual(shardSentences([1, 2, 3]).map((s) => s.length), [3]);
  assert.deepEqual(shardSentences([1, 2, 3, 4]).map((s) => s.length), [2, 2]);
  assert.deepEqual(shardSentences([1, 2, 3, 4, 5, 6, 7]).map((s) => s.length), [3, 3, 1]);
  assert.deepEqual(shardSentences([1, 2, 3, 4, 5, 6, 7], 8), [[1, 2, 3, 4, 5, 6, 7]]);
  assert.deepEqual(shardSentences([1, 2, 3, 4, 5]).flat(), [1, 2, 3, 4, 5]);
});

test("a long list runs as concurrent shards and the findings come back in input order", async () => {
  // The first shard answers LAST.
  const calls = stubFetch({ delayFor: (ids) => (ids[0] === "s1" ? 60 : 0) });
  const sentences = [1, 2, 3, 4, 5, 6, 7].map(sentence);
  const r = await runFactCheck({ text: "doc", sentences });
  assert.equal(calls.length, 3, "three shards of 3/3/1");
  assert.deepEqual(r.findings.map((f) => f.id), sentences.map((s) => s.id));
  assert.equal(r.shards, 3);
  assert.deepEqual(r.usage, { input: 30, output: 15, cached: 0, cacheWrite: 0 }, "usage is the sum of every shard");
  const f2 = r.findings.find((f) => f.id === "s2");
  assert.equal(f2.verdict, "false");
  assert.equal(f2.basis, "Fact 2 is otherwise.");
  assert.equal(f2.explanation, "Wrong 2.");
  const f1 = r.findings.find((f) => f.id === "s1");
  assert.deepEqual(f1, { id: "s1", verdict: "accurate", explanation: "", revision: "", confidence: "medium" }, "a clean finding carries no basis");
});

test("admitCalls is asked once with the number of EXTRA calls; refused or throwing, the check is one call", async () => {
  const sentences = [1, 2, 3, 4, 5, 6, 7].map(sentence);
  let asked = [];
  let calls = stubFetch();
  await runFactCheck({ text: "doc", sentences, admitCalls: (n) => { asked.push(n); return true; } });
  assert.deepEqual(asked, [2]);
  assert.equal(calls.length, 3);

  calls = stubFetch();
  const r = await runFactCheck({ text: "doc", sentences, admitCalls: () => false });
  assert.equal(calls.length, 1, "refused: one call");
  assert.deepEqual(r.findings.map((f) => f.id), sentences.map((s) => s.id));
  assert.equal(r.shards, undefined);

  calls = stubFetch();
  await runFactCheck({ text: "doc", sentences, admitCalls: () => { throw new Error("db"); } });
  assert.equal(calls.length, 1, "a hook that throws refuses");

  calls = stubFetch();
  await runFactCheck({ text: "doc", sentences: sentences.slice(0, 3), admitCalls: () => { throw new Error("never asked"); } });
  assert.equal(calls.length, 1, "one shard never asks");
});

test("a failing shard reports what the other shards were billed", async () => {
  stubFetch({ fail: (ids) => ids[0] === "s4" });
  const sentences = [1, 2, 3, 4, 5, 6, 7].map(sentence);
  const err = await runFactCheck({ text: "doc", sentences }).catch((e) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.llm?.usage?.input, 20, "the two shards that answered were billed 10 input tokens each");
  assert.equal(err.llm?.usage?.output, 10);
});

test("normalizeFinding: both model shapes and the old flat shape flatten to the wire shape", () => {
  assert.deepEqual(normalizeFinding({ id: "a", verdict: "accurate" }),
    { id: "a", verdict: "accurate", explanation: "", revision: "", confidence: "medium" });
  assert.deepEqual(normalizeFinding({ id: "b", verdict: "needs_citation", basis: "A government statistics office.", explanation: "Cite the source.", revision: "should be dropped", confidence: "high" }),
    { id: "b", verdict: "needs_citation", explanation: "Cite the source.", revision: "", confidence: "high", basis: "A government statistics office." });
  // The old flat shape (a mock, an older test) still reads.
  assert.deepEqual(normalizeFinding({ id: "c", verdict: "accurate", explanation: "ignored", revision: "ignored", confidence: "low" }),
    { id: "c", verdict: "accurate", explanation: "", revision: "", confidence: "low" });
  assert.equal(normalizeFinding({ id: "d", verdict: "nonsense" }).verdict, "no_claim");
});

test("a 'false' with no stated basis is a doubt, not a contradiction: demoted to questionable", () => {
  const f = normalizeFinding({ id: "e", verdict: "false", basis: "", explanation: "Seems off.", revision: "Fixed.", confidence: "high" });
  assert.equal(f.verdict, "questionable");
  assert.equal(f.explanation, "Seems off.");
  assert.equal(f.basis, undefined);
  const g = normalizeFinding({ id: "f", verdict: "false", basis: "The Wall is not visible unaided from orbit.", explanation: "", revision: "x", confidence: "high" });
  assert.equal(g.verdict, "false");
  assert.equal(g.explanation, g.basis, "an empty explanation falls back to the basis");
});

test("the union schema is strict-mode clean, and a loose branch is caught", () => {
  const ok = { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: { anyOf: [
    { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } },
    { type: "object", additionalProperties: false, required: ["id", "why"], properties: { id: { type: "string" }, why: { type: "string" } } },
  ] } } } };
  assert.doesNotThrow(() => assertStrictSchema(ok, "t"));
  const loose = structuredClone(ok);
  delete loose.properties.items.items.anyOf[1].additionalProperties;
  assert.throws(() => assertStrictSchema(loose, "t"), /additionalProperties:false/);
  const unlisted = structuredClone(ok);
  unlisted.properties.items.items.anyOf[1].required = ["id"];
  assert.throws(() => assertStrictSchema(unlisted, "t"), /missing why/);
});

test("an id the model left out is asked again once, on its own; a second miss stands", async () => {
  // The first call drops s2; the retry (call 2, for s2 alone) answers it.
  let calls = stubFetch({ omit: (id, n) => id === "s2" && n === 1 });
  const r = await runFactCheck({ text: "doc", sentences: [1, 2, 3].map(sentence) });
  assert.deepEqual(calls, [["s1", "s2", "s3"], ["s2"]]);
  assert.deepEqual(r.findings.map((f) => f.id).sort(), ["s1", "s2", "s3"]);
  assert.equal(r.usage.input, 20, "both calls billed");
  // Dropped twice: asked once more, then left for the client's next cycle.
  calls = stubFetch({ omit: (id) => id === "s2" });
  const r2 = await runFactCheck({ text: "doc", sentences: [1, 2, 3].map(sentence) });
  assert.deepEqual(calls, [["s1", "s2", "s3"], ["s2"]]);
  assert.deepEqual(r2.findings.map((f) => f.id), ["s1", "s3"]);
  // Everything missing is not a miss to retry — that is an answer that did not parse to any id.
  calls = stubFetch({ omit: () => true });
  const r3 = await runFactCheck({ text: "doc", sentences: [1, 2].map(sentence) });
  assert.equal(calls.length, 1);
  assert.deepEqual(r3.findings, []);
});

test("the missed-id retry is one more call, admitted like an extra shard: refused, the missed id stands", async () => {
  // Admitted: asked for exactly 1, and the retry runs.
  let asked = [];
  let calls = stubFetch({ omit: (id, n) => id === "s2" && n === 1 });
  let r = await runFactCheck({ text: "doc", sentences: [1, 2, 3].map(sentence), admitCalls: (n) => { asked.push(n); return true; } });
  assert.deepEqual(asked, [1]);
  assert.deepEqual(calls, [["s1", "s2", "s3"], ["s2"]]);
  assert.deepEqual(r.findings.map((f) => f.id).sort(), ["s1", "s2", "s3"]);
  // Refused (a pool with no room): no second call; s2 is left for the client's next cycle.
  calls = stubFetch({ omit: (id, n) => id === "s2" && n === 1 });
  r = await runFactCheck({ text: "doc", sentences: [1, 2, 3].map(sentence), admitCalls: () => false });
  assert.deepEqual(calls, [["s1", "s2", "s3"]]);
  assert.deepEqual(r.findings.map((f) => f.id), ["s1", "s3"]);
  assert.equal(r.usage.input, 10, "only the call made is billed");
  // Sharded: the extras are asked for first, then each shard's retry on its own.
  asked = [];
  calls = stubFetch({ omit: (id, n) => id === "s5" && n <= 2 }); // both shards answer first
  r = await runFactCheck({ text: "doc", sentences: [1, 2, 3, 4, 5, 6].map(sentence), admitCalls: (n) => { asked.push(n); return true; } });
  assert.deepEqual(asked, [1, 1], "one extra shard, then one retry");
  assert.equal(calls.length, 3);
  assert.deepEqual(r.findings.map((f) => f.id).sort(), ["s1", "s2", "s3", "s4", "s5", "s6"]);
});

/* A shard that never answers, the way one did on 2026-10-03 (over two
 * minutes, then `timeout`). The stub waits on the abort signal the provider
 * passes to fetch, so the deadline under test is the real one. */
function stubHang(hangs) {
  stubFetch();
  const answer = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const ids = [...String(JSON.parse(opts.body).input).matchAll(/^\[(s\d+)\]/gm)].map((m) => m[1]);
    if (!hangs(ids)) return answer(url, opts);
    return new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(opts.signal.reason)));
  };
}

test("a hung shard gives up at the shard deadline and the check answers with the shards that did", async () => {
  stubHang((ids) => ids.includes("s4"));
  const logged = [];
  const t0 = Date.now();
  const r = await runFactCheck({
    text: "doc", sentences: [1, 2, 3, 4, 5, 6, 7].map(sentence),
    shardTimeoutMs: 80, onShardFailure: (e) => logged.push(e.kind),
  });
  assert.ok(Date.now() - t0 < 2_000, "bounded by the shard deadline, not 120 s");
  assert.deepEqual(r.findings.map((f) => f.id), ["s1", "s2", "s3", "s7"], "the hung shard's ids are omitted, for the client to re-send");
  assert.deepEqual(Object.keys(r).sort(), ["findings", "model", "shards", "usage"], "the response shape is unchanged");
  assert.equal(r.shards, 3);
  // The shards that answered (20 in, 10 out), and the hung one at its worst
  // case: it was sent, and a dropped request runs and bills to its end, so it
  // is no longer free (2026-10-17) — its bytes as input priced as cache
  // writes, and its whole 16,000-token output ceiling.
  assert.equal(r.usage.output, 10 + 16_000, "answered shards + the hung shard's output ceiling");
  assert.ok(r.usage.input > 20 && r.usage.cacheWrite === r.usage.input - 20, `the hung shard's request bytes, as cache writes (${r.usage.input})`);
  assert.deepEqual(logged, ["timeout"], "the dropped shard is still reported for the failure log");
});

test("every shard hung: the check fails with the same timeout error as before", async () => {
  stubHang(() => true);
  await assert.rejects(
    runFactCheck({ text: "doc", sentences: [1, 2, 3, 4].map(sentence), shardTimeoutMs: 50 }),
    (e) => e.kind === "timeout" && e.message === "The model took too long to answer — try a smaller portion of text." && e.status === 504,
  );
});

test("a one-shard check is bounded by the deadline too, and fails with the same error", async () => {
  stubHang(() => true);
  const t0 = Date.now();
  await assert.rejects(runFactCheck({ text: "doc", sentences: [1, 2].map(sentence), shardTimeoutMs: 50 }), (e) => e.kind === "timeout");
  assert.ok(Date.now() - t0 < 2_000);
});

test("a non-timeout failure still fails the whole check, deadline or not", async () => {
  stubFetch({ fail: (ids) => ids.includes("s4") });
  await assert.rejects(runFactCheck({ text: "doc", sentences: [1, 2, 3, 4, 5, 6, 7].map(sentence), shardTimeoutMs: 5_000 }), (e) => e.kind === "server");
});

test("without a deadline (eval harness, Explain in depth) a timeout fails the check as before", async () => {
  // The provider's own deadline firing, with no shardTimeoutMs passed: no partial answer.
  stubFetch({ fail: () => false });
  const answer = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (opts.body.includes("[s4]")) { const e = new Error("t"); e.name = "TimeoutError"; throw e; }
    return answer(url, opts);
  };
  await assert.rejects(runFactCheck({ text: "doc", sentences: [1, 2, 3, 4, 5, 6, 7].map(sentence) }), (e) => e.kind === "timeout");
});

test("a call larger than one shard keeps the 120 s deadline", async () => {
  // admitCalls refused: seven sentences in ONE call, over the shard size of 3.
  let seen = null;
  stubFetch();
  const answer = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { seen = opts.signal; return answer(url, opts); };
  await runFactCheck({ text: "doc", sentences: [1, 2, 3, 4, 5, 6, 7].map(sentence), admitCalls: () => false, shardTimeoutMs: 1 });
  await sleep(30);
  assert.ok(seen && !seen.aborted, "a 1 ms deadline would have aborted it");
});

/* ── a finding copied onto the wrong sentence (owner, 2026-10-30) ──
 * The accuracy run on production, checkset-hard h4s08 and h4s09, both reps:
 * the model wrote h4s09's finding twice, once on the von Braun sentence. */
const { dropCopiedFindings } = await import("../lib/factcheck.js");
const VON_BRAUN = { id: "s8", text: "As the Smithsonian's National Air and Space Museum notes, Wernher von Braun, whose team led the development of the Saturn rockets, had been a Nazi Party member and an SS officer." };
const COLUMBIA = { id: "s9", text: "On July 20, 1969, the lunar module Columbia touched down on the Moon while Michael Collins waited in orbit aboard Eagle." };
const APOLLO = { verdict: "false", basis: "Apollo 11's lunar module was Eagle, while its command module Columbia remained in lunar orbit.", explanation: "The sentence reverses the names of Apollo 11's lunar and command modules.", revision: "r", confidence: "high" };

test("dropCopiedFindings: the von Braun sentence loses the Apollo finding it was given; the Apollo sentence keeps it", () => {
  const out = dropCopiedFindings([{ id: "s8", ...APOLLO }, { id: "s9", ...APOLLO }], [VON_BRAUN, COLUMBIA]);
  assert.deepEqual(out.map((f) => f.id), ["s9"]);
  // The same copy with a basis that differs in its last words: the explanation alone gives it away.
  const again = dropCopiedFindings([{ id: "s8", ...APOLLO, basis: "Apollo 11's lunar module was Eagle; Columbia carried Michael Collins in lunar orbit." }, { id: "s9", ...APOLLO }], [VON_BRAUN, COLUMBIA]);
  assert.deepEqual(again.map((f) => f.id), ["s9"]);
});

test("dropCopiedFindings: nothing is dropped unless one sentence holds the words and another holds none", () => {
  const same = { verdict: "false", basis: "The Treaty of Versailles was signed on 28 June 1919, not in 1920.", explanation: "The Treaty of Versailles was signed in 1919, not 1920.", revision: "r", confidence: "high" };
  const a = { id: "a", text: "The Treaty of Versailles was signed in 1920." };
  const b = { id: "b", text: "Germany signed the Versailles treaty in 1920, ending the war." };
  const c = { id: "c", text: "It changed the map of Europe." };
  const d = { id: "d", text: "Nobody expected what came next." };
  // Two sentences that both hold the words: two real findings that happen to read the same.
  assert.equal(dropCopiedFindings([{ id: "a", ...same }, { id: "b", ...same }], [a, b]).length, 2);
  // Neither holds them: no way to tell which is the original, so both stand.
  assert.equal(dropCopiedFindings([{ id: "c", ...same }, { id: "d", ...same }], [c, d]).length, 2);
  // Different explanations: nothing to compare.
  assert.equal(dropCopiedFindings([{ id: "s8", ...APOLLO, explanation: "Von Braun was never in the SS.", basis: "Von Braun joined the Nazi Party in 1937." }, { id: "s9", ...APOLLO }], [VON_BRAUN, COLUMBIA]).length, 2);
  // A short generic explanation is not taken for a copy.
  const short = { verdict: "false", explanation: "The date is wrong.", revision: "r", confidence: "high" };
  assert.equal(dropCopiedFindings([{ id: "s8", ...short }, { id: "s9", ...short, explanation: "The date is wrong." }], [VON_BRAUN, COLUMBIA]).length, 2);
});

test("dropCopiedFindings: citation requests and clean sentences are never touched", () => {
  const cite = { verdict: "needs_citation", basis: "A space agency or a history of the space program.", explanation: "The specific measurements need a source.", revision: "", confidence: "high" };
  const sputnik = { id: "s2", text: "Sputnik 1 weighed about 184 pounds and took roughly an hour and a half to circle the planet." };
  const out = dropCopiedFindings([{ id: "s2", ...cite }, { id: "s8", ...cite }, { id: "s9", verdict: "accurate", explanation: "", revision: "", confidence: "high" }], [sputnik, VON_BRAUN, COLUMBIA]);
  assert.equal(out.length, 3);
  assert.deepEqual(dropCopiedFindings([], []), []);
});

test("runFactCheck: a copied finding is dropped and that sentence asked again, alone, in one more call", async () => {
  const calls = [];
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    const user = typeof body.input === "string" ? body.input : JSON.stringify(body.input);
    const ids = [...user.matchAll(/^\[(s\d+)\]/gm)].map((m) => m[1]);
    calls.push(ids);
    const findings = ids.length > 1 ? [{ id: "s8", ...APOLLO }, { id: "s9", ...APOLLO }] : [{ id: "s8", verdict: "accurate" }];
    return { ok: true, json: async () => ({ status: "completed", model: body.model, output_text: JSON.stringify({ findings }), output: [], usage: { input_tokens: 10, output_tokens: 5 } }) };
  };
  const r = await runFactCheck({ text: `${VON_BRAUN.text} ${COLUMBIA.text}`, sentences: [VON_BRAUN, COLUMBIA], model: "gpt-5.6-luna" });
  assert.deepEqual(calls, [["s8", "s9"], ["s8"]], "the copy's sentence asked again on its own");
  assert.deepEqual(r.findings.map((f) => [f.id, f.verdict]).sort(), [["s8", "accurate"], ["s9", "false"]]);
  assert.equal(r.usage.input, 20, "both calls billed");
});
