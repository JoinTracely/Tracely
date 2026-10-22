import { strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Author } from '../../../shared/types.ts'
import { formatAuthorsAPA, formatAuthorsChicago, formatAuthorsMLA } from './authorUtils.ts'

// Codex review C4 (2026-10): every list over three authors was cut to
// "First, et al." in APA and Chicago reference entries. The rules below are
// APA 7's and Chicago 18's for a reference list, the same numbers the
// extension's formatter uses.

/** Author i is "Family<i>, Given<i>", so a list's order shows in its output. */
const people = (n: number): Author[] =>
  Array.from({ length: n }, (_, i) => ({ given: `G${i + 1}`, family: `F${i + 1}` }))

const apaNames = (from: number, to: number): string =>
  Array.from({ length: to - from + 1 }, (_, i) => `F${from + i}, G.`).join(', ')

describe('formatAuthorsAPA', () => {
  it('names one, two and three authors as before', () => {
    strictEqual(formatAuthorsAPA(people(1)), 'F1, G.')
    strictEqual(formatAuthorsAPA(people(2)), 'F1, G., & F2, G.')
    strictEqual(formatAuthorsAPA(people(3)), 'F1, G., F2, G., & F3, G.')
  })

  it('names a fourth author instead of cutting to et al.', () => {
    strictEqual(formatAuthorsAPA(people(4)), 'F1, G., F2, G., F3, G., & F4, G.')
  })

  it('names all of twenty, with & before the last', () => {
    strictEqual(formatAuthorsAPA(people(20)), `${apaNames(1, 19)}, & F20, G.`)
  })

  it('names the first nineteen, an ellipsis and the last from twenty-one, with no &', () => {
    strictEqual(formatAuthorsAPA(people(21)), `${apaNames(1, 19)}, . . . F21, G.`)
    strictEqual(formatAuthorsAPA(people(40)), `${apaNames(1, 19)}, . . . F40, G.`)
  })

  it('never says et al. in a reference', () => {
    for (const n of [4, 7, 20, 21, 60]) strictEqual(formatAuthorsAPA(people(n))?.includes('et al.'), false, `n=${n}`)
  })

  it('counts after the placeholders are stripped', () => {
    const list = [...people(20), { family: 'Unknown' }]
    strictEqual(formatAuthorsAPA(list), `${apaNames(1, 19)}, & F20, G.`)
  })
})

describe('formatAuthorsChicago', () => {
  it('names up to six, the first inverted and "and" before the last', () => {
    strictEqual(formatAuthorsChicago(people(2)), 'F1, G1, and G2 F2')
    strictEqual(formatAuthorsChicago(people(4)), 'F1, G1, G2 F2, G3 F3, and G4 F4')
    strictEqual(formatAuthorsChicago(people(6)), 'F1, G1, G2 F2, G3 F3, G4 F4, G5 F5, and G6 F6')
  })

  it('names the first three and et al. from seven', () => {
    strictEqual(formatAuthorsChicago(people(7)), 'F1, G1, G2 F2, G3 F3, et al.')
    strictEqual(formatAuthorsChicago(people(25)), 'F1, G1, G2 F2, G3 F3, et al.')
  })
})

describe('formatAuthorsMLA', () => {
  it('still cuts at three: MLA 9 does', () => {
    strictEqual(formatAuthorsMLA(people(2)), 'F1, G1, and G2 F2')
    strictEqual(formatAuthorsMLA(people(3)), 'F1, G1, et al.')
  })
})
