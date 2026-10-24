/* Look it up before flagging it (content.js LOOKUP_FIRST, "look it up before
 * flagging it" in the shared helpers). Owner, 2026-10-23: "instead of saying
 * that stuff like this arent confirmed, look them up before flagging them and
 * instead if they are right dont flag them at all and if they arent flag them
 * as false claim … Never flag things for being unverified, you call shots".
 * Of a claim nothing backs: "unverified claim but be more assertive … state
 * recommend deleting it". Chosen with him: up to 5 lookups a check, on their
 * own allowance (the server's VERIFY_LIMITS, sources-quota.test.js), and a
 * claim that checks out but cites nothing is not flagged: its source is
 * offered under "Sources you could cite". */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sliceBetween } from "./helpers/anchors.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "..", "extension", "content.js"), "utf8");

function between(from, to) {
  const a = SRC.indexOf(from);
  const b = SRC.indexOf(to, a);
  assert.ok(a > 0 && b > a, `content.js: could not find ${from} .. ${to}`);
  return SRC.slice(a, b);
}

const SHARED = (features) => `const CHECK_INTERVAL_MS = 10000; const FEATURES = ${JSON.stringify(features)}; function hashText(s) { return "h" + String(s).length; }
  ${sliceBetween(SRC, "  const ISSUE_VERDICTS =", "  /* Card titles")}
  ${between("  /* Card titles", "  const MARK_PENDING")}
  ${between("  const MARK_PATTERN =", "  const MARK_ICON_RANK")}
  ${between("  /* ── Settings → the widget", '  /* ── "Explain in depth" (2.20.0)')}
  ${sliceBetween(SRC, "  // Bibliography block", "  function wireChrome(")}`;

function context(clock = { t: 1_000_000 }) {
  class FakeDate extends Date { static now() { return clock.t; } }
  return vm.createContext({
    URL, Date: FakeDate, clock, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: (fn, ms = 0) => { clock.t += ms; fn(); return 0; }, clearTimeout() {},
    storageGet: () => {}, storageSet() {}, storageOnChanged() {}, extCall: () => null,
  });
}

function load(features = { lookupFirst: true, quoteTips: true }) {
  return vm.runInContext(`${SHARED(features)}
    ({ flagShown, notePrefs, verdictLabel, VERDICT_LABEL, MARK_COLORS, MARK_ICON, verdictCat, tallyOf, tipKindShown, claimIsWrong,
       LOOKUP, LOOKUP_COPY, LOOKUP_FIRST, lookupFirstOn, lookupHides, isStatistic, lookupOutcome, lookedUp, lookupPicks, lookupWaitMs,
       couldCiteItems, couldCiteSectionHtml, unfoundHtml, backingSources, STORED_VERDICTS: typeof STORED_VERDICTS === "undefined" ? null : STORED_VERDICTS })`, context());
}

// The owner's two sentences.
const NEA = "According to the National Education Association, schools that introduced AI-powered writing assistants experienced a 73% reduction in plagiarism incidents during the 2023–2024 academic year (NEA, 2024).";
const SPEED = "Some research has examined whether AI use affects information-processing speed, but the extent of any effect remains uncertain.";
const FIGURE = "In 2019, 64 percent of teenagers in the United States owned a smartphone.";
const STUDY = "A study involving 12 college students found that 10 participants reported positive experiences using AI.";

const read = (stance, extra = {}) => ({ url: `https://example.org/${stance}${extra.n ?? ""}`, title: "A source", publisher: "Example Institute", stance, verified: true, quote: `It says ${stance}.`, ...extra });

test("what a lookup found: a source that backs it, one that says otherwise, nothing, or nothing it could open", () => {
  const X = load();
  assert.equal(X.lookupOutcome([read("supports")]), "backed");
  assert.equal(X.lookupOutcome([read("refutes"), read("supports", { n: 2 })]), "backed", "one source that backs it is enough to leave it unflagged");
  assert.equal(X.lookupOutcome([read("refutes")]), "refuted");
  assert.equal(X.lookupOutcome([read("context")]), "unverified", "read, and none of it backs the sentence");
  assert.equal(X.lookupOutcome([]), "unverified", "nothing came back at all");
  assert.equal(X.lookupOutcome(undefined), "unverified");
  // A page the server couldn't open says nothing either way: never "made up" over it.
  assert.equal(X.lookupOutcome([read("supports", { verified: false })]), "unread");
  assert.equal(X.lookupOutcome([read("context", { verified: false }), read("refutes", { verified: false, n: 2 })]), "unread");
  assert.equal(X.lookupOutcome([read("context"), read("supports", { verified: false, n: 2 })]), "unverified", "what was read backs nothing; an unread page doesn't change that");
});

