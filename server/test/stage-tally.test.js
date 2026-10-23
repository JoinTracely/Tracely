/* The hourly stage lines (lib/stageTally.js, Codex review S1): where a source
 * search's time went and why its sources went unread, per route and pool,
 * numbers and fixed labels only. */
import test from "node:test";
import assert from "node:assert/strict";
import { tallyStages, takeStageLines, STAGES } from "../lib/stageTally.js";

test("each stage's p50 / p95 / max, how many searches backed the sentence, and the read outcomes", () => {
  takeStageLines(); // start clean
  for (let i = 1; i <= 20; i++) {
    tallyStages("/api/sources", "paid", { wait: 10, search: i * 100, complete: 50, read: 1000, judge: 2000, trim: i === 20 ? 3000 : 0, total: 5000 + i },
      { reads: { abstract: 2, page: 1, blocked: i % 2 }, backed: i <= 15 });
  }
  const lines = takeStageLines();
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "[tracely] stages route=/api/sources pool=paid n=20 backed=15 wait=10/10/10 search=1000/1900/2000 complete=50/50/50 read=1000/1000/1000 judge=2000/2000/2000 trim=0/0/3000 total=5010/5019/5020 (ms p50/p95/max)");
  assert.equal(lines[1], "[tracely] reads route=/api/sources pool=paid abstract=40 page=20 blocked=10");
  assert.deepEqual(takeStageLines(), [], "a take starts the hour afresh");
});

test("one line pair per route and pool; a stage that was not timed is left out", () => {
  takeStageLines();
  tallyStages("/api/verify-sources", "app", { wait: 3, read: 800, judge: 1200, trim: 0, total: 2003 }, { reads: { "abstract+page": 1 }, backed: true });
  tallyStages("/api/sources", "extension", { wait: 5, total: 40 }, {}); // the mock answer: nothing but its total
  tallyStages("/api/sources", "beta", { wait: 5, total: 40 }, {});
  const lines = takeStageLines();
  assert.deepEqual(lines, [
    "[tracely] stages route=/api/sources pool=beta n=1 backed=0 wait=5/5/5 total=40/40/40 (ms p50/p95/max)",
    "[tracely] stages route=/api/sources pool=extension n=1 backed=0 wait=5/5/5 total=40/40/40 (ms p50/p95/max)",
    "[tracely] stages route=/api/verify-sources pool=app n=1 backed=1 wait=3/3/3 read=800/800/800 judge=1200/1200/1200 trim=0/0/0 total=2003/2003/2003 (ms p50/p95/max)",
    "[tracely] reads route=/api/verify-sources pool=app abstract+page=1",
  ]);
});

test("never a word of anyone's text: labels outside the fixed lists collapse to 'other'", () => {
  takeStageLines();
  tallyStages("a student's sentence about vaccines", "paid", { total: 1 }, { reads: { "https://example.org/private": 1, pdf: 1 } });
  tallyStages("/api/sources", "Someone@Example.com", { total: 1, "a word": 5 }, {});
  const text = takeStageLines().join("\n");
  assert.doesNotMatch(text, /sentence|vaccines|example|Someone|a word/);
  assert.match(text, /route=other pool=paid/);
  assert.match(text, /route=\/api\/sources pool=other/);
  assert.match(text, /reads route=other pool=paid pdf=1 other=1/);
});

test("a busy hour keeps a bounded sample, and bad numbers are not counted", () => {
  takeStageLines();
  for (let i = 0; i < 5_000; i++) tallyStages("/api/sources", "paid", { search: 100, total: Number.NaN, judge: -4 });
  const [line] = takeStageLines();
  assert.match(line, /n=5000 backed=0 search=100\/100\/100 \(ms/);
  assert.doesNotMatch(line, /total=|judge=/);
  assert.deepEqual(STAGES, ["wait", "search", "complete", "read", "judge", "trim", "total"]);
});
