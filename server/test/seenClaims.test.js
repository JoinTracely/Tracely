import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { noteClaimSeen, claimHash, normalizeClaim, resetSeen, seenSize, takeRepeatLines, SEEN_TTL_MS, SEEN_MAX } from "../lib/seenClaims.js";

test("the same claim, differently punctuated or cased, is one hash; a different claim is another; nothing stored is the text", () => {
  resetSeen();
  assert.equal(normalizeClaim("  Finland’s literacy rate is 100%!  "), "finlands literacy rate is 100%");
  assert.equal(claimHash("Finland's literacy rate is 100%."), claimHash("finland's  LITERACY rate is 100%"));
  assert.notEqual(claimHash("Finland's literacy rate is 100%."), claimHash("Finland's literacy rate is 99%."));
  assert.match(claimHash("x"), /^[0-9a-f]{32}$/);
  assert.equal(noteClaimSeen("Finland's literacy rate is 100%."), false, "first time");
  assert.equal(noteClaimSeen("finland's literacy rate is 100%"), true, "second time, normalised");
  assert.equal(noteClaimSeen("Finland's literacy rate is 99%."), false);
});

test("a claim is forgotten after the TTL, and the table never grows past its cap", () => {
  resetSeen();
  const t0 = 1_000_000;
  assert.equal(noteClaimSeen("old claim", t0), false);
  assert.equal(noteClaimSeen("old claim", t0 + SEEN_TTL_MS - 1), true);
  assert.equal(noteClaimSeen("old claim", t0 + 2 * SEEN_TTL_MS), false, "expired");
  resetSeen();
  for (let i = 0; i < SEEN_MAX + 500; i++) noteClaimSeen(`claim number ${i}`, t0 + i);
  assert.ok(seenSize() <= SEEN_MAX, `size ${seenSize()}`);
  assert.equal(noteClaimSeen(`claim number ${SEEN_MAX + 499}`, t0 + SEEN_MAX + 600), true, "the most recent survives");
  assert.equal(noteClaimSeen("claim number 0", t0 + SEEN_MAX + 601), false, "the oldest was evicted");
});

test("the hash is keyed: a plain SHA-256 of the sentence, which anyone can compute, never matches it", () => {
  const claim = "Water boils at 100 degrees Celsius at sea level.";
  const plain = createHash("sha256").update(normalizeClaim(claim)).digest("hex").slice(0, 32);
  assert.notEqual(claimHash(claim), plain);
  assert.equal(claimHash(claim), claimHash(claim), "but it is stable within this process");
});

test("a repeat by another caller is told apart from the same caller searching again", () => {
  resetSeen();
  const t = 5_000_000;
  assert.equal(noteClaimSeen("Finland's literacy rate is 100%.", t, { caller: "user:a" }), false);
  assert.equal(noteClaimSeen("Finland's literacy rate is 100%.", t + 1, { caller: "user:a" }), true, "seen, by the same caller");
  assert.equal(noteClaimSeen("finland's literacy rate is 100%", t + 2, { caller: "install:b" }), true, "seen, by another");
  assert.equal(noteClaimSeen("finland's literacy rate is 100%", t + 3, { caller: "user:a" }), true, "user:a is still remembered");
  assert.deepEqual(takeRepeatLines(), [
    "[tracely] repeats scope=sources searches=4 seen=3 (75%) other=1 (25%) remembered=1",
  ]);
  assert.deepEqual(takeRepeatLines(), [], "each take starts the next hour fresh");
  assert.equal(noteClaimSeen("Finland's literacy rate is 100%.", t + 4, { caller: "install:b" }), true, "what was seen survives the take");
});

test("scopes never count as each other's: the try-out's sample essay is not a writer's repeat", () => {
  resetSeen();
  const t = 9_000_000;
  noteClaimSeen("Screen time harms teenagers' sleep.", t, { scope: "demo-sources", caller: "demo:1" });
  noteClaimSeen("Screen time harms teenagers' sleep.", t + 1, { scope: "demo-sources", caller: "demo:2" });
  assert.equal(noteClaimSeen("Screen time harms teenagers' sleep.", t + 2, { scope: "sources", caller: "user:c" }), false,
    "a writer's first search of a sentence the try-out also searched is not a repeat");
  assert.deepEqual(takeRepeatLines(), [
    "[tracely] repeats scope=demo-sources searches=2 seen=1 (50%) other=1 (50%) remembered=2",
    "[tracely] repeats scope=sources searches=1 seen=0 (0%) other=0 (0%) remembered=2",
  ]);
});

