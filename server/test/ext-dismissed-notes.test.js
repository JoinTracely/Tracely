/* Dismissing a sentence's card dismisses the notes it carries (content.js
 * citationTips). Owner, 2026-10-25, on the verdict sheet's sentence 13 ("A
 * 2024 report from the World Health Organization concluded that antibiotics
 * are effective treatments for viral infections …"): it was underlined amber.
 * Its saved verdict was "false", with three refuting sources, and its red
 * card had been dismissed (the Doc's dismissed list held only its hash). The
 * "Source not cited" note on the same sentence, which rides on the red card
 * while it shows (tipCoversSentence), then drew its own amber line. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sliceBetween } from "./helpers/anchors.js";
import { VERDICT_SHEET } from "./fixtures/verdict-classes-sheet.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "..", "extension", "content.js"), "utf8");
const X = vm.runInContext(`const CHECK_INTERVAL_MS = 10000;
  ${sliceBetween(SRC, "  function hashText(s) {", "  /* A Doc opened from a second")}
  ${sliceBetween(SRC, "  const ISSUE_VERDICTS =", "  /* Card titles")}
  ${sliceBetween(SRC, "  // Bibliography block", "  function wireChrome(")}
  ({ hashText, citationTips, citationMarks, segmentText, tipCoversSentence })`, vm.createContext({ URL }));

// The sheet as the owner's Doc holds it: one sentence a paragraph, numbered by the list.
const DOC = `Test sheet\n\n${VERDICT_SHEET.map((r) => r.text).join("\n\n")}\n`;
const S13 = VERDICT_SHEET.find((r) => r.n === 13).text;
const notesOn = (dismissed) => Array.from(X.citationTips(DOC, "apa", dismissed, "research")).filter((t) => t.quote === S13);

test("sentence 13 carries a 'Source not cited' note, its hash is the one the owner's Doc saved, and the note is the whole sentence", () => {
  assert.equal(X.hashText(S13), "s1pvxe60", "the hash in the owner's dismissed list");
  const seg = X.segmentText(DOC).find((s) => s.text === S13);
  assert.equal(seg.hash, "s1pvxe60");
  const [note] = notesOn(new Set());
  assert.equal(note.kind, "uncited");
  assert.equal(X.tipCoversSentence(seg.text, note.quote), true, "it rides on the red card while that card shows");
});

test("the red card dismissed: its note goes with it, from the panel and the underlines alike", () => {
  assert.deepEqual(notesOn(new Set(["s1pvxe60"])), []);
  assert.equal(Array.from(X.citationMarks(DOC, "apa", new Set(["s1pvxe60"]), "research")).some((m) => m.mark === S13), false, "no amber line");
  // Bringing the dismissed back (Settings → Memory clears the list) brings both back.
  assert.equal(notesOn(new Set()).length, 1);
  // Another sentence's dismissal changes nothing here.
  assert.equal(notesOn(new Set([X.hashText(VERDICT_SHEET[0].text)])).length, 1);
});

test("a page note sits on the citation beside its sentence, and keeps its own Dismiss", () => {
  const doc = `Smith argues that "reading changes how children think" (Smith, 2019). Another sentence follows here.\n\nWorks Cited\nSmith, Jane. Reading Minds. Penguin, 2019.\n`;
  const sentence = `Smith argues that "reading changes how children think" (Smith, 2019).`;
  const page = (dismissed) => Array.from(X.citationTips(doc, "mla", dismissed, "literary")).filter((t) => t.kind === "page");
  assert.equal(page(new Set()).length, 1, "a quote without its page");
  assert.equal(page(new Set([X.hashText(sentence)])).length, 1, "the sentence's card dismissed: the page note stays");
  assert.equal(page(new Set([page(new Set())[0].id])).length, 0, "its own Dismiss");
});
