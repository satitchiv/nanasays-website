import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatProjectionCell } from './topic-lens-cell-formatters.ts'

const oakhamProjection = {
  competitive_tier: 'national-strong',
  dmt_ranking: { current_rank: 17, rank_3y_avg: 23 },
  socs: { performance: [{ rank: 59, total: 305, season: '2025-2026', is_live: true }] },
  head_coach: null,
  coaching_staff: [
    { name: 'Matt Smith', role: 'Head Coach of Leicester Tigers Academy', notable: 'Old Oakhamian, retired Tigers player' },
  ],
  notable_alumni: [
    { name: 'Hamish Watson', known_for: 'Scotland international rugby player', year_left: 2010 },
    { name: 'Jack van Poortvliet', known_for: 'England rugby player, Tigers scrum-half', year_left: 2019 },
    { name: 'Sam Costelow', known_for: 'Wales U20 rugby player, Scarlets player', year_left: 2019 },
  ],
  cup_results: [
    { tournament: 'Schools Cup', year: 2023, result: 'winner' },
    { tournament: 'County Cup', year: 2026, result: 'finalist' },
    { tournament: 'NatWest Cup', year: null, result: 'semi-finalist' },
  ],
  academy_zone: null,
  academy_scholarship: true,
  academy_scholarship_notes: 'Sports scholarships available; rugby is listed as core sport in GCSE Sporting Futures Pathway',
  school_teams_visible: { value: 4 },
  evidence_urls: [
    'https://www.oakham.rutland.sch.uk/co-curricular/sport/core-sports/rugby/',
    'https://www.oakhamschoolsport.co.uk/Fixtures_Teams.asp?Id=70&S=20252026&SID=4',
  ],
}

test('formatProjectionCell: returns null for non-rugby dimension', () => {
  assert.equal(formatProjectionCell('medicine', 'Medicine destinations', oakhamProjection), null)
})

test('formatProjectionCell: returns null for null projection', () => {
  assert.equal(formatProjectionCell('rugby', 'Rugby tier', null), null)
})

test('formatProjectionCell: matches "rugby tier" → competitive_tier', () => {
  const r = formatProjectionCell('rugby', 'Rugby tier', oakhamProjection)
  assert.equal(r?.value, 'National-strong')
  assert.equal(r?.source, 'https://www.oakham.rutland.sch.uk/co-curricular/sport/core-sports/rugby/')
})

test('formatProjectionCell: matches "Rugby strength" → competitive_tier', () => {
  const r = formatProjectionCell('rugby', 'Rugby strength', oakhamProjection)
  assert.equal(r?.value, 'National-strong')
})

test('formatProjectionCell: matches "Rugby standing" → competitive_tier', () => {
  const r = formatProjectionCell('rugby', 'Rugby standing', oakhamProjection)
  assert.equal(r?.value, 'National-strong')
})

test('formatProjectionCell: matches "DMT current rank" → dmt_ranking.current_rank', () => {
  const r = formatProjectionCell('rugby', 'DMT current rank', oakhamProjection)
  assert.equal(r?.value, '17')
})

test('formatProjectionCell: matches "SOCS performance rank" → socs.performance[0]', () => {
  const r = formatProjectionCell('rugby', 'SOCS performance rank', oakhamProjection)
  assert.equal(r?.value, '59/305')
})

test('formatProjectionCell: SOCS rank is matched before DMT rank (rule order)', () => {
  // 'SOCS rank' must hit the SOCS rule, not be confused by 'rank'
  const r = formatProjectionCell('rugby', 'SOCS rank', oakhamProjection)
  assert.equal(r?.value, '59/305')
})

test('formatProjectionCell: matches "Director of rugby" → head_coach or coaching_staff', () => {
  const r = formatProjectionCell('rugby', 'Director of rugby', oakhamProjection)
  // head_coach is null, so falls back to first coaching_staff entry
  assert.ok(r?.value.startsWith('Matt Smith'))
  assert.ok(r?.value.includes('Head Coach of Leicester Tigers Academy'))
})

test('formatProjectionCell: head_coach takes precedence over coaching_staff', () => {
  const projWithHead = {
    ...oakhamProjection,
    head_coach: { name: 'Coach Director', notable: 'Former England international' },
  }
  const r = formatProjectionCell('rugby', 'Head coach', projWithHead)
  assert.equal(r?.value, 'Coach Director — Former England international')
})

test('formatProjectionCell: matches "Notable alumni" → top 2 alumni', () => {
  const r = formatProjectionCell('rugby', 'Notable alumni', oakhamProjection)
  assert.ok(r?.value.includes('Hamish Watson'))
  assert.ok(r?.value.includes('Jack van Poortvliet'))
  assert.ok(!r?.value.includes('Sam Costelow'), 'should cap at 2 alumni')
})

test('formatProjectionCell: matches "Recent rugby success" → top cup result', () => {
  const r = formatProjectionCell('rugby', 'Recent rugby success', oakhamProjection)
  // Schools Cup 2023 winner ranks higher than finalist/semi
  assert.equal(r?.value, 'Schools Cup 2023 winner')
})

test('formatProjectionCell: matches "Academy zone" → external partner or scholarship notes', () => {
  const r = formatProjectionCell('rugby', 'Academy / pathway', oakhamProjection)
  assert.ok(r?.value.includes('Sports scholarships available'))
})

test('formatProjectionCell: matches "Number of teams" → school_teams_visible.value', () => {
  const r = formatProjectionCell('rugby', 'Number of rugby teams', oakhamProjection)
  assert.equal(r?.value, '4')
})

test('formatProjectionCell: returns null when row_name does not match any rule', () => {
  assert.equal(formatProjectionCell('rugby', 'Total fee per term', oakhamProjection), null)
  assert.equal(formatProjectionCell('rugby', 'Some random row', oakhamProjection), null)
})

test('formatProjectionCell: returns null when matched rule field is missing', () => {
  const sparse = { competitive_tier: 'national-strong' }
  assert.equal(formatProjectionCell('rugby', 'DMT rank', sparse), null)
  assert.equal(formatProjectionCell('rugby', 'SOCS rank', sparse), null)
  assert.equal(formatProjectionCell('rugby', 'Notable alumni', sparse), null)
})

test('formatProjectionCell: source URL omitted when no valid HTTPS evidence_url', () => {
  const noUrl = {
    competitive_tier: 'national-strong',
    evidence_urls: ['http://insecure.example.com/x'],  // not HTTPS
  }
  const r = formatProjectionCell('rugby', 'Rugby tier', noUrl)
  assert.equal(r?.value, 'National-strong')
  assert.equal(r?.source, undefined)
})

test('formatProjectionCell: value is capped at 80 chars', () => {
  const longProj = {
    competitive_tier: 'a'.repeat(120),
    evidence_urls: [],
  }
  const r = formatProjectionCell('rugby', 'Rugby tier', longProj)
  assert.ok(r != null && r.value.length <= 80)
})