test("the finding as its lookup leaves it: False claim with what the source says, Unverified with delete, or as it was", () => {
  const X = load();
  const f = { verdict: "questionable", explanation: "Could not confirm this.", revision: "Schools saw fewer plagiarism cases.", confidence: "medium" };
  const refuted = X.lookedUp(f, "refuted", [read("context"), read("refutes", { publisher: "National Education Association", quote: "Plagiarism reports were flat across districts." })]);
  assert.equal(refuted.verdict, "refuted");
  assert.equal(refuted.from, "questionable", "what the check said is kept");
  assert.equal(refuted.lookup, "refuted");
  assert.equal(refuted.explanation, "A source says otherwise (National Education Association): “Plagiarism reports were flat across districts.”");
  assert.equal(refuted.revision, f.revision, "a false claim keeps the check's fix");
  assert.equal(X.lookedUp(f, "refuted", [read("refutes", { quote: "", publisher: "" })]).explanation, "A source says otherwise.");

  const unverified = X.lookedUp(f, "unverified", []);
  assert.equal(unverified.verdict, "unverified");
  assert.equal(unverified.revision, "", "its fix is deleting it, so the check's rewrite goes");
  assert.equal(unverified.explanation, X.LOOKUP_COPY.unverified);
  // Assertive, never "Tracely couldn't find a source" (owner: "dont act like tracely just didnt find it").
  assert.match(X.LOOKUP_COPY.unverified, /nothing backs it\. It may be made up, so we recommend deleting it/);
  for (const copy of [X.LOOKUP_COPY.unverified, X.LOOKUP_COPY.unverifiedStudy, X.LOOKUP_COPY.unverifiedField]) {
    assert.doesNotMatch(copy, /couldn't find|could not find|can't find|unable to/i, copy);
  }

  for (const outcome of ["backed", "unread"]) {
    const kept = X.lookedUp(f, outcome, []);
    assert.equal(kept.verdict, "questionable", outcome);
    assert.equal(kept.lookup, outcome);
    assert.equal(kept.revision, f.revision);
  }
  assert.equal(X.lookedUp(refuted, "refuted", [read("refutes")]).from, "questionable", "looked up again, it still remembers the check's verdict");
  assert.equal(X.lookedUp(null, "refuted", []), null);
});

test("titles and colours: False claim, Unverified statistic or claim, both red, both errors", () => {
  const X = load();
  assert.equal(X.verdictLabel("refuted", NEA), "False claim");
  assert.equal(X.verdictLabel("unverified", NEA), "Unverified statistic", "a figure a reader would check");
  assert.equal(X.verdictLabel("unverified", FIGURE), "Unverified statistic");
  assert.equal(X.verdictLabel("unverified", SPEED), "Unverified claim", "the owner's sentence has no figure");
  assert.equal(X.isStatistic(SPEED), false);
  assert.equal(X.isStatistic(NEA), true);
  for (const v of ["refuted", "unverified"]) {
    assert.equal(X.MARK_COLORS[v], "#d93636", v);
    assert.equal(X.MARK_ICON[v], "wrong", v);
    assert.equal(X.verdictCat(v), "wrong", v);
  }
  assert.deepEqual({ ...X.tallyOf(["refuted", "unverified", "false"], []) }, { wrong: 3, check: 0, cite: 0, writing: 0 }, "the header counts them as factual errors");
  assert.equal(X.claimIsWrong("refuted"), true, "a refuting source is shown, never cited for it");
});

