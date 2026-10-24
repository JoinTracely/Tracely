/* The cost counters, the extension's half (2026-10-24). A lookup tells the
 * server a few labels about itself (`lookupTags`, counted in
 * server/lib/searchTally.js), never text: its kind, its place among the
 * picks, whether this Doc already had sources for a related sentence, and
 * whether another Doc on this computer looked it up. And Copy diagnostics
 * counts, on this computer only, how often a checked sentence was gone again
 * soon after and how often another Doc here had already checked it. They
 * decide whether judging known sources first, and remembering lookups across
 * documents, are worth building. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sliceBetween } from "./helpers/anchors.js";
import { LOOKUP_TAGS } from "../lib/searchTally.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const SRC = readFileSync(path.join(ROOT, "extension", "content.js"), "utf8");
const OPTIONS = readFileSync(path.join(ROOT, "extension", "options.js"), "utf8");

function between(from, to) {
  const a = SRC.indexOf(from);
  const b = SRC.indexOf(to, a);
  assert.ok(a > 0 && b > a, `content.js: could not find ${from} .. ${to}`);
  return SRC.slice(a, b);
}

const shared = () => vm.runInContext(`const CHECK_INTERVAL_MS = 10000; const FEATURES = { lookupFirst: true }; function hashText(s) { return "h" + String(s).length; }
  ${sliceBetween(SRC, "  const ISSUE_VERDICTS =", "  /* Card titles")}
  ${between("  /* ── Settings → the widget", '  /* ── "Explain in depth" (2.20.0)')}
  ${sliceBetween(SRC, "  // Bibliography block", "  function wireChrome(")}
  ({ relatedClaims, docSourcesTag, lookupRank, LOOKUP })`, vm.createContext({
  URL, Date, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setTimeout: () => 0, clearTimeout() {},
  storageGet() {}, storageSet() {}, storageOnChanged() {}, extCall: () => null,
}));

const NEA = "According to the National Education Association, schools that introduced AI-powered writing assistants experienced a 73% reduction in plagiarism incidents during the 2023–2024 academic year (NEA, 2024).";

test("related sentences: a shared figure and a longer word, or three longer words; common essay words don't count", () => {
  const X = shared();
  assert.equal(X.relatedClaims(NEA, "The 73% reduction in plagiarism came after AI tools arrived."), true, "the same figure and 'plagiarism'");
  assert.equal(X.relatedClaims("Plagiarism incidents declined sharply once writing assistants were introduced.", NEA), true, "three longer words");
  assert.equal(X.relatedClaims(NEA, "Students in Finland start school at seven."), false);
  assert.equal(X.relatedClaims("Students at the school said research helps.", "Research shows students at school learn more."), false, "'students', 'school' and 'research' are every essay's words");
  assert.equal(X.relatedClaims("In 2020, 40% of teens owned a phone.", "In 2020, the election was close."), false, "a shared year alone is not a related claim");
});

test("what the Doc already had: none, some (another sentence's sources), or related", () => {
  const X = shared();
  const segs = [{ hash: "a", text: NEA }, { hash: "b", text: "Plagiarism incidents declined sharply once writing assistants were introduced." }, { hash: "c", text: "Finland starts school at seven." }];
  assert.equal(X.docSourcesTag("b", segs[1].text, new Map(), segs), "none");
  assert.equal(X.docSourcesTag("b", segs[1].text, new Map([["c", { list: [{}] }]]), segs), "some");
  assert.equal(X.docSourcesTag("b", segs[1].text, new Map([["c", { list: [{}] }], ["a", { partial: { quote: "q" } }]]), segs), "related", "a partial or unread result counts: they are sources the Doc has");
  assert.equal(X.docSourcesTag("b", segs[1].text, new Map([["b", { list: [{}] }], ["a", { loading: true }]]), segs), "none", "its own sources and a running search don't count");
  assert.equal(X.docSourcesTag("b", segs[1].text, new Map([["gone", { list: [{}] }]]), segs), "some", "a sentence no longer in the Doc still had sources");
});

test("the labels the extension can send are exactly the ones the server keeps", () => {
  const X = shared();
  for (const text of [NEA, "A recent study found that students who use AI write longer essays.", "Teachers report that feedback helps (Lee, 2021).", "Most schools ban phones in class."]) {
    assert.ok(LOOKUP_TAGS.rank.includes(String(X.lookupRank(text))), text);
  }
  assert.ok(X.LOOKUP.perCheck <= LOOKUP_TAGS.pick.length, "every pick position has a label");
  assert.deepEqual(LOOKUP_TAGS.doc, ["none", "some", "related"]);
  assert.match(SRC, /return elsewhere\.looked\.has\(hash\) \? "looked" : elsewhere\.checked\.has\(hash\) \? "checked" : "no";/);
  assert.deepEqual(LOOKUP_TAGS.elsewhere, ["looked", "checked", "no"]);
});

/* ── on this computer: Copy diagnostics' counts ───────────────────────── */

