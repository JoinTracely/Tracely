import { strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { NormalizedSourceResult } from './types.ts'
import { findDuplicateIndex, normalizeTitle, titleYearKey } from './workIdentity.ts'

const result = (title: string, year: number | null = 2020, doi: string | null = null): NormalizedSourceResult =>
  ({ title, year, doi }) as NormalizedSourceResult

describe('normalizeTitle', () => {
  it('still drops every separator, so line breaks and spacing do not split a work', () => {
    strictEqual(normalizeTitle('Evidence fromA CHINESE EXPERIMENT'), normalizeTitle('Evidence from\nA CHINESE EXPERIMENT'))
    strictEqual(normalizeTitle('COVID-19: A Review'), 'covid19areview')
  })

  it('keeps letters in any script', () => {
    strictEqual(normalizeTitle('中国农村教育的发展'), '中国农村教育的发展')
    strictEqual(normalizeTitle('Über die Bildung'), 'überdiebildung')
    strictEqual(normalizeTitle('التعليم في مصر'), 'التعليمفيمصر')
  })

  it('keys a precomposed and a decomposed accent, and full-width letters, alike', () => {
    strictEqual(normalizeTitle('Café society'), normalizeTitle('Café society'))
    strictEqual(normalizeTitle('ＡＩ ｉｎ ｓｃｈｏｏｌｓ'), normalizeTitle('AI in schools'))
  })

  it('keeps the marks that tell words apart', () => {
    // Japanese voicing: が is not か.
    strictEqual(normalizeTitle('がっこう') === normalizeTitle('かっこう'), false)
    // Devanagari vowel signs.
    strictEqual(normalizeTitle('शिक्षा') === normalizeTitle('शकष'), false)
  })
})

describe('titleYearKey', () => {
  it('is null when the title has nothing to key on', () => {
    strictEqual(titleYearKey(result('')), null)
    strictEqual(titleYearKey(result('— ? —')), null)
  })
})

describe('findDuplicateIndex', () => {
  it('keeps two different Chinese titles of one year apart', () => {
    // Both keyed as ":2020" before, so the second replaced the first.
    const clusters = [result('中国农村教育的发展')]
    strictEqual(findDuplicateIndex(clusters, result('人工智能与高等教育')), -1)
  })

  it('keeps titles apart that share only their Latin part', () => {
    const clusters = [result('COVID-19 在中国的传播')]
    strictEqual(findDuplicateIndex(clusters, result('COVID-19 在美国的传播')), -1)
  })

  it('still matches one work from two providers, by title and year', () => {
    const clusters = [result('Learning to Read: A Study'), result('中国农村教育的发展')]
    strictEqual(findDuplicateIndex(clusters, result('Learning to read — a study')), 0)
    strictEqual(findDuplicateIndex(clusters, result('中国农村教育的发展。')), 1)
  })

  it('never matches two records by an empty title', () => {
    strictEqual(findDuplicateIndex([result('???')], result('!!!')), -1)
  })

  it('still matches by DOI whatever the titles say', () => {
    const clusters = [result('', 2020, '10.1000/XYZ')]
    strictEqual(findDuplicateIndex(clusters, result('A different title', 2021, ' 10.1000/xyz')), 0)
  })
})