test("no line carries a word of the claim or a caller id", () => {
  resetSeen();
  noteClaimSeen("A very particular sentence about owls.", 1, { caller: "user:secret-id" });
  const [line] = takeRepeatLines();
  assert.ok(!/owl|particular|secret/i.test(line), line);
});

/* ── candidate buckets (cost counters, 2026-10-24) ──────────────────────── */
import { claimFeatures, noteBucket, noteBucketOutcome, takeCandidateLines } from "../lib/seenClaims.js";

const NEA = "According to the National Education Association, schools that introduced AI-powered writing assistants experienced a 73% reduction in plagiarism incidents during the 2023–2024 academic year (NEA, 2024).";

test("a claim's features: its figures with their units, its names, a negation and a direction, and for a claim with no figure and name its longer words", () => {
  assert.deepEqual(claimFeatures(NEA), ["#2023", "#2024", "#73%", "@association", "@education", "@national", "^down"], "the citation's year is not the claim's; 'AI' is a word, as in the extension");
  assert.deepEqual(claimFeatures("The NEA found that plagiarism fell by 73 percent after schools adopted AI writing tools."), ["#73%", "@nea", "^down"], "a figure and a name: bucketed by those alone, whatever the wording");
  assert.deepEqual(claimFeatures("Plagiarism fell by 73 percent, the NEA found, once schools adopted AI tools."), ["#73%", "@nea", "^down"], "so another student's wording lands in the same bucket");
  assert.ok(claimFeatures("Teachers do not use AI tools for grading.").includes("!not"), "'not' is kept: it is what the claim turns on");
  assert.notDeepEqual(claimFeatures("Teachers do not use AI tools for grading."), claimFeatures("Teachers use AI tools for grading."));
  assert.deepEqual(claimFeatures("AI is good."), [], "too little to bucket");
});

test("buckets: seen, by another caller, and by another caller whose search was backed", () => {
  resetSeen();
  const t0 = 2_000_000;
  const a = noteBucket("The NEA found that plagiarism fell by 73 percent after schools adopted AI writing tools.", t0, { scope: "lookup", caller: "user:a" });
  assert.ok(a);
  noteBucketOutcome(a, true);
  noteBucket("Plagiarism fell by 73 percent, the NEA found, once schools adopted AI tools.", t0 + 1, { scope: "lookup", caller: "user:b" }); // other, backed
  noteBucket("The NEA found that plagiarism fell by 73 percent after schools adopted AI writing tools.", t0 + 2, { scope: "lookup", caller: "user:a" }); // seen, other (b), otherBacked? only a backed it: no
  assert.equal(noteBucket("AI is good.", t0 + 3, { scope: "lookup", caller: "user:c" }), null, "no bucket");
  noteBucket("The NEA found that plagiarism fell by 73 percent.", t0 + 4, { scope: "search", caller: "user:c" }); // another scope: first time
  noteBucket("Plagiarism fell by 73 percent, the NEA found.", t0 + SEEN_TTL_MS + 10, { scope: "lookup", caller: "user:d" }); // a fortnight on: forgotten
  assert.deepEqual(takeCandidateLines(), [
    "[tracely] candidates scope=lookup searches=5 bucketed=4 seen=2 (40%) other=2 (40%) otherBacked=1 (20%) remembered=2",
    "[tracely] candidates scope=search searches=1 bucketed=1 seen=0 (0%) other=0 (0%) otherBacked=0 (0%) remembered=2",
  ]);
  assert.deepEqual(takeCandidateLines(), [], "the counts start again; the buckets are kept");
});

test("no candidate line carries a word of the claim or a caller id", () => {
  resetSeen();
  noteBucket("Owls in Finland sleep 14 hours a day, the Helsinki Zoo says.", 1, { scope: "lookup", caller: "user:secret-id" });
  const [line] = takeCandidateLines();
  assert.ok(!/owl|finland|helsinki|secret|14/i.test(line), line);
});
