/* What a verdict is about (content.js classifyFinding, "what a verdict is
 * about" in the shared helpers). Owner, 2026-10-24, on a twenty-sentence
 * sheet: "Keep factual truth, source alignment, and temporal scope
 * distinct." The check returned "false" for two true figures cited to the
 * wrong body and for two conclusions their premise does not support, and
 * "accurate" for two more wrong citations. The extension reads each verdict
 * again against what the check itself said (its explanation and its fix),
 * with no further call: a citation-only fix is "Wrong source cited", a
 * premise kept and a conclusion that does not follow is "Doesn't make
 * sense", an organisation credited but another cited is "Wrong source
 * cited". A "false" that is wrong on the facts stays "false". */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sliceBetween } from "./helpers/anchors.js";
import { VERDICT_SHEET } from "./fixtures/verdict-classes-sheet.js";
import { CITATION_KEY } from "./fixtures/citation-key.js";
import { CITE_FIT_BLIND } from "./fixtures/cite-fit-blind.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "..", "extension", "content.js"), "utf8");

function between(from, to) {
  const a = SRC.indexOf(from);
  const b = SRC.indexOf(to, a);
  assert.ok(a > 0 && b > a, `content.js: could not find ${from} .. ${to}`);
  return SRC.slice(a, b);
}

function load(features = { lookupFirst: true, quoteTips: true, verdictClasses: true }) {
  return vm.runInContext(`const CHECK_INTERVAL_MS = 10000; const FEATURES = ${JSON.stringify(features)}; function hashText(s) { return "h" + String(s).length; }
    ${sliceBetween(SRC, "  const ISSUE_VERDICTS =", "  /* Card titles")}
    ${between("  /* Card titles", "  const MARK_PENDING")}
    ${between("  const MARK_PATTERN =", "  const MARK_ICON_RANK")}
    ${between("  /* ── Settings → the widget", '  /* ── "Explain in depth" (2.20.0)')}
    ${sliceBetween(SRC, "  // Bibliography block", "  function wireChrome(")}
    ({ segmentText, classifyFinding, classifyInto, wrongCitation, citationOnlyFix, inferenceOnlyFix, sameBody, orgCredited, flagShown, lookupHides,
       verdictLabel, MARK_COLORS, LOOKUP_FIRST, CLASSIFY_GEN })`, vm.createContext({
    URL, Date, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout, storageGet: () => {}, storageSet() {}, storageOnChanged() {}, extCall: () => null,
  }));
}
const X = load();
const shownAs = (f, text) => (X.flagShown(f, {}, "prose", text) ? f.verdict : "");

test("the owner's sheet: each saved verdict becomes the class the owner expects", () => {
  for (const s of VERDICT_SHEET) {
    const f = X.classifyFinding(s.saved, s.text);
    assert.equal(shownAs(f, s.text), s.expect, `#${s.n}: ${s.saved.verdict} → ${f.verdict}`);
  }
});

test("the sheet's citations: a citation-only fix keeps the check's own explanation and fix; an accurate one gets ours", () => {
  const four = VERDICT_SHEET.find((s) => s.n === 4);
  const f4 = X.classifyFinding(four.saved, four.text);
  assert.equal(f4.verdict, "wrong_source");
  assert.equal(f4.from, "false", "what the check said is kept");
  assert.equal(f4.revision, four.saved.revision, "its fix swaps the citation for the IEA's");
  assert.equal(X.verdictLabel(f4.verdict, four.text), "Wrong source cited");
  assert.equal(X.MARK_COLORS[f4.verdict], "#ffb800", "amber, the attribution colour");
  const twelve = VERDICT_SHEET.find((s) => s.n === 12);
  const f12 = X.classifyFinding(twelve.saved, twelve.text);
  assert.equal(f12.verdict, "wrong_source");
  assert.equal(f12.from, "accurate");
  assert.match(f12.explanation, /credits the National Aeronautics and Space Administration, but its citation names OECD/);
  assert.equal(f12.revision, "", "no rewrite is invented: its card's fix is Find a source");
});

test("the sheet's reasoning: a premise kept and a conclusion dropped is Doesn't make sense, still red", () => {
  for (const n of [5, 16]) {
    const s = VERDICT_SHEET.find((x) => x.n === n);
    const f = X.classifyFinding(s.saved, s.text);
    assert.equal(f.verdict, "incoherent", `#${n}`);
    assert.equal(X.verdictLabel(f.verdict, s.text), "Doesn't make sense");
    assert.equal(X.MARK_COLORS[f.verdict], X.MARK_COLORS.false, "the flag stays red: only its title changes");
    assert.equal(f.explanation, s.saved.explanation, "the check's own explanation, which never denied the premise");
  }
});

