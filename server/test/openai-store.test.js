/* Every request to OpenAI says `store: false` (2026-10-24, the legal
 * checklist). Without it the Responses API keeps each request and its answer,
 * a student's sentences included, for 30 days as "application state", which
 * PRIVACY.md never said. Tracely never reads a stored response back, so the
 * flag costs nothing. It is set once, in the provider's `send`, so every
 * request builder (check, flow, review, source search, the desktop's routes)
 * carries it. */
import test from "node:test";
import assert from "node:assert/strict";
import { openai } from "../lib/providers/openai.js";
import { runFactCheck } from "../lib/factcheck.js";

process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";

function capture() {
  const sent = [];
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    sent.push(body);
    return { ok: true, json: async () => ({ status: "completed", model: body.model, output_text: "{\"findings\":[]}", output: [], usage: { input_tokens: 1, output_tokens: 1 } }) };
  };
  return sent;
}

test("every request body the provider builds goes out with store: false", async () => {
  const sent = capture();
  const schema = { type: "object", properties: {}, required: [], additionalProperties: false };
  const bodies = [
    openai.structuredBody({ model: "m", system: "s", user: "u", schema, maxTokens: 10, name: "n", effort: "low" }),
    openai.textBody({ model: "m", system: "s", messages: [{ role: "user", content: "u" }], maxTokens: 10 }),
    openai.webSearchBody({ model: "m", system: "s", user: "u", maxTokens: 10, maxSearches: 3 }),
    openai.webSearchStructuredBody({ model: "m", system: "s", user: "u", schema, name: "n", maxTokens: 10, maxSearches: 4 }),
  ];
  for (const body of bodies) await openai.send(body, { key: "k", timeoutMs: 1000 });
  assert.equal(sent.length, 4);
  for (const body of sent) assert.equal(body.store, false, JSON.stringify(Object.keys(body)));
  assert.equal(sent[0].reasoning.effort, "low", "the rest of the body is untouched");
  assert.equal(sent[2].max_tool_calls, 3);
});

test("a real route's call carries it too: the extension's check", async () => {
  const sent = capture();
  await runFactCheck({ text: "Paris is the capital of France.", sentences: [{ id: "s1", text: "Paris is the capital of France." }], model: "gpt-5.6-luna", effort: "medium" });
  assert.ok(sent.length >= 1);
  assert.ok(sent.every((b) => b.store === false));
});

/* What the privacy policy says about it moves with the code (the legal
 * checklist, 2026-10-24): a policy that disagrees with what the product does
 * is the thing that gets a business in trouble. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POLICY = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "PRIVACY.md"), "utf8");

test("PRIVACY.md says what the server does: no training, asks OpenAI not to store, up to 30 days of abuse logs", () => {
  assert.match(POLICY, /every request asks OpenAI not\s+to store it/);
  assert.match(POLICY, /up to 30 days in its\s+abuse-monitoring logs/);
});

test("PRIVACY.md names the real host, the website's host, a minimum age of 13, Do Not Track, and a private contact", () => {
  assert.match(POLICY, /\*\*Railway\*\* — hosts our server/);
  assert.doesNotMatch(POLICY, /\*\*Linode\*\* — hosts our server/, "the server left the Linode on 23 October 2026");
  assert.match(POLICY, /\*\*Vercel\*\* — hosts the website/);
  assert.match(POLICY, /\*\*13 and older\*\*/);
  assert.doesNotMatch(POLICY, /school age/, "one age, stated one way");
  assert.match(POLICY, /## Do Not Track/);
  assert.match(POLICY, /info@jointracely\.com/);
  assert.doesNotMatch(POLICY, /open an issue at\s+https:\/\/github\.com/, "privacy requests never go to a public issue");
});
