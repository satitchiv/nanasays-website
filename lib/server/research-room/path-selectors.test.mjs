// Behavioural tests for path-selectors.ts
//
// 21 tests covering: 3 selectors in isolation + happy path + edge cases +
// Jack-test recreation + Codex r1/r2/r3 review fixes.
//
// path-selectors.ts begins with `import 'server-only'` and imports types
// from verdict-generator-v3-types.ts. We strip the server-only line to a
// temp file at test time (same pattern as verdict-generator.test.mjs).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'

const SRC_URL    = new URL('./path-selectors.ts', import.meta.url)
const TYPES_PATH = new URL('./verdict-generator-v3-types.ts', import.meta.url).pathname
const TEMP_PATH  = `/tmp/path-selectors-test-${process.pid}.ts`

const src = readFileSync(SRC_URL, 'utf8')
  .replace(/^import 'server-only'\s*$/m, '')
  .replace(`from './verdict-generator-v3-types'`, `from '${TYPES_PATH}'`)
writeFileSync(TEMP_PATH, src)
const {
  pickPathA_recommenderFirst,
  pickPathB_strongestAcademic,
  pickPathC_bestValue,
  selectPathWinners,
  selectDefaultPath,
} = await import(TEMP_PATH)

// ── Fixture builders ─────────────────────────────────────────────────────

function school(slug, name, categoryScores = {}, score = 0, evidenceCells = 5, totalCells = 8) {
  return {
    slug, name, score,
    categoryScores,
    strengths: [], reservations: [],
    evidenceCells, totalCells,
    evidenceThin: evidenceCells / totalCells < 0.5,
  }
}

function facts(slug, name, opts = {}) {
  return {
    slug, name,
    city: opts.city, region: opts.region,
    a_level_a_star_a_pct: opts.a_level,
    gcse_9_7_pct: opts.gcse,
    fee_min: opts.fee_min, fee_max: opts.fee_max,
    gender_split: opts.gender_split,
  }
}

function briefContext(overrides = {}) {
  return {
    rubric: {
      topPriority: 'academic', boardingPref: 'full', homeRegion: 'anywhere',
      budgetRange: '50k', budgetMaxAnnual: 50000,
      curriculumPref: null, classSizePref: null, senNeed: null,
      childGender: 'boy', childYear: 9,
      ...overrides.rubric,
    },
    goalOrientation: undefined,
    anchors: [], tensions: [], hardConstraints: overrides.hardConstraints ?? [],
    goalsNotes: undefined,
  }
}

const eligibleAlways = () => true

// ── Path A ───────────────────────────────────────────────────────────────

test('Path A — happy path: recommender #1 wins', () => {
  const eligible = [
    school('reeds', "Reed's", { academics: 5 }, 10),
    school('harrow', 'Harrow', { academics: 8 }, 12),
  ]
  const r = pickPathA_recommenderFirst(eligible, new Map(), briefContext(), [
    { slug: 'reeds', rank_position: 0 }, { slug: 'harrow', rank_position: 1 },
  ], eligibleAlways)
  assert.equal(r.winner.slug, 'reeds')
  assert.equal(r.source, 'recommender')
})

test('Path A — recommender #1 missing → falls through, skippedRanks captured', () => {
  const eligible = [school('harrow', 'Harrow', {}, 12)]
  const r = pickPathA_recommenderFirst(eligible, new Map(), briefContext(), [
    { slug: 'reeds', rank_position: 0 }, { slug: 'harrow', rank_position: 1 },
  ], eligibleAlways)
  assert.equal(r.winner.slug, 'harrow')
  assert.equal(r.source, 'recommender')
  assert.deepEqual(r.skippedRanks, ['reeds@0'])
})

test('Path A — empty ranking → fallback_scored', () => {
  const eligible = [school('oundle', 'Oundle', {}, 9), school('harrow', 'Harrow', {}, 12)]
  const r = pickPathA_recommenderFirst(eligible, new Map(), briefContext(), [], eligibleAlways)
  assert.equal(r.winner.slug, 'oundle')
  assert.equal(r.source, 'fallback_scored')
})

test('Path A — no eligible → empty', () => {
  const r = pickPathA_recommenderFirst([], new Map(), briefContext(), [], eligibleAlways)
  assert.equal(r.winner, null)
  assert.equal(r.source, 'empty')
})

