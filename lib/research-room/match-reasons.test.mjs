// Slice 8 Build 2 — match-reasons unit tests
//
// Run via:
//   node --experimental-strip-types --test \
//     lib/research-room/match-reasons.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMatchReasons } from './match-reasons.ts'

const SCHOOL_BROMSGROVE = {
  slug: 'bromsgrove-school',
  name: 'Bromsgrove School',
  region: 'West Midlands',   // r2: bucketed under 'midlands' via shared lib/uk-regions.ts
  boarding: true,
  sen_support: false,
}

const SCHOOL_DAY_LONDON = {
  slug: 'a-day-school',
  name: 'A Day School',
  region: 'London',
  boarding: false,
  sen_support: false,
}

const SCHOOL_SEN_SUPPORTIVE = {
  slug: 'sen-friendly',
  name: 'SEN Friendly School',
  region: 'Surrey',
  boarding: false,
  sen_support: true,
}

const SCHOOL_DEVON = {
  slug: 'a-devon-school',
  name: 'A Devon School',
  region: 'Devon',     // r2: south-west bucket via shared module
  boarding: true,
  sen_support: false,
}

const SCHOOL_NORTH_SOMERSET = {
  slug: 'a-north-somerset-school',
  name: 'A North Somerset School',
  region: 'North Somerset',  // r2: south-west bucket (was missed in r1 brief-predicates own map)
  boarding: false,
  sen_support: false,
}

// r2 (Codex P2 #4): tier vocabulary is `national-elite`, `national-strong`,
// `national`, `regional`. Replaces r1 fixture which used 'elite' (never an
// actual tier value).
const STRUCT_RUGBY_NATIONAL_STRONG = {
  sports_profile: { rugby: { competitive_tier: 'national-strong', team_count: 12 } },
  exam_results:   null,
}

const STRUCT_RUGBY_NATIONAL_ELITE = {
  sports_profile: { rugby: { competitive_tier: 'national-elite' } },
  exam_results:   null,
}

const STRUCT_RUGBY_LOCAL = {
  sports_profile: { rugby: { competitive_tier: 'local' } },
  exam_results:   null,
}

const STRUCT_OFFERS_IB = {
  sports_profile: null,
  exam_results:   { ib: { avg_points: 38 } },
}

const STRUCT_NONE = {
  sports_profile: null,
  exam_results:   null,
}

test('null profile → empty reasons (back-compat)', () => {
  const r = buildMatchReasons(null, SCHOOL_BROMSGROVE, STRUCT_NONE)
  assert.deepEqual(r, [])
})

test('Theo: full-boarding + sport priority + Midlands school → 3 reasons', () => {
  const profile = {
    home_region:   'midlands',
    boarding_pref: 'full',
    top_priority:  'sport',
  }
  const r = buildMatchReasons(profile, SCHOOL_BROMSGROVE, STRUCT_RUGBY_NATIONAL_STRONG)
  assert.ok(r.includes('boarding school'), `missing boarding reason: ${r.join(', ')}`)
  assert.ok(r.includes('strong rugby'),    `missing rugby reason: ${r.join(', ')}`)
  assert.ok(r.some(x => /midlands/i.test(x)), `missing region reason: ${r.join(', ')}`)
})

test('Day-only parent at a London day school → only region reason', () => {
  const profile = { home_region: 'london', boarding_pref: 'day' }
  const r = buildMatchReasons(profile, SCHOOL_DAY_LONDON, STRUCT_NONE)
  assert.ok(r.some(x => /london/i.test(x)))
  assert.ok(!r.includes('boarding school'))
})

test('IB-curriculum parent → "offers IB diploma" when school has ib block', () => {
  const profile = { curriculum_pref: 'ib' }
  const r = buildMatchReasons(profile, SCHOOL_DAY_LONDON, STRUCT_OFFERS_IB)
  assert.ok(r.includes('offers IB diploma'))
})

test('IB-curriculum but school has no ib block → no IB reason', () => {
  const profile = { curriculum_pref: 'ib' }
  const r = buildMatchReasons(profile, SCHOOL_DAY_LONDON, STRUCT_NONE)
  assert.ok(!r.includes('offers IB diploma'))
})

// r3 (Codex P2): fallback "your sport priority" dropped (evidence-less).
// Sport priority with no strong sport tier now emits NO sport reason.
test('Sport priority but no strong sport data → NO sport reason (r3 fallback drop)', () => {
  const profile = { top_priority: 'sport' }
  const r = buildMatchReasons(profile, SCHOOL_DAY_LONDON, STRUCT_NONE)
  assert.ok(!r.includes('your sport priority'))
  assert.ok(!r.some(x => /strong /i.test(x)))
})

