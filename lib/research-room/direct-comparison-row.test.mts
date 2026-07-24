import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeModelResults,
  resolveTrustedComparisonCell,
  safeHttpsUrl,
  type DirectComparisonSchool,
} from './direct-comparison-row.ts'

const school: DirectComparisonSchool = {
  slug: 'example-school',
  name: 'Example School',
  city: 'Oxford',
  region: 'Oxfordshire',
  boarding: true,
  gender_split: 'Co-ed',
  structured: {
    fees_max: 52_000,
    fees_currency: 'GBP',
    exam_results: { a_level: { pct_a_star_a: 71.2 } },
    student_community: { total_pupils: 744 },
    location_profile: {
      airports: [
        { name: 'London Heathrow', distance_km: 83, drive_time_min_estimate: 118 },
        { name: 'Gatwick', distance_km: 53, drive_time_min_estimate: 79 },
      ],
    },
  },
}

test('resolves common trusted criteria without web research', () => {
  assert.deepEqual(resolveTrustedComparisonCell('Airport distance', school), {
    value: '53 km · 1 hr 19 min',
    note: 'Gatwick',
    source: undefined,
    evidence_kind: 'nana_database',
  })
  assert.deepEqual(resolveTrustedComparisonCell('Distance from Heathrow', school), {
    value: '83 km · 1 hr 58 min',
    note: 'London Heathrow',
    source: undefined,
    evidence_kind: 'nana_database',
  })
  assert.equal(resolveTrustedComparisonCell('A-level A*–A', school)?.value, '71%')
  assert.equal(resolveTrustedComparisonCell('Annual school fees', school)?.value, '£52,000')
  assert.equal(resolveTrustedComparisonCell('Total pupils', school)?.value, '~744')
})

test('accepts only https sources returned by web search', () => {
  assert.equal(safeHttpsUrl('http://example.com'), null)
  assert.equal(safeHttpsUrl('not a url'), null)
  assert.equal(safeHttpsUrl('https://example.com/page#section'), 'https://example.com/page')
})

test('keeps sourced medium-confidence web results and rejects weak results', () => {
  const cells = normalizeModelResults(
    {
      results: [
        {
          slug: 'example-school',
          value: 'Saturday lessons twice per term',
          note: 'Published weekend programme',
          destination: null,
          distance: null,
          travel_time: null,
          source_url: 'https://example.com/weekends',
          confidence: 'medium',
        },
        {
          slug: 'other-school',
          value: 'Probably',
          note: null,
          destination: null,
          distance: null,
          travel_time: null,
          source_url: 'https://other.example/weekends',
          confidence: 'low',
        },
      ],
    },
    [
      school,
      { ...school, slug: 'other-school', name: 'Other School' },
    ],
    new Map(),
    new Set(['https://example.com/weekends', 'https://other.example/weekends']),
    '2026-07-24T00:00:00.000Z',
  )

  assert.equal(cells['example-school'].value, 'Saturday lessons twice per term')
  assert.equal(cells['example-school'].evidence_kind, 'web_search')
  assert.deepEqual(cells['other-school'], { value: null })
})

test('formats sourced airport research as distance and travel time', () => {
  const cells = normalizeModelResults(
    {
      results: [{
        slug: 'example-school',
        value: 'East Midlands Airport',
        note: 'A long research explanation',
        destination: 'East Midlands Airport',
        distance: '28 miles',
        travel_time: '37 min drive',
        source_url: 'https://example.com/route',
        confidence: 'high',
      }],
    },
    [school],
    new Map(),
    new Set(['https://example.com/route']),
    '2026-07-24T00:00:00.000Z',
    'Airport distance',
  )

  assert.equal(cells['example-school'].value, '28 miles · 37 min drive')
  assert.equal(cells['example-school'].note, 'East Midlands Airport')
})

test('does not mislabel a driving time as a distance', () => {
  const cells = normalizeModelResults(
    {
      results: [{
        slug: 'example-school',
        value: '35 minute drive to East Midlands Airport',
        note: 'East Midlands Airport',
        destination: 'East Midlands Airport',
        distance: '35 minute drive',
        travel_time: '35 minutes',
        source_url: 'https://example.com/route',
        confidence: 'high',
      }],
    },
    [school],
    new Map(),
    new Set(['https://example.com/route']),
    '2026-07-24T00:00:00.000Z',
    'Airport distance',
  )

  assert.equal(cells['example-school'].value, '35 minutes')
})