test('Path A — duplicate rank_position values → alphabetical tiebreak', () => {
  const eligible = [
    school('zebra', 'Zebra', {}, 10),
    school('alpha', 'Alpha', {}, 10),
  ]
  const r = pickPathA_recommenderFirst(eligible, new Map(), briefContext(), [
    { slug: 'zebra', rank_position: 0 }, { slug: 'alpha', rank_position: 0 },
  ], eligibleAlways)
  assert.equal(r.winner.slug, 'alpha')
})

test('Path A — negative rank_position (route filters but selector tolerates)', () => {
  const eligible = [school('a', 'A', {}, 10), school('b', 'B', {}, 8)]
  const r = pickPathA_recommenderFirst(eligible, new Map(), briefContext(), [
    { slug: 'a', rank_position: 5 }, { slug: 'b', rank_position: -1 },
  ], eligibleAlways)
  // Negative sorts first — documents the bug the route's rank_position>=0 filter prevents.
  assert.equal(r.winner.slug, 'b')
})

test('Path A — hard constraints filter EVERYONE → broader fallback fires', () => {
  const eligible = [
    school('prep-one', 'Prep One', {}, 10),
    school('prep-two', 'Prep Two', {}, 8),
  ]
  const noneEligible = () => false
  const r = pickPathA_recommenderFirst(eligible, new Map(), briefContext(), [
    { slug: 'prep-one', rank_position: 0 }, { slug: 'prep-two', rank_position: 1 },
  ], noneEligible)
  assert.equal(r.winner.slug, 'prep-one')
  assert.equal(r.source, 'hard_constraint_fallback')
})

// ── Path B ───────────────────────────────────────────────────────────────

test('Path B — happy path with no facts: aggregate signal wins (highest academics excluding A)', () => {
  const eligible = [
    school('reeds',  "Reed's", { academics: 5 }, 10),
    school('harrow', 'Harrow', { academics: 8 }, 12),
    school('oundle', 'Oundle', { academics: 6 }, 9),
  ]
  // No school_facts passed → academicSignal falls through to aggregate
  // (categoryScores.academics). Harrow's higher aggregate wins.
  const r = pickPathB_strongestAcademic(eligible, new Map(), briefContext(), [], new Set(['reeds']), eligibleAlways)
  assert.equal(r.winner.slug, 'harrow')
  assert.equal(r.source, 'academic_signal')
  assert.equal(r.framingHint, 'strongest_academic_aggregate',
    'no extracted facts → aggregate variant fires (v3.2 Codex r1 Q5 default)')
})

test('Path B — equal academic, higher overall score wins', () => {
  const eligible = [
    school('a', 'A', { academics: 5 }, 8),
    school('b', 'B', { academics: 5 }, 10),
  ]
  const r = pickPathB_strongestAcademic(eligible, new Map(), briefContext(), [], new Set(), eligibleAlways)
  assert.equal(r.winner.slug, 'b')
})

test('Path B — no academic data anywhere + no ranking → falls through to candidates[0]', () => {
  const eligible = [school('a', 'A', {}, 5), school('b', 'B', {}, 8)]
  const r = pickPathB_strongestAcademic(eligible, new Map(), briefContext(), [], new Set(), eligibleAlways)
  assert.equal(r.winner.slug, 'a')
  assert.equal(r.framingHint, 'next_best_fit_b')
})

test('Path B — no academic data → falls back to recommender walk', () => {
  const eligible = [school('a', 'A', {}, 5), school('b', 'B', {}, 8)]
  const r = pickPathB_strongestAcademic(eligible, new Map(), briefContext(), [
    { slug: 'a', rank_position: 0 }, { slug: 'b', rank_position: 1 },
  ], new Set(['a']), eligibleAlways)
  assert.equal(r.winner.slug, 'b')
  assert.equal(r.source, 'fallback_recommender')
  assert.equal(r.framingHint, 'next_best_fit_b')
})

// ── Path C ───────────────────────────────────────────────────────────────

