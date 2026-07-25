import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countFilledCells,
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
    fees_by_grade: {
      currency: 'GBP',
      rows: [{ phase: 'Boarding Years 9–13', per_year: 54_000 }],
      compulsory_extras: [{ name: 'Registration fee', per_year: 250 }],
    },
    admissions_format: {
      entry_points: [{ year: 9, boarding: true }, { year: 7, boarding: false }],
    },
    university_destinations: {
      top_universities: [{ name: 'Oxford' }, { name: 'Cambridge' }, { name: 'Durham' }],
    },
    sports_profile: {
      signature_sports: ['Rugby', 'Tennis'],
      facilities: ['50m pool'],
      football: {
        competitive_tier: 'national-strong',
        competitive_tier_reasoning: 'Regular national cup participation.',
        programme_classification: 'Major sport',
        school_teams_visible: {
          value: 12,
          evidence: { url: 'https://sport.example-school.test/football-teams' },
        },
        head_coach: { name: 'A Coach', title: 'Head of Football' },
        coaching_staff: [{ name: 'A Coach' }, { name: 'B Coach' }],
        academy_scholarship: true,
        academy_scholarship_notes: 'Football awards are available after assessment.',
        notes: 'A deep football programme with national competition evidence.',
        evidence_urls: [
          'https://example-school.test/football',
          'https://sport.example-school.test/football-teams',
        ],
        extracted_at: '2026-07-20T00:00:00.000Z',
      },
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
  assert.equal(resolveTrustedComparisonCell('Boarding fees', school)?.value, '£54,000 per year')
  assert.equal(resolveTrustedComparisonCell('Registration fee', school)?.value, '£250')
  assert.equal(resolveTrustedComparisonCell('Lowest boarding entry', school)?.value, 'Year 9')
  assert.equal(resolveTrustedComparisonCell('University destinations', school)?.value, 'Oxford · Cambridge · Durham')
  assert.equal(resolveTrustedComparisonCell('Sports opportunities', school)?.value, 'Rugby · Tennis · 50m pool')
  assert.equal(
    resolveTrustedComparisonCell('Football competitive level and results', school)?.value,
    'National strong',
  )
  assert.deepEqual(
    resolveTrustedComparisonCell('Football teams and playing opportunities', school),
    {
      value: 'Major sport',
      note: '12 teams visible',
      source: 'https://sport.example-school.test/football-teams',
      checked_at: '2026-07-20T00:00:00.000Z',
      evidence_kind: 'nana_database',
    },
  )
  assert.equal(
    resolveTrustedComparisonCell('Football coaching and elite pathway', school)?.value,
    'Academy or scholarship pathway',
  )
})

test('does not publish football cells that fail the database evidence gate', () => {
  const oneSourceSchool: DirectComparisonSchool = {
    ...school,
    structured: {
      ...school.structured,
      sports_profile: {
        football: {
          competitive_tier: 'national-elite',
          programme_classification: 'Major sport',
          head_coach: { name: 'A Coach' },
          notes: 'Strong programme.',
          evidence_urls: [
            'https://example-school.test/football',
            'https://example-school.test/football',
          ],
        },
      },
    },
  }
  assert.equal(
    resolveTrustedComparisonCell('Football competitive level and results', oneSourceSchool),
    null,
  )
  assert.equal(
    resolveTrustedComparisonCell('Football teams and playing opportunities', oneSourceSchool),
    null,
  )
  assert.equal(
    resolveTrustedComparisonCell('Football coaching and elite pathway', oneSourceSchool),
    null,
  )
})

test('keeps unknown strength out while allowing separately evidenced programme data', () => {
  const unknownTierSchool: DirectComparisonSchool = {
    ...school,
    structured: {
      ...school.structured,
      sports_profile: {
        football: {
          competitive_tier: 'unknown',
          programme_classification: 'Development sport',
          notes: 'The programme is published but competitive strength is unresolved.',
          evidence_urls: [
            'https://example-school.test/football',
            'https://sport.example-school.test/football',
          ],
        },
      },
    },
  }
  assert.equal(
    resolveTrustedComparisonCell('Football competitive level and results', unknownTierSchool),
    null,
  )
  assert.equal(
    resolveTrustedComparisonCell('Football teams and playing opportunities', unknownTierSchool)?.value,
    'Development sport',
  )
})

