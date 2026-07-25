// Phase 2.8 — resolveSportFocus tests
//
// Run via:
//   node --experimental-strip-types --test \
//     lib/research-room/resolve-sport-focus.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSportFocus } from './resolve-sport-focus.ts'
import {
  hashProseSnapshot,
  DEFAULT_EXPECTED_VERSION,
} from './effective-top-priority.ts'

const PROSE = {
  academic_notes:    'a',
  goals_notes:       'b',
  personality_notes: 'c',
  child_wants:       'd',
  anchors_notes:     'e',
}
const cacheFor = (sport) => ({
  value:       'sport',
  sport_focus: sport,
  source_hash: hashProseSnapshot(PROSE),
  version:     DEFAULT_EXPECTED_VERSION,
  computed_at: '2026-05-25T00:00:00Z',
})

test('interests_sports wins over conflicting intent', () => {
  const r = resolveSportFocus({
    interestsSports: [{ sport: 'rugby', level: 'national' }],
    intent: { sport_focus: 'tennis' },
  })
  assert.equal(r.sport, 'rugby')
  assert.equal(r.source, 'interests_sports')
  assert.equal(r.conflict, true)
})

test('intent wins when no interests_sports', () => {
  const r = resolveSportFocus({
    interestsSports: [],
    intent: { sport_focus: 'tennis' },
  })
  assert.equal(r.sport, 'tennis')
  assert.equal(r.source, 'intent')
  assert.equal(r.conflict, false)
})

test('cache used when intent absent', () => {
  const r = resolveSportFocus({
    interestsSports: null,
    intent: null,
    profile: { ...PROSE, intent_focus_cache: cacheFor('cricket') },
  })
  assert.equal(r.sport, 'cricket')
  assert.equal(r.source, 'cache')
})

test('intent="none" falls through to cache', () => {
  const r = resolveSportFocus({
    interestsSports: null,
    intent: { sport_focus: 'none' },
    profile: { ...PROSE, intent_focus_cache: cacheFor('hockey') },
  })
  assert.equal(r.sport, 'hockey')
  assert.equal(r.source, 'cache')
})

test('returns none when no signal anywhere', () => {
  const r = resolveSportFocus({ interestsSports: [], intent: null, profile: null })
  assert.equal(r.sport, null)
  assert.equal(r.source, 'none')
})

test('synonyms normalize (soccer→football, rugby union→rugby, field hockey→hockey)', () => {
  assert.equal(resolveSportFocus({ interestsSports: [{ sport: 'Soccer' }] }).sport, 'football')
  assert.equal(resolveSportFocus({ interestsSports: [{ sport: 'Rugby Union' }] }).sport, 'rugby')
  assert.equal(resolveSportFocus({ interestsSports: [{ sport: 'field hockey' }] }).sport, 'hockey')
})

test('unknown sport label returns none, does not throw', () => {
  const r = resolveSportFocus({ interestsSports: [{ sport: 'lacrosse' }] })
  assert.equal(r.sport, null)
})

test('non-string sport_focus on intent ignored — Codex r3 P1 whitelist', () => {
  // @ts-expect-error — intentional bad value
  const r = resolveSportFocus({ intent: { sport_focus: 123 } })
  assert.equal(r.sport, null)
})

test('malformed cache.sport_focus ignored — Codex r3 P1 whitelist', () => {
  const r = resolveSportFocus({
    profile: {
      ...PROSE,
      intent_focus_cache: { ...cacheFor('tennis'), sport_focus: 'lacrosse' },
    },
  })
  assert.equal(r.sport, null)
})

test('stale cache (prose changed) returns none', () => {
  const r = resolveSportFocus({
    profile: {
      ...PROSE,
      goals_notes: 'CHANGED',
      intent_focus_cache: cacheFor('tennis'),
    },
  })
  assert.equal(r.sport, null)
})

test('version mismatch returns none', () => {
  const r = resolveSportFocus({
    profile: {
      ...PROSE,
      intent_focus_cache: { ...cacheFor('tennis'), version: 'old-version' },
    },
  })
  assert.equal(r.sport, null)
})
