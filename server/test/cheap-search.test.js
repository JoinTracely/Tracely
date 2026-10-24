/* A cheaper web search first, OpenAI's as its fallback (lib/searchApi.js,
 * factcheck.js cheapFirst). Owner, 2026-10-24: "implement the system with
 * openai's search as a fallback". The rule the tests hold: no source search
 * ends with fewer backing sources than OpenAI's search alone gives it, a
 * cheaper search that answers charges no web_search fee, and with no
 * provider set nothing changes. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDERS, searchProvider, searchQueryFor, candidateResults } from "../lib/searchApi.js";
import { cheapFirst, findSources } from "../lib/factcheck.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLAIM = "Most high school students in the United States sleep fewer than 8 hours on school nights (CDC, 2023).";
const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

test("no provider, an unknown one, or no key: off, and every search is OpenAI's as before", () => {
  assert.equal(searchProvider({}), null);
  assert.equal(searchProvider({ TRACELY_SEARCH_PROVIDER: "brave" }), null, "no key");
  assert.equal(searchProvider({ TRACELY_SEARCH_PROVIDER: "altavista", BRAVE_SEARCH_API_KEY: "k" }), null);
  assert.equal(searchProvider({ TRACELY_SEARCH_PROVIDER: "toString", toString: "k" }), null, "only a provider of ours");
  const brave = searchProvider({ TRACELY_SEARCH_PROVIDER: " Brave ", BRAVE_SEARCH_API_KEY: "k" });
  assert.equal(brave.name, "brave");
  assert.equal(brave.microCentsPerQuery, Math.round((PROVIDERS.brave.defaultPricePer1k / 1000) * 1e8), "the list price, in millionths of a cent");
  assert.equal(brave.microCentsPerQuery, 500_000, "Brave's $5 per 1,000: half a cent a search");
  assert.equal(searchProvider({ TRACELY_SEARCH_PROVIDER: "brave", BRAVE_SEARCH_API_KEY: "k", TRACELY_SEARCH_PRICE_PER_1K_USD: "3" }).microCentsPerQuery, 300_000, "the plan's own price");
  assert.equal(searchProvider({ TRACELY_SEARCH_PROVIDER: "brave", BRAVE_SEARCH_API_KEY: "k", TRACELY_SEARCH_PRICE_PER_1K_USD: "nonsense" }).microCentsPerQuery, 500_000);
  // A scraper of Google's results is not one of ours (the comparison of 2026-10-24).
  assert.equal(searchProvider({ TRACELY_SEARCH_PROVIDER: "serper", SERPER_API_KEY: "k" }), null);
  assert.deepEqual(Object.keys(PROVIDERS), ["brave"]);
});

test("the query is the sentence without its citation, quote marks or brackets; only the query leaves", () => {
  assert.equal(searchQueryFor(CLAIM), "Most high school students in the United States sleep fewer than 8 hours on school nights .");
  assert.equal(searchQueryFor('The report said "half of teens" were tired [3] (Smith and Lee, 2019; WHO, n.d.).'), "The report said half of teens were tired .");
  assert.equal(searchQueryFor("x".repeat(900)).length, 350);
});

test("results worth reading: web pages, one per address, no PDFs, videos, social posts or shops, at most six", () => {
  const got = candidateResults([
    { url: "https://www.cdc.gov/sleep/data-research/facts-stats/high-school-students.html", title: "Sleep and high school students", snippet: "About 7 in 10…" },
    { url: "https://cdc.gov/sleep/data-research/facts-stats/high-school-students.html/", title: "dup" },
    { url: "https://www.youtube.com/watch?v=1", title: "video" },
    { url: "https://m.facebook.com/post", title: "post" },
    { url: "https://example.org/report.pdf", title: "pdf" },
    { url: "ftp://example.org/x", title: "ftp" },
    { url: "not a url", title: "junk" },
    ...Array.from({ length: 8 }, (_, i) => ({ url: `https://site${i}.org/a`, title: `S${i}` })),
  ]);
  assert.equal(got.length, 6);
  assert.equal(got[0].url, "https://www.cdc.gov/sleep/data-research/facts-stats/high-school-students.html");
  assert.ok(!got.some((r) => /youtube|facebook|\.pdf|ftp|dup/.test(r.url + r.title)));
});

test("Brave: its request, and its results read into {url, title, snippet}", async () => {
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    seen.push({ url: String(url), init });
    return new Response(JSON.stringify({ web: { results: [{ url: "https://a.org/x", title: "A <strong>page</strong>", description: "It &amp; says <b>so</b>." }] } }), { status: 200 });
  };
  const brave = await searchProvider({ TRACELY_SEARCH_PROVIDER: "brave", BRAVE_SEARCH_API_KEY: "bk" }).search("sleep teens");
  assert.deepEqual(brave, [{ url: "https://a.org/x", title: "A page", snippet: "It & says so." }]);
  assert.match(seen[0].url, /^https:\/\/api\.search\.brave\.com\/res\/v1\/web\/search\?q=sleep%20teens&count=10&country=us/);
  assert.equal(seen[0].init.headers["X-Subscription-Token"], "bk");
  assert.equal(seen[0].init.method ?? "GET", "GET");
  globalThis.fetch = async () => new Response("no", { status: 429 });
  await assert.rejects(searchProvider({ TRACELY_SEARCH_PROVIDER: "brave", BRAVE_SEARCH_API_KEY: "bk" }).search("q"), /brave answered 429/);
});

/* ── cheapFirst, with a provider, a judge and OpenAI's search that are fakes ── */
const read = (url, stance, extra = {}) => ({ title: url, url, publisher: "x", snippet: "", stance, verified: true, ...(stance === "context" ? {} : { quote: "It says so." }), ...extra });
const provider = (results, price = 50_000) => ({ name: "fake", microCentsPerQuery: price, calls: 0, async search(q) { this.calls++; this.q = q; if (results instanceof Error) throw results; return results; } });
function harness({ results, verdicts, openai }) {
  const p = provider(results);
  const calls = { judge: 0, full: 0 };
  const run = cheapFirst({
    claim: CLAIM, model: "gpt-5.6-luna", provider: p,
    judge: async (merged) => { calls.judge++; return { sources: merged.map((s) => read(s.url, verdicts[s.url] ?? "context")), usage: { input: 5000, output: 400 }, enriched: 0, dropped: 0, retracted: 0, verified: {}, stages: { complete: 1, read: 2, judge: 3, trim: 0 }, reads: {}, pages: {} }; },
    full: async () => { calls.full++; if (openai instanceof Error) throw openai; return { sources: openai, model: "gpt-5.6-luna", usage: { input: 20_000, output: 2000 }, webSearchCalls: 1, webSearchActions: { search: 1 }, stages: { search: 9 } }; },
  });
  return { run, calls, p };
}