// Written fresh for this test, none from the sheet: changed figures, swapped bodies, historical estimates, valid and invalid conclusions.
const FRESH = [
  // A wrong citation and nothing else, in the check's own fix.
  { why: "citation-only fix, another body", expect: "wrong_source",
    text: "UNICEF estimates that about 250 million children are out of school worldwide (OECD, 2022).",
    saved: { verdict: "false", explanation: "UNICEF publishes this estimate; the OECD is the wrong citation.", revision: "UNICEF estimates that about 250 million children are out of school worldwide (UNICEF, 2022)." } },
  // A changed figure AND a swapped body: wrong on the facts, so it stays false.
  { why: "figure and citation both fixed", expect: "false",
    text: "The World Bank reported that 900 million people lived in extreme poverty in 2022 (IMF, 2022).",
    saved: { verdict: "false", explanation: "The World Bank estimated about 700 million in extreme poverty.", revision: "The World Bank reported that about 700 million people lived in extreme poverty in 2022 (World Bank, 2022)." } },
  { why: "a changed figure, citation kept", expect: "false",
    text: "The Food and Agriculture Organization reports that about 60% of all food produced is wasted (FAO, 2019).",
    saved: { verdict: "false", explanation: "The FAO estimate is about a third of food lost or wasted.", revision: "The Food and Agriculture Organization reports that about a third of all food produced is lost or wasted (FAO, 2019)." } },
  // A false with no fix says nothing about what is wrong: it stays false.
  { why: "no fix to read", expect: "false",
    text: "The Food and Agriculture Organization reports that about 60% of all food produced is wasted (FAO, 2019).",
    saved: { verdict: "false", explanation: "The FAO estimate is about a third.", revision: "" } },
  // An accurate sentence, one body credited, another cited.
  { why: "accurate, swapped body", expect: "wrong_source",
    text: "The Food and Agriculture Organization estimates that roughly a third of food is lost or wasted (WHO, 2021).",
    saved: { verdict: "accurate", explanation: "", revision: "" } },
  { why: "accurate, According to, swapped body", expect: "wrong_source",
    text: "According to the International Monetary Fund, global growth slowed in 2023 (World Bank, 2024).",
    saved: { verdict: "accurate", explanation: "", revision: "" } },
  // The same body, written two ways.
  ...[
    "The Federal Bureau of Investigation reported that violent crime fell in 2022 (FBI, 2023).",
    "The Department of Energy found that many retired coal plant sites could host reactors (DOE 2022).",
    "The United Nations Children's Fund reports that one in four children lives with food poverty (UNICEF, 2024).",
    "According to the Pew Research Center, most American teens use YouTube (Pew, 2023).",
    "The Organisation for Economic Co-operation and Development reported a fall in maths scores (OECD, 2023).",
    "The UN Environment Programme reported that food waste rose (UNEP, 2024).",
    "The CDC recommends that adults get at least seven hours of sleep (Centers for Disease Control and Prevention, 2022).",
  ].map((text) => ({ why: "same body", expect: "", text, saved: { verdict: "accurate", explanation: "", revision: "" } })),
  // A person cited for a body's finding may be an article that reports it: never ours to call.
  { why: "person-authored citation", expect: "",
    text: "The World Health Organization reported that air pollution causes millions of deaths each year (Smith, 2020).",
    saved: { verdict: "accurate", explanation: "", revision: "" } },
  { why: "as cited in", expect: "",
    text: "The World Health Organization reported that air pollution causes millions of deaths each year (as cited in OECD, 2023).",
    saved: { verdict: "accurate", explanation: "", revision: "" } },
  { why: "two works in one parenthetical", expect: "",
    text: "The World Health Organization reported that air pollution causes millions of deaths each year (OECD, 2023; WHO, 2022).",
    saved: { verdict: "accurate", explanation: "", revision: "" } },
  // A historical estimate with its year, cited to its own body: nothing to say.
  { why: "historical estimate, right body", expect: "",
    text: "The World Health Organization estimated that 1.28 billion adults had hypertension in 2019 (WHO, 2021).",
    saved: { verdict: "accurate", explanation: "", revision: "" } },
  // Reasoning: a conclusion that follows is the check's to pass, and this never reads an accurate one.
  { why: "a conclusion that follows", expect: "",
    text: "Because water expands when it freezes, pipes left full in an unheated house can crack in winter.",
    saved: { verdict: "accurate", explanation: "", revision: "" } },
  { why: "invalid conclusion, premise kept, explanation names the gap", expect: "incoherent",
    text: "Because a few schools that banned phones reported fewer distractions, banning phones would guarantee higher test scores in every school.",
    saved: { verdict: "false", explanation: "Fewer distractions at a few schools do not establish guaranteed higher scores everywhere.", revision: "Because a few schools that banned phones reported fewer distractions, banning phones may help some schools focus." } },
  { why: "P; therefore C, premise kept", expect: "incoherent",
    text: "Some students who use flashcards remember more vocabulary; therefore every student who uses flashcards will pass the final exam.",
    saved: { verdict: "false", explanation: "Better recall for some students does not guarantee that every student passes.", revision: "Some students who use flashcards remember more vocabulary; flashcards may help others study too." } },
  // A false premise: the fix changes the premise, so it is wrong on the facts.
  { why: "false premise", expect: "false",
    text: "Because the Sun orbits the Earth once a day, daylight and darkness alternate.",
    saved: { verdict: "false", explanation: "The Earth rotates on its axis; the Sun does not orbit the Earth.", revision: "Because the Earth rotates on its axis once a day, daylight and darkness alternate." } },
  // A false conclusion the check grounds in a fact, not in the gap: stays false.
  { why: "premise kept, conclusion contradicted by a stated fact", expect: "false",
    text: "Because the Earth's axis is tilted, the planet is closest to the Sun during the northern summer.",
    saved: { verdict: "false", explanation: "Earth is farthest from the Sun in early July; seasons come from the tilt, not distance.", revision: "Because the Earth's axis is tilted, the Northern Hemisphere receives more direct sunlight in summer." } },
  // An absolute statement is not an inference: the words "all" and "always" decide nothing here.
  { why: "absolute claim, no premise", expect: "false",
    text: "Drinking eight glasses of water every day always prevents all headaches in adults.",
    saved: { verdict: "false", explanation: "Headaches have many causes, and research does not show that water prevents them all.", revision: "" } },
  { why: "absolute claim that is true", expect: "",
    text: "All mammals breathe air through lungs.",
    saved: { verdict: "accurate", explanation: "", revision: "" } },
];