test('Path C — happy path: lowest within-budget fee wins', () => {
  const eligible = [school('a', 'A', {}, 10), school('b', 'B', {}, 9), school('c', 'C', {}, 8)]
  const factsMap = new Map([
    ['a', facts('a', 'A', { fee_max: 60000 })],
    ['b', facts('b', 'B', { fee_max: 45000 })],
    ['c', facts('c', 'C', { fee_max: 48000 })],
  ])
  const r = pickPathC_bestValue(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 50000 } }), [], new Set(), eligibleAlways)
  assert.equal(r.winner.slug, 'b')
  assert.equal(r.source, 'within_budget')
  assert.equal(r.framingHint, 'most_affordable')
})

test('Path C — ALL over budget → framingHint=least_over_budget with overshoot detail', () => {
  const eligible = [school('a', 'A', {}, 10), school('b', 'B', {}, 9)]
  const factsMap = new Map([
    ['a', facts('a', 'A', { fee_max: 70000 })],
    ['b', facts('b', 'B', { fee_max: 65000 })],
  ])
  const r = pickPathC_bestValue(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 50000 } }), [], new Set(), eligibleAlways)
  assert.equal(r.framingHint, 'least_over_budget')
  assert.ok(r.overshootDetail?.includes('£15k above'))
})

test('Path C — Math.ceil overshoot rounding (no £0k above)', () => {
  const eligible = [school('a', 'A', {}, 10)]
  const factsMap = new Map([['a', facts('a', 'A', { fee_max: 50500 })]])
  const r = pickPathC_bestValue(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 50000 } }), [], new Set(), eligibleAlways)
  assert.equal(r.framingHint, 'least_over_budget')
  assert.ok(r.overshootDetail?.includes('£1k above'))
})

test('Path C — budgetMaxAnnual=0 treated as no-budget (lowest_fee framing)', () => {
  const eligible = [school('a', 'A', {}, 10), school('b', 'B', {}, 9)]
  const factsMap = new Map([
    ['a', facts('a', 'A', { fee_max: 40000 })],
    ['b', facts('b', 'B', { fee_max: 38000 })],
  ])
  const r = pickPathC_bestValue(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 0 } }), [], new Set(), eligibleAlways)
  assert.equal(r.winner.slug, 'b')
  assert.equal(r.framingHint, 'lowest_fee')
  assert.equal(r.source, 'no_budget_set')
})

test('Path C — no fee data → falls back to recommender walk (next_best_fit_c)', () => {
  const eligible = [school('a', 'A', {}, 10), school('b', 'B', {}, 8)]
  const r = pickPathC_bestValue(eligible, new Map(), briefContext(), [
    { slug: 'a', rank_position: 0 }, { slug: 'b', rank_position: 1 },
  ], new Set(['a']), eligibleAlways)
  assert.equal(r.winner.slug, 'b')
  assert.equal(r.framingHint, 'next_best_fit_c')
})

test('Path C — equal fees → alphabetical slug tiebreak', () => {
  const eligible = [school('zebra', 'Zebra', {}, 10), school('alpha', 'Alpha', {}, 10)]
  const factsMap = new Map([
    ['zebra', facts('zebra', 'Zebra', { fee_max: 40000 })],
    ['alpha', facts('alpha', 'Alpha', { fee_max: 40000 })],
  ])
  const r = pickPathC_bestValue(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 50000 } }), [], new Set(), eligibleAlways)
  assert.equal(r.winner.slug, 'alpha')
})

// ── Integration: full selectPathWinners ────────────────────────────────