test("the cheaper search backs it: that is the answer, and OpenAI's search never runs", async () => {
  const { run, calls, p } = harness({ results: [{ url: "https://cdc.gov/a", title: "CDC" }, { url: "https://b.org/b", title: "B" }], verdicts: { "https://cdc.gov/a": "supports" }, openai: [] });
  const r = await run;
  assert.equal(calls.full, 0);
  assert.equal(r.via, "cheap");
  assert.equal(r.webSearchCalls, 0, "no web_search fee");
  assert.equal(r.providerSearches, 1);
  assert.equal(r.providerMicroCents, 50_000);
  assert.equal(r.model, "gpt-5.6-luna");
  assert.ok(r.sources.some((s) => s.stance === "supports" && s.verified === true));
  assert.equal(p.q, searchQueryFor(CLAIM), "the sentence without its citation");
  assert.ok(Number.isInteger(r.stages.cheap));
});

test("none of the provider's snippets is kept: the judge sees the links alone, and a source's words are the page's own", async () => {
  const p = provider([{ url: "https://cdc.gov/a", title: "CDC", snippet: "Brave's own words about the page." }]);
  let given = null;
  await cheapFirst({ claim: CLAIM, model: "gpt-5.6-luna", provider: p,
    judge: async (merged) => { given = merged; return { sources: merged.map((s) => read(s.url, "supports")), usage: null, stages: {} }; },
    full: async () => { throw new Error("not reached"); } });
  assert.equal(given[0].snippet, "");
  assert.equal(given[0].stance, "context", "nothing backs it until the receipts say so");
});

test("nothing it found backs it: OpenAI's search runs as before, and a page that says otherwise is kept beside it", async () => {
  const { run, calls } = harness({
    results: [{ url: "https://a.org/1", title: "A" }, { url: "https://no.org/2", title: "No" }],
    verdicts: { "https://no.org/2": "refutes" },
    openai: [read("https://openai-found.org/x", "supports")],
  });
  const r = await run;
  assert.equal(calls.full, 1);
  assert.equal(r.via, "fallback");
  assert.equal(r.webSearchCalls, 1, "OpenAI's search, charged as before");
  assert.deepEqual(r.sources.map((s) => s.url), ["https://openai-found.org/x", "https://no.org/2"], "its backing source first, the refutation kept; the page on the topic dropped");
  assert.deepEqual(r.usage, { input: 25_000, output: 2400, cached: 0, cacheWrite: 0 }, "both passes' tokens");
  assert.equal(r.providerMicroCents, 50_000, "the cheaper search was still paid for");
});

