import type { Author } from '@shared/types'
// Relative and with its extension, so this module loads under `node --test`
// (authorUtils.test.ts); the alias does not resolve there.
import { realAuthors } from '../../../shared/placeholderAuthor.ts'

/**
 * An author list with nobody in it returns null, and every formatter moves the
 * TITLE into the author slot instead.
 *
 * It used to return the literal string 'Unknown Author', which is not a
 * citation in any style — it is a placeholder that reads to a marker exactly
 * like an invented source. Owner, 2026-08-19: *"We should never put 'Unknown
 * Author' in a citation."* Right, and it had already cost real damage: the same
 * string in a draft's reference list made `referenceCheck` search Crossref for
 * an author called "Author", find nothing, and the critique called three true
 * sentences fabricated.
 *
 * Title-first rather than refusing to format, because that is what APA, MLA and
 * Chicago all actually prescribe for a work with no named author — an
 * unattributed report, a database entry, an anonymous pamphlet. The citation
 * that comes out is correct and usable, which is better than a skipped one.
 */

/**
 * How many authors a reference-list entry names. These formatters write the
 * reference list, never the in-text citation, and the lists are long:
 *
 * - APA 7 names up to 20, with "&" before the last; from 21 it names the first
 *   19, then ". . .", then the last. A reference never says "et al."
 * - Chicago 18 names up to six; from seven, the first three and "et al."
 *
 * Until 2026-10 both cut every list over three to "First, et al.", the rule of
 * neither (Codex review C4, `docs/ideas/2026-10-codex-review.md`). The
 * extension's formatter (`formatCitation` in extension/content.js) already used
 * these numbers. MLA 9 does cut at three, so `formatAuthorsMLA` is unchanged.
 */
const APA_LIST_MAX = 20
const APA_LONG_HEAD = 19
const CHICAGO_LIST_MAX = 6
const CHICAGO_LONG_HEAD = 3

function initials(given: string | undefined): string {
  if (!given) return ''
  return given
    .trim()
    .split(/\s+/)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(' ')
}

/** "Family, F. M." */
function apaSingle(author: Author): string {
  const init = initials(author.given)
  return init ? `${author.family}, ${init}` : author.family
}

export function formatAuthorsAPA(authorsIn: Author[]): string | null {
  // Placeholders are stripped BEFORE anything counts them, so a list whose
  // only "author" was `{ family: 'Unknown' }` empties to null here and the
  // caller moves the TITLE into the author slot, which is what APA, MLA and
  // Chicago all prescribe for an unattributed work. The earlier fix handled
  // an EMPTY list; the providers send the placeholder as an author instead.
  // See shared/placeholderAuthor.ts.
  const authors = realAuthors(authorsIn)
  if (authors.length === 0) return null
  if (authors.length === 1) return apaSingle(authors[0])

  if (authors.length > APA_LIST_MAX) {
    const head = authors.slice(0, APA_LONG_HEAD).map(apaSingle).join(', ')
    return `${head}, . . . ${apaSingle(authors[authors.length - 1])}`
  }

  const formatted = authors.map(apaSingle)
  const last = formatted.pop()
  return `${formatted.join(', ')}, & ${last}`
}

/** "Family, First" for the lead author, "First Family" for the rest. */
function mlaFull(author: Author, isFirst: boolean): string {
  if (!author.given) return author.family
  return isFirst ? `${author.family}, ${author.given}` : `${author.given} ${author.family}`
}

export function formatAuthorsMLA(authorsIn: Author[]): string | null {
  // Placeholders are stripped BEFORE anything counts them, so a list whose
  // only "author" was `{ family: 'Unknown' }` empties to null here and the
  // caller moves the TITLE into the author slot, which is what APA, MLA and
  // Chicago all prescribe for an unattributed work. The earlier fix handled
  // an EMPTY list; the providers send the placeholder as an author instead.
  // See shared/placeholderAuthor.ts.
  const authors = realAuthors(authorsIn)
  if (authors.length === 0) return null
  if (authors.length === 1) return mlaFull(authors[0], true)
  if (authors.length === 2) return `${mlaFull(authors[0], true)}, and ${mlaFull(authors[1], false)}`
  return `${mlaFull(authors[0], true)}, et al.`
}

export function formatAuthorsChicago(authorsIn: Author[]): string | null {
  // Placeholders are stripped BEFORE anything counts them, so a list whose
  // only "author" was `{ family: 'Unknown' }` empties to null here and the
  // caller moves the TITLE into the author slot, which is what APA, MLA and
  // Chicago all prescribe for an unattributed work. The earlier fix handled
  // an EMPTY list; the providers send the placeholder as an author instead.
  // See shared/placeholderAuthor.ts.
  const authors = realAuthors(authorsIn)
  if (authors.length === 0) return null
  if (authors.length === 1) return mlaFull(authors[0], true)
  if (authors.length > CHICAGO_LIST_MAX) {
    const head = authors.slice(0, CHICAGO_LONG_HEAD).map((a, i) => mlaFull(a, i === 0))
    return `${head.join(', ')}, et al.`
  }

  const formatted = authors.map((a, i) => mlaFull(a, i === 0))
  const last = formatted.pop()
  return `${formatted.join(', ')}, and ${last}`
}
