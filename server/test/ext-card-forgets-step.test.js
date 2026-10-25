/* The Docs hover card goes back to its first card once the writer leaves it
 * (content.js forgetPopStep). Owner, 2026-10-25: "when I hover over a flag
 * and click the action button such as suggest fix, and I stop hovering over
 * it, and then I hover over it again, it stays at the next page as if I
 * clicked suggest fix. I want it to forget and go back to the original …
 * overlay when I stop hovering on them." */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sliceBetween } from "./helpers/anchors.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "..", "extension", "content.js"), "utf8");

function load() {
  return vm.runInContext(`let popHash = null, paints = 0;
    function paintPop() { paints++; }
    ${sliceBetween(SRC, "    const popSteps = new Map();", "    let popCard = null, popAbove = false")}
    ({ popSteps, stepOf, setStep, forgetPopStep, open: (h) => { popHash = h; }, close: () => { popHash = null; } })`, vm.createContext({}));
}

test("Suggest fix, then away: the next hover opens the problem card again", () => {
  const X = load();
  X.open("s1");
  X.setStep("s1", { step: "fix" });
  assert.equal(X.stepOf("s1").step, "fix");
  X.forgetPopStep();
  assert.equal(X.stepOf("s1").step, "problem");
});

test("a note opened from the sentence's card forgets both, and nothing else", () => {
  const X = load();
  X.popSteps.set("s1", { step: "sources", selected: null, searched: true });
  X.popSteps.set("s2", { step: "fix" });
  X.popSteps.set("tip-9", { step: "problem", backTo: "s1", backLabel: "Needs evidence" });
  X.open("tip-9");
  X.forgetPopStep();
  assert.equal(X.popSteps.has("tip-9"), false);
  assert.equal(X.popSteps.has("s1"), false, "back on the sentence, its first card");
  assert.equal(X.stepOf("s2").step, "fix", "another sentence's card is not this one");
  X.close();
  X.forgetPopStep(); // no card open: nothing to forget
  assert.equal(X.popSteps.size, 1);
});

test("a note's search, sources that disagree: Suggest fix turns the card into the sentence's, at its fix", () => {
  // Owner, 2026-10-25: "when I click suggest fix when I search for sources and they refute me, the button
  // suggest fix doesnt do anything". The card open was the note's ("Source not cited"); the click set the
  // sentence's step, which no card on screen showed.
  const click = sliceBetween(SRC, "        primary = dmBtn(f?.revision ? POP_COPY.suggestFix : POP_COPY.openArticle, true);", "      } else if (canEditDoc()) {");
  assert.match(click, /if \(stepKey !== hash\) \{ popSteps\.set\(hash, \{ \.\.\.stepOf\(hash\), step: "fix", backTo: stepKey \}\); popHash = hash; popPinned = true; paintPop\(\); return; \}/);
  assert.match(click, /setStep\(hash, \{ step: "fix" \}\);/, "its own card: as before");
  // And a note's search hands paintSources the note's card as stepKey.
  assert.match(SRC, /function paintClaimSources\(key, pst, put\) \{[\s\S]*?paintSources\(pst\.claim, seg, cache\.get\(pst\.claim\), pst, put, \{\n\s+stepKey: key,/);
  // Leaving then forgets the sentence's step and the note's (backTo).
  const X = load();
  X.popSteps.set("tip-1", { step: "sources", claim: "s1" });
  X.popSteps.set("s1", { step: "fix", backTo: "tip-1" });
  X.open("s1");
  X.forgetPopStep();
  assert.equal(X.popSteps.size, 0);
});

test("wired where the writer leaves: the hover's close, another underline taking over, typing and Esc — not a card opened for them", () => {
  assert.match(SRC, /function runHoverDecision\(d, st\) \{\n\s+if \(d\.act === "hide"\) \{ forgetPopStep\(\); hideDocsPopover\(\); return; \}\n\s+if \(!st\.bar\) return;\n\s+if \(popEl && popHash !== st\.bar\.hash\) forgetPopStep\(\);/);
  assert.match(SRC, /function typingClosesCard\(e\) \{[\s\S]*?clearHoverPending\(\);\n\s+forgetPopStep\(\);\n\s+hideDocsPopover\(\);\n\s+\}/);
  // hideDocsPopover itself keeps the step: Sources ready's Show and the panel open a card at a step on purpose.
  assert.doesNotMatch(sliceBetween(SRC, "    function hideDocsPopover({ instant = false } = {}) {", "    /* ── the app's popover, state for state"), /forgetPopStep|popSteps/);
});
