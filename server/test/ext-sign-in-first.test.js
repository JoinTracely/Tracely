/* Sign in first (content.js, owner 2026-10-30): "please make sign in more
 * prominent, for example when an overlay button is pressed the please sign in
 * first is required". Signed out, Tracely still checks and underlines; a
 * button that does something for the writer asks first, then runs. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sliceBetween } from "./helpers/anchors.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const SRC = readFileSync(path.join(ROOT, "extension", "content.js"), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

// A button or the sheet: just what the gate touches. `marks` are the selectors it answers to.
class Fake {
  constructor(...marks) { this.marks = marks; this.on = {}; this.kids = {}; this.isConnected = true; this.clicks = 0; }
  get attributes() {
    return this.marks.filter((m) => m.startsWith("[")).map((m) => ({ name: m.slice(1, -1), value: "1" }));
  }
  matches(sel) { return sel.split(",").some((s) => this.marks.includes(s.trim())); }
  closest(sel) { return sel === "button" ? this : sel === ".signin-sheet" && this.inSheet ? this : null; }
  addEventListener(type, fn) { (this.on[type] ??= []).push(fn); }
  querySelector(sel) { return this.kids[sel] ?? null; }
  click() { this.clicks++; }
  focus() { this.focused = true; }
  remove() { this.isConnected = false; }
}
const press = (target) => {
  const e = { target, stopped: false, stopImmediatePropagation() { this.stopped = true; }, preventDefault() {} };
  return e;
};

function world({ signedIn = false, feature = true, reply = { ok: true } } = {}) {
  const log = [], timers = [], sheets = [];
  const document = {
    createElement() {
      const el = new Fake();
      for (const k of ["[data-signin-go]", "[data-signin-later]"]) { el.kids[k] = new Fake("button.act", k); el.kids[k].inSheet = true; }
      sheets.push(el);
      return el;
    },
  };
  const shadow = new Fake();
  shadow.appendChild = () => log.push("sheet");
  const X = vm.runInContext(`
    let tier = { plan: "free", beta: false, unenforced: false, signedIn: ${signedIn} };
    const FEATURES = { signInFirst: ${feature} };
    const needsSignIn = () => !tier.signedIn;
    const esc = (s) => String(s), MARK_SOLID_SVG = "<svg></svg>";
    const sendMsg = async (m) => { log.push(m.type); return ${JSON.stringify(reply)}; };
    const openSettings = (s) => log.push("settings:" + s), refreshTier = () => log.push("refreshTier"), tierChanged = () => log.push("tierChanged");
    const saved = new Map();
    const lsGet = (k) => saved.get(k) ?? null, lsSet = (k, v) => { saved.set(k, v); return true; };
    ${sliceBetween(SRC, "  const SIGNIN_COPY = {", "  function searchFailureNote(err) {")}
    ({ signInGate, signInStripHtml, signInNoteHtml, signInOpen, signInNow, SIGNED_OUT_OK, SIGNIN_FIRST, SIGNIN_HOLD_MS,
       setSignedIn: (fn) => { signedInNow = fn; }, tier: () => tier })`,
  vm.createContext({ log, document, CSS: { escape: (s) => s }, setTimeout: (fn, ms) => timers.push([fn, ms]) }));
  return { X, log, timers, sheets, shadow, gate: (btn) => { const e = press(btn); X.signInGate(e, shadow); return e; } };
}

test("signed out, a button that does something asks first and its own handler never runs", () => {
  for (const mark of ["[data-doc-fix]", "[data-field-fix]", "[data-sources]", "[data-copy-fix]", "[data-doc-cite]", "[data-unfound-del]", "[data-walk-go]", "[data-better-upsell]", "[data-some-new-button]"]) {
    const w = world();
    const e = w.gate(new Fake("button.act", mark));
    assert.equal(e.stopped, true, `${mark} stops at the gate`);
    assert.deepEqual(plain(w.log), ["sheet"], `${mark} opens the card`);
    assert.equal(w.X.signInOpen(), true);
    assert.equal(w.sheets[0].kids["[data-signin-go]"].focused, true, "the card takes the keyboard");
  }
});

test("looking, leaving, taking back and turning Tracely on never ask", () => {
  for (const mark of ["[data-signin]", "[data-upgrade]", "[data-rec-plans]", "[data-better-later]", "[data-trim-keep]", "[data-doc-undo]", "[data-ready-show]",
    "[data-fxp-stop]", "[data-fxp-none]", "[data-fxp-list]", "[data-fx-skip]", "[data-fx-close]", "[data-walk-stop]", "#docsOn", "#docsNotNow", "#siteSwitch", "#tracelyResume", "#tracelyPausedSettings"]) {
    const w = world();
    assert.equal(w.gate(new Fake("button.act", mark)).stopped, false, mark);
    assert.deepEqual(plain(w.log), [], mark);
  }
  // Dismiss, Never flag, Close, Settings and the tabs are not .act buttons at all.
  for (const cls of ["button.x", "button.hbtn", "button.tab", "button.ev-toggle"]) assert.equal(world().gate(new Fake(cls)).stopped, false, cls);
  // Everything named still exists: a name left behind would hide a button that changed its name.
  for (const name of world().X.SIGNED_OUT_OK.split(",")) {
    assert.ok(SRC.includes(name.startsWith("#") ? `id="${name.slice(1)}"` : name.slice(1, -1)), `${name} is still in content.js`);
  }
});

test("signed in, or with the switch off, nothing asks", () => {
  for (const w of [world({ signedIn: true }), world({ feature: false })]) {
    assert.equal(w.gate(new Fake("button.act", "[data-doc-fix]")).stopped, false);
    assert.deepEqual(plain(w.log), []);
    assert.equal(w.X.signInStripHtml(), "");
    assert.equal(w.X.signInNoteHtml(3), "");
  }
});

test("signed in from the card, the press is made again, on the button or what a render drew in its place", async () => {
  const w = world();
  const waited = [];
  w.X.setSignedIn(() => waited.push("lookups"));
  const btn = new Fake("button.act", "[data-doc-fix]");
  w.gate(btn);
  const go = w.sheets[0].kids["[data-signin-go]"];
  const running = go.on.click[0]();
  assert.equal(go.disabled, true, "one sign-in at a time");
  assert.equal(go.textContent, "Signing in…");
  await running;
  assert.equal(btn.clicks, 1);
  assert.deepEqual(plain(w.log), ["sheet", "tracely-signIn", "refreshTier", "tierChanged"]);
  assert.deepEqual(waited, ["lookups"], "claims held for a lookup start now");
  assert.equal(w.sheets[0].isConnected, false);

  const redrawn = world();
  const old = new Fake("button.act", "[data-sources]");
  const fresh = new Fake("button.act", "[data-sources]");
  redrawn.shadow.kids['button[data-sources="1"]'] = fresh;
  redrawn.gate(old);
  old.isConnected = false; // the panel re-rendered behind the card
  await redrawn.sheets[0].kids["[data-signin-go]"].on.click[0]();
  assert.equal(fresh.clicks, 1);
  assert.equal(old.clicks, 0);
});

test("the hover card that asked stays long enough to be reached", async () => {
  const w = world();
  w.gate(new Fake("button.act", "[data-doc-fix]"));
  await w.sheets[0].kids["[data-signin-go]"].on.click[0]();
  assert.equal(w.X.signInOpen(), true, "held after the sheet has gone");
  assert.equal(w.timers.at(-1)[1], w.X.SIGNIN_HOLD_MS, "then the pointer decides");
});

test("Not now, the page around the card, Esc and a closed Google window press nothing", async () => {
  for (const how of ["later", "outside", "esc"]) {
    const w = world();
    const btn = new Fake("button.act", "[data-doc-fix]");
    w.gate(btn);
    const sheet = w.sheets[0];
    if (how === "later") sheet.kids["[data-signin-later]"].on.click[0]();
    if (how === "outside") sheet.on.click[0]({ target: sheet });
    if (how === "esc") sheet.on.keydown[0]({ key: "Escape" });
    assert.equal(w.X.signInOpen(), false, how);
    assert.equal(btn.clicks, 0, how);
  }
  const inside = world();
  inside.gate(new Fake("button.act", "[data-doc-fix]"));
  inside.sheets[0].on.click[0]({ target: new Fake() });
  assert.equal(inside.X.signInOpen(), true, "a click on the card is not a click away");

  const closed = world({ reply: { ok: false, message: "The user did not approve access." } });
  const btn = new Fake("button.act", "[data-doc-fix]");
  closed.gate(btn);
  await closed.sheets[0].kids["[data-signin-go]"].on.click[0]();
  assert.equal(btn.clicks, 0);
  assert.equal(closed.log.includes("settings:account"), false, "closing Google's window is the writer's answer, not a failure");

  // Not now while Google's window is open: the sign-in stands, and nothing is pressed.
  const late = world();
  const b2 = new Fake("button.act", "[data-doc-fix]");
  late.gate(b2);
  const sheet = late.sheets[0];
  const running = sheet.kids["[data-signin-go]"].on.click[0]();
  sheet.kids["[data-signin-later]"].on.click[0]();
  await running;
  assert.equal(b2.clicks, 0);
  assert.equal(late.X.tier().signedIn, true);
});

test("the card's own buttons pass the gate, and two presses share one sign-in", async () => {
  const w = world();
  w.gate(new Fake("button.act", "[data-doc-fix]"));
  assert.equal(w.gate(w.sheets[0].kids["[data-signin-go]"]).stopped, false);
  const two = world();
  await Promise.all([two.X.signInNow(), two.X.signInNow()]);
  assert.equal(plain(two.log).filter((m) => m === "tracely-signIn").length, 1);
});

test("the strip and the note ask before any press; the note goes for the day and only follows a flag", () => {
  const w = world();
  const strip = w.X.signInStripHtml();
  assert.match(strip, /<div class="signin-strip">/);
  assert.match(strip, /<button class="act primary" data-signin-now="1">Sign in with Google<\/button>/);
  assert.equal(w.X.signInNoteHtml(0), "", "nothing flagged, nothing to fix");
  assert.match(w.X.signInNoteHtml(2), /class="ready-ping enter"/);
  assert.doesNotMatch(w.X.signInNoteHtml(2), /enter/, "rises in once");
  assert.match(w.X.signInNoteHtml(2), /data-signin-now="1">Sign in<\/button>/);
  const e = w.gate(new Fake("button.x", "[data-signin-note-x]"));
  assert.equal(e.stopped, false);
  assert.deepEqual(plain(w.log), ["tierChanged"], "the widget re-renders without it");
  assert.equal(w.X.signInNoteHtml(2), "");
});

test("the strip's and the note's button sign in without opening the card", async () => {
  const w = world();
  w.gate(new Fake("button.act", "[data-signin-now]"));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(plain(w.log), ["tracely-signIn", "refreshTier", "tierChanged"]);
  assert.equal(w.sheets.length, 0);
});

test("the card says what it is for and that any Google account works: a school's can be barred", () => {
  const { SIGNIN_FIRST } = world().X;
  assert.equal(SIGNIN_FIRST.head, "Please sign in first");
  assert.match(SIGNIN_FIRST.body, /Any Google account works/);
  assert.match(SIGNIN_FIRST.body, /personal one/);
});

test("every widget hears the gate before its buttons, in both modes", () => {
  assert.match(SRC, /shadow\.addEventListener\("click", \(e\) => signInGate\(e, shadow\), true\);/, "makeWidget, in the capture phase");
  assert.match(SRC, /popEl\.addEventListener\("click", popSignInGate, true\);/, "the hover card sits outside the shadow root");
  assert.equal((SRC.match(/signInNoteHtml\(expanded/g) ?? []).length, 2, "the launcher's note in Docs and in a field");
  assert.equal((SRC.match(/signedInNow = \(\) => autoFindSources\(\[\]\);/g) ?? []).length, 2);
  assert.match(sliceBetween(SRC, "  function panelHeadHtml(", "  // The claim cards, all of them"), /signInStripHtml\(\)/, "one panel head, both modes");
  // Buttons made for the hover card carry the mark; rows and pills only change what it shows.
  assert.equal((SRC.match(/b\.setAttribute\?\.\("data-dm-act", ""\);/g) ?? []).length, 2, "dmBtn and dmShine");
  assert.match(SRC, /onCard = \(typeof signInOpen === "function" && signInOpen\(\)\)/, "the card that asked stays while the writer signs in");
});

// The hover card's gate: the real function, with its button words from the real copy.
function popWorld(label) {
  const log = [];
  const btn = new Fake();
  btn.closest = (sel) => (sel === "[data-dm-act]" ? btn : null);
  btn.textContent = label;
  const X = vm.runInContext(`
    ${sliceBetween(SRC, "    const POP_COPY = {", "    const CITE_STYLE_LABEL")}
    ${sliceBetween(SRC, "  const TRIM_COPY = {", "  // The sentence with the detail struck through")}
    ${sliceBetween(SRC, "  const BETTER_COPY = {", "  // An argument's premise")}
    const SIGNIN_COPY = { button: "Sign in with Google", later: "Not now" };
    const OUT_COPY = { pro: "Get Pro for more", student: "Get Student plan for more" };
    const RECOMMEND_COPY = { seePlans: "See plans" }, RECEIPT_COPY = { open: "Open ↗" };
    const signInAsks = () => true, shadow = {}, hoverHit = () => {}, popEl = null;
    const signInSheetOpen = () => log.push("asked");
    ${sliceBetween(SRC, "    function popSignInGate(e) {", "    function showDocsPopover(hash, rect, anchorBar) {")}
    ({ popSignInGate })`, vm.createContext({ log }));
  const e = press(btn);
  X.popSignInGate(e);
  return { stopped: e.stopped, asked: log.includes("asked") };
}

test("the hover card asks on what it does, never on leaving or taking back", () => {
  for (const label of ["Suggest fix", "Find a source", "Delete claim", "Replace with better claim", "Apply revision", "Cite in doc", "Copy citation", "Remove the detail", "See the sources"]) {
    assert.deepEqual(popWorld(label), { stopped: true, asked: true }, label);
  }
  for (const label of ["Dismiss", "Back", "Done", "Undo", "Cancel", "Keep writing", "Not now", "Keep as is", "Get Pro", "See plans", "Open article ↗", "Open ↗"]) {
    assert.deepEqual(popWorld(label), { stopped: false, asked: false }, label);
  }
});

test("what a writer and a Web Store reviewer read says the same", () => {
  const options = readFileSync(path.join(ROOT, "extension", "options.js"), "utf8");
  assert.doesNotMatch(options, /Not required — without an account/);
  assert.match(options, /Without an account, Tracely still underlines what it finds\./);
  const listing = readFileSync(path.join(ROOT, "extension", "STORE-LISTING.md"), "utf8");
  assert.doesNotMatch(listing, /No account is needed/);
  assert.match(listing, /sign in with Google/i);
  const privacy = readFileSync(path.join(ROOT, "PRIVACY.md"), "utf8");
  assert.doesNotMatch(privacy, /^- No account is needed\. If you sign in/m);
});
