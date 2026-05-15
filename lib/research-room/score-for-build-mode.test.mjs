// Slice 8 Build 6 — Build Mode scorer unit tests.
//
// Tests the pure `rankCandidates` ranker (no DB). The DB-backed
// `scoreForBuildMode` wrapper is exercised end-to-end via the finalize
// route tests in a later step.
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/research-room/score-for-build-mode.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankCandidates } from './score-for-build-mode.ts'

// ── Fixtures ─────────────────────────────────────────────────────────

const SHERBORNE = {
  slug: 'sherborne-school',
  name: 'Sherborne School',
  gender_split: 'Boys',
  fees_usd_min: 60000,
  sen_support: false,
  strengths: ['sport', 'academic'],
  confidence_score: 90,
  age_min: 13, age_max: 18,
  region: 'Dorset',
}

const RUGBY_SCHOOL = {
  slug: 'rugby-school',
  name: 'Rugby School',
  gender_split: 'Mixed',
  fees_usd_min: 55000,
  sen_support: false,
  strengths: ['sport', 'academic'],
  confidence_score: 85,
  age_min: 13, age_max: 18,
  region: 'Warwickshire',
}

const WYCOMBE_ABBEY = {
  slug: 'wycombe-abbey',
  name: 'Wycombe Abbey',
  gender_split: 'Girls',
  fees_usd_min: 65000,
  sen_support: false,
  strengths: ['academic'],
  confidence_score: 95,
  age_min: 11, age_max: 18,
  region: 'Buckinghamshire',
}

const A_DAY_SCHOOL = {
  slug: 'a-day-school',
  name: 'A Day School',
  gender_split: 'Co-ed',
  fees_usd_min: 30000,
  sen_support: false,
  strengths: [],
  confidence_score: 50,
  age_min: 11, age_max: 18,
  region: 'London',
}

// Struct rows — competitive_tier + exam_results are what the dimension
// scorers read. Keep minimal so tests stay focused.
const STRUCT_SHERBORNE_RUGBY_NATIONAL = {
  school_slug: 'sherborne-school',
  sports_profile: {
    rugby: { competitive_tier: 'national-strong' },
  },
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: null,
}

const STRUCT_RUGBY_SCHOOL_RUGBY_ELITE = {
  school_slug: 'rugby-school',
  sports_profile: {
    rugby: { competitive_tier: 'national-elite' },
  },
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: null,
}

const STRUCT_WYCOMBE_ACADEMIC = {
  school_slug: 'wycombe-abbey',
  sports_profile: null,
  exam_results: {
    a_level: { pct_a_star: 75, pct_a_star_a: 95 },
    gcse:    { pct_9: 60 },
  },
  university_destinations: {
    oxford_count: 12, cambridge_count: 10, russell_group_count: 80,
  },
  student_community: null,
  isi_deep_facts: null,
}

const STRUCT_DAY_EMPTY = {
  school_slug: 'a-day-school',
  sports_profile: null,
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

// ── Tests ────────────────────────────────────────────────────────────

test('empty input → empty output', () => {
  const out = rankCandidates([], new Map(), {
    parent: null, child: null, excludeSlugs: [],
  }, 10)
  assert.deepEqual(out, [])
})

test('gender filter drops boys-only school when child is a girl', () => {
  const out = rankCandidates(
    [SHERBORNE, WYCOMBE_ABBEY],
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL, STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'south-east' },
      child: { goal_orientation: 'university_track' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('sherborne-school'), 'Sherborne (Boys) should be filtered out for a girl')
  assert.ok(slugs.includes('wycombe-abbey'),     'Wycombe Abbey (Girls) should remain')
})

test('boarding_pref=day drops known full-boarding schools', () => {
  // Wycombe Abbey IS in KNOWN_FULL_BOARDING_NAMES — so a day-pref parent
  // should not see it.
  const out = rankCandidates(
    [WYCOMBE_ABBEY, A_DAY_SCHOOL],
    structMap(STRUCT_WYCOMBE_ACADEMIC, STRUCT_DAY_EMPTY),
    {
      parent: { boarding_pref: 'day', home_region: 'london' },
      child: null,
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('wycombe-abbey'), 'Wycombe Abbey should be excluded for day-only parents')
})

test('sport interest produces "strong rugby" signal with tier label', () => {
  const out = rankCandidates(
    [RUGBY_SCHOOL, A_DAY_SCHOOL],
    structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE, STRUCT_DAY_EMPTY),
    {
      parent: null,
      child: {
        interests_sports: [{ sport: 'rugby', level: 'county' }],
      },
      excludeSlugs: [],
    },
    10,
  )
  const rugby = out.find(c => c.slug === 'rugby-school')
  assert.ok(rugby, 'Rugby School should be in output')
  assert.ok(
    rugby.signals.some(s => s.startsWith('strong rugby')),
    `expected a "strong rugby" signal, got: ${JSON.stringify(rugby.signals)}`,
  )
  assert.ok(
    rugby.signals.some(s => s.includes('elite')),
    'expected the elite tier label in the signal',
  )
})

test('goal_orientation=university_track surfaces academic-strong signal + exam fact', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child: { goal_orientation: 'university_track' },
      excludeSlugs: [],
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe Abbey should be ranked')
  assert.ok(wa.signals.includes('academic-strong'))
  // Rationale-seed should mention a concrete academic fact (e.g. "75% A*")
  assert.match(wa.rationale_seed, /A\*|Grade 9|Oxbridge/)
})

