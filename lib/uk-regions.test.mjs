// Slice 8 Build 2 r3 — uk-regions canonical bucket tests.
//
// Dedicated test file for the shared primitive (Codex r3 Q4 answer).
// Runs via:
//   node --experimental-strip-types --test \
//     lib/uk-regions.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { regionInBucket, REGION_BUCKETS } from './uk-regions.ts'

test('REGION_BUCKETS keys are the 8 home_region enum values from onboarding-fields.ts', () => {
  // 2026-05-19 — added 'anywhere' for the "no preference" option. Bucket
  // is intentionally empty (same as 'overseas') — the scorer should
  // short-circuit region scoring entirely when home_region='anywhere'.
  const keys = Object.keys(REGION_BUCKETS).sort()
  assert.deepEqual(keys, [
    'anywhere',
    'london',
    'midlands',
    'north',
    'overseas',
    'scotland-wales',
    'south-east',
    'south-west',
  ])
})

test('regionInBucket: anywhere never matches a school region (no-preference branch)', () => {
  // Parent picked 'anywhere' → recommender should NOT use region for
  // scoring or reasons. regionInBucket returning false for every school
  // ensures match_reasons skips the "X region" reason and the scorer's
  // `home_region !== 'anywhere'` guard skips the +0.6 / -2.0 delta.
  assert.equal(regionInBucket('anywhere', 'London'),         false)
  assert.equal(regionInBucket('anywhere', 'Worcestershire'), false)
  assert.equal(regionInBucket('anywhere', 'Yorkshire'),      false)
})

test('regionInBucket: exact matches across all 6 UK buckets', () => {
  assert.equal(regionInBucket('london',         'London'),         true)
  assert.equal(regionInBucket('south-east',     'Kent'),           true)
  assert.equal(regionInBucket('south-west',     'Devon'),          true)
  assert.equal(regionInBucket('midlands',       'Worcestershire'), true)
  assert.equal(regionInBucket('north',          'Yorkshire'),      true)
  assert.equal(regionInBucket('scotland-wales', 'Scotland'),       true)
})

test('regionInBucket: critical regression — no false positives on substring overlap', () => {
  // 'north' must NOT match 'North Somerset' (south-west) or 'Northamptonshire' (midlands).
  // These were the substring false-positives the r1 alias map introduced.
  assert.equal(regionInBucket('north', 'North Somerset'),   false)
  assert.equal(regionInBucket('north', 'Northamptonshire'), false)
  // The actual south-west / midlands membership remains correct:
  assert.equal(regionInBucket('south-west', 'North Somerset'),   true)
  assert.equal(regionInBucket('midlands',   'Northamptonshire'), true)
})

test('regionInBucket: case insensitive and whitespace tolerant', () => {
  assert.equal(regionInBucket('SOUTH-WEST', 'devon'),     true)
  assert.equal(regionInBucket('south-west', 'DEVON  '),   true)
  assert.equal(regionInBucket('  south-west', 'Devon'),   true)
})

test('regionInBucket: nulls and unknowns short-circuit to false', () => {
  assert.equal(regionInBucket(null,           'Kent'),  false)
  assert.equal(regionInBucket('south-east',   null),    false)
  assert.equal(regionInBucket(undefined,      'Kent'),  false)
  assert.equal(regionInBucket('south-east',   undefined), false)
  assert.equal(regionInBucket('mars',         'Kent'),  false)  // unknown enum value
})

test('regionInBucket: overseas bucket is intentionally empty (no UK match)', () => {
  assert.equal(regionInBucket('overseas', 'Kent'),      false)
  assert.equal(regionInBucket('overseas', 'Scotland'),  false)
  assert.equal(regionInBucket('overseas', ''),          false)
})

test('REGION_BUCKETS: scotland-wales explicitly includes Northern Ireland', () => {
  // Codex r2 fix: the recommender's bucket includes NI, so the shared
  // map does too. Brief-predicates inherited this when we extracted.
  assert.ok(REGION_BUCKETS['scotland-wales'].includes('Northern Ireland'))
  assert.equal(regionInBucket('scotland-wales', 'Northern Ireland'), true)
})

test('REGION_BUCKETS: south-west explicitly includes North Somerset', () => {
  // r2 P2 #5 regression: this entry was missing from brief-predicates'
  // own (now-deleted) alias map before consolidation.
  assert.ok(REGION_BUCKETS['south-west'].includes('North Somerset'))
})
