/* One fetch per page per source search (citeMeta.js sharedPages, Codex review
 * S2): completing a source's citation fields and reading it for its receipt
 * used to fetch the same page twice. They now share one fetch, and each still
 * reads exactly what it read before. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setHostResolver, sharedPages, pageBody, fetchUrlMetadata, SHARED_PAGE_BYTES } from "../lib/citeMeta.js";

test.before(() => setHostResolver(async () => [{ address: "93.184.216.34" }]));
test.after(() => setHostResolver(null));

const NOW = new Date("2026-10-22T12:00:00Z");
const NATURE = readFileSync(new URL("./fixtures/cite-url/nature-numpy.html", import.meta.url), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const html = (body, { status = 200, type = "text/html; charset=utf-8" } = {}) => new Response(body, { status, headers: { "content-type": type } });

test("a page is fetched once however many readers ask, and each read is counted", async () => {
  let fetches = 0;
  const pages = sharedPages({ fetchImpl: async () => { fetches++; return html("<p>hello</p>"); } });
  pages.start("https://example.org/a");
  const [x, y] = await Promise.all([pages.get("https://example.org/a"), pages.get(" https://example.org/a ")]);
  assert.equal(fetches, 1);
  assert.equal(x, y, "the same answer");
  assert.equal(pageBody(x, 100), "<p>hello</p>");
  assert.deepEqual(pages.counts, { fetched: 1, reads: 2 }, "start() fetches without counting as a read");
  await pages.get("https://example.org/b");
  assert.deepEqual(pages.counts, { fetched: 2, reads: 3 });
  pages.close();
});

test("a reader's deadline stops its own waiting, never the fetch: a later reader gets the page", async () => {
  let fetches = 0;
  const pages = sharedPages({ fetchImpl: async () => { fetches++; await sleep(80); return html("<p>slow</p>"); } });
  // Completing the citation gives up first (its 2.5 s, here 20 ms)…
  await assert.rejects(pages.get("https://slow.example/x", { signal: AbortSignal.timeout(20) }), (e) => e.name === "TimeoutError" || e.name === "AbortError");
  // …and the receipt check, whose deadline is later, still reads it, with no second fetch.
  const page = await pages.get("https://slow.example/x", { signal: AbortSignal.timeout(2_000) });
  assert.equal(pageBody(page, 100), "<p>slow</p>");
  assert.equal(fetches, 1);
  pages.close();
});

test("the citation reader reads the same thing through the shared fetch as on its own", async () => {
  const fetchImpl = async () => html(NATURE);
  const alone = await fetchUrlMetadata("https://www.nature.com/articles/s41586-020-2649-2", { now: NOW, fetchImpl });
  const pages = sharedPages({ fetchImpl });
  const shared = await fetchUrlMetadata("https://www.nature.com/articles/s41586-020-2649-2", { now: NOW, fetchImpl, pages });
  assert.deepEqual(shared, alone);
  pages.close();

  // A dead page, a wall and an error are refused alike.
  for (const [status, body] of [[404, ""], [410, ""], [403, "Access Denied"], [500, "oops"]]) {
    const fi = async () => html(body, { status });
    const a = await fetchUrlMetadata("https://example.org/p", { now: NOW, fetchImpl: fi }).catch((e) => e.message);
    const p = sharedPages({ fetchImpl: fi });
    const b = await fetchUrlMetadata("https://example.org/p", { now: NOW, fetchImpl: fi, pages: p }).catch((e) => e.message);
    assert.equal(b, a, `HTTP ${status}`);
    p.close();
  }
});

test("each reader cuts the body to its own limit, as before: bytes first, then characters", async () => {
  const body = "é".repeat(SHARED_PAGE_BYTES); // two bytes each: more than the shared cap
  const pages = sharedPages({ fetchImpl: async () => html(body) });
  const page = await pages.get("https://big.example/x");
  assert.equal(page.bytes.length, SHARED_PAGE_BYTES, "only the shared cap is kept");
  const bytes = new TextEncoder().encode(body);
  // The verifier's cut (MAX_PAGE_BYTES, 1.5 MB) and the citation reader's (1 MB of bytes, then 500,000 characters).
  assert.equal(pageBody(page, 1_500_000, 1_500_000), new TextDecoder().decode(bytes.subarray(0, 1_500_000)));
  assert.equal(pageBody(page, 1_000_000, 500_000), new TextDecoder().decode(bytes.subarray(0, 1_000_000)).slice(0, 500_000));
  // A body with no stream (a test's stand-in) is cut by characters, as before.
  assert.equal(pageBody({ text: "abcdef" }, 1_000_000, 4), "abcd");
  pages.close();
});

test("a body no reader would use is never read: a PDF or an image", async () => {
  let pulled = 0;
  const stream = new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(1024)); } });
  const pages = sharedPages({ fetchImpl: async () => new Response(stream, { status: 200, headers: { "content-type": "application/pdf" } }) });
  const page = await pages.get("https://files.example/report");
  assert.equal(page.type, "application/pdf");
  assert.equal(page.bytes, null);
  assert.ok(pulled <= 1, `the stream was not drained (${pulled} pulls)`);
  pages.close();
});

test("close() ends what is still coming in; a bad address is refused, not thrown", async () => {
  // Like fetch: an aborted signal rejects, at once if it already was.
  const pages = sharedPages({ fetchImpl: (url, init) => new Promise((_, reject) => {
    if (init.signal.aborted) reject(new Error("aborted"));
    init.signal.addEventListener("abort", () => reject(new Error("aborted")));
  }) });
  const waiting = pages.get("https://never.example/x");
  pages.close();
  await assert.rejects(waiting, /aborted/);
  assert.doesNotThrow(() => pages.start("not a url"));
  await assert.rejects(pages.get("not a url"), TypeError);
});
