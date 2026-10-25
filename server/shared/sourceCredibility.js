/* Would a marker accept this as a source? A leaf port of the desktop's
 * src/shared/sourceCredibility.ts, which the extension copies too
 * (content.js credibilityOf). test/source-credibility.test.js runs all
 * three on one corpus and fails when they disagree: change one, change all.
 *
 * Decided from the publisher, never by a model: a model grading its own
 * search grades it generously. "unvetted" means "Tracely does not recognise
 * this publisher", a fact about these lists, not about the site.
 *
 * The server uses it for one thing (lib/searchApi.js strongFirst): in the
 * cheaper searches' pass, judge the strong candidates first, and leave the
 * unvetted ones unjudged when enough strong ones were found. Nothing a
 * search shows is dropped by it; the extension still labels and ranks. */

const ORDER = { scholarly: 0, official: 1, reference: 2, "news-of-record": 3, unvetted: 4 };
export const credibilityRank = (tier) => ORDER[tier];

const OFFICIAL_SUFFIX = /(^|\.)(gov|mil|int|edu)$|(^|\.)(gov|ac|edu)\.[a-z]{2}$/i;
const OFFICIAL_HOSTS = ["un.org", "unicef.org", "unesco.org", "unhcr.org", "who.int", "worldbank.org", "imf.org", "oecd.org", "wto.org", "icrc.org", "redcross.org", "europa.eu"];
const REFERENCE_HOSTS = ["britannica.com", "oxforddnb.com", "oed.com", "oxfordreference.com", "loc.gov", "bl.uk", "archives.gov", "nationalarchives.gov.uk", "jstor.org", "niod.nl", "iwm.org.uk", "si.edu", "ushmm.org", "yadvashem.org"];
const NEWS_OF_RECORD = ["nytimes.com", "washingtonpost.com", "wsj.com", "ft.com", "economist.com", "theguardian.com", "bbc.co.uk", "bbc.com", "reuters.com", "apnews.com", "npr.org", "pbs.org", "time.com", "theatlantic.com", "newyorker.com", "nature.com", "science.org", "scientificamerican.com", "smithsonianmag.com", "nationalgeographic.com", "telegraph.co.uk", "thetimes.co.uk", "latimes.com", "cbc.ca", "abc.net.au"];
const OPEN_ENCYCLOPEDIA = /(^|\.)(wikipedia|wikimedia|fandom|wikiwand)\./i;

export function hostOf(url) {
  if (!url) return null;
  try {
    return new URL(String(url).trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
// On a dot boundary: news.bbc.co.uk counts, nottime.com does not.
const matches = (host, list) => list.some((entry) => host === entry || host.endsWith(`.${entry}`));

/* { tier, label, citable, why } from { url, venueType, doi }, word for word the desktop's. */
export function credibilityOf(source = {}) {
  const host = hostOf(source?.url);
  const scholarlyVenue = source?.venueType === "journal" || source?.venueType === "conference" || source?.venueType === "preprint";
  if (source?.doi && scholarlyVenue) return { tier: "scholarly", label: "Peer-reviewed", citable: true, why: "A journal article with a DOI. The strongest thing you can cite." };
  if (host && (OFFICIAL_SUFFIX.test(host) || matches(host, OFFICIAL_HOSTS))) return { tier: "official", label: "Official", citable: true, why: "Published by the government, university or organisation it is about." };
  if (host && matches(host, REFERENCE_HOSTS)) return { tier: "reference", label: "Reference work", citable: true, why: "An established work of record — an encyclopedia, archive or museum." };
  if (host && matches(host, NEWS_OF_RECORD)) return { tier: "news-of-record", label: "News of record", citable: true, why: "A masthead with editors and a corrections policy." };
  if (host && OPEN_ENCYCLOPEDIA.test(host)) return { tier: "unvetted", label: "Encyclopedia", citable: false, why: "Anyone can edit it, so most teachers will not accept it. Follow its references and cite those instead." };
  if (source?.doi || scholarlyVenue) return { tier: "unvetted", label: "Check this one", citable: false, why: "Looks academic, but Tracely could not confirm the publisher. Check who published it before citing." };
  return { tier: "unvetted", label: "Check this one", citable: false, why: "Tracely does not recognise this publisher. It may still be fine — check who wrote it and whether they cite their own sources." };
}
