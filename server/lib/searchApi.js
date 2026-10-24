/* A cheaper web search, tried before OpenAI's (2026-10-24). Owner: "is
 * there any other way to decrease costs?" and then "implement the system
 * with openai's search as a fallback".
 *
 * Why it can be cheaper without being worse:
 *   - What OpenAI's web_search costs: $10 per 1,000 calls, plus the result
 *     pages it reads back as input tokens. That was most of a lookup's 1.7 to
 *     2.7 cents on the cost page.
 *   - What decides what a writer sees is not the search: the server reads
 *     every candidate page and judges it against the sentence, with a quote
 *     as its receipt (lib/sourceVerify.js).
 *   - So a plain search API that returns links feeds the same reader and
 *     judge. Only when nothing it found backs the sentence does today's
 *     OpenAI search run (factcheck.js cheapFirst), so no lookup can end with
 *     fewer backing sources than it would have had.
 *
 * Off unless TRACELY_SEARCH_PROVIDER names a provider below AND that
 * provider's key variable is set: then searchProvider() returns null and
 * every search is exactly what it was. The key lives in Railway's variables,
 * never in the tree. TRACELY_SEARCH_PRICE_PER_1K_USD records the plan's
 * real price on the cost page and against the spend cap; each provider's
 * default below is its list price, as noted. Only the search query leaves
 * for the provider: the sentence with its citation taken out, never the
 * document. */

const TIMEOUT_MS = 5_000;
const MAX_QUERY = 350;

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
/* Why Brave, and only Brave so far (the comparison of 2026-10-24: Brave,
 * Serper, SerpApi, SearchAPI.io, Tavily, Exa, Jina, You.com, Linkup,
 * Firecrawl, Kagi, Mojeek, Google's and Bing's APIs, SearXNG):
 *   - Brave's Search plan is $5 per 1,000 searches, with no charge for
 *     reading results back, and $5 of free credit a month.
 *   - It is its own index. Its terms (1 September 2026) cover use in an AI
 *     product and showing results to users, with storage limited to what is
 *     "transient" and required for operation. So cheapFirst keeps none of
 *     Brave's snippets, only the pages' own words.
 *   - The cheapest options (Serper, SerpApi, SearchAPI.io, $1 to $25 per
 *     1,000) resell Google's results by scraping them, and Google sued SerpApi
 *     over that in December 2025. Left out on purpose.
 *   - Google's Custom Search API is closed to new customers, and Bing's was
 *     retired in August 2025.
 * The next to try, if a second is wanted, is Exa (its own index, $4 to $7 per
 * 1,000), once Exa confirms in writing that showing results is allowed. */

/* The provider this server is set up for, or null for none (OpenAI's search
 * alone, as before). Read on every search, so a variable change in Railway
 * takes effect on its redeploy without anything cached. */
export function searchProvider(env = process.env) {
  const name = String(env.TRACELY_SEARCH_PROVIDER ?? "").trim().toLowerCase();
  const provider = Object.hasOwn(PROVIDERS, name) ? PROVIDERS[name] : null;
  if (!provider) return null;
  const key = String(env[provider.keyVar] ?? "").trim();
  if (!key) return null;
  const set = Number(env.TRACELY_SEARCH_PRICE_PER_1K_USD);
  const per1k = String(env.TRACELY_SEARCH_PRICE_PER_1K_USD ?? "").trim() !== "" && Number.isFinite(set) && set >= 0 ? set : provider.defaultPricePer1k;
  return {
    name,
    // A millionth of a cent, the spend ledger's unit.
    microCentsPerQuery: Math.round((per1k / 1000) * 100 * 1e6),
    search: (q, { signal = AbortSignal.timeout(TIMEOUT_MS) } = {}) => provider.search(q, key, signal),
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
 * provider's order, at most `max`. */
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
    out.push({ url: u.href, title: String(r.title || u.href).slice(0, 200), snippet: String(r.snippet ?? "").slice(0, 300) });
    if (out.length >= max) break;
  }
  return out;
}
