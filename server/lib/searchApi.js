/* Cheaper searches, tried before OpenAI's (2026-10-24). Owner: "is there
 * any other way to decrease costs?", then "implement the system with
 * openai's search as a fallback", then yes to adding free scholarly
 * databases beside it.
 *
 * Why it can be cheaper without being worse:
 *   - What OpenAI's web_search costs: $10 per 1,000 calls, plus the result
 *     pages it reads back as input tokens. That was most of a lookup's 1.7 to
 *     2.7 cents on the cost page.
 *   - What decides what a writer sees is not the search: the server reads
 *     every candidate page and judges it against the sentence, with a quote
 *     as its receipt (lib/sourceVerify.js).
 *   - So links from a cheaper search feed the same reader and judge. Only
 *     when nothing found backs the sentence does today's OpenAI search run
 *     (factcheck.js cheapFirst), so no lookup can end with fewer backing
 *     sources than it would have had.
 *
 * TRACELY_SEARCH_PROVIDER picks the mode. Unset, every search is exactly
 * what it was.
 *   - "openalex": OpenAlex's papers alone. Free: CC0 data, a search draws
 *     $0.001 of a daily budget, $0.10 a day (about 100 searches) with no key
 *     and $1 with a free OPENALEX_API_KEY. Past that it fails, and OpenAI's
 *     search runs as before.
 *   - "brave": Brave's web results ($5 per 1,000, BRAVE_SEARCH_API_KEY) and
 *     OpenAlex's papers, asked at once and judged in one pass.
 * TRACELY_SEARCH_PRICE_PER_1K_USD records Brave's real plan price on the cost
 * page and against the spend cap. Only the search query leaves: the sentence
 * with its citation taken out, never the document. Keys live in Railway's
 * variables, never in the tree. */
import { searchOpenAlex, lexicalRelevance } from "./evidence.js";
import { RELEVANCE_FLOOR_LEXICAL } from "../shared/marks.js";
import { credibilityOf } from "../shared/sourceCredibility.js";

const TIMEOUT_MS = 5_000;
const MAX_QUERY = 350;
// Who is asking, as the APIs ask to be told.
const API_HEADERS = { "User-Agent": "Tracely/1.0 (https://jointracely.com; mailto:info@jointracely.com)", Accept: "application/json" };

