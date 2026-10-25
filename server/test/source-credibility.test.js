/* The server's copy of "would a marker accept this as a source?"
 * (shared/sourceCredibility.js), held to the desktop's original
 * (src/shared/sourceCredibility.ts) and the extension's copy (content.js
 * credibilityOf). The cheaper searches' pass judges strong sources first by it
 * (lib/searchApi.js strongFirst), so the three must agree on every source. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sliceBetween } from "./helpers/anchors.js";
import { credibilityOf, credibilityRank } from "../shared/sourceCredibility.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(HERE, "..", "..", "extension", "content.js"), "utf8");
const DESKTOP = path.join(HERE, "..", "..", "src", "shared", "sourceCredibility.ts");
const EXT = vm.runInContext(`const CHECK_INTERVAL_MS = 10000; function hashText(s) { return s; }
  ${sliceBetween(SRC, "  // Bibliography block", "  function wireChrome(")}
  ({ credibilityOf })`, vm.createContext({ URL }));

let SKIP = false;
if (!existsSync(DESKTOP)) SKIP = "no desktop tree (a server-only checkout)";
else if (!process.features?.typescript) SKIP = `this Node (${process.version}) cannot strip TypeScript types`;
const desktop = SKIP ? null : await import(pathToFileURL(DESKTOP).href);

const CORPUS = [
  { url: "https://doi.org/10.1093/qje/qju032", doi: "10.1093/qje/qju032", venueType: "journal" },
  { url: "https://doi.org/10.1/book", doi: "10.1/book", venueType: "book" },
  { url: "https://www.cdc.gov/antibiotic-use/data/outpatient-prescribing.html" },
  { url: "https://www.gov.uk/government/statistics/x" },
  { url: "https://www.ox.ac.uk/research" },
  { url: "https://www.who.int/news-room/fact-sheets/detail/antimicrobial-resistance" },
  { url: "https://data.worldbank.org/indicator/EG.ELC.ACCS.ZS" },
  { url: "https://www.britannica.com/biography/Johannes-Gutenberg" },
  { url: "https://www.loc.gov/item/x" },
  { url: "https://www.nytimes.com/2023/01/01/x.html" },
  { url: "https://news.bbc.co.uk/x" },
  { url: "https://nottime.com/x" },
  { url: "https://en.wikipedia.org/wiki/Printing_press" },
  { url: "https://arxiv.org/abs/1234", venueType: "preprint" },
  { url: "https://example-journal.net/x", doi: "10.1234/x" },
  { url: "https://voxbooster.com/blog/sleep-deprivation-teens-statistics-2026/" },
  { url: "not a url" },
  {},
];

test("the server's copy gives the extension's verdict on every source", () => {
  for (const s of CORPUS) assert.deepEqual(credibilityOf(s), { ...EXT.credibilityOf(s) }, JSON.stringify(s));
});

test("and the desktop's, which both copy", { skip: SKIP }, () => {
  for (const s of CORPUS) assert.deepEqual(credibilityOf(s), desktop.credibilityOf(s), JSON.stringify(s));
  for (const t of ["scholarly", "official", "reference", "news-of-record", "unvetted"]) assert.equal(credibilityRank(t), desktop.credibilityRank(t), t);
});

test("the blog from the first Brave lookup is unvetted; the Washington Post and a journal paper are not", () => {
  assert.equal(credibilityOf({ url: "https://voxbooster.com/blog/sleep-deprivation-teens-statistics-2026/" }).tier, "unvetted");
  assert.equal(credibilityOf({ url: "https://www.washingtonpost.com/health/2025/02/10/x/" }).tier, "news-of-record");
  assert.equal(credibilityOf({ url: "https://doi.org/10.1176/appi.pn.2016.8a1", doi: "10.1176/appi.pn.2016.8a1", venueType: "journal" }).tier, "scholarly");
});