test("what is drawn: Needs evidence and Missing citation wait for their lookup; what it decides is drawn", () => {
  const X = load();
  X.notePrefs({});
  const shown = (verdict, text = FIGURE, attribution = "", before = false) => X.flagShown({ verdict, confidence: "high" }, {}, "prose", text, false, attribution, before);
  assert.equal(shown("questionable"), false, "never flagged for being unverified");
  assert.equal(shown("needs_citation"), false);
  assert.equal(shown("questionable", FIGURE, "", true), true, "but it is what the lookup picks from");
  assert.equal(shown("needs_citation", FIGURE, "", true), true);
  assert.equal(shown("refuted"), true);
  assert.equal(shown("unverified"), true);
  assert.equal(shown("false"), true, "the check's own factual errors are as before");
  assert.equal(shown("incoherent"), true);
  // The owner's sentences are looked up, whatever note rides on them.
  assert.equal(shown("questionable", NEA, "named", true), true, "a named source's claim is looked up, not left as a citation issue");
  assert.equal(shown("needs_citation", SPEED, "unnamed", true), true, "an unnamed source's claim is looked up");
  // "Look for evidence automatically" off brings the marks back as they were, unsearched.
  X.notePrefs({ autoEvidence: false });
  assert.equal(X.lookupFirstOn(), false);
  assert.equal(shown("questionable"), true);
  assert.equal(shown("needs_citation"), true);
  // And the switch.
  const off = load({ lookupFirst: false, quoteTips: true });
  off.notePrefs({});
  assert.equal(off.lookupFirstOn(), false);
  assert.equal(off.flagShown({ verdict: "questionable", confidence: "high" }, {}, "prose", FIGURE), true);
});

test("the unnamed-source note does not say 'Needs evidence' while the lookup decides", () => {
  const X = load();
  X.notePrefs({});
  assert.equal(X.tipKindShown({ kind: "vague", quote: SPEED }), false);
  assert.equal(X.tipKindShown({ kind: "uncited", quote: NEA }), true, "a named source not cited is still a citation note");
  X.notePrefs({ autoEvidence: false });
  assert.equal(X.tipKindShown({ kind: "vague", quote: SPEED }), true);
});

test("which five: statistics first, then a named or cited source, then a study, in reading order within each", () => {
  const X = load();
  const items = [
    { hash: "a", text: "Writing by hand helps memory." },
    { hash: "b", text: "A recent study found that students who use AI write longer essays." },
    { hash: "c", text: "Teachers report that feedback helps (Lee, 2021)." },
    { hash: "d", text: FIGURE },
    { hash: "e", text: "Most schools ban phones in class." },
    { hash: "f", text: NEA },
    { hash: "g", text: SPEED },
  ];
  assert.equal(X.LOOKUP.perCheck, 5);
  assert.deepEqual([...X.lookupPicks(items).map((i) => i.hash)], ["d", "f", "c", "b", "g"], "two figures, a cited claim, then the studies; the plain two wait");
  assert.deepEqual([...X.lookupPicks(items, 2).map((i) => i.hash)], ["d", "f"]);
  assert.deepEqual([...X.lookupPicks(items, 0)], []);
});

test("paced like a person pressing: three a minute, the server allows a caller four", () => {
  const X = load();
  const now = 10_000_000;
  assert.equal(X.LOOKUP.perMinute, 3);
  assert.equal(X.lookupWaitMs([], now), 0);
  assert.equal(X.lookupWaitMs([now - 5_000, now - 1_000], now), 0);
  const wait = X.lookupWaitMs([now - 50_000, now - 20_000, now - 1_000], now);
  assert.ok(wait > 9_000 && wait < 11_000, `the oldest of the three leaves the minute in ~10 s: ${wait}`);
  assert.equal(X.lookupWaitMs([now - 70_000, now - 20_000, now - 1_000], now), 0, "a start over a minute ago no longer counts");
});

