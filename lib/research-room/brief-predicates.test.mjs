// Slice 8 Build 2 — brief-predicates unit tests
//
// Run via:
//   node --experimental-strip-types --test \
//     lib/research-room/brief-predicates.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isSportPriority,
  isArtsPriority,
  isPastoralPriority,
  isFullOrWeeklyBoarding,
  isIbCurriculum,
  hasSenNeed,
  caresAboutInclusiveCulture,
  caresAboutPastoralDepth,
  regionMatches,
} from './brief-predicates.ts'

test('top_priority gates fire on exact values only', () => {
  assert.equal(isSportPriority({ top_priority: 'sport' }), true)
  assert.equal(isSportPriority({ top_priority: 'academic' }), false)
  assert.equal(isSportPriority({ top_priority: null }), false)
  assert.equal(isSportPriority(null), false)

  assert.equal(isArtsPriority({ top_priority: 'arts' }), true)
  assert.equal(isArtsPriority({ top_priority: 'sport' }), false)

  assert.equal(isPastoralPriority({ top_priority: 'pastoral' }), true)
  assert.equal(isPastoralPriority({ top_priority: 'all-round' }), false)
})

test('boarding gate fires for full and weekly only', () => {
  assert.equal(isFullOrWeeklyBoarding({ boarding_pref: 'full' }), true)
  assert.equal(isFullOrWeeklyBoarding({ boarding_pref: 'weekly' }), true)
  assert.equal(isFullOrWeeklyBoarding({ boarding_pref: 'flexi' }), false)
  assert.equal(isFullOrWeeklyBoarding({ boarding_pref: 'day' }), false)
  assert.equal(isFullOrWeeklyBoarding({ boarding_pref: null }), false)
})

test('IB gate matches the onboarding option value', () => {
  assert.equal(isIbCurriculum({ curriculum_pref: 'ib' }), true)
  assert.equal(isIbCurriculum({ curriculum_pref: 'a-level' }), false)
  assert.equal(isIbCurriculum({ curriculum_pref: 'either' }), false)
})

test('SEN gate fires only on yes-priority', () => {
  assert.equal(hasSenNeed({ sen_need: 'yes-priority' }), true)
  assert.equal(hasSenNeed({ sen_need: 'no-concern' }), false)
  assert.equal(hasSenNeed({}), false)
})

// r1 fix: actual lgbtq_pref enum is { important, no-preference }.
// 'must_have' / 'nice_to_have' from the original draft never existed in
// the onboarding UI or the schema.
test('inclusive-culture gate fires only on "important"', () => {
  assert.equal(caresAboutInclusiveCulture({ lgbtq_pref: 'important' }), true)
  assert.equal(caresAboutInclusiveCulture({ lgbtq_pref: 'no-preference' }), false)
  // legacy/typo values should NOT fire — guard against future enum drift
  assert.equal(caresAboutInclusiveCulture({ lgbtq_pref: 'must_have' }), false)
  assert.equal(caresAboutInclusiveCulture({ lgbtq_pref: null }), false)
})

test('pastoral-depth gate fires on multiple signals (OR)', () => {
  assert.equal(caresAboutPastoralDepth({ pastoral_pref: 'high_priority' }), true)
  assert.equal(caresAboutPastoralDepth({ top_priority: 'pastoral' }), true)
  assert.equal(caresAboutPastoralDepth({ sen_need: 'yes-priority' }), true)
  assert.equal(caresAboutPastoralDepth({ top_priority: 'sport' }), false)
})

// r2 (Codex P2 #5): regionMatches now delegates to the shared
// lib/uk-regions.ts module so the recommender and the brief predicates
// share one canonical bucket map. These tests assert the SHARED map's
// behaviour — covering UK independents corpus values seen live.
test('regionMatches: home_region enum maps to UK counties + region labels', () => {
  // south-west — North Somerset (r2 regression: missed in r1's smaller map)
  assert.equal(regionMatches('south-west', 'Somerset'),       true)
  assert.equal(regionMatches('south-west', 'North Somerset'), true)  // r2 regression
  assert.equal(regionMatches('south-west', 'Dorset'),         true)
  assert.equal(regionMatches('south-west', 'Devon'),          true)
  assert.equal(regionMatches('south-west', 'Bristol'),        true)
  assert.equal(regionMatches('south-west', 'Worcestershire'), false)

  // south-east
  assert.equal(regionMatches('south-east', 'Kent'),    true)
  assert.equal(regionMatches('south-east', 'Surrey'),  true)
  assert.equal(regionMatches('south-east', 'Berkshire'), true)
  assert.equal(regionMatches('south-east', 'East Sussex'), true)
  assert.equal(regionMatches('south-east', 'Norfolk'), false)  // east, not south-east

  // midlands
  assert.equal(regionMatches('midlands', 'Worcestershire'),  true)
  assert.equal(regionMatches('midlands', 'West Midlands'),   true)
  assert.equal(regionMatches('midlands', 'Northamptonshire'), true)  // midlands, not 'north'
  assert.equal(regionMatches('midlands', 'North Yorkshire'),  false)

  // north — must NOT false-positive on 'North Somerset' or 'Northamptonshire'
  assert.equal(regionMatches('north', 'Yorkshire'),          true)
  assert.equal(regionMatches('north', 'Cumbria'),            true)
  assert.equal(regionMatches('north', 'Lancashire'),         true)
  assert.equal(regionMatches('north', 'North Yorkshire'),    true)
  assert.equal(regionMatches('north', 'Somerset'),           false)
  assert.equal(regionMatches('north', 'Northamptonshire'),   false)  // critical regression test

  // scotland-wales — uses the recommender's broader bucket (incl. NI)
  assert.equal(regionMatches('scotland-wales', 'Scotland'),         true)
  assert.equal(regionMatches('scotland-wales', 'Wales'),            true)
  assert.equal(regionMatches('scotland-wales', 'Northern Ireland'), true)
  assert.equal(regionMatches('scotland-wales', 'Fife'),             true)
  assert.equal(regionMatches('scotland-wales', 'Kent'),             false)

  // overseas is intentionally an empty set
  assert.equal(regionMatches('overseas', 'Kent'),     false)
  assert.equal(regionMatches('overseas', 'Scotland'), false)

  // case-insensitive on both sides
  assert.equal(regionMatches('SOUTH-WEST', 'somerset'), true)

  // nulls short-circuit
  assert.equal(regionMatches(null, 'Somerset'),      false)
  assert.equal(regionMatches('south-west', null),    false)

  // unknown profile region returns false (not a bucket key)
  assert.equal(regionMatches('mars', 'Kent'), false)
})