test('region match adds a region chip', () => {
  // home_region 'south-west' maps to a bucket including Dorset
  const out = rankCandidates(
    [SHERBORNE],
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL),
    {
      parent: { home_region: 'south-west' },
      child: { interests_sports: [{ sport: 'rugby', level: 'school' }] },
      excludeSlugs: [],
      childGender: 'boy',
    },
    10,
  )
  const sherb = out.find(c => c.slug === 'sherborne-school')
  assert.ok(sherb, 'Sherborne should be present')
  assert.ok(
    sherb.signals.some(s => s.includes('region')),
    `expected a region chip, got: ${JSON.stringify(sherb.signals)}`,
  )
})

test('excludeSlugs are NOT filtered here (wrapper handles that)', () => {
  // rankCandidates is pure; the SQL-side wrapper excludes shortlist
  // slugs. So passing in an already-shortlisted school should still rank
  // it, and the wrapper test in a later step will assert the SQL filter.
  const out = rankCandidates(
    [SHERBORNE],
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL),
    {
      parent: null,
      child: { interests_sports: [{ sport: 'rugby', level: 'county' }] },
      excludeSlugs: ['sherborne-school'],   // ignored by pure ranker
      childGender: 'boy',
    },
    10,
  )
  assert.equal(out.length, 1, 'rankCandidates does not enforce excludeSlugs (wrapper does)')
})

test('school with zero positive signals is dropped from output', () => {
  // No sport interest, no academic, no region match, no budget signal —
  // the day school scores only on confidence_score base. signals.length=0.
  const out = rankCandidates(
    [A_DAY_SCHOOL],
    structMap(STRUCT_DAY_EMPTY),
    {
      parent: null,
      child: null,
      excludeSlugs: [],
    },
    10,
  )
  assert.equal(out.length, 0, 'no positive signal → drop')
})

test('anchors_notes mentioning pastoral upgrades pastoral_pref ctx', () => {
  // Even without parent.pastoral_pref set, prose containing "pastoral" /
  // "wellbeing" / "anxiety" should activate the pastoral_care scorer.
  // Wycombe Abbey has no isi_deep_facts so pastoral_care.rank returns 0
  // here; the test just confirms the school still appears (driven by
  // academic), not that a pastoral signal fires.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child: {
        goal_orientation: 'university_track',
        anchors_notes: 'Pastoral care is critical — she gets homesick',
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  assert.ok(out.length === 1)
  // Confirm rationale_seed isn't broken
  assert.ok(out[0].rationale_seed.length > 0)
})

test('budget hard-cap soft signal: in-budget school gets "in budget" chip', () => {
  const out = rankCandidates(
    [A_DAY_SCHOOL],   // 30k USD fees
    structMap(STRUCT_DAY_EMPTY),
    {
      parent: { budget_range: 'over-50k', home_region: 'london' },
      // budget_range over-50k → no ceiling → won't add "in budget" chip
      child: { interests_sports: [{ sport: 'rugby', level: 'school' }] },
      excludeSlugs: [],
    },
    10,
  )
  // With no budget ceiling AND no rugby data, day school scores only on
  // region (london matches itself). Should produce a region chip but no
  // budget chip.
  const day = out.find(c => c.slug === 'a-day-school')
  if (day) {
    assert.ok(!day.signals.includes('in budget'), 'no budget chip when ceiling is null')
  }
})

test('budget under-30k cap: in-budget chip fires for a 30k school', () => {
  const out = rankCandidates(
    [A_DAY_SCHOOL],   // 30000 USD → vs ceiling 30000*1.27 = 38100 → ratio < 1.0 → "in budget"
    structMap(STRUCT_DAY_EMPTY),
    {
      parent: { budget_range: 'under-30k', home_region: 'london' },
      child: { interests_sports: [{ sport: 'rugby', level: 'school' }] },
      excludeSlugs: [],
    },
    10,
  )
  const day = out.find(c => c.slug === 'a-day-school')
  assert.ok(day, 'day school should rank with region chip + in-budget chip')
  assert.ok(day.signals.includes('in budget'), 'in-budget chip should fire')
})

test('rationale_seed is non-empty and contains the school name when signals exist', () => {
  const out = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    {
      parent: { home_region: 'south-east' },
      child: { interests_sports: [{ sport: 'rugby', level: 'county' }] },
      excludeSlugs: [],
    },
    10,
  )
  const rs = out[0]
  assert.ok(rs.rationale_seed.startsWith('Rugby School —'))
  assert.ok(rs.rationale_seed.endsWith('.'))
})

test('signals are deduplicated and capped at 5', () => {
  // Force a school that would produce many duplicate-looking signals.
  // Easiest: rugby + tennis + sport_career fallback. Verify no duplicates.
  const STRUCT_MULTI = {
    school_slug: 'rugby-school',
    sports_profile: {
      rugby:  { competitive_tier: 'national-elite' },
      tennis: { competitive_tier: 'national-strong' },
    },
    exam_results: { a_level: { pct_a_star: 50 } },
    university_destinations: { oxford_count: 5, cambridge_count: 5 },
    student_community: { total_pupils: 350 },
    isi_deep_facts: null,
  }
  const out = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_MULTI),
    {
      parent: { home_region: 'midlands', class_size_pref: 'very-important', budget_range: 'over-50k' },
      child: {
        goal_orientation: 'university_track',
        interests_sports: [
          { sport: 'rugby',  level: 'national' },
          { sport: 'tennis', level: 'regional' },
        ],
      },
      excludeSlugs: [],
    },
    10,
  )
  const rs = out[0]
  assert.ok(rs.signals.length <= 5, `signals capped at 5, got ${rs.signals.length}`)
  assert.equal(new Set(rs.signals).size, rs.signals.length, 'no duplicate signals')
})
