/* A wrong claim's way out (content.js BETTER_COPY, betterClaimQuery,
 * betterPick, findBetterClaim). Owner, 2026-10-25: "when tracely finds
 * sources to refute, thats all it does. It should say delete claim/evidence
 * or something. And pro/student plans should have a button that says replace
 * with better claim, and that should happen. For free plan, have that be a
 * shiny orange/red button that when they click on it there is animation that
 * said upgrade plan." His example is the sheet's sentence 20, "Doesn't make
 * sense", with no fix of its own. */
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
const S20_TEXT = VERDICT_SHEET.find((r) => r.n === 20).text;
const S7_TEXT = VERDICT_SHEET.find((r) => r.n === 7).text;

function load(plan = "pro") {
  return vm.runInContext(`const CHECK_INTERVAL_MS = 10000; const FEATURES = {};
    function hashText(s) { return "h" + s.length; }
    let tier = { plan: ${JSON.stringify(plan)}, beta: false, unenforced: false };
    function canRecommend() { return tier.unenforced || tier.beta || ["student", "pro"].includes(tier.plan); }
    ${sliceBetween(SRC, "  const ISSUE_VERDICTS =", "  /* Card titles")}
    ${sliceBetween(SRC, "  // Bibliography block", "  function wireChrome(")}
    const segments = [], cache = new Map(), replaceMap = new Map(), sourcesMap = new Map(), settings = { citationStyle: "apa" };
    const calls = [], paints = { render: 0, pop: 0 };
    const io = { answer: { sources: [] }, fail: null };
    const render = () => { paints.render++; }, renderPopSources = () => { paints.pop++; };
    const offlineError = () => false;
    const CHECK_MODEL = "gpt-5.6-luna", docText = ${JSON.stringify(`${S20_TEXT} ${S7_TEXT}`)};
    async function searchSources(body) { calls.push(body); if (io.fail) throw io.fail; return io.answer; }
    ${sliceBetween(SRC, "    /* A wrong claim's better claim (BETTER_COPY), Student and Pro: what a", "    // Under a wrong claim's card (panel)")}
    ({ BETTER_COPY, premiseOf, betterClaimQuery, betterPick, betterBtnHtml, betterUpsell, betterUpsellHtml, betterHtml,
       findBetterClaim, segments, cache, replaceMap, sourcesMap, calls, paints, io, tier })`, vm.createContext({}));
}

const row = (n) => VERDICT_SHEET.find((r) => r.n === n);
const S20 = row(20).text; // incoherent, no fix: the owner's example
const S5 = row(5).text; // "Because P, C": false, read as incoherent, with a fix that keeps the premise
const S2 = row(2).text; // false, with a fix
const S7 = row(7).text; // false, no fix
const PREMISE_20 = "Artificial intelligence can improve efficiency in certain educational tasks.";

const RAND = { url: "https://www.rand.org/pubs/research_reports/RRA956-21.html", title: "AI in K-12 classrooms", publisher: "RAND Corporation", groupAuthor: "RAND Corporation", kind: "institutional", year: 2024,
  stance: "refutes", verified: true, quote: "AI tools cannot replace the relationships teachers build with students" };
const PAPER = { url: "https://doi.org/10.1/ai-ed", title: "AI and efficiency in education", authors: ["Jane Lee", "Sam Park"], year: 2023, kind: "article", container: "Computers & Education",
  stance: "supports", verified: true, quote: "AI tools reduced the time teachers spent grading routine assignments" };

test("the premise the check let stand: sentence 20's concession, and 'Because P, C'", () => {
  const X = load();
  assert.equal(X.premiseOf(S20), PREMISE_20, "the owner's example: 'Although' goes, the rest is a claim a source can back");
  assert.equal(X.premiseOf(S5), "Several studies have identified associations between social media use and adolescent anxiety.");
  assert.equal(X.premiseOf(S7), null, "no premise and conclusion in it");
  assert.equal(X.premiseOf("Because it rained, the game was cancelled."), null, "too little to search");
});