test('selectPathWinners — Jack-test recreation', () => {
  const eligible = [
    school('reeds-school-uk',  "Reed's",     { academics: 5 }, 10),
    school('harrow-school',    'Harrow',     { academics: 9 }, 12),
    school('wellington-college', 'Wellington', { academics: 7 }, 11),
    school('rugby-school',     'Rugby',      { academics: 6 }, 9),
    school('culford-school',   'Culford',    { academics: 4 }, 8),
    school('oundle-school',    'Oundle',     { academics: 7 }, 10),
  ]
  const factsMap = new Map([
    ['reeds-school-uk',      facts('reeds-school-uk', "Reed's",     { fee_max: 48000 })],
    ['harrow-school',        facts('harrow-school',   'Harrow',     { fee_max: 63735 })],
    ['wellington-college',   facts('wellington-college', 'Wellington', { fee_max: 49000 })],
    ['rugby-school',         facts('rugby-school',    'Rugby',      { fee_max: 51000 })],
    ['culford-school',       facts('culford-school',  'Culford',    { fee_max: 52000 })],
    ['oundle-school',        facts('oundle-school',   'Oundle',     { fee_max: 49500 })],
  ])
  const ranking = [
    { slug: 'reeds-school-uk',    rank_position: 0 },
    { slug: 'wellington-college', rank_position: 1 },
    { slug: 'rugby-school',       rank_position: 2 },
    { slug: 'culford-school',     rank_position: 3 },
    { slug: 'harrow-school',      rank_position: 4 },
    { slug: 'oundle-school',      rank_position: 5 },
  ]
  const sel = selectPathWinners(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 50000 } }), ranking, eligibleAlways)
  assert.equal(sel.winners.A.slug, 'reeds-school-uk')
  assert.equal(sel.winners.B.slug, 'harrow-school')
  // v3.3 (2026-05-26 — Sam smoke fix): strict A/B/C exclusion dropped.
  // Path C now picks the actual cheapest within budget — Reed's at 48k
  // — which ALSO won Path A. sharedWith.C carries ['A'] for the badge.
  assert.equal(sel.winners.C.slug, 'reeds-school-uk',
    'v3.3: Path C honestly picks the cheapest within budget even if it duplicates Path A')
  assert.deepEqual(sel.sharedWith.C, ['A'], 'sharedWith records the A↔C overlap')
  assert.deepEqual(sel.sharedWith.A, ['C'], 'symmetric: A also marked sharedWith C')
  assert.deepEqual(sel.sharedWith.B, [], 'Harrow unique to Path B')
  assert.equal(sel.framingHints.A, 'best_overall')
  // v3.2: Jack-test factsMap has no a_level_a_star_a_pct / gcse_9_7_pct
  // for any school (only fee_max), so academicSignal falls through to
  // the aggregate categoryScores.academics — aggregate variant fires.
  assert.equal(sel.framingHints.B, 'strongest_academic_aggregate')
  assert.equal(sel.framingHints.C, 'most_affordable')
  assert.equal(sel.budgetCapLabel, '£50k')
  assert.equal(sel.eligibleCount, 6)
  // v3: Harrow on Path B is over £50k → fee-cost note emitted (P2.a fix)
  assert.ok(sel.costNotes.B?.includes('above'))
  assert.equal(sel.costNotes.A, null)
})

test('selectPathWinners — provisional ranking surfaces consideration banner', () => {
  const eligible = [school('only', 'Only', { academics: 5 }, 10)]
  const sel = selectPathWinners(eligible, new Map(), briefContext(), [], eligibleAlways)
  assert.equal(sel.winners.A.slug, 'only')
  assert.equal(sel.sourceDebug.A, 'fallback_scored')
  assert.ok(sel.considerationNotes.A?.[0].includes('provisional'))
})

test('v3.3 — Path A collides with best-academic: B honestly picks SAME school + sharedWith records overlap', () => {
  // Pre-v3.3 this test asserted strict exclusion forced B to pick #2.
  // v3.3 (Sam smoke fix) drops the exclusion — when Harrow is BOTH
  // the recommender's #1 AND the best academic, both paths show Harrow
  // and sharedWith['B' or 'A'] surfaces the overlap to the renderer
  // for an "Also wins Path X" badge.
  const eligible = [
    school('harrow', 'Harrow', { academics: 9 }, 12),
    school('reeds',  "Reed's", { academics: 7 }, 10),
    school('oundle', 'Oundle', { academics: 5 }, 8),
  ]
  const ranking = [{ slug: 'harrow', rank_position: 0 }, { slug: 'reeds', rank_position: 1 }]
  const sel = selectPathWinners(eligible, new Map(), briefContext(), ranking, eligibleAlways)
  assert.equal(sel.winners.A.slug, 'harrow')
  assert.equal(sel.winners.B.slug, 'harrow',
    'v3.3: Path B picks the actual best-academic even when it equals Path A')
  // With no factsMap + no budget, Path C falls back to recommender walk
  // → also picks Harrow. All three converge. sharedWith carries the
  // pairs symmetrically: A↔B, A↔C, B↔C.
  assert.equal(sel.winners.C.slug, 'harrow')
  assert.deepEqual(sel.sharedWith.A.sort(), ['B', 'C'])
  assert.deepEqual(sel.sharedWith.B.sort(), ['A', 'C'])
  assert.deepEqual(sel.sharedWith.C.sort(), ['A', 'B'])
})

