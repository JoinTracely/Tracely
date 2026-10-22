import type { NormalizedSourceResult } from './types'

/**
 * When two search results are the same work. Moved out of aggregator.ts on
 * 2026-10-22 so it loads under `node --test` (workIdentity.test.ts); the
 * aggregator's own imports (the ML stack, every provider) do not.
 */

// Separators are DROPPED, not collapsed to a space, because providers disagree
// about where the word boundaries in a title even are. Crossref returned the
// same AEA trial registration twice — "Evidence fromA CHINESE EXPERIMENT" and
// "Evidence from\nA CHINESE EXPERIMENT" — and mapping runs of non-alphanumerics
// to a space preserves exactly that difference ("froma" vs "from a"), so the
// pair survived into one claim's evidence list as two sources. Deleting the
// separators makes both "...evidencefromachineseexperiment".
//
// Letters and numbers in ANY script are kept (Codex review A1, 2026-10). The
// key used to keep only [a-z0-9], so a Chinese title keyed as "" and every
// Chinese title of one year was one work: the second replaced the first in
// the evidence list. An accented letter was dropped the same way ("Über" keyed
// as "ber"). NFKC first, so a precomposed and a decomposed "é", or a
// full-width "Ａ" and "A", key alike. Combining marks are kept, never folded
// away: in Devanagari or with Japanese voicing marks they tell words apart,
// and wrongly merging two works drops one silently, while wrongly keeping two
// shows a duplicate.
export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '')
}

export function normalizedDoi(item: NormalizedSourceResult): string | null {
  return item.doi ? item.doi.toLowerCase().trim() : null
}

/**
 * Null when the title has nothing to key on (empty, or only punctuation or
 * symbols): such a record is never matched by title, only by DOI. Before, it
 * keyed as ":2020", and every such record of a year was one work.
 */
export function titleYearKey(item: NormalizedSourceResult): string | null {
  const title = normalizeTitle(item.title ?? '')
  return title ? `${title}:${item.year ?? ''}` : null
}

// Same paper, indexed by two different providers, doesn't always come back
// with a DOI from BOTH of them — one might have it, the other might not (or
// one is the preprint record, one the published version). Matching on DOI
// *or* normalized title+year — instead of committing to whichever key the
// first-seen record happened to have — is what catches that case; DOI-only
// matching let those pairs both survive into the same claim's evidence list
// as if they were two different sources.
export function findDuplicateIndex(clusters: NormalizedSourceResult[], item: NormalizedSourceResult): number {
  const doi = normalizedDoi(item)
  const titleYear = titleYearKey(item)
  return clusters.findIndex(
    (c) => (doi !== null && normalizedDoi(c) === doi) || (titleYear !== null && titleYearKey(c) === titleYear)
  )
}
