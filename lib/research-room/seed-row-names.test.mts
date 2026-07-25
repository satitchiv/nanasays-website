import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generalSeedRowSlug,
  isGeneralSeedRowName,
} from './seed-row-names.ts'

test('recognises current and historical seeded row names', () => {
  assert.equal(generalSeedRowSlug('Boarding mix'), 'boarding_ratio')
  assert.equal(generalSeedRowSlug('Boarding ratio'), 'boarding_ratio')
  assert.equal(generalSeedRowSlug('Entry timeline'), 'y9_y10_admissions')
  assert.equal(generalSeedRowSlug('Year 9 / 10 admissions'), 'y9_y10_admissions')
  assert.equal(isGeneralSeedRowName('Travel from Heathrow'), true)
  assert.equal(isGeneralSeedRowName('Football strength and achievements'), false)
})