test("fresh variations: changed figures, swapped bodies, historical estimates, valid and invalid conclusions", () => {
  for (const c of FRESH) {
    const f = X.classifyFinding({ confidence: "high", ...c.saved }, c.text);
    assert.equal(shownAs(f, c.text), c.expect, `${c.why}: ${c.text}`);
  }
});

test("it never touches a verdict it has no reading for", () => {
  const s = "The World Health Organization estimates that approximately 1.28 billion adults have hypertension (NASA, 2023).";
  for (const verdict of ["questionable", "needs_citation", "incoherent", "no_claim", "refuted", "unverified", "wrong_source"]) {
    const f = { verdict, explanation: "x does not establish y", revision: "" };
    assert.equal(X.classifyFinding(f, s).verdict, verdict, `${verdict} is left as it is (a lookup, or the check, decides it)`);
  }
});

test("names: one body written two ways is never a mismatch; two bodies are", () => {
  for (const [a, b] of [["Centers for Disease Control and Prevention", "CDC"], ["Department of Energy", "DOE"], ["United Nations Children's Fund", "UNICEF"],
    ["Organisation for Economic Co-operation and Development", "OECD"], ["UN Environment Programme", "UNEP"], ["National Aeronautics and Space Administration", "NASA"],
    ["Pew Research Center", "Pew"], ["World Bank", "World Bank Group"], ["International Union for Conservation of Nature", "IUCN"]]) {
    assert.equal(X.sameBody(a, b), true, `${a} = ${b}`);
    assert.equal(X.sameBody(b, a), true, `${b} = ${a}`);
  }
  for (const [a, b] of [["World Health Organization", "NASA"], ["International Energy Agency", "UNESCO"], ["World Health Organization", "WTO"],
    ["International Union for Conservation of Nature", "OECD"], ["Food and Agriculture Organization", "WHO"]]) {
    assert.equal(X.sameBody(a, b), false, `${a} ≠ ${b}`);
  }
});

test("orgCredited is unchanged for its own caller; the classifier reads a wider set of verbs", () => {
  const s = "The International Union for Conservation of Nature identifies habitat loss as a major threat.";
  assert.equal(X.orgCredited(s), "", "Source not cited still reads only its own verbs");
  assert.ok(X.wrongCitation(`${s.slice(0, -1)} (OECD, 2023).`), "identifies credits the body here");
});