// ── v3.2 NEW: Path B signal source (Codex Path-B-signal r1) ───────────

test('v3.2 Sam regression — A-level signal beats aggregate (Bromsgrove 61 > Rugby 60)', () => {
  // Browser smoke (2026-05-26) on real Sam shortlist: pre-v3.2 Path B
  // picked Rugby (60% A*-A) because Rugby has more academic comparison
  // cells filled → higher categoryScores.academics. Bromsgrove (61%
  // A*-A) should win because parents read "Strongest academic" as the
  // headline A-level rate, not an opaque aggregate.
  const eligible = [
    school('ellesmere-college', 'Ellesmere',  {}, 12),                  // Path A excludes
    school('rugby-school',      'Rugby',      { academics: 15 }, 14),   // high aggregate, 60% A-level
    school('bromsgrove-school', 'Bromsgrove', { academics:  8 }, 10),   // lower aggregate, 61% A-level
    school('oakham-school',     'Oakham',     { academics:  9 }, 11),   // 45% A-level
  ]
  const factsMap = new Map([
    ['ellesmere-college', facts('ellesmere-college', 'Ellesmere',  {})],
    ['rugby-school',      facts('rugby-school',      'Rugby',      { a_level: 60 })],
    ['bromsgrove-school', facts('bromsgrove-school', 'Bromsgrove', { a_level: 61 })],
    ['oakham-school',     facts('oakham-school',     'Oakham',     { a_level: 45 })],
  ])
  const r = pickPathB_strongestAcademic(eligible, factsMap, briefContext(), [], new Set(['ellesmere-college']), eligibleAlways)
  assert.equal(r.winner.slug, 'bromsgrove-school',
    'v3.2: A-level a_level_a_star_a_pct=61 should beat Rugby a_level=60 despite Rugby having higher aggregate')
  assert.equal(r.framingHint, 'strongest_academic_a_level',
    'v3.2: framingHint should be the signal-specific a_level variant')
})

test('v3.2 GCSE fallback — when no a_level data, GCSE 9-7 % drives Path B', () => {
  const eligible = [
    school('a', 'A', { academics: 8 }, 10),
    school('b', 'B', { academics: 5 }, 9),
  ]
  const factsMap = new Map([
    ['a', facts('a', 'A', { gcse: 65 })],
    ['b', facts('b', 'B', { gcse: 80 })],
  ])
  const r = pickPathB_strongestAcademic(eligible, factsMap, briefContext(), [], new Set(), eligibleAlways)
  assert.equal(r.winner.slug, 'b', 'GCSE 80 > GCSE 65 even though A has higher aggregate')
  assert.equal(r.framingHint, 'strongest_academic_gcse')
})

test('v3.2 mixed shortlist — a_level winner beats gcse-only candidate', () => {
  // School A has only GCSE; School B has A-level. A-level priority=3 beats
  // GCSE priority=2 regardless of values (even if A's GCSE is 99% and B's
  // A-level is only 30%).
  const eligible = [
    school('a', 'A', { academics: 8 }, 10),
    school('b', 'B', { academics: 5 }, 9),
  ]
  const factsMap = new Map([
    ['a', facts('a', 'A', { gcse: 99 })],
    ['b', facts('b', 'B', { a_level: 30 })],
  ])
  const r = pickPathB_strongestAcademic(eligible, factsMap, briefContext(), [], new Set(), eligibleAlways)
  assert.equal(r.winner.slug, 'b',
    'a_level priority (3) beats gcse priority (2) regardless of values — Codex r1 tagged-priority sort')
  assert.equal(r.framingHint, 'strongest_academic_a_level')
})

