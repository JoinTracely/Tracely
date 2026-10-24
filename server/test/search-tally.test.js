/* The cost counters (2026-10-24): each source search's cost and outcome by
 * pool and mode, and what the extension's lookups were tagged with
 * (lib/searchTally.js); and the same request from the same caller while the
 * first still runs (lib/dupeTally.js). Numbers and fixed labels only. */
import test from "node:test";
import assert from "node:assert/strict";
import { startSearch, noteSearchCost, endSearch, searchOutcome, lookupTags, takeSearchLines, LOOKUP_TAGS } from "../lib/searchTally.js";
import { noteArrival, noteDupeCost, noteDone, takeDupeLines, runningCount } from "../lib/dupeTally.js";
import { MICRO_CENTS_PER_USD } from "../lib/spend.js";

const cents = (c) => (c / 100) * MICRO_CENTS_PER_USD;
const src = (stance, verified = true) => ({ url: "https://example.org", stance, verified });

test("the outcome is the extension's own: a read source that backs it, else one that refutes it, else unread, else unverified", () => {
  assert.equal(searchOutcome([src("refutes"), src("supports")]), "backed");
  assert.equal(searchOutcome([src("context"), src("refutes")]), "refuted");
  assert.equal(searchOutcome([src("supports", false), src("refutes", false)]), "unread", "found, but read none");
  assert.equal(searchOutcome([src("context")]), "unverified");
  assert.equal(searchOutcome([]), "unverified");
  assert.equal(searchOutcome(undefined), "unverified");
  assert.equal(searchOutcome([{ url: "x", stance: "supports" }]), "backed", "a server without receipts sends no `verified`");
});

test("a lookup's tags are kept only as their fixed values", () => {
  assert.deepEqual(lookupTags({ rank: "0", pick: "2", doc: "related", elsewhere: "looked" }), { rank: "0", pick: "2", doc: "related", elsewhere: "looked" });
  assert.deepEqual(lookupTags({ rank: 3, pick: 5, doc: "none", elsewhere: "no" }), { rank: "3", pick: "5", doc: "none", elsewhere: "no" }, "numbers as sent by an older build");
  assert.deepEqual(lookupTags({ rank: "a student's sentence", pick: 9, doc: { nested: 1 }, elsewhere: "https://example.org" }), { rank: "?", pick: "?", doc: "?", elsewhere: "?" });
  assert.deepEqual(lookupTags(undefined), { rank: "?", pick: "?", doc: "?", elsewhere: "?" });
  assert.deepEqual(Object.keys(LOOKUP_TAGS), ["rank", "pick", "doc", "elsewhere"]);
});

test("per pool and mode: searches, failures, every cent charged (a billed failure too), each outcome, and the cost of a backed answer", () => {
  takeSearchLines();
  for (const [outcome, c] of [["backed", 1.2], ["backed", 1.4], ["refuted", 1.3], ["unverified", 1.1], ["unread", 1.0]]) {
    const h = startSearch({ pool: "extension", mode: "lookup", tags: { rank: "0", pick: "1", doc: "none", elsewhere: "no" } });
    noteSearchCost(h, cents(c));
    endSearch(h, outcome);
  }
  const failed = startSearch({ pool: "extension", mode: "lookup", tags: { rank: "3", pick: "5", doc: "related", elsewhere: "looked" } });
  noteSearchCost(failed, cents(1.0)); // billed, then it failed
  endSearch(failed, "failed");
  endSearch(failed, "failed"); // counted once
  const manual = startSearch({ pool: "paid", mode: "search", tags: { rank: "0" } });
  noteSearchCost(manual, cents(1.25));
  endSearch(manual, "backed");
  const lines = takeSearchLines();
  assert.deepEqual(lines, [
    "[tracely] searches route=/api/sources pool=extension mode=lookup n=6 failed=1 cost=$0.0700 backed=2 refuted=1 unverified=1 unread=1 perBacked=$0.0350",
    "[tracely] searches route=/api/sources pool=paid mode=search n=1 failed=0 cost=$0.0125 backed=1 refuted=0 unverified=0 unread=0 perBacked=$0.0125",
    "[tracely] lookup-tags pool=extension rank=0:5/2/1/1,3:1/0/0/0 pick=1:5/2/1/1,5:1/0/0/0 doc=none:5/2/1/1,related:1/0/0/0 elsewhere=looked:1/0/0/0,no:5/2/1/1 (n/backed/refuted/unverified)",
  ], "a writer's own search carries no tags");
  assert.deepEqual(takeSearchLines(), [], "a take starts the hour afresh");
});

test("never a word of anyone's text, a URL or a caller id: labels outside the fixed lists collapse", () => {
  takeSearchLines();
  const h = startSearch({ route: "a student's sentence", pool: "Someone@Example.com", mode: "vaccines", tags: { rank: "vaccines cause autism" } });
  endSearch(h, "https://example.org/private");
  const lookup = startSearch({ pool: "extension", mode: "lookup", tags: { rank: "vaccines cause autism", doc: "https://example.org" } });
  endSearch(lookup, "backed");
  const text = takeSearchLines().join("\n");
  assert.doesNotMatch(text, /student|sentence|Someone|Example|vaccines|autism|example\.org/i);
  assert.match(text, /route=other pool=other mode=other n=1 failed=1/);
  assert.match(text, /rank=\?:1\/1\/0\/0/);
});

test("duplicates: the same request from the same caller while one runs is counted, with what it cost; a different input or caller is not", () => {
  takeDupeLines();
  const a = noteArrival("/api/check", "install:abc", { text: "t", sentences: [{ id: "1", text: "s" }] });
  const b = noteArrival("/api/check", "install:abc", { text: "t", sentences: [{ id: "1", text: "s" }] });
  const c = noteArrival("/api/check", "install:abc", { text: "t", sentences: [{ id: "1", text: "other" }] });
  const d = noteArrival("/api/check", "install:xyz", { text: "t", sentences: [{ id: "1", text: "s" }] });
  assert.equal(a.dupe, false);
  assert.equal(b.dupe, true);
  assert.equal(c.dupe, false, "another input");
  assert.equal(d.dupe, false, "another caller");
  noteDupeCost(a, cents(0.1)); // the first one's cost is not a duplicate's
  noteDupeCost(b, cents(0.09));
  for (const t of [a, b, c, d]) noteDone(t);
  noteDone(a); // released once
  const e = noteArrival("/api/check", "install:abc", { text: "t", sentences: [{ id: "1", text: "s" }] });
  assert.equal(e.dupe, false, "nothing in flight any more");
  noteDone(e);
  assert.equal(noteArrival("/api/sources", null, { claim: "x" }), null, "an unidentified caller is not counted");
  assert.equal(runningCount(), 0);
  const lines = takeDupeLines();
  assert.deepEqual(lines, ["[tracely] dupes route=/api/check arrivals=5 dupes=1 (20%) cost=$0.0009"]);
  assert.doesNotMatch(lines.join("\n"), /abc|xyz|install/);
});
