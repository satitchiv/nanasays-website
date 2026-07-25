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
      source_url: 'https://example-school.test/admissions',
      entry_points: [
        {
          year: 9,
          boarding: true,
          entry_point: '13+ (Year 9)',
          assessment: 'ISEB Common Pre-Test, entrance papers, interview and group activity',
        },
        {
          year: 7,
          boarding: false,
          entry_point: '11+ (Year 7)',
          assessment: 'School report and interview',
        },
      ],
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
    curriculum: ['GCSE', 'A Level', 'IB Diploma'],
    languages: ['English', 'French', 'Mandarin'],
    scholarships_available: [
      'Academic Scholarship — up to 20% fee remission',
      'Music Scholarship — instrumental assessment required',
      'Sports Scholarship — coach reference required',
    ],
    pastoral_model: 'House system with resident houseparents, tutors and year heads',
    pastoral_care: 'Every pupil has a tutor and access to the central pastoral team.',
    wellbeing_staffing: {
      team: [
        { role: 'Counsellor', count: 2 },
        { role: 'Mental Health Nurse', count: 1 },
        { role: 'Head of Learning Support', count: 1 },
      ],
      total_staff: 4,
      source_urls: ['https://example-school.test/wellbeing'],
      extracted_at: '2026-07-21T00:00:00.000Z',
    },
    school_life: {
      boarding_life: 'Boarders live in mixed-age houses with resident staff and a full weekend programme.',
      arts_music: {
        description: 'Pupils take part in ensembles, concerts, drama and annual productions.',
        highlights: [
          'Annual school musical — whole-school production',
          'Chamber orchestra — weekly rehearsals',
          'House singing competition — annual event',
        ],
      },
      activities_clubs: ['Debating', 'Robotics', 'Duke of Edinburgh', 'Community service'],
      source_urls: ['https://example-school.test/school-life'],
    },
    facilities: ['Performing arts centre', 'Science laboratories', '25m swimming pool'],
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
  assert.equal(
    resolveTrustedComparisonCell('Curriculum and qualifications', school)?.value,
    'GCSE · A Level · IB Diploma',
  )
  assert.equal(
    resolveTrustedComparisonCell('Admissions tests and interviews', school)?.value,
    'ISEB Pre-Test · Entrance tests · Interview · Group activity',
  )
  assert.equal(
    resolveTrustedComparisonCell('Pastoral care model', school)?.value,
    'House system',
  )
  assert.equal(
    resolveTrustedComparisonCell('Wellbeing and pupil support team', school)?.value,
    '4 named pupil-support staff',
  )
  assert.equal(
    resolveTrustedComparisonCell('Boarding life', school)?.value,
    'Published boarding-life profile',
  )
  assert.equal(
    resolveTrustedComparisonCell('Music and performing arts', school)?.value,
    'Annual school musical · Chamber orchestra · House singing competition',
  )
  assert.equal(
    resolveTrustedComparisonCell('Clubs and extracurricular activities', school)?.value,
    'Debating · Robotics · Duke of Edinburgh · Community service',
  )
  assert.equal(
    resolveTrustedComparisonCell('School facilities', school)?.value,
    'Performing arts centre · Science laboratories · 25m swimming pool',
  )
  assert.equal(
    resolveTrustedComparisonCell('Languages offered', school)?.value,
    'English · French · Mandarin',
  )
  assert.equal(
    resolveTrustedComparisonCell('Scholarships', school)?.value,
    'Academic Scholarship · Music Scholarship · Sports Scholarship',
  )
})

test('never substitutes the nearest airport for an explicit Heathrow request', () => {
  const noHeathrow: DirectComparisonSchool = {
    ...school,
    structured: {
      ...school.structured,
      location_profile: {
        airports: [
          { name: 'Manchester', distance_km: 80, drive_time_min_estimate: 114 },
        ],
      },
    },
  }

  assert.equal(resolveTrustedComparisonCell('Distance from Heathrow', noHeathrow), null)
  assert.equal(
    resolveTrustedComparisonCell('Airport distance', noHeathrow)?.note,
    'Manchester',
  )
})

test('does not turn database gap notes into comparison answers', () => {
  const gapsOnly: DirectComparisonSchool = {
    ...school,
    structured: {
      wellbeing_staffing: {
        team: [],
        total_staff: null,
        notes: 'No mental health staffing data found in crawled content',
      },
      school_life: {
        notes: 'No clubs, boarding life or music information found',
        arts_music: {},
        activities_clubs: [],
      },
      facilities: [],
      scholarships_available: [],
    },
  }

  assert.equal(resolveTrustedComparisonCell('Wellbeing and pupil support team', gapsOnly), null)
  assert.equal(resolveTrustedComparisonCell('Music and performing arts', gapsOnly), null)
  assert.equal(resolveTrustedComparisonCell('Clubs and extracurricular activities', gapsOnly), null)
  assert.equal(resolveTrustedComparisonCell('School facilities', gapsOnly), null)
  assert.equal(resolveTrustedComparisonCell('Scholarships', gapsOnly), null)
})

test('uses a substantive pastoral profile when a separate model field is absent', () => {
  const careOnly: DirectComparisonSchool = {
    ...school,
    structured: {
      pastoral_care: 'A family-oriented pastoral environment with dedicated boarding houses and pupil support.',
      pastoral_model: null,
    },
  }
  assert.equal(
    resolveTrustedComparisonCell('Pastoral care model', careOnly)?.value,
    'Published pastoral care profile',
  )
})

test('requires a concrete admissions assessment signal', () => {
  const processOnly: DirectComparisonSchool = {
    ...school,
    structured: {
      admissions_format: {
        process_steps: ['Submit the application form', 'Pay the registration fee'],
      },
    },
  }
  assert.equal(
    resolveTrustedComparisonCell('Admissions tests and interviews', processOnly),
    null,
  )

  const entranceExaminations: DirectComparisonSchool = {
    ...school,
    structured: {
      admissions_format: {
        entry_points: [{
          entry_point: '13+',
          assessment: 'Candidates sit entrance examinations in English and mathematics.',
        }],
      },
    },
  }
  assert.equal(
    resolveTrustedComparisonCell('Admissions tests and interviews', entranceExaminations)?.value,
    'Entrance tests',
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