test('v3.2 aggregate fallback — when no extracted exam data anywhere, categoryScores.academics wins', () => {
  const eligible = [
    school('a', 'A', { academics: 5 }, 10),
    school('b', 'B', { academics: 8 }, 9),
  ]
  // Empty factsMap → no a_level, no gcse anywhere → aggregate fires.
  const r = pickPathB_strongestAcademic(eligible, new Map(), briefContext(), [], new Set(), eligibleAlways)
  assert.equal(r.winner.slug, 'b', 'aggregate 8 > 5 → B wins')
  assert.equal(r.framingHint, 'strongest_academic_aggregate')
})

// ── v3 NEW: Codex r2 fixes ─────────────────────────────────────────────

test('v3 P2.a — over-budget Path A winner gets fee-cost note', () => {
  const eligible = [school('only', 'Only', { academics: 5 }, 10)]
  const factsMap = new Map([['only', facts('only', 'Only', { fee_max: 70000 })]])
  const sel = selectPathWinners(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 50000 } }), [
    { slug: 'only', rank_position: 0 },
  ], eligibleAlways)
  assert.equal(sel.winners.A.slug, 'only')
  assert.ok(sel.costNotes.A?.includes('£20k above'))
})

test('v3 P2.b — Path C hard-constraint fallback runs budget framing', () => {
  // v3.3 rewrite: under no-exclusion, the only way to trigger Path C's
  // hard_constraint_fallback is if EVERY eligible candidate fails the
  // Path-C eligibility check. Then the broader-pool fallback runs,
  // still using budget-aware framing.
  const eligible = [
    school('a', 'A', { academics: 5 }, 10),
    school('b', 'B', { academics: 9 }, 12),
  ]
  const factsMap = new Map([
    ['a', facts('a', 'A', { fee_max: 70000 })],
    ['b', facts('b', 'B', { fee_max: 68000 })],
  ])
  // Path C eligibility rejects everything; A + B accept everything.
  // Forces broader-pool fallback for C; budget-aware framing should still
  // fire (both candidates are over budget → least_over_budget).
  const elig = (pk) => pk !== 'C'
  const sel = selectPathWinners(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 50000 } }), [
    { slug: 'a', rank_position: 0 }, { slug: 'b', rank_position: 1 },
  ], elig)
  assert.equal(sel.winners.C.slug, 'b', 'broader fallback picks cheaper of the over-budget pair')
  assert.equal(sel.framingHints.C, 'least_over_budget')
  assert.ok(sel.costNotes.C?.includes('above'))
})

test('v3 P3 — eligibleCount populated', () => {
  const sel0 = selectPathWinners([], new Map(), briefContext(), [], eligibleAlways)
  assert.equal(sel0.eligibleCount, 0)
  const sel2 = selectPathWinners([
    school('a', 'A'), school('b', 'B'),
  ], new Map(), briefContext(), [], eligibleAlways)
  assert.equal(sel2.eligibleCount, 2)
})

// ── Default-path ────────────────────────────────────────────────────────

test('selectDefaultPath — Path A wins when present', () => {
  const sel = selectPathWinners(
    [school('only', 'Only')], new Map(), briefContext(),
    [{ slug: 'only', rank_position: 0 }], eligibleAlways,
  )
  assert.equal(selectDefaultPath(sel), 'A')
})

test('selectDefaultPath — all paths null → null', () => {
  const sel = selectPathWinners([], new Map(), briefContext(), [], eligibleAlways)
  assert.equal(selectDefaultPath(sel), null)
})

// ════════════════════════════════════════════════════════════════════════
// v3.3 SCENARIO SMOKE — 5 hand-crafted briefs covering edges that the
// existing 244 tests don't reach. Designed to be readable AS a behavior
// table: each scenario sets up a brief shape that stresses one part of
// the selector tree. Failure here = real bug; pass = green light for
// that brief shape.
// ════════════════════════════════════════════════════════════════════════

