/* A source search sends the sentence's own neighbourhood as `context`, never
 * the document's head (content.js searchContext; Codex review C2,
 * 2026-10-22). Every search sent the first 6,000 characters, so a claim past
 * them was searched without its paragraph: the server's claimWindow
 * (lib/factcheck.js) can only cut the claim's surroundings out of what it is
 * sent. The review reproduced it with a claim at offset 8,001. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sliceBetween } from "./helpers/anchors.js";
import { claimWindow } from "../lib/factcheck.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "..", "extension", "content.js"), "utf8");
const { searchContext } = vm.runInContext(
  `${sliceBetween(SRC, "  const SEARCH_CONTEXT_MAX", "\n  }\n")}\n  }\n({ searchContext })`, vm.createContext({}));

/* A long essay: paragraphs of five numbered sentences, each one unique, so
 * where a window starts and stops can be read off its first and last. */
function essay(sentences) {
  const out = [];
  for (let i = 1; i <= sentences; i++) out.push(`Sentence ${i} says something about topic ${i} in a plain way.${i % 5 === 0 ? "\n\n" : " "}`);
  return out.join("").trim();
}
const segOf = (text, sentence, from = 0) => { const start = text.indexOf(sentence, from); return { start, end: start + sentence.length, text: sentence }; };

test("a text that fits is sent whole, exactly as before", () => {
  const t = essay(40);
  assert.ok(t.length < 6000);
  assert.equal(searchContext(t, segOf(t, "Sentence 12 says something about topic 12 in a plain way.")), t);
});

test("a claim deep in a long essay is sent with its own paragraph, not the essay's head", () => {
  const t = essay(400);
  const claim = "Sentence 300 says something about topic 300 in a plain way.";
  const seg = segOf(t, claim);
  assert.ok(seg.start > 6000, "the claim sits past the old 6,000-character head");
  const c = searchContext(t, seg);
  assert.ok(c.length <= 6000, `${c.length} characters`);
  assert.ok(c.includes(claim));
  assert.ok(c.includes("Sentence 296 ") && c.includes("Sentence 304 "), "its neighbours on both sides");
  assert.ok(!c.includes("Sentence 1 says"), "not the essay's head");
  assert.match(c, /^Sentence \d+ /, "it starts at a sentence, never mid-word");
  assert.match(c, /[.]$/, "and stops at one");
});

test("the server's claimWindow now finds the claim the review showed it losing (offset 8,001)", () => {
  const head = "x".repeat(7999) + ". ";
  const claim = "Later school start times improved attendance at the district's high schools by 4 percent.";
  const t = `${head}${claim} The district measured it over two years. ${"Filler sentence about something else entirely. ".repeat(150)}`;
  const seg = segOf(t, claim);
  assert.equal(seg.start, 8001);
  assert.ok(!claimWindow(t.slice(0, 6000), claim).includes(claim), "before: the head never held the claim");
  const w = claimWindow(searchContext(t, seg), claim);
  assert.ok(w.includes(claim) && w.includes("The district measured it over two years."), "after: the claim and the sentence after it");
});

test("near either edge, the side cut short gives its room to the other", () => {
  const t = essay(400);
  const early = searchContext(t, segOf(t, "Sentence 2 says something about topic 2 in a plain way."));
  assert.ok(early.startsWith("Sentence 1 says"), "starts at the top");
  assert.ok(early.length > 5500, `uses the room after it (${early.length})`);
  const late = searchContext(t, segOf(t, "Sentence 399 says something about topic 399 in a plain way."));
  assert.ok(late.endsWith("Sentence 400 says something about topic 400 in a plain way."), "ends at the bottom");
  assert.ok(late.length > 5500, `uses the room before it (${late.length})`);
});

test("a repeated sentence keeps its own occurrence", () => {
  const repeated = "Screen time harms sleep.";
  const first = `Opening marker paragraph. ${repeated} ${"Early filler sentence here. ".repeat(250)}`;
  const second = `Closing marker paragraph. ${repeated} ${"Late filler sentence here. ".repeat(250)}`;
  const t = `${first}\n\n${second}`;
  const seg = segOf(t, repeated, first.length);
  const c = searchContext(t, seg);
  assert.ok(c.includes("Closing marker paragraph."), "the second occurrence's neighbourhood");
  assert.ok(!c.includes("Opening marker paragraph."), "not the first's");
});

test("a segment with no place known sends the head, as before; the study search sends 3,000", () => {
  const t = essay(400);
  assert.equal(searchContext(t, { text: "x" }), t.slice(0, 6000));
  assert.equal(searchContext(t, null), t.slice(0, 6000));
  const c = searchContext(t, segOf(t, "Sentence 250 says something about topic 250 in a plain way."), 3000);
  assert.ok(c.length <= 3000 && c.includes("Sentence 250 "), `${c.length} characters, around the sentence`);
});

test("every source search builds its context with searchContext, none from the document's head", () => {
  assert.equal((SRC.match(/context: (?:docText|fieldText)\.slice\(0, 6000\)/g) ?? []).length, 0);
  assert.equal((SRC.match(/context: searchContext\((?:docText|fieldText), seg(?:, 3000)?\)/g) ?? []).length, 6, "Docs and field, each with Find a source, Replace with evidence and Replace with better claim");
});