test("what a better claim is searched as: the premise, else the check's fix, else the sentence and a source that says otherwise", () => {
  const X = load();
  assert.deepEqual({ ...X.betterClaimQuery(S20, { verdict: "incoherent", revision: "" }) }, { claim: PREMISE_20, want: "supports" });
  assert.deepEqual({ ...X.betterClaimQuery(S5, { ...row(5).saved, verdict: "incoherent" }) }, { claim: "Several studies have identified associations between social media use and adolescent anxiety.", want: "supports" });
  assert.deepEqual({ ...X.betterClaimQuery(S2, row(2).saved) }, { claim: row(2).saved.revision, want: "supports" }, "false with a fix: the fix's claim");
  assert.deepEqual({ ...X.betterClaimQuery(S7, row(7).saved) }, { claim: S7, want: "refutes" }, "false with no fix: what sources say about the sentence");
  assert.deepEqual({ ...X.betterClaimQuery(S7, { verdict: "refuted", revision: `${S7}  ` }) }, { claim: S7, want: "refutes" }, "a fix that changes nothing is no fix");
  assert.equal(X.betterClaimQuery(S20, { verdict: "false", revision: "" }).want, "refutes", "only an incoherent sentence is searched by its premise");
});

test("the replacement: a read source on the side asked for, quoted with who said it; a refuting one backs its own quote", () => {
  const X = load();
  const rep = X.betterPick([RAND], "refutes", "apa");
  assert.equal(rep.text, "According to RAND Corporation (2024), “AI tools cannot replace the relationships teachers build with students.”");
  assert.equal(rep.src.stance, "supports", "the new sentence is the source's own words, so it backs it");
  assert.equal(RAND.stance, "refutes", "the sentence's own list is left as it was");
  assert.equal(X.betterPick([{ ...RAND, verified: false }], "refutes", "apa"), null, "never a source nothing read");
  assert.equal(X.betterPick([{ ...RAND, quote: "" }], "refutes", "apa"), null, "no receipt, nothing to quote");
  assert.equal(X.betterPick([RAND], "supports", "apa"), null, "the premise wants a source that backs it");
  assert.equal(X.betterPick([{ ...PAPER, quote: "" }, PAPER], "supports", "apa").text, "According to Lee and Park (2023), “AI tools reduced the time teachers spent grading routine assignments.”");
});

test("the button: Student and Pro find; Free's shines and opens 'Upgrade your plan', which rises in once", () => {
  const pro = load("pro");
  assert.equal(pro.betterBtnHtml("h1"), `<button class="act" data-better-find="h1">Replace with better claim</button>`);
  assert.equal(load("student").betterBtnHtml("h1").includes("data-better-find"), true);
  const free = load("free");
  assert.match(free.betterBtnHtml("h1"), /^<button class="act shine" data-better-upsell="h1"><svg[^>]*>.*<\/svg>Replace with better claim<\/button>$/);
  assert.equal(free.betterUpsellHtml("h1"), "", "nothing until it is pressed");
  free.betterUpsell.set("h1", false);
  const first = free.betterUpsellHtml("h1");
  assert.match(first, /^<div class="upsell enter" role="status"><div class="upsell-head"><svg[^>]*>.*<\/svg>Upgrade your plan<\/div>/);
  assert.match(first, /Student and Pro replace a wrong claim with what a source says, quoted and cited\./);
  assert.match(first, /<button class="act primary" data-upgrade="pro">Get Pro<\/button><button class="act" data-upgrade="student">Get Student<\/button><button class="act" data-better-later="h1">Not now<\/button>/);
  assert.match(free.betterUpsellHtml("h1"), /^<div class="upsell" role="status">/, "the panel re-renders often: only the render that brings it animates");
});

