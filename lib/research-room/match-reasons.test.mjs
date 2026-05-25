// Slice 8 Build 2 — match-reasons unit tests
//
// Run via:
//   node --experimental-strip-types --test \
//     lib/research-room/match-reasons.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMatchReasons } from './match-reasons.ts'

// 2026-05-19 Bug 2 fix — every fixture now carries `curriculum` so
// buildMatchReasons can verify IB from the authoritative schools.curriculum
// column (struct.exam_results.ib is over-populated and unreliable).
const SCHOOL_BROMSGROVE = {
  slug: 'bromsgrove-school',
  name: 'Bromsgrove School',
  region: 'West Midlands',   // r2: bucketed under 'midlands' via shared lib/uk-regions.ts
  boarding: true,
  sen_support: false,
  curriculum: ['IB Diploma'],
}

const SCHOOL_DAY_LONDON = {
  slug: 'a-day-school',
  name: 'A Day School',
  region: 'London',
  boarding: false,
  sen_support: false,
  curriculum: null,
}

const SCHOOL_SEN_SUPPORTIVE = {
  slug: 'sen-friendly',
  name: 'SEN Friendly School',
  region: 'Surrey',
  boarding: false,
  sen_support: true,
  curriculum: null,
}

const SCHOOL_DEVON = {
  slug: 'a-devon-school',
  name: 'A Devon School',
  region: 'Devon',     // r2: south-west bucket via shared module
  boarding: true,
  sen_support: false,
  curriculum: null,
}

const SCHOOL_NORTH_SOMERSET = {
  slug: 'a-north-somerset-school',
  name: 'A North Somerset School',
  region: 'North Somerset',  // r2: south-west bucket (was missed in r1 brief-predicates own map)
  boarding: false,
  sen_support: false,
  curriculum: null,
}

// 2026-05-19 Bug 2 fix — fixtures for IB testing now live ON the school,
// not on struct.exam_results. The latter is over-populated (Eton has
// non-null exam_results.ib but doesn't actually offer IB).
const SCHOOL_OFFERS_IB = {
  slug: 'ib-school',
  name: 'IB School',
  region: 'London',
  boarding: false,
  sen_support: false,
  curriculum: ['IB Diploma Programme', 'IB'],
}

const SCHOOL_ETON_LIKE_NO_IB = {
  slug: 'eton-like',
  name: 'Eton-like (A-Level only)',
  region: 'Berkshire',
  boarding: true,
  sen_support: false,
  curriculum: null,   // matches Eton's actual schools.curriculum=NULL
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

// 2026-05-19 Bug 2 fix — IB verification now reads schools.curriculum, not
// struct.exam_results.ib. Eton's exam_results.ib is non-null in live DB but
// the school doesn't actually offer the IB Diploma; using struct led to
// every shortlisted school being labelled "offers IB diploma".
test('IB-curriculum parent + school.curriculum lists IB → "offers IB diploma"', () => {
  const profile = { curriculum_pref: 'ib' }
  const r = buildMatchReasons(profile, SCHOOL_OFFERS_IB, STRUCT_NONE)
  assert.ok(r.includes('offers IB diploma'))
})

test('IB-curriculum parent + school.curriculum NULL (Eton-like) → no IB reason (Bug 2 regression)', () => {
  // The exact case that broke production — Eton has curriculum=NULL in
  // schools but had a non-null exam_results.ib. The fix must rely on the
  // schools column; struct should not be able to overrule a NULL.
  const profile = { curriculum_pref: 'ib' }
  const r = buildMatchReasons(profile, SCHOOL_ETON_LIKE_NO_IB, STRUCT_OFFERS_IB)
  assert.ok(!r.includes('offers IB diploma'),
    `Eton-like (curriculum NULL) must not get "offers IB diploma" even when struct.exam_results.ib is set: ${r.join(', ')}`)
})

test('IB-curriculum parent + school.curriculum=null + struct null → no IB reason', () => {
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

// ─── Phase 2.8 — briefRelevantSport (sport_focus from intent_focus_cache) ──
//
// When the brief names a sport via intent_focus_cache.sport_focus, the
// "added because" line should cite THAT sport at the school (if tier
// ≥ regional) or no sport chip at all — never cite a different sport.

import {
  hashProseSnapshot,
  DEFAULT_EXPECTED_VERSION,
} from './effective-top-priority.ts'

const PROSE_28 = {
  academic_notes: 'a', goals_notes: 'tennis pathway',
  personality_notes: 'c', child_wants: 'd', anchors_notes: 'e',
}
const CACHE_28 = (sport) => ({
  value: 'sport', sport_focus: sport,
  source_hash: hashProseSnapshot(PROSE_28),
  version: DEFAULT_EXPECTED_VERSION,
  computed_at: '2026-05-25T00:00:00Z',
})

const STRUCT_REEDS_LIKE = {
  sports_profile: {
    tennis: { competitive_tier: 'national-elite' },
    rugby:  { competitive_tier: 'national-strong' },
  },
  exam_results: null,
}
const STRUCT_HARROW_LIKE = {
  sports_profile: {
    rugby:  { competitive_tier: 'national-elite' },
    // No tennis row
  },
  exam_results: null,
}

test('Phase 2.8 — briefRelevantSport: tennis brief prefers tennis over school\'s strongest rugby', () => {
  const profile = { ...PROSE_28, top_priority: 'sport', intent_focus_cache: CACHE_28('tennis') }
  const r = buildMatchReasons(profile, SCHOOL_BROMSGROVE, STRUCT_REEDS_LIKE)
  assert.ok(r.includes('strong tennis'), `expected "strong tennis", got: ${r.join(', ')}`)
  assert.ok(!r.includes('strong rugby'), `tennis brief should NOT cite rugby: ${r.join(', ')}`)
})

test('Phase 2.8 — briefRelevantSport: no sport_focus → fall back to strongestSport', () => {
  const profile = { ...PROSE_28, top_priority: 'sport', intent_focus_cache: CACHE_28('none') }
  const r = buildMatchReasons(profile, SCHOOL_BROMSGROVE, STRUCT_REEDS_LIKE)
  // tennis (national-elite) > rugby (national-strong) by tier strength
  assert.ok(r.includes('strong tennis'), `no brief focus → strongest wins; got: ${r.join(', ')}`)
})

test('Phase 2.8 — Codex r1 Q7: focused brief + no school signal → NO sport chip (not wrong sport)', () => {
  const profile = { ...PROSE_28, top_priority: 'sport', intent_focus_cache: CACHE_28('tennis') }
  const r = buildMatchReasons(profile, SCHOOL_BROMSGROVE, STRUCT_HARROW_LIKE)
  assert.ok(!r.some(x => x.startsWith('strong ')),
    `tennis brief at rugby-only school: should emit NO sport chip; got: ${r.join(', ')}`)
})