test("the provider failed: OpenAI's search, and no provider fee", async () => {
  const { run, calls } = harness({ results: new Error("brave answered 503"), verdicts: {}, openai: [read("https://o.org/x", "context")] });
  const r = await run;
  assert.equal(calls.judge, 0);
  assert.equal(calls.full, 1);
  assert.equal(r.via, "fallback");
  assert.equal(r.providerSearches, 0);
  assert.equal(r.providerMicroCents, 0);
});

test("it found nothing worth reading: OpenAI's search, and the search it made is paid for", async () => {
  const { run, calls } = harness({ results: [{ url: "https://www.youtube.com/watch?v=1" }], verdicts: {}, openai: [read("https://o.org/x", "supports")] });
  const r = await run;
  assert.equal(calls.judge, 0, "nothing to read");
  assert.equal(r.via, "fallback");
  assert.equal(r.providerSearches, 1);
  assert.equal(r.providerMicroCents, 50_000);
});

test("OpenAI's search fails after the cheaper one: the error carries the cheaper pass's tokens and fee, so it is still charged", async () => {
  const boom = new Error("vendor down");
  Object.defineProperty(boom, "llm", { value: { model: "gpt-5.6-luna", usage: { input: 100, output: 10 }, webSearchCalls: 1 }, enumerable: false, configurable: true });
  const { run } = harness({ results: [{ url: "https://a.org/1", title: "A" }], verdicts: {}, openai: boom });
  await assert.rejects(run, (err) => {
    assert.equal(err, boom);
    assert.deepEqual(err.llm.usage, { input: 5100, output: 410, cached: 0, cacheWrite: 0 });
    assert.equal(err.llm.extraMicroCents, 50_000);
    assert.equal(err.llm.webSearchCalls, 1);
    return true;
  });
});

test("findSources: a correction search, or a server with no provider, never takes the cheaper path", async () => {
  // A provider that would fail the test if asked.
  const never = { name: "never", microCentsPerQuery: 1, search: async () => { throw new Error("must not be asked"); } };
  process.env.OPENAI_API_KEY = "sk-test";
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    bodies.push(String(url));
    return new Response(JSON.stringify({ status: "completed", model: "gpt-5.6-luna", usage: { input_tokens: 10, output_tokens: 10 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ sources: [] }) }] }] }), { status: 200 });
  };
  // A correction: OpenAI's search alone (it answers no sources: the usual 502).
  await assert.rejects(findSources({ claim: CLAIM, correction: "Most sleep less than 8 hours.", model: "gpt-5.6-luna", provider: never, enrich: false }), /No usable sources/);
  // No provider set (provider: null): the same.
  await assert.rejects(findSources({ claim: CLAIM, model: "gpt-5.6-luna", provider: null, enrich: false }), /No usable sources/);
  assert.ok(bodies.every((u) => /openai/.test(u)));
  // The mock never searches anything.
  const mock = await findSources({ claim: CLAIM, model: "gpt-5.6-luna", mock: true, provider: never });
  assert.ok(Array.isArray(mock.sources));
});

test("wiring: the route charges the provider's fee and no web_search fee for a cheap answer, logs which search answered, and keeps it out of the response", () => {
  const src = readFileSync(path.join(HERE, "..", "server.js"), "utf8");
  assert.match(src, /via, provider: searchApi, providerSearches, providerMicroCents, \.\.\.result \} = answer;/, "out of the frozen response");
  assert.match(src, /webSearchCalls: via === "cheap" \? 0 : searchFee\(webSearchCalls\), extraMicroCents: providerMicroCents \?\? 0/);
  assert.match(src, /gate\.costVia = via \?\? "openai";/);
  assert.match(src, / via=\$\{via \?\? "openai"\}/);
  assert.match(src, /extraMicroCents: err\.llm\.extraMicroCents \?\? 0/, "a failed fallback still charges the cheaper pass");
  assert.match(src, /if \(\(route !== "\/api\/sources" && route !== "\/api\/sources\/stream"\) \|\| !searchProvider\(\)\) return base;/, "the reservation grows only with a provider set");
  const spend = readFileSync(path.join(HERE, "..", "lib", "spend.js"), "utf8");
  assert.match(spend, /costMicroCents\(model, usage, \{ webSearchCalls \}\) \+ Math\.max\(0, Math\.round\(Number\(extraMicroCents\) \|\| 0\)\)/);
});
