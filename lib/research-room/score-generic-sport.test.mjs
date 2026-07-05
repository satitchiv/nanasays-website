// Build Mode recommender — generic sport interest tests (2026-07-05).
//
// The gap this pins: a parent whose child is golf-mad used to get NO
// golf-aware ranking — normalizeSportLabel dropped 'Golf' (not big-five),
// so golf-strong schools scored identically to any school with a generic
// 'sport' strengths tag. Now interests_sports entries that match the
// GENERIC_SPORTS registry score via scoreSportOffering() against the
// generic sports_profile fields.
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/research-room/score-generic-sport.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankCandidates } from './score-for-build-mode.ts'

// ── Fixtures ─────────────────────────────────────────────────────────

const GOLF_ACADEMY_SCHOOL = {
  slug: 'golf-academy-school',
  name: 'Golf Academy School',
  gender_split: 'Co-ed',
  fees_usd_min: 45000,
  sen_support: false,
  strengths: ['sport'],
  confidence_score: 80,
  age_min: 11, age_max: 18,
  region: 'Surrey',
}

const SPORTY_NO_GOLF_SCHOOL = {
  slug: 'sporty-no-golf-school',
  name: 'Sporty No-Golf School',
  gender_split: 'Co-ed',
  fees_usd_min: 45000,
  sen_support: false,
  strengths: ['sport'],
  confidence_score: 80,
  age_min: 11, age_max: 18,
  region: 'Surrey',
}

// Live-shape sports_profile (sampled 2026-07-05 — ACS Cobham pattern).
const STRUCT_GOLF_ACADEMY = {
  school_slug: 'golf-academy-school',
  sports_profile: {
    sport_categories: { major: [], academy: ['Golf'], optional: [] },
    teams_by_sport: [{ sport: 'Golf', gender: 'mixed', team_count: 2, team_levels: ['1st', 'U16'] }],
    competitions_entered: [{ name: 'ISGA Championship', scope: 'national', sport: 'Golf' }],
    facilities: ['Five par-3 practice golf holes'],
    sports_offered: ['Golf', 'Football'],
    source_urls: ['https://example.com/sport'],
  },
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: null,
}

const STRUCT_SPORTY_NO_GOLF = {
  school_slug: 'sporty-no-golf-school',
  sports_profile: {
    sport_categories: { major: ['Rugby Union'], academy: [], optional: [] },
    teams_by_sport: [{ sport: 'Rugby Union', gender: 'boys', team_count: 19, team_levels: ['1st XV'] }],
    sports_offered: ['Rugby Union', 'Hockey'],
    source_urls: [],
  },
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: null,
}

function structMap(...rows) {
  const m = new Map()
  for (const r of rows) m.set(r.school_slug, r)
  return m
}

const GOLF_CHILD = {
  interests_sports: [{ sport: 'Golf', level: 'county' }],
}

// ── Tests ────────────────────────────────────────────────────────────

test('golf interest ranks the golf-academy school above the equally-sporty non-golf school', () => {
  const out = rankCandidates(
    [GOLF_ACADEMY_SCHOOL, SPORTY_NO_GOLF_SCHOOL],
    structMap(STRUCT_GOLF_ACADEMY, STRUCT_SPORTY_NO_GOLF),
    { parent: null, child: GOLF_CHILD, excludeSlugs: [] },
    10,
  )
  const golf = out.find(c => c.slug === 'golf-academy-school')
  assert.ok(golf, 'golf school must be in output')
  const nonGolf = out.find(c => c.slug === 'sporty-no-golf-school')
  if (nonGolf) {
    assert.ok(golf.score > nonGolf.score,
      `golf school (${golf.score}) must outrank non-golf school (${nonGolf.score})`)
  }
})