// r2 (Codex P2 #4): regression — tier vocabulary now matches dimensions.js.
test('Sport priority: national-elite tier → "strong rugby"', () => {
  const profile = { top_priority: 'sport' }
  const r = buildMatchReasons(profile, SCHOOL_DAY_LONDON, STRUCT_RUGBY_NATIONAL_ELITE)
  assert.ok(r.includes('strong rugby'), `expected strong rugby for national-elite: ${r.join(', ')}`)
})

test('Sport priority: local tier does NOT count as strong (r3: no fallback either)', () => {
  const profile = { top_priority: 'sport' }
  const r = buildMatchReasons(profile, SCHOOL_DAY_LONDON, STRUCT_RUGBY_LOCAL)
  assert.ok(!r.includes('strong rugby'))
  // r3: dropped fallback — neither tier-based reason nor generic one.
  assert.ok(!r.includes('your sport priority'))
})

// r3 (Codex P3 #4): strongestSport ranks by tier strength, not array order.
test('strongestSport: tier ranking picks national-elite tennis over regional rugby', () => {
  const profile = { top_priority: 'sport' }
  const struct = {
    sports_profile: {
      rugby:  { competitive_tier: 'regional' },
      tennis: { competitive_tier: 'national-elite' },
    },
    exam_results: null,
  }
  const r = buildMatchReasons(profile, SCHOOL_DAY_LONDON, struct)
  assert.ok(r.includes('strong tennis'), `expected strong tennis (national-elite): ${r.join(', ')}`)
  assert.ok(!r.includes('strong rugby'),  'rugby was regional, should not be chosen')
})

test('strongestSport: ties broken by array order (rugby before tennis at same tier)', () => {
  const profile = { top_priority: 'sport' }
  const struct = {
    sports_profile: {
      rugby:  { competitive_tier: 'national-strong' },
      tennis: { competitive_tier: 'national-strong' },
    },
    exam_results: null,
  }
  const r = buildMatchReasons(profile, SCHOOL_DAY_LONDON, struct)
  // Rugby is first in the candidates array; at equal strength rugby wins.
  assert.ok(r.includes('strong rugby'))
  assert.ok(!r.includes('strong tennis'))
})

// r2 (Codex P2 #5): regression — North Somerset is south-west via shared
// region map (was missed by r1's narrower alias set).
test('Region: North Somerset matches south-west via shared region map', () => {
  const profile = { home_region: 'south-west' }
  const r = buildMatchReasons(profile, SCHOOL_NORTH_SOMERSET, STRUCT_NONE)
  assert.ok(r.some(x => /north somerset/i.test(x)), `expected North Somerset region reason: ${r.join(', ')}`)
})

test('Region: Devon matches south-west', () => {
  const profile = { home_region: 'south-west' }
  const r = buildMatchReasons(profile, SCHOOL_DEVON, STRUCT_NONE)
  assert.ok(r.some(x => /devon/i.test(x)))
})

// r2 (Codex P2 #3): SEN-aware now requires schools.sen_support === true.
test('SEN parent + school.sen_support=true → "SEN-aware" reason', () => {
  const profile = { sen_need: 'yes-priority' }
  const r = buildMatchReasons(profile, SCHOOL_SEN_SUPPORTIVE, STRUCT_NONE)
  assert.ok(r.includes('SEN-aware'))
})

test('SEN parent + school.sen_support=false → NO "SEN-aware" reason (evidence gate)', () => {
  const profile = { sen_need: 'yes-priority' }
  const r = buildMatchReasons(profile, SCHOOL_DAY_LONDON, STRUCT_NONE)
  assert.ok(!r.includes('SEN-aware'))
})

// r2 (Codex P2 #3): "pastoral focus" and "inclusive culture" reasons were
// removed entirely — they fired purely from profile preferences with no
// school evidence. Re-introduce only when school-level evidence loads.
test('"pastoral focus" reason is never emitted in r2 (evidence-less, removed)', () => {
  const profile = { top_priority: 'pastoral', sen_need: 'yes-priority', pastoral_pref: 'high_priority' }
  const r = buildMatchReasons(profile, SCHOOL_SEN_SUPPORTIVE, STRUCT_NONE)
  assert.ok(!r.includes('pastoral focus'))
})

test('"inclusive culture" reason is never emitted in r2 (evidence-less, removed)', () => {
  const profile = { lgbtq_pref: 'important' }
  const r = buildMatchReasons(profile, SCHOOL_DAY_LONDON, STRUCT_NONE)
  assert.ok(!r.includes('inclusive culture'))
})