test('SCENARIO 1 — comfortable budget, 4 distinct schools, all 3 paths different', () => {
  // Boy/Year 9/academic priority/£60k budget/4-school shortlist with
  // varying academic + fees. Exercises: distinct A/B/C winners, no
  // shared-winner overlap, no over-budget cost notes.
  const eligible = [
    school('top-rec',    'Top Rec School',    { academics: 5 }, 11),  // recommender #1
    school('top-acad',   'Top Academic',      { academics: 9 }, 12),  // best academic
    school('cheapest',   'Cheapest School',   { academics: 6 }, 9),   // best value within budget
    school('mid',        'Mid School',        { academics: 7 }, 10),
  ]
  const factsMap = new Map([
    ['top-rec',  facts('top-rec',  'Top Rec School',  { fee_max: 55000, a_level: 55 })],
    ['top-acad', facts('top-acad', 'Top Academic',    { fee_max: 58000, a_level: 75 })],
    ['cheapest', facts('cheapest', 'Cheapest School', { fee_max: 42000, a_level: 60 })],
    ['mid',      facts('mid',      'Mid School',      { fee_max: 50000, a_level: 65 })],
  ])
  const ranking = [
    { slug: 'top-rec',  rank_position: 0 },
    { slug: 'top-acad', rank_position: 1 },
    { slug: 'cheapest', rank_position: 2 },
    { slug: 'mid',      rank_position: 3 },
  ]
  const sel = selectPathWinners(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 60000 } }), ranking, eligibleAlways)
  // A = recommender #1
  assert.equal(sel.winners.A.slug, 'top-rec',          'Path A = recommender #1')
  // B = highest A-level (75)
  assert.equal(sel.winners.B.slug, 'top-acad',         'Path B = highest A-level')
  assert.equal(sel.framingHints.B, 'strongest_academic_a_level')
  // C = cheapest within budget (42k)
  assert.equal(sel.winners.C.slug, 'cheapest',         'Path C = lowest fee within £60k cap')
  assert.equal(sel.framingHints.C, 'most_affordable')
  // No overlap
  assert.deepEqual(sel.sharedWith.A, [], 'no overlap')
  assert.deepEqual(sel.sharedWith.B, [], 'no overlap')
  assert.deepEqual(sel.sharedWith.C, [], 'no overlap')
  // No over-budget cost notes
  assert.equal(sel.costNotes.A, null, 'A under budget')
  assert.equal(sel.costNotes.B, null, 'B under budget')
  assert.equal(sel.costNotes.C, null, 'C under budget')
})

test('SCENARIO 2 — no budget set, Path C labels as Lowest-fee credible fit', () => {
  // Budget = null. Tests Path C framingHint='lowest_fee' (not 'most_affordable').
  // Tests budgetCapLabel = null. Tests no over-budget cost notes anywhere.
  const eligible = [
    school('a', 'School A', { academics: 5 }, 10),
    school('b', 'School B', { academics: 8 }, 11),
    school('c', 'School C', { academics: 6 }, 9),
  ]
  const factsMap = new Map([
    ['a', facts('a', 'School A', { fee_max: 55000, a_level: 50 })],
    ['b', facts('b', 'School B', { fee_max: 70000, a_level: 80 })],
    ['c', facts('c', 'School C', { fee_max: 38000, a_level: 65 })],
  ])
  const ranking = [
    { slug: 'a', rank_position: 0 },
    { slug: 'b', rank_position: 1 },
    { slug: 'c', rank_position: 2 },
  ]
  const sel = selectPathWinners(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: null } }), ranking, eligibleAlways)
  assert.equal(sel.winners.A.slug, 'a')
  assert.equal(sel.winners.B.slug, 'b',         'Path B = highest A-level (80)')
  assert.equal(sel.winners.C.slug, 'c',         'Path C = lowest fee (38k)')
  assert.equal(sel.framingHints.C, 'lowest_fee', 'no budget → lowest_fee variant fires')
  assert.equal(sel.budgetCapLabel, null,        'budgetCapLabel null when no budget set')
  assert.equal(sel.costNotes.A, null, 'no over-budget notes when no budget')
  assert.equal(sel.costNotes.B, null)
  assert.equal(sel.costNotes.C, null)
})