const text = (v) => String(v ?? "").replace(/<[^>]*>/g, "").replace(/&(?:#39|apos);/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export const PROVIDERS = {
  /* Brave Search API: its own index. GET with the key in X-Subscription-Token;
   * `web.results[]` carries title, url and description. */
  brave: {
    keyVar: "BRAVE_SEARCH_API_KEY",
    defaultPricePer1k: 5,
    async search(q, key, signal) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&country=us&search_lang=en&safesearch=moderate`;
      const res = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal });
      if (!res.ok) throw new Error(`brave answered ${res.status}`);
      const body = await res.json();
      return (Array.isArray(body?.web?.results) ? body.web.results : []).map((r) => ({ url: r?.url, title: text(r?.title), snippet: text(r?.description) }));
    },
  },
};
/* Why Brave and OpenAlex, and not others (the comparison of 2026-10-24: Brave,
 * Serper, SerpApi, SearchAPI.io, Tavily, Exa, Jina, You.com, Linkup,
 * Firecrawl, Kagi, Mojeek, Google's and Bing's APIs, SearXNG; then Semantic
 * Scholar and OpenAlex):
 *   - Brave's Search plan: $5 per 1,000 searches, with no charge for reading
 *     results back, and $5 of free credit a month. It is its own index. Its
 *     terms (1 September 2026) cover use in an AI product and showing results
 *     to users, with storage limited to what is "transient" and required for
 *     operation. So cheapFirst keeps none of Brave's snippets, only the
 *     pages' own words.
 *   - OpenAlex: about 250 million works, CC0 data with "no 'personal use only'
 *     carve-out". The server already reads abstracts from it. Its single-work
 *     lookups are free.
 *   - Left out on purpose:
 *     - the Google-scraping resellers (Serper, SerpApi, SearchAPI.io, $1 to
 *       $25 per 1,000). Google sued SerpApi over that in December 2025;
 *     - Google Scholar scrapers: against Google's terms, and blocked on cloud
 *       servers;
 *     - Semantic Scholar: its data is under licenses such as CC BY-NC, and
 *       Tracely sells plans. Ask s2-api@semanticscholar.org in writing first.
 *   - Unavailable: Google's Custom Search API is closed to new customers, and
 *     Bing's was retired in August 2025.
 *   - The next to try, if a second web index is wanted, is Exa ($4 to $7 per
 *     1,000, its own index), once Exa confirms that showing results is
 *     allowed. */

/* OpenAlex's papers for the sentence: only the ones a relevance score says
 * are about it (evidence.js lexicalRelevance, the floor the local evidence
 * search uses), the best three, each by its DOI so the reader finds its
 * abstract. A paper with neither a DOI nor an open copy is nothing to read. */
export async function openAlexCandidates(q, claim, { apiKey = "" } = {}) {
  const works = await searchOpenAlex(q, { headers: API_HEADERS, apiKey });
  return works
    .map((w) => ({ w, rel: lexicalRelevance(claim, `${w.title} ${w.abstract ?? ""}`) }))
    .filter(({ w, rel }) => rel >= RELEVANCE_FLOOR_LEXICAL && (w.doi || w.oaUrl))
    .sort((a, b) => b.rel - a.rel)
    .slice(0, 3)
    // Its DOI and kind travel with it, so a journal article counts as peer-reviewed (strongFirst).
    .map(({ w }) => ({ url: w.doi ? `https://doi.org/${w.doi}` : w.oaUrl, title: String(w.title ?? ""), snippet: "", origin: "openalex", doi: w.doi ?? null, venueType: w.venueType ?? null }));
}

/* Which candidates the one pass judges (owner, 2026-10-24, on a blog that
 * backed a sentence beside the Washington Post: "yes start with the first").
 * The strong ones (peer-reviewed, official, reference, news of record:
 * shared/sourceCredibility.js) go first, in the services' order. When at least
 * ENOUGH_STRONG of them were found, the unvetted ones (an unrecognised
 * publisher, an open encyclopedia) are left unjudged: a student is better
 * served by one of those three backing the sentence, and if none does, OpenAI's
 * search runs as before. With fewer strong ones, the unvetted fill the pass,
 * so a sentence only a smaller site states is still found cheaply. Nothing
 * shown is dropped: the extension labels and ranks whatever is returned. */
const ENOUGH_STRONG = 3;
export function strongFirst(results, max = 8) {
  const list = Array.isArray(results) ? results : [];
  const strong = list.filter((r) => credibilityOf({ url: r.url, doi: r.doi, venueType: r.venueType }).tier !== "unvetted");
  const weak = list.filter((r) => !strong.includes(r));
  const picked = (strong.length >= ENOUGH_STRONG ? strong : [...strong, ...weak]).slice(0, max);
  return { picked, strong: strong.length, weak: weak.length };
}

/* The mode this server is set up for, or null for none (OpenAI's search
 * alone, as before). Read on every search, so a variable change in Railway
 * takes effect on its redeploy without anything cached. `find(query, claim)`
 * answers { results, microCents, searches }: what to read, what it was
 * charged, and how many of the services answered. It throws only when none
 * did. */
export function searchProvider(env = process.env) {
  const name = String(env.TRACELY_SEARCH_PROVIDER ?? "").trim().toLowerCase();
  const openalexKey = String(env.OPENALEX_API_KEY ?? "").trim();
  const papers = (q, claim) => openAlexCandidates(q, claim, { apiKey: openalexKey });
  if (name === "openalex") {
    return { name: "openalex", microCentsPerQuery: 0, find: async (q, claim) => ({ results: await papers(q, claim), microCents: 0, searches: 1 }) };
  }
  if (name !== "brave") return null;
  const key = String(env[PROVIDERS.brave.keyVar] ?? "").trim();
  if (!key) return null;
  const set = Number(env.TRACELY_SEARCH_PRICE_PER_1K_USD);
  const per1k = String(env.TRACELY_SEARCH_PRICE_PER_1K_USD ?? "").trim() !== "" && Number.isFinite(set) && set >= 0 ? set : PROVIDERS.brave.defaultPricePer1k;
  // A millionth of a cent, the spend ledger's unit.
  const microCentsPerQuery = Math.round((per1k / 1000) * 100 * 1e6);
  return {
    name: "brave+openalex",
    microCentsPerQuery,
    async find(q, claim) {
      const [web, paper] = await Promise.allSettled([PROVIDERS.brave.search(q, key, AbortSignal.timeout(TIMEOUT_MS)), papers(q, claim)]);
      if (web.status === "rejected" && paper.status === "rejected") throw web.reason;
      // All ten of Brave's: strongFirst picks the strong ones from anywhere in the list.
      const pages = web.status === "fulfilled" ? web.value.map((r) => ({ ...r, origin: "brave" })) : [];
      return {
        results: [...pages, ...(paper.status === "fulfilled" ? paper.value : [])],
        // Brave is paid for when it answered; OpenAlex's searches come out of its free daily budget.
        microCents: web.status === "fulfilled" ? microCentsPerQuery : 0,
        searches: (web.status === "fulfilled" ? 1 : 0) + (paper.status === "fulfilled" ? 1 : 0),
      };
    },
  };
}

/* What is searched: the sentence, without its parenthetical citations, quote
 * marks or brackets, which would narrow the results to its own words. */
export function searchQueryFor(claim) {
  return String(claim ?? "")
    .replace(/\([^()]*\b(?:1[5-9]\d\d|20\d\d|n\.\s?d\.)[^()]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/["“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY);
}

/* Results worth reading: web pages, one per address, not a PDF (the reader
 * never reads one), a video, a social post or a shop. The rest in the
 * services' order, at most `max`, each keeping which service found it. */
const NOT_A_SOURCE = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|reddit\.com|quora\.com|pinterest\.[a-z.]+|amazon\.[a-z.]+|ebay\.[a-z.]+|linkedin\.com)$/i;
export function candidateResults(results, max = 6) {
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(results) ? results : []) {
    let u;
    try { u = new URL(String(r?.url ?? "")); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || NOT_A_SOURCE.test(u.hostname) || /\.pdf$/i.test(u.pathname)) continue;
    const key = `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: u.href, title: String(r.title || u.href).slice(0, 200), snippet: String(r.snippet ?? "").slice(0, 300), origin: r.origin ?? null, doi: r.doi ?? null, venueType: r.venueType ?? null });
    if (out.length >= max) break;
  }
  return out;
}
