/* What Tracely types into a document: plain single spaces (extension
 * 2.21.71). Owner, 2026-10-23: "tracely keeps making these big spaces". A
 * model's fix, a source's words or a citation can carry a no-break, narrow,
 * thin or em space, which Docs draws wider than a space, or two spaces where
 * one belongs. typedText cleans what goes IN; what Tracely looks FOR is never
 * touched, because it has to match the document as it is. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sliceBetween } from "./helpers/anchors.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "..", "extension", "content.js"), "utf8");
const X = vm.runInContext(`
  ${sliceBetween(SRC, "  function typedText(text", "  /* ── sentence boundaries")}
  ${sliceBetween(SRC, "    function typedJob(job) {", "    /* Run one edit")}
  ({ typedText, typedJob })`, vm.createContext({}));

// Built from code points, so this file holds none of the characters it tests.
const NBSP = String.fromCodePoint(0xa0), NARROW = String.fromCodePoint(0x202f), THIN = String.fromCodePoint(0x2009),
  EM = String.fromCodePoint(0x2003), EN = String.fromCodePoint(0x2002), IDEO = String.fromCodePoint(0x3000);

test("every odd space becomes a plain one: no-break, narrow, thin, en, em, ideographic", () => {
  assert.equal(X.typedText(`about 10${NBSP}km, up${NARROW}8%,${THIN}and${EN}more${EM}than${IDEO}that.`, "x"), "about 10 km, up 8%, and more than that.");
  assert.ok(![...X.typedText(`a${NBSP}b${EM}c`, "x")].some((ch) => ch !== " " && /\s/.test(ch)), "only plain spaces left");
});

test("two spaces become one, unless the text it replaces has two of its own", () => {
  assert.equal(X.typedText("A fix  with  doubles.", "The old sentence."), "A fix with doubles.");
  assert.equal(X.typedText(`odd${NBSP} space`, "x y"), "odd space", "an odd space beside a plain one is a double too");
  assert.equal(X.typedText("First.  Second.", "First.  Old second."), "First.  Second.", "a writer's two spaces after a full stop stay");
});

test("its ends follow the replaced text's: no space doubled beside the sentence", () => {
  assert.equal(X.typedText(" The fixed sentence. ", "The old sentence."), "The fixed sentence.");
  assert.equal(X.typedText(" The fixed sentence.", " The old sentence."), " The fixed sentence.", "kept where the replaced text had one");
  assert.equal(X.typedText("Works Cited  ", ""), "Works Cited", "a new line has no space at either end");
});

test("line breaks and tabs stay", () => {
  assert.equal(X.typedText("One line\nnext\tline", ""), "One line\nnext\tline");
});

test("a job: what goes in is cleaned, what is looked for is not", () => {
  const fresh = () => null;
  const find = `The${NBSP}old sentence.`;
  const job = X.typedJob({
    steps: [
      { action: "replace", find, replacement: `The${NBSP}new  sentence. `, freshHint: fresh },
      { action: "appendLine", line: `Lee,${NBSP}A. (2021).` },
      { action: "insertLineBefore", line: ` Park,${EM}J. (2020). `, before: `Smith,${NBSP}B.` },
    ],
    retry: [{ action: "appendLine", line: `Park,${EM}J.` }],
    copy: `The${NBSP}new sentence.`,
    doneMsg: "fixed",
  });
  assert.equal(job.steps[0].find, find, "the find matches the document as it is, odd space and all");
  assert.equal(job.steps[0].replacement, "The new sentence.");
  assert.equal(job.steps[0].freshHint, fresh, "the rest of a step is kept as it was");
  assert.equal(job.steps[1].line, "Lee, A. (2021).");
  assert.equal(job.steps[2].line, "Park, J. (2020).");
  assert.equal(job.steps[2].before, `Smith,${NBSP}B.`);
  assert.equal(job.retry[0].line, "Park, J.");
  assert.equal(job.copy, "The new sentence.", "and what is copied when Docs refuses the edit");
  assert.equal(job.doneMsg, "fixed");
  assert.equal(X.typedJob(null), null);
});

test("wired: every edit, in Docs and in fields, types through it", () => {
  const head = sliceBetween(SRC, "    async function runDocEdit(key, job) {", "      docBusy = true;");
  assert.match(head, /if \(docBusy\) return false;\n\s+job = typedJob\(job\);\n\s+if \(editGate\.collect/, "before Review all collects it and before the preview shows it");
  assert.match(SRC, /function replaceInField\(find, replacement\) \{\n[^\n]*\n[^\n]*\n\s+replacement = typedText\(replacement, find\);/);
  assert.equal((SRC.match(/const replacement = typedText\(withMarkers\(seg\.text, rev\), seg\.text\);/g) ?? []).length, 2, "fixInField, in a textarea and in a contenteditable");
});