test("Sources you could cite: a claim that checks out and cites nothing, never a flag", () => {
  const X = load();
  const segs = [
    { hash: "ok", text: FIGURE },
    { hash: "cited", text: NEA },
    { hash: "nolist", text: "Half of teachers use AI weekly." },
    { hash: "wrong", text: "Ninety percent of students cheat." },
    { hash: "gone", text: "Two thirds of teens own a laptop." },
  ];
  const cache = new Map([
    ["ok", { verdict: "needs_citation", lookup: "backed" }],
    ["cited", { verdict: "questionable", lookup: "backed" }],
    ["nolist", { verdict: "questionable", lookup: "backed" }],
    ["wrong", { verdict: "refuted", from: "questionable", lookup: "refuted" }],
    ["gone", { verdict: "questionable", lookup: "backed" }],
  ]);
  const src = read("supports");
  const sourcesMap = new Map([["ok", { list: [src] }], ["cited", { list: [src] }], ["nolist", { list: [] }], ["wrong", { list: [read("refutes")] }], ["gone", { list: [src] }]]);
  const items = X.couldCiteItems(segs, cache, new Set(["gone"]), sourcesMap);
  assert.deepEqual([...items.map((s) => s.hash)], ["ok"], "cited already, no source kept, refuted or dismissed: not offered");

  const folded = X.couldCiteSectionHtml(items, false, () => "<b>SOURCES</b>");
  assert.match(folded, /id="couldCiteToggle" aria-expanded="false">▸ Sources you could cite \(1\)/);
  assert.doesNotMatch(folded, /SOURCES/, "folded until opened");
  const open = X.couldCiteSectionHtml(items, true, () => "<b>SOURCES</b>");
  assert.match(open, /These sentences check out\. Cite the source so your reader can check them too\./);
  assert.match(open, /<span class="ctitle">A source backs this<\/span>/);
  assert.match(open, /<b>SOURCES<\/b>/, "the mode's own source list, with its Cite in doc and Copy cite");
  assert.match(open, /class="card ev-card"/, "folded apart from the claim cards (foldCards skips .ev-card)");
  assert.doesNotMatch(open, /#d93636|#2563eb|#ffb800/, "neutral: colour only means a finding");
  assert.equal(X.couldCiteSectionHtml([], true, () => ""), "");
});

test("the unverified card: the card's own title and words, then Delete; Replace with evidence only for a study", () => {
  const X = load();
  const bare = X.unfoundHtml(undefined, "<b>DELETE</b>", true, { bare: true, study: false });
  assert.doesNotMatch(bare, /Tracely couldn't find this study/, "the card's title already says what it is");
  assert.doesNotMatch(bare, /data-rec-plans/, "nothing to upsell where nothing can be replaced");
  assert.match(bare, /<div class="row"><b>DELETE<\/b><\/div>/);
  assert.match(X.unfoundHtml(undefined, "", true, { bare: true, study: true }), /data-rec-plans/, "a study can be replaced on Student and Pro");
  assert.match(X.unfoundHtml(undefined, "", true), /Tracely couldn't find this study/, "the study card as it was");
});

test("verdicts saved with the doc keep their lookup: refuted and unverified are stored verdicts", () => {
  assert.match(SRC, /const STORED_VERDICTS = new Set\(\["accurate", "false", "questionable", "incoherent", "needs_citation", "wrong_source", "no_claim", "refuted", "unverified"\]\);/);
  assert.match(SRC, /const CITED_VERDICTS = \["false", "questionable", "incoherent", "refuted", "unverified"\];/);
});

/* ── the queue, in Docs mode ─────────────────────────────────────────── */

function docsQueue({ segs, verdicts, outcomes, prefs = {}, inflight = 0, signedOut = false }) {
  const clock = { t: 5_000_000 };
  const ctx = context(clock);
  ctx.log = { searches: [], renders: 0 };
  ctx.seed = { segs, verdicts, outcomes, prefs, inflight, signedOut };
  return vm.runInContext(`${SHARED({ lookupFirst: true, quoteTips: true })}
    notePrefs(seed.prefs);
    const segments = seed.segs.map((s) => ({ checkable: true, ...s }));
    const cache = new Map(Object.entries(seed.verdicts));
    const dismissed = new Set();
    const editedHashes = new Set();
    const sourcesMap = new Map();
    const citedLater = new Set();
    const sourceAttr = new Map();
    const settings = {};
    const docGenre = "prose";
    let sourcesInflight = seed.inflight;
    const needsSignIn = () => seed.signedOut;
    const persistCaches = () => {};
    const render = () => { log.renders++; };
    const currentIssues = () => [];
    let autoSourceTimes = [], autoSinceUsage = 0, statusMsg = "";
    const searchesLeft = () => 99;
    // The real fetchSources' lookup half: verify: true, then lookedUp decides the verdict.
    async function fetchSources(hash, auto, opts) {
      const seg = segments.find((s) => s.hash === hash);
      log.searches.push({ hash, auto, lookup: opts?.lookup === true, at: Date.now() });
      const got = seed.outcomes[hash];
      if (got === "fail") return true;
      if (got === "limit") { lookupsOut = true; return true; }
      const sources = got ?? [];
      cache.set(hash, lookedUp(cache.get(hash), lookupOutcome(sources), sources));
      const { list, unbacked, unread, partial } = backingSources(sources, cache.get(hash).verdict);
      sourcesMap.set(hash, { loading: false, list, unbacked, unread, partial });
      return true;
    }
    ${between("    /* The claims looked up before they are flagged (LOOKUP_FIRST): every", '    // "Paste a URL and cite it"')}
    ({ lookUpClaims, lookupCandidates, autoFindSources, cache, sourcesMap, flagShown, docGenre, settings, log, couldCiteItems: () => couldCiteItems(segments, cache, dismissed, sourcesMap) })`, ctx);
}

test("Docs: each check's claims are looked up, up to five, three a minute, each verdict decided by what it found", async () => {
  const segs = [
    { hash: "s1", text: FIGURE },
    { hash: "s2", text: NEA },
    { hash: "s3", text: SPEED },
    { hash: "s4", text: STUDY },
    { hash: "s5", text: "Two thirds of teachers say AI saves them an hour a week." },
    { hash: "s6", text: "A recent study found that students who use AI write longer essays." },
    { hash: "s7", text: "The moon is made of rock." },
    { hash: "s8", text: "Most universities now publish an AI policy for coursework." },
  ];
  const verdicts = {
    s1: { verdict: "needs_citation", confidence: "high" },
    s2: { verdict: "questionable", confidence: "high" },
    s3: { verdict: "needs_citation", confidence: "high" },
    s4: { verdict: "questionable", confidence: "high" },
    s5: { verdict: "questionable", confidence: "high" },
    s6: { verdict: "questionable", confidence: "high" },
    s7: { verdict: "accurate" },
    s8: { verdict: "questionable", confidence: "high" },
  };
  const outcomes = { s1: [read("supports")], s2: [read("refutes", { quote: "Plagiarism reports were flat." })], s3: [read("context")], s4: [], s5: [read("supports", { verified: false })] };
  const Q = docsQueue({ segs, verdicts, outcomes });
  await Q.autoFindSources([]);
  assert.deepEqual([...Q.log.searches.map((s) => s.hash)], ["s1", "s2", "s4", "s5", "s3"], "statistics first, then the study-like claim");
  assert.ok(Q.log.searches.every((s) => s.auto && s.lookup), "every one a lookup, never the writer's search");
  const v = (h) => Q.cache.get(h);
  assert.equal(v("s1").verdict, "needs_citation", "backed: left as it was, and not drawn");
  assert.equal(v("s1").lookup, "backed");
  assert.equal(Q.flagShown(v("s1"), Q.settings, Q.docGenre, FIGURE), false, "a claim that checks out is not flagged");
  assert.equal(v("s2").verdict, "refuted", "the owner's NEA sentence, when a source says otherwise: False claim");
  assert.equal(v("s3").verdict, "unverified", "the owner's speed sentence, when nothing backs it");
  assert.equal(v("s4").verdict, "unverified");
  assert.equal(v("s5").lookup, "unread", "could open nothing: no flag, and not looked up again while it stands");
  assert.equal(v("s5").verdict, "questionable");
  assert.equal(v("s6").lookup, undefined, "the sixth waits for a later check");
  assert.equal(v("s7").lookup, undefined, "an accurate sentence is never looked up");
  assert.equal(v("s8").lookup, undefined, "nor a general statement the check would not have flagged");
  assert.deepEqual([...Q.couldCiteItems().map((s) => s.hash)], ["s1"], "the backed one is offered to cite");

  // A later check reaches the sixth; nothing is looked up twice.
  await Q.autoFindSources([]);
  assert.equal(v("s6").lookup, "unverified");
  assert.equal(Q.log.searches.length, 6);
});

test("Docs: the lookups are paced at three a minute", async () => {
  const segs = Array.from({ length: 5 }, (_, i) => ({ hash: `p${i}`, text: `In 20${10 + i}, ${40 + i} percent of students used a laptop in class.` }));
  const verdicts = Object.fromEntries(segs.map((s) => [s.hash, { verdict: "questionable", confidence: "high" }]));
  const Q = docsQueue({ segs, verdicts, outcomes: {} });
  await Q.autoFindSources([]);
  const at = Q.log.searches.map((s) => s.at);
  assert.equal(at.length, 5);
  assert.equal(at[2] - at[0] < 60_000, true, "three start at once");
  assert.ok(at[3] - at[0] >= 60_000, `the fourth waits for the first to leave the minute: ${at[3] - at[0]} ms`);
  assert.ok(at[4] - at[1] >= 60_000);
});

test("Docs: the writer's own search goes first, and what it found answers the lookup", async () => {
  const segs = [{ hash: "s1", text: FIGURE }];
  const Q = docsQueue({ segs, verdicts: { s1: { verdict: "needs_citation", confidence: "high" } }, outcomes: {} });
  Q.sourcesMap.set("s1", { loading: false, list: [read("supports")] });
  await Q.autoFindSources([]);
  assert.equal(Q.log.searches.length, 0, "no second search");
  assert.equal(Q.cache.get("s1").lookup, "backed");
});

test("Docs: signed out, out of lookups, or switched off, nothing is looked up", async () => {
  const segs = [{ hash: "s1", text: FIGURE }, { hash: "s2", text: NEA }];
  const verdicts = { s1: { verdict: "needs_citation", confidence: "high" }, s2: { verdict: "questionable", confidence: "high" } };
  const out = docsQueue({ segs, verdicts, outcomes: {}, signedOut: true });
  await out.autoFindSources([]);
  assert.equal(out.cache.get("s1").lookup, undefined, "signed out");
  const off = docsQueue({ segs, verdicts, outcomes: {}, prefs: { autoEvidence: false } });
  await off.autoFindSources([]);
  assert.equal(off.cache.get("s1").lookup, undefined, "Look for evidence automatically is off");
  const limit = docsQueue({ segs, verdicts, outcomes: { s1: "limit" } });
  await limit.autoFindSources([]);
  assert.equal(limit.cache.get("s2").lookup, undefined, "out of lookups: the rest wait, and nothing is said");
  const failed = docsQueue({ segs, verdicts, outcomes: { s1: "fail" } });
  await failed.autoFindSources([]);
  assert.equal(failed.cache.get("s1").lookup, undefined, "a failed lookup leaves the claim unflagged");
  assert.equal(failed.cache.get("s2").lookup, "unverified", "and the next one still runs");
  await failed.autoFindSources([]);
  assert.equal(failed.cache.get("s1").lookup, undefined, "not looked up again within LOOKUP.retryMs");
});

/* ── wiring ──────────────────────────────────────────────────────────── */

test("wired: a lookup asks for verify: true, in both modes, and its failure is never said", () => {
  assert.equal((SRC.match(/\.\.\.\(lookup \? \{ verify: true \} : \{\}\), \/\/ a lookup: the server's VERIFY_LIMITS, never the writer's searches/g) || []).length, 2);
  assert.equal((SRC.match(/const lookup = arguments\[2\]\?\.lookup === true;/g) || []).length, 2);
  assert.equal((SRC.match(/correction: \(!lookup && f\?\.revision\) \|\| undefined,/g) || []).length, 2, "a lookup searches the sentence as written, never the check's rewrite");
  assert.equal((SRC.match(/if \(lookup\) \{\n(?:\s*\/\/[^\n]*\n)+\s+if \(err\?\.kind === "plan_limit"\) lookupsOut = true;\n\s+return( true)?;/g) || []).length, 2, "out of lookups stops them; nothing reaches the card or the header");
  assert.equal((SRC.match(/if \(lookupFirstOn\(\)\) return lookUpClaims\(\);/g) || []).length, 2, "autoFindSources, both modes");
  assert.equal((SRC.match(/for \(const \{ hash \} of lookupPicks\(lookupCandidates\(\)\)\) \{/g) || []).length, 2);
  assert.equal((SRC.match(/\} else if \(!lookupKicked && lookupFirstOn\(\)\) \{/g) || []).length, 2, "verdicts kept from an earlier visit are looked up once");
  assert.equal((SRC.match(/const couldCiteHtml = typeof lookupFirstOn === "function" && lookupFirstOn\(\)/g) || []).length, 2, "both panels offer Sources you could cite");
  assert.equal((SRC.match(/shadow\.getElementById\("couldCiteToggle"\)\?\.addEventListener/g) || []).length, 2);
  assert.match(SRC, /const expl = f\.verdict === "unverified" \? LOOKUP_COPY\.unverifiedField : f\.explanation;/, "a field can't delete from the card: the writer does");
  assert.match(SRC, /lookupFirst: true,/, "on");
});