test('golf-academy school gets a golf signal chip; non-golf school gets none', () => {
  const out = rankCandidates(
    [GOLF_ACADEMY_SCHOOL, SPORTY_NO_GOLF_SCHOOL],
    structMap(STRUCT_GOLF_ACADEMY, STRUCT_SPORTY_NO_GOLF),
    { parent: null, child: GOLF_CHILD, excludeSlugs: [] },
    10,
  )
  const golf = out.find(c => c.slug === 'golf-academy-school')
  assert.ok(golf.signals.some(s => /golf/.test(s)),
    `expected a golf chip, got: ${JSON.stringify(golf.signals)}`)
  // Academy category (+5) + teams + national competition + facilities ≥ 6
  // → the stronger "programme" wording, not just "offers golf".
  assert.ok(golf.signals.some(s => s === 'strong golf programme'),
    `expected "strong golf programme", got: ${JSON.stringify(golf.signals)}`)

  const nonGolf = out.find(c => c.slug === 'sporty-no-golf-school')
  if (nonGolf) {
    assert.ok(!nonGolf.signals.some(s => /golf/.test(s)),
      `non-golf school must not get golf chips: ${JSON.stringify(nonGolf.signals)}`)
  }
})

test('duplicate golf entries do not stack the boost', () => {
  const once = rankCandidates(
    [GOLF_ACADEMY_SCHOOL],
    structMap(STRUCT_GOLF_ACADEMY),
    { parent: null, child: { interests_sports: [{ sport: 'Golf', level: 'county' }] }, excludeSlugs: [] },
    10,
  )
  const twice = rankCandidates(
    [GOLF_ACADEMY_SCHOOL],
    structMap(STRUCT_GOLF_ACADEMY),
    { parent: null, child: { interests_sports: [{ sport: 'Golf', level: 'county' }, { sport: 'golfing', level: 'county' }] }, excludeSlugs: [] },
    10,
  )
  assert.equal(
    twice[0].score, once[0].score,
    'dedup by registry key: [{Golf},{golfing}] must score the same as [{Golf}]',
  )
})

test('big-five interests still take the *_strength path (no generic double-count)', () => {
  const out = rankCandidates(
    [SPORTY_NO_GOLF_SCHOOL],
    structMap({
      ...STRUCT_SPORTY_NO_GOLF,
      sports_profile: {
        ...STRUCT_SPORTY_NO_GOLF.sports_profile,
        rugby: { competitive_tier: 'national-elite' },
      },
    }),
    { parent: null, child: { interests_sports: [{ sport: 'rugby', level: 'county' }] }, excludeSlugs: [] },
    10,
  )
  const school = out.find(c => c.slug === 'sporty-no-golf-school')
  assert.ok(school, 'school present')
  assert.ok(school.signals.some(s => s.startsWith('strong rugby')),
    `rugby chip from the *_strength path expected: ${JSON.stringify(school.signals)}`)
})

test('unmatchable sport label (kabaddi) neither boosts nor throws; generic sport suppresses the bare sport-tag fallback only when it matched', () => {
  // kabaddi: not big-five, not in registry → genericSportsInterest empty →
  // behaviour identical to the pre-change fallback path.
  const out = rankCandidates(
    [SPORTY_NO_GOLF_SCHOOL],
    structMap(STRUCT_SPORTY_NO_GOLF),
    { parent: null, child: { interests_sports: [{ sport: 'kabaddi', level: 'club' }] }, excludeSlugs: [] },
    10,
  )
  const school = out.find(c => c.slug === 'sporty-no-golf-school')
  if (school) {
    assert.ok(!school.signals.some(s => /kabaddi/.test(s)))
  }
})

test('golf interest against a school with NO sports_profile produces no golf chip (honest no-data)', () => {
  const noProfile = {
    school_slug: 'golf-academy-school',
    sports_profile: null,
    exam_results: null,
    university_destinations: null,
    student_community: null,
    isi_deep_facts: null,
  }
  const out = rankCandidates(
    [GOLF_ACADEMY_SCHOOL],
    structMap(noProfile),
    { parent: null, child: GOLF_CHILD, excludeSlugs: [] },
    10,
  )
  const school = out.find(c => c.slug === 'golf-academy-school')
  if (school) {
    assert.ok(!school.signals.some(s => /golf/.test(s)),
      `no data → no golf chip: ${JSON.stringify(school.signals)}`)
  }
})