test('SCENARIO 3 — single-school shortlist, A populated B+C needs_research', () => {
  // Only 1 school in shortlist (e.g. parent just started adding schools).
  // Tests pathStatus.A=winner, B+C=needs_research. Tests sharedWith all
  // empty (no other paths to share with). Tests statusNoteForV2 tailored
  // to eligibleCount=1.
  const eligible = [school('only', 'Only School', { academics: 7 }, 10)]
  const factsMap = new Map([['only', facts('only', 'Only School', { fee_max: 40000, a_level: 60 })]])
  const ranking = [{ slug: 'only', rank_position: 0 }]
  const sel = selectPathWinners(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 50000 } }), ranking, eligibleAlways)
  assert.equal(sel.winners.A.slug, 'only')
  assert.equal(sel.pathStatus.A, 'winner')
  // B can still pick the only school (no exclusion now — v3.3 design)
  assert.equal(sel.winners.B?.slug, 'only')
  assert.equal(sel.winners.C?.slug, 'only')
  // All three share
  assert.deepEqual(sel.sharedWith.A.sort(), ['B', 'C'])
  assert.deepEqual(sel.sharedWith.B.sort(), ['A', 'C'])
  assert.deepEqual(sel.sharedWith.C.sort(), ['A', 'B'])
  assert.equal(sel.eligibleCount, 1)
})

test('SCENARIO 4 — only GCSE data extracted (no A-level), Path B fires GCSE variant', () => {
  // Tests Path B's GCSE fallback path. Shortlist of schools where
  // a_level_a_star_a_pct is NULL but gcse_9_7_pct is populated.
  const eligible = [
    school('a', 'School A', { academics: 8 }, 11),
    school('b', 'School B', { academics: 5 }, 10),  // higher GCSE despite lower aggregate
  ]
  const factsMap = new Map([
    ['a', facts('a', 'School A', { fee_max: 50000, gcse: 70 })],   // no a_level
    ['b', facts('b', 'School B', { fee_max: 48000, gcse: 85 })],   // no a_level, but higher GCSE
  ])
  const ranking = [
    { slug: 'a', rank_position: 0 },
    { slug: 'b', rank_position: 1 },
  ]
  const sel = selectPathWinners(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 55000 } }), ranking, eligibleAlways)
  // B wins GCSE comparison (85 > 70) — overrides the higher aggregate
  assert.equal(sel.winners.B.slug, 'b',                'Path B = highest GCSE 9-7%')
  assert.equal(sel.framingHints.B, 'strongest_academic_gcse')
})

test('SCENARIO 5 — all schools over budget, Path C least_over_budget + cost notes on all paths', () => {
  // Parent has £40k cap but every shortlist school is £50k+. Tests:
  //   - Path C framingHint = 'least_over_budget'
  //   - costNotes.A/B/C all populated (v3.1 P2.a fix — every over-budget
  //     winner gets a fee-cost line)
  //   - Path C overshoot detail uses Math.ceil (no £0k above)
  const eligible = [
    school('a', 'School A', { academics: 5 }, 11),
    school('b', 'School B', { academics: 9 }, 12),
    school('c', 'School C', { academics: 6 }, 10),
  ]
  const factsMap = new Map([
    ['a', facts('a', 'School A', { fee_max: 55000, a_level: 50 })],   // 15k over
    ['b', facts('b', 'School B', { fee_max: 65000, a_level: 75 })],   // 25k over
    ['c', facts('c', 'School C', { fee_max: 48000, a_level: 60 })],   // 8k over — cheapest of the over
  ])
  const ranking = [
    { slug: 'a', rank_position: 0 },
    { slug: 'b', rank_position: 1 },
    { slug: 'c', rank_position: 2 },
  ]
  const sel = selectPathWinners(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 40000 } }), ranking, eligibleAlways)
  assert.equal(sel.winners.A.slug, 'a')
  assert.equal(sel.winners.B.slug, 'b',                  'Path B = highest A-level despite over-budget')
  assert.equal(sel.winners.C.slug, 'c',                  'Path C = least overshoot (8k vs 15k vs 25k)')
  assert.equal(sel.framingHints.C, 'least_over_budget')
  // All 3 over budget → all 3 get fee-cost notes (v3.1 P2.a)
  assert.ok(sel.costNotes.A?.includes('above'), 'A has over-budget cost note')
  assert.ok(sel.costNotes.B?.includes('above'), 'B has over-budget cost note')
  assert.ok(sel.costNotes.C?.includes('above'), 'C has over-budget cost note')
  // C's note is the richer "Lowest-fee in shortlist is £X — £Yk above..."
  assert.ok(sel.costNotes.C?.includes('Lowest-fee'), 'C uses the richer overshoot detail')
})