function device({ store = {}, docId = "doc-here" } = {}) {
  const saved = [];
  // Like the page's: Object.keys(localStorage) lists what is stored, not its methods.
  const localStorage = Object.defineProperties({ ...store }, {
    getItem: { value: (k) => store[k] ?? null }, setItem: { value() {} }, removeItem: { value() {} },
  });
  const ctx = vm.createContext({
    Date, saved, localStorage,
    setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {},
    storageSet: (o) => saved.push(JSON.parse(JSON.stringify(o))),
  });
  return vm.runInContext(`
    const lsGet = (k) => localStorage.getItem(k);
    function jsonParse(s, d) { try { return JSON.parse(s); } catch { return d; } }
    const CACHE_GEN = "2";
    const VCACHE_KEY = "tracely.widget.vcache2.${docId}";
    let segments = [];
    ${between("  /* What the last edits did, for Settings", '  /* ── "Explain in depth" (2.20.0)')}
    ${between("    /* The cost counters on this computer", "    async function cycle() {")}
    ({ elsewhereTag, noteSentForCheck, noteLookupStarted, noteChurn, noteDiag, diagCounts, setSegments: (s) => { segments = s; }, saved })`, ctx);
}

test("another Doc on this computer: looked up there, only checked there, or never seen — read from this origin's saved checks", () => {
  const store = {
    "tracely.widget.vcache2.doc-other": JSON.stringify([["s1", { verdict: "questionable", lookup: "backed" }], ["s2", { verdict: "accurate" }], ["bad"], "nonsense"]),
    "tracely.widget.vcache2.doc-here": JSON.stringify([["s3", { verdict: "questionable", lookup: "unverified" }]]),
    "tracely.widget.vcache1.doc-old": JSON.stringify([["s4", { verdict: "accurate", lookup: "backed" }]]),
    "tracely.widget.vcache2.doc-broken": "{not json",
  };
  const X = device({ store });
  assert.equal(X.elsewhereTag("s1"), "looked");
  assert.equal(X.elsewhereTag("s2"), "checked");
  assert.equal(X.elsewhereTag("s3"), "no", "this Doc's own checks are not elsewhere");
  assert.equal(X.elsewhereTag("s4"), "no", "an older generation's checks are retired");
  assert.equal(X.elsewhereTag("zzz"), "no");
});

test("churn: checked sentences gone again within 10 s, a minute or five, and lookups that lost their sentence within a minute; counts only", () => {
  const X = device({ store: { "tracely.widget.vcache2.doc-other": JSON.stringify([["a", { verdict: "accurate" }]]) } });
  const t0 = 1_000_000;
  X.setSegments([{ hash: "a" }, { hash: "b" }, { hash: "c" }, { hash: "d" }]);
  X.noteSentForCheck([{ hash: "a" }, { hash: "b" }, { hash: "c" }, { hash: "d" }], t0);
  X.noteLookupStarted("d", t0);
  X.noteLookupStarted("b", t0);
  X.setSegments([{ hash: "b" }, { hash: "c" }, { hash: "d" }]);
  X.noteChurn(t0 + 5_000); // a: gone in 10 s
  X.setSegments([{ hash: "c" }, { hash: "d" }]);
  X.noteChurn(t0 + 30_000); // b: gone in a minute
  X.setSegments([{ hash: "d" }]);
  X.noteChurn(t0 + 200_000); // c: gone in five minutes
  X.noteChurn(t0 + 400_000); // d still here after five minutes: no longer watched
  X.setSegments([]);
  X.noteChurn(t0 + 500_000); // d gone, but too late to count
  const c = X.diagCounts;
  assert.equal(c.checked, 4);
  assert.equal(c.checkedElsewhere, 1, "'a' was checked in another Doc here");
  assert.equal(c.goneIn10s, 1);
  assert.equal(c.goneIn60s, 1);
  assert.equal(c.goneIn5m, 1);
  assert.equal(c.lookups, 2);
  assert.equal(c.lookupGoneIn60s, 1, "'b' lost its sentence within the minute; 'd' was still there a minute on");
  const last = X.saved.at(-1);
  assert.ok(last.diag.counts && last.diag.edits, "saved with the edits, for Copy diagnostics");
  assert.doesNotMatch(JSON.stringify(last), /"a"|"b"|"c"|"d"/, "no hash, no sentence");
});

test("wired: the counters run in the read and before the check, a lookup records its start, and Copy diagnostics carries them", () => {
  assert.match(SRC, /const todo = uncheckedSegments\(\)\.slice\(0, MAX_SENTENCES_PER_CHECK\);\n\s+noteChurn\(readAt\); \/\/ Copy diagnostics: checked sentences gone again since the last read\n\s+prevHashes = /);
  assert.match(SRC, /sentencesChecked \+= todo\.length;\n\s+noteSentForCheck\(todo, readAt\);\n\s+const data = await api\("\/api\/check", \{\n\s+text: docText\.slice/);
  assert.match(SRC, /noteLookupStarted\(hash\);\n\s+await fetchSources\(hash, true, \{ lookup: true, tags: lookupTagsFor\(hash, text, at \+ 1\) \}\);/, "Docs: a lookup's start");
  assert.match(SRC, /doc: docSourcesTag\(hash, text, sourcesMap, segments\), elsewhere: elsewhereTag\(hash\) \};/, "Docs sends all four labels");
  assert.match(SRC, /return \{ rank: String\(lookupRank\(text\)\), pick: String\(pick\), doc: docSourcesTag\(hash, text, sourcesMap, segments\) \};/, "a field sends no 'elsewhere': its checks are kept per site");
  assert.match(OPTIONS, /counts: cfg\.diag\?\.counts \?\? null,/);
});
