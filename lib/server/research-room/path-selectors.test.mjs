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

test('Path B — happy path: highest academics wins (excluding A)', () => {
  const eligible = [
    school('reeds',  "Reed's", { academics: 5 }, 10),
    school('harrow', 'Harrow', { academics: 8 }, 12),
    school('oundle', 'Oundle', { academics: 6 }, 9),
  ]
  const r = pickPathB_strongestAcademic(eligible, new Map(), briefContext(), [], new Set(['reeds']), eligibleAlways)
  assert.equal(r.winner.slug, 'harrow')
  assert.equal(r.source, 'academic_signal')
  assert.equal(r.framingHint, 'strongest_academic')
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
  assert.equal(sel.winners.C.slug, 'wellington-college')
  assert.equal(sel.framingHints.A, 'best_overall')
  assert.equal(sel.framingHints.B, 'strongest_academic')
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

test('selectPathWinners — Path A collides with best-academic: B picks #2 academic', () => {
  const eligible = [
    school('harrow', 'Harrow', { academics: 9 }, 12),
    school('reeds',  "Reed's", { academics: 7 }, 10),
    school('oundle', 'Oundle', { academics: 5 }, 8),
  ]
  const ranking = [{ slug: 'harrow', rank_position: 0 }, { slug: 'reeds', rank_position: 1 }]
  const sel = selectPathWinners(eligible, new Map(), briefContext(), ranking, eligibleAlways)
  assert.equal(sel.winners.A.slug, 'harrow')
  assert.equal(sel.winners.B.slug, 'reeds')
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
  const eligible = [
    school('a', 'A', { academics: 5 }, 10),
    school('b', 'B', { academics: 9 }, 12),
    school('c', 'C', { academics: 6 }, 9),
  ]
  const factsMap = new Map([
    ['a', facts('a', 'A', { fee_max: 48000 })],
    ['b', facts('b', 'B', { fee_max: 49000 })],
    ['c', facts('c', 'C', { fee_max: 70000, gender_split: 'girls' })],
  ])
  const elig = (pk, school) => {
    const f = factsMap.get(school.slug)
    if (pk === 'C' && /^girls?$/i.test(f?.gender_split ?? '')) return false
    return true
  }
  const sel = selectPathWinners(eligible, factsMap, briefContext({ rubric: { budgetMaxAnnual: 50000 } }), [
    { slug: 'a', rank_position: 0 }, { slug: 'b', rank_position: 1 }, { slug: 'c', rank_position: 2 },
  ], elig)
  assert.equal(sel.winners.C.slug, 'c')
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