test('continues resolving previously saved football row labels', () => {
  assert.equal(
    resolveTrustedComparisonCell('Football strength and achievements', school)?.value,
    'National strong',
  )
  assert.equal(
    resolveTrustedComparisonCell('Football opportunities and programme depth', school)?.value,
    'Major sport',
  )
  assert.equal(
    resolveTrustedComparisonCell('Football coaching and player pathway', school)?.value,
    'Academy or scholarship pathway',
  )
})

test('labels term-only boarding fees without presenting them as annual', () => {
  const termOnlySchool: DirectComparisonSchool = {
    ...school,
    structured: {
      ...school.structured,
      fees_by_grade: {
        currency: 'GBP',
        rows: [{ phase: 'Senior boarding', per_term: 18_500 }],
      },
    },
  }

  assert.deepEqual(resolveTrustedComparisonCell('Boarding fees', termOnlySchool), {
    value: '£18,500 per term',
    note: 'Senior boarding',
    evidence_kind: 'nana_database',
  })
})

test('does not present day-school tuition as a boarding fee', () => {
  const daySchool: DirectComparisonSchool = {
    ...school,
    boarding: false,
    structured: {
      ...school.structured,
      fees_by_grade: {
        currency: 'GBP',
        rows: [{ phase: 'Senior day pupils', per_year: 28_000 }],
      },
    },
  }

  assert.equal(resolveTrustedComparisonCell('Boarding fees', daySchool), null)
})

test('resolves boarding entry from the current admissions entry-point shape', () => {
  const currentSchemaSchool: DirectComparisonSchool = {
    ...school,
    structured: {
      ...school.structured,
      admissions_format: {
        entry_points: [
          { entry_point: '13+ (Year 9)', assessment: 'Boarding assessment weekend' },
          { entry_point: '16+ (Year 12)', assessment: 'Sixth Form interview' },
        ],
      },
    },
  }

  assert.equal(
    resolveTrustedComparisonCell('Lowest boarding entry', currentSchemaSchool)?.value,
    'Year 9',
  )

  assert.equal(
    resolveTrustedComparisonCell('Lowest boarding entry', {
      ...currentSchemaSchool,
      structured: {
        ...currentSchemaSchool.structured,
        admissions_format: {
          entry_points: [{ entry_point: 'Years 7–13', assessment: 'Boarding taster available' }],
        },
      },
    })?.value,
    'Year 7',
  )
})

test('bounds list-backed comparison values without cutting an item', () => {
  const verboseSchool: DirectComparisonSchool = {
    ...school,
    structured: {
      ...school.structured,
      university_destinations: {
        top_universities: [
          { name: 'University of Oxford' },
          { name: 'Massachusetts Institute of Technology' },
          { name: 'University College London' },
        ],
      },
      sports_profile: {
        signature_sports: [
          'Competitive rugby programme',
          'High-performance swimming programme',
          'National tennis academy pathway',
          'Regional athletics competition squad',
        ],
      },
    },
  }

  const universityValue = String(
    resolveTrustedComparisonCell('University destinations', verboseSchool)?.value,
  )
  const sportsValue = String(resolveTrustedComparisonCell('Sports opportunities', verboseSchool)?.value)

  assert.ok(universityValue.length <= 80)
  assert.ok(sportsValue.length <= 80)
  assert.ok(!universityValue.endsWith('…'))
  assert.ok(!sportsValue.endsWith('…'))
})

test('counts only comparison cells that contain usable values', () => {
  assert.equal(countFilledCells({
    full: { value: 'Available' },
    zero: { value: 0 },
    empty: { value: '' },
    missing: { value: null },
  }), 2)
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