test("the corpora: of every cited sentence in the repo's documents, it calls one credited-but-other-cited", async () => {
  // Every document the repo holds (the extension's corpora, the citation eval's drafts, the model checksets), but this sheet.
  const docs = [];
  const texts = (v) => {
    if (typeof v === "string") { if (v.length > 80) docs.push(v); return; }
    if (Array.isArray(v)) return v.forEach(texts);
    if (v && typeof v === "object") Object.values(v).forEach(texts);
  };
  const FX = path.join(HERE, "fixtures");
  for (const f of readdirSync(FX).filter((f) => f.endsWith(".js") && f !== "verdict-classes-sheet.js")) texts(await import(pathToFileURL(path.join(FX, f))));
  for (const f of readdirSync(FX).filter((f) => f.endsWith(".txt"))) docs.push(readFileSync(path.join(FX, f), "utf8"));
  const drafts = path.join(HERE, "..", "..", "eval", "citations", "essays");
  for (const f of readdirSync(drafts)) docs.push(readFileSync(path.join(drafts, f), "utf8"));
  for (const set of ["checkset", "checkset-hard", "checkset-long", "checkset-narrative"]) {
    for (const e of JSON.parse(readFileSync(path.join(HERE, "..", "..", "eval", "models", `${set}.json`), "utf8")).essays) docs.push(e.text || e.sentences.map((s) => s.text).join(" "));
  }
  const seen = new Set();
  const fires = [];
  for (const d of docs) for (const s of X.segmentText(d)) {
    if (!s.checkable || seen.has(s.text)) continue;
    seen.add(s.text);
    if (X.wrongCitation(s.text)) fires.push(s.text);
  }
  assert.ok(seen.size > 20_000, `read ${seen.size} sentences`);
  // The owner's 2026-10-15 key marks this one correct (the CDC republishes the Academy's recommendation). Owner, 2026-10-24: "keep the AASM card".
  const key13 = CITATION_KEY.find((s) => s.n === 13);
  assert.deepEqual(fires, [key13.text]);
  assert.deepEqual({ ...X.wrongCitation(key13.text) }, { credit: "American Academy of Sleep Medicine", author: "CDC" });
  // The blind wrong-source set names no body in its words: those stay citeFit's to judge.
  for (const s of CITE_FIT_BLIND) assert.equal(X.wrongCitation(s.text), null, s.text);
});

test("a saved verdict is read again once, and only once; the switch turns it off", () => {
  const sheet4 = VERDICT_SHEET.find((s) => s.n === 4);
  const cache = new Map([["a", { ...sheet4.saved }], ["b", { verdict: "accurate" }]]);
  const segs = [{ hash: "a", text: sheet4.text }, { hash: "b", text: "Photosynthesis converts light into chemical energy." }];
  assert.equal(X.classifyInto(segs, cache), 1, "one verdict changed");
  assert.equal(cache.get("a").verdict, "wrong_source");
  assert.equal(cache.get("a").cls, X.CLASSIFY_GEN);
  assert.equal(cache.get("b").cls, X.CLASSIFY_GEN, "an unchanged verdict is marked read too");
  assert.equal(X.classifyInto(segs, cache), 0, "nothing is read twice");
  const off = load({ lookupFirst: true, quoteTips: true, verdictClasses: false });
  assert.equal(off.classifyFinding({ ...sheet4.saved }, sheet4.text).verdict, "false");
});

test("no new searches: what it produces is never looked up, and a false it changes was never looked up either", () => {
  for (const v of ["wrong_source", "incoherent", "false", "accurate"]) assert.equal(X.LOOKUP_FIRST.includes(v), false, v);
  assert.equal(X.lookupHides("wrong_source"), false);
});

test("wiring: both modes classify a check's findings as they arrive and saved verdicts on the next read", () => {
  const arrivals = SRC.match(/confidence: f\.confidence \}\);\n\s+\}\n\s+classifyInto\(todo, cache\);/g) ?? [];
  assert.equal(arrivals.length, 2, "Docs mode and field mode, right after the findings loop");
  const reads = SRC.match(/return n \+ classifyInto\(segments, cache\);/g) ?? [];
  assert.equal(reads.length, 2, "inside each mode's inheritVerdicts, which every read calls");
  // The request is what it was: no new field, no citeFit.
  assert.match(SRC, /citeFit: false,/);
  assert.equal((SRC.match(/\.\.\.\(FEATURES\.citeFit \? \{ citeFit: true \} : \{\}\)/g) ?? []).length, 2);
});