test("the block under the card: the better claim, the search for it, or why there is none", () => {
  const X = load();
  assert.equal(X.betterHtml("h1", undefined, "<b>ACTS</b>"), `<div class="better"><div class="row"><b>ACTS</b></div></div>`);
  assert.match(X.betterHtml("h1", { loading: true }, ""), /Finding a better claim…/);
  assert.match(X.betterHtml("h1", { none: true }, ""), /couldn't find a source to build a better claim from\. Delete the claim, or rewrite it/);
  const found = X.betterHtml("h1", X.betterPick([RAND], "refutes", "apa"), "");
  assert.match(found, /<div class="fix-label">Replace with<\/div><div class="fix-text">According to RAND Corporation \(2024\), “AI tools cannot replace the relationships teachers build with students\.”<\/div>/);
  assert.match(found, /AI in K-12 classrooms · /, "and which source it is");
});

function seed(X, text, f, st) {
  X.segments.push({ hash: "s1", text, start: 0, end: text.length });
  X.cache.set("s1", f);
  if (st) X.sourcesMap.set("s1", st);
}

test("Replace with better claim: a refuting source the sentence already has is used as it is, with no search", async () => {
  const X = load();
  seed(X, S20, { verdict: "incoherent", revision: "" }, { loading: false, list: [RAND], unread: [] });
  assert.equal(await X.findBetterClaim("s1"), true);
  assert.equal(X.calls.length, 0, "no search: the sources are already in the card");
  assert.match(X.replaceMap.get("s1").text, /^According to RAND Corporation \(2024\), “AI tools cannot replace/);
  assert.ok(X.paints.render >= 1 && X.paints.pop >= 1, "the panel and the hover card both show it");
});

test("otherwise one search: sentence 20's premise, and a source that backs it", async () => {
  const X = load();
  seed(X, S20, { verdict: "incoherent", revision: "" }, { loading: false, list: [{ ...RAND, quote: "" }], unread: [] });
  X.io.answer = { sources: [{ ...RAND }, PAPER] };
  await X.findBetterClaim("s1");
  assert.equal(X.calls.length, 1);
  assert.equal(X.calls[0].claim, PREMISE_20);
  assert.match(X.calls[0].context, /replacing all classroom teachers/, "its paragraph goes with it (searchContext, 3,000 characters, as Replace with evidence)");
  assert.match(SRC, /const data = await searchSources\(\{ claim: q\.claim, context: searchContext\(docText, seg, 3000\), model: CHECK_MODEL \}, \(\) => \{\}\);/);
  assert.equal(X.calls[0].verify, undefined, "the writer's own search, never a lookup's allowance");
  assert.equal(X.replaceMap.get("s1").src.url, PAPER.url, "it backs the premise; the refuting one is not on that side");
});

test("never pays twice for the same answer, and never runs for Free or a claim that isn't wrong", async () => {
  const searched = load();
  seed(searched, S7, row(7).saved, { loading: false, list: [], unread: [] });
  await searched.findBetterClaim("s1");
  assert.equal(searched.calls.length, 0, "its own search already asked about the sentence as written");
  assert.equal(searched.replaceMap.get("s1").none, true);

  const fresh = load();
  seed(fresh, S7, row(7).saved, null);
  fresh.io.answer = { sources: [{ ...RAND, quote: "drinking a fixed amount of water does not prevent kidney disease" }] };
  await fresh.findBetterClaim("s1");
  assert.equal(fresh.calls[0].claim, S7);
  assert.equal(fresh.replaceMap.get("s1").src.stance, "supports");

  const failed = load();
  seed(failed, S7, row(7).saved, null);
  failed.io.fail = Object.assign(new Error("Uh-oh, you ran out of free searches"), { kind: "plan_limit" });
  await failed.findBetterClaim("s1");
  assert.equal(failed.replaceMap.get("s1").failed, "Uh-oh, you ran out of free searches", "why, in the card that asked");

  const free = load("free");
  seed(free, S20, { verdict: "incoherent", revision: "" }, null);
  assert.equal(await free.findBetterClaim("s1"), false);
  assert.equal(free.calls.length + free.replaceMap.size, 0);

  const right = load();
  seed(right, S20, { verdict: "accurate" }, null);
  assert.equal(await right.findBetterClaim("s1"), false);
});

test("wired: both panels, the hover card, Delete claim through the delete that exists, and the plans", () => {
  // Panels: under a wrong claim's card that isn't the unfound study's.
  assert.equal((SRC.match(/\$\{claimIsWrong\(f\.verdict\) && !unfound \? betterHtml\(seg\.hash, replaceMap\.get\(seg\.hash\), betterActionsHtml\(seg\.hash/g) || []).length, 2, "Docs and field");
  assert.equal((SRC.match(/wireBetter\(shadow, findBetterClaim, render\);/g) || []).length, 2);
  assert.equal((SRC.match(/async function findBetterClaim\(hash\) \{/g) || []).length, 2, "both modes");
  // Docs: Delete claim is the study's one-replace delete (docDeleteSentence), and the card's fix stays the primary.
  assert.match(SRC, /return editBtnHtml\(`del:\$\{hash\}`, BETTER_COPY\.delete, `data-unfound-del="\$\{hash\}"`, !lead\) \+ find;/);
  assert.match(SRC, /function editBtnHtml\(key, idle, attrs, primary = true\) \{/);
  // A field can't delete a sentence: Replace in field or Copy, never a Delete.
  const field = sliceBetween(SRC, "    // Its buttons under the card: a field can't delete a sentence", "    // Signed in from a card");
  assert.doesNotMatch(field, /data-unfound-del/);
  assert.match(field, /data-unfound-apply="\$\{hash\}"/);
  // The hover card: the problem card, and a refuting source's row on the sources step.
  assert.match(SRC, /if \(claimIsWrong\(f\.verdict\)\) paintBetter\(hash, put\);/);
  assert.match(SRC, /if \(src && !citable && disagree && stepKey === hash\) \{\n\s+preview = betterBtn\(hash, \(\) => setStep\(hash, \{ step: "problem" \}\)\);/);
  const hover = sliceBetween(SRC, "    function paintBetter(hash, put) {", "    function paintSources(");
  assert.match(hover, /docDeleteSentence\(hash\)/);
  assert.match(hover, /docReplaceWithEvidence\(hash\)/);
  assert.match(hover, /if \(betterUpsell\.has\(hash\)\) put\(dmUpsell\(hash\)\);/);
  // Free's plans open the order page, as every other plan button does.
  assert.match(sliceBetween(SRC, "    function dmUpsell(hash) {", "    /* A hint-styled control"), /b\.addEventListener\("click", \(\) => openOrderPage\(\)\);/);
  assert.equal((SRC.match(/querySelectorAll\("\[data-upgrade\]"\)\) btn\.addEventListener\("click", \(\) => openOrderPage\(\)\);/g) || []).length, 2);
});

test("the shine: brand orange into red, a light that passes over it, and still under reduced motion", () => {
  assert.match(SRC, /button\.act\.shine \{[^}]*color: #fff; background: linear-gradient\(135deg, #ff5900, #d93636\);/);
  assert.match(SRC, /button\.act\.shine::after \{[^}]*animation: tracely-shine 2\.8s ease-in-out infinite;/);
  assert.match(SRC, /\.upsell\.enter \{ animation: tracely-upsell-in 420ms/);
  assert.match(SRC, /@media \(prefers-reduced-motion: reduce\) \{\n\s+button\.act\.shine::after, \.upsell\.enter::after \{ display: none; \}\n\s+\.upsell\.enter, \.upsell\.enter \.upsell-head svg \{ animation: none; \}/);
  // The hover card's own: the same colours from the palette, the shine only with motion.
  const shine = sliceBetween(SRC, "    function dmShine(label) {", "    /* \"Upgrade your plan\", risen in");
  assert.match(shine, /background: `linear-gradient\(135deg, \$\{DM\.orange\}, \$\{DM\.red\}\)`/);
  assert.match(shine, /if \(!reducedMotion\(\) && typeof sheen\.animate === "function"\)/);
});
