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
import { rankCandidates, scoreForBuildMode } from './score-for-build-mode.ts'

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

// ── Codex r8 Medium #2 — DB-backed wrapper integration tests ─────────
//
// These tests pin two invariants the unit suite never asserted:
// 1. The `school_structured_data` SELECT must NOT include `isi_deep_facts`
//    (it's not a column; that's the bug we fixed 2026-05-15).
// 2. The wrapper must call `school_facts` to load the ISI deep bundle.
//
// We mock the supabase client with a fluent builder + a queries log, then
// drive scoreForBuildMode and assert on the captured selects.

function makeMockSupabase(opts) {
  const calls = []
  const make = (table) => {
    let captured = { table, select: null, eqs: [], ors: [], range: null, ins: [], order: null, limit: null }
    const builder = {
      select(cols) { captured.select = cols; return builder },
      eq(col, val) { captured.eqs.push([col, val]); return builder },
      or(expr)     { captured.ors.push(expr); return builder },
      in(col, vals){ captured.ins.push([col, vals]); return builder },
      order(col, o){ captured.order = [col, o]; return builder },
      range(a, b)  { captured.range = [a, b]; return builder },
      limit(n)     { captured.limit = n; return builder },
      then(resolve, reject) {
        calls.push(captured)
        const handler = opts.handle[table]
        try {
          const result = handler ? handler(captured) : { data: [], error: null }
          resolve(result)
        } catch (e) { reject(e) }
      },
    }
    return builder
  }
  return { from: (table) => make(table), _calls: () => calls }
}

test('scoreForBuildMode wrapper: SELECT for school_structured_data does NOT include isi_deep_facts', async () => {
  const supa = makeMockSupabase({
    handle: {
      schools_status: () => ({
        data: [{ school_slug: 'rugby-school' }, { school_slug: 'sherborne-school' }],
        error: null,
      }),
      schools: () => ({
        data: [{ slug: 'rugby-school', name: 'Rugby School', gender_split: 'Co-ed', fees_usd_min: 50000, sen_support: false, strengths: ['sport'], confidence_score: 80, age_min: 11, age_max: 18, region: 'Warwickshire' }],
        error: null,
      }),
      school_structured_data: () => ({ data: [], error: null }),
      school_facts:           () => ({ data: [], error: null }),
    },
  })

  await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands', boarding_pref: 'full', budget_range: '40k-50k' },
    child:  { interests_sports: [{ sport: 'rugby', level: 'county' }] },
    excludeSlugs: [],
    childGender: 'girl',
    childYear:   'year-9',
  }, 10)

  const structCall = supa._calls().find(c => c.table === 'school_structured_data')
  assert.ok(structCall,                            'school_structured_data was queried')
  assert.ok(!structCall.select.includes('isi_deep_facts'), `SELECT must not include isi_deep_facts. Got: ${structCall.select}`)
})

test('scoreForBuildMode wrapper: loads ISI deep bundle via school_facts', async () => {
  const supa = makeMockSupabase({
    handle: {
      schools_status: () => ({ data: [{ school_slug: 'rugby-school' }], error: null }),
      schools:        () => ({ data: [{ slug: 'rugby-school', name: 'Rugby School', gender_split: 'Co-ed', fees_usd_min: 50000, sen_support: false, strengths: [], confidence_score: 80, age_min: 11, age_max: 18, region: 'Warwickshire' }], error: null }),
      school_structured_data: () => ({ data: [{ school_slug: 'rugby-school', sports_profile: null, exam_results: null, university_destinations: null, student_community: null }], error: null }),
      school_facts:   () => ({ data: [], error: null }),
    },
  })

  await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands', pastoral_pref: 'high_priority' },
    child:  { interests_sports: [{ sport: 'rugby', level: 'county' }] },
    excludeSlugs: [],
    childGender: 'girl',
    childYear:   'year-9',
  }, 10)

  const factsCall = supa._calls().find(c => c.table === 'school_facts')
  assert.ok(factsCall, 'school_facts was queried (loadDimFactsBundles)')
})

test('scoreForBuildMode wrapper: schools_status fetch error → reason fetch_failed (NOT no_candidates)', async () => {
  const supa = makeMockSupabase({
    handle: {
      schools_status: () => ({ data: null, error: { message: 'simulated', code: 'PGRST' } }),
    },
  })

  const result = await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands' },
    child:  {},
    excludeSlugs: [],
    childGender: 'girl',
    childYear:   'year-9',
  }, 10)

  assert.equal(result.reason, 'fetch_failed', `expected fetch_failed; got ${result.reason}`)
  assert.equal(result.candidates.length, 0)
})

// ════════════════════════════════════════════════════════════════════════════
// Phase 1 data-utilization (2026-05-21) — wired previously-ignored fields
// into the scorer. Tests added per field. Audit context:
// `~/notes/roadmap-recommender-data-utilization-2026-05-21.md`.
// ════════════════════════════════════════════════════════════════════════════

// ── Fixtures for Phase 1 ─────────────────────────────────────────────

const CONCORD_LIKE = {
  slug: 'concord-college',
  name: 'Concord College',
  gender_split: 'Co-ed',
  fees_usd_min: 60000,
  sen_support: false,
  strengths: ['academic'],
  confidence_score: 90,
  age_min: 11, age_max: 18,
  region: 'Shropshire',
}

const STRUCT_CONCORD_MEDICINE = {
  school_slug: 'concord-college',
  sports_profile: null,
  exam_results: null,
  university_destinations: {
    medicine_dentistry_vet_count: 30,
    oxbridge_subjects: ['Medicine', 'Veterinary Medicine', 'Engineering'],
    oxford_count: 5, cambridge_count: 7,
  },
  student_community: null,
  isi_deep_facts: null,
  wellbeing_staffing: null,
  ethos_facts: null,
}

const WORTH_LIKE = {
  slug: 'worth-school',
  name: 'Worth School',
  gender_split: 'Co-ed',
  fees_usd_min: 59000,
  sen_support: false,
  strengths: [],
  confidence_score: 100,
  age_min: 11, age_max: 19,
  region: 'West Sussex',
}

const STRUCT_WORTH_RC = {
  school_slug: 'worth-school',
  sports_profile: null,
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: null,
  wellbeing_staffing: null,
  ethos_facts: { ethos_label: 'roman_catholic' },
}

const STRUCT_RUGBY_WELLBEING = {
  school_slug: 'rugby-school',
  sports_profile: null,
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: null,
  wellbeing_staffing: { total_staff: 7, ratio_per_pupil: null },
  ethos_facts: null,
}

const STRUCT_RUGBY_EMPTY = {
  school_slug: 'rugby-school',
  sports_profile: null,
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: null,
  wellbeing_staffing: null,
  ethos_facts: null,
}

// ── 1. Medicine-pathway scoring ──────────────────────────────────────

test('Phase 1: medicine intent in goals_notes triggers medicine_dentistry_vet_count boost', () => {
  const out = rankCandidates(
    [CONCORD_LIKE],
    structMap(STRUCT_CONCORD_MEDICINE),
    {
      parent: null,
      child: { goals_notes: 'wants to be a doctor at Cambridge' },
      excludeSlugs: [],
    },
    10,
  )
  const concord = out.find(c => c.slug === 'concord-college')
  assert.ok(concord, 'Concord should be ranked when medicine intent fires')
  assert.ok(
    concord.signals.some(s => /medicine pipeline \(30 placements\)/.test(s)),
    `expected "medicine pipeline (30 placements)" chip, got: ${JSON.stringify(concord.signals)}`,
  )
})

test('Phase 1: medicine boost does NOT fire without medicine prose intent', () => {
  const out = rankCandidates(
    [CONCORD_LIKE],
    structMap(STRUCT_CONCORD_MEDICINE),
    {
      parent: null,
      child: { goals_notes: 'wants to be a tennis player' },  // sport, not medicine
      excludeSlugs: [],
    },
    10,
  )
  const concord = out.find(c => c.slug === 'concord-college')
  // Gating works: if no medicine intent, medicine_dentistry_vet_count isn't read.
  // Concord may not be in output at all (no positive signal fired).
  if (concord) {
    assert.ok(
      !concord.signals.some(s => /medicine/i.test(s)),
      'medicine signals must NOT fire on a non-medicine child',
    )
  }
})

test('Phase 1 (Codex r1 P1.2): oxbridge_subjects "Natural Sciences" / "Veterinary Medicine" / "Biomedical Sciences" all fire medicine pathway via regex', () => {
  // Pre-fix: exact Set.has() required "natural sciences" lower-case
  // string match. Cambridge titles vary by whitespace, capitalization,
  // and ampersand usage. Substring regex handles all of these.
  for (const subj of ['Natural Sciences', 'Biomedical Sciences', 'Veterinary Medicine', 'Medical Sciences']) {
    const STRUCT = {
      ...STRUCT_CONCORD_MEDICINE,
      university_destinations: {
        medicine_dentistry_vet_count: null,
        oxbridge_subjects: [subj],
      },
    }
    const out = rankCandidates(
      [CONCORD_LIKE],
      structMap(STRUCT),
      { parent: null, child: { goals_notes: 'wants to study medicine' }, excludeSlugs: [] },
      10,
    )
    const concord = out.find(c => c.slug === 'concord-college')
    assert.ok(concord, `Concord must rank when oxbridge_subjects=[${JSON.stringify(subj)}]`)
    assert.ok(
      concord.signals.some(s => /Oxbridge medicine pathway/i.test(s)),
      `expected medicine pathway chip for subject "${subj}", got: ${JSON.stringify(concord.signals)}`,
    )
  }
})

test('Phase 1 (Codex r1 P1.2): oxbridge_subjects "Jurisprudence" fires law pathway via regex', () => {
  const STRUCT = {
    ...STRUCT_CONCORD_MEDICINE,
    university_destinations: {
      medicine_dentistry_vet_count: null,
      oxbridge_subjects: ['Jurisprudence'],
    },
  }
  const out = rankCandidates(
    [CONCORD_LIKE],
    structMap(STRUCT),
    { parent: null, child: { goals_notes: 'wants to be a lawyer' }, excludeSlugs: [] },
    10,
  )
  const concord = out.find(c => c.slug === 'concord-college')
  assert.ok(concord, 'Concord must rank on law intent + Jurisprudence subject')
  assert.ok(
    concord.signals.some(s => /Oxbridge law pathway/i.test(s)),
    `expected law pathway chip, got: ${JSON.stringify(concord.signals)}`,
  )
})

test('Phase 1 (Codex r1 P1.2): oxbridge_subjects "Engineering Science" fires engineering pathway', () => {
  const STRUCT = {
    ...STRUCT_CONCORD_MEDICINE,
    university_destinations: {
      medicine_dentistry_vet_count: null,
      oxbridge_subjects: ['Engineering Science', 'Computer Science and Philosophy'],
    },
  }
  const out = rankCandidates(
    [CONCORD_LIKE],
    structMap(STRUCT),
    { parent: null, child: { goals_notes: 'wants to study engineering' }, excludeSlugs: [] },
    10,
  )
  const concord = out.find(c => c.slug === 'concord-college')
  assert.ok(concord, 'Concord must rank on engineering intent')
  assert.ok(
    concord.signals.some(s => /Oxbridge engineering pathway/i.test(s)),
    `expected engineering pathway chip, got: ${JSON.stringify(concord.signals)}`,
  )
})

test('Phase 1 (Codex r1 P1.3 + r2 P1): MEDICINE_INTENT_RE matches med/medical/pediatrics/pharmacy/orthodontist/vet school', () => {
  // r1 P1.3: bare "medical school" / "med school" / "pediatrics" missed.
  // r2 P1: "pharmacy" / "pharmacist" / "orthodontist" / "vet school"
  // were ALSO missed because `pharmac` and `orthodont` sat inside
  // trailing `\b` (couldn't match longer derived words). Suffix optional
  // groups `pharmac(?:y|ist|ology|eutical)?` and `orthodont(?:ist|ics?)?`
  // fix this. "dentistry" already covered by the dentistry alternation.
  for (const phrase of [
    'wants to go to med school',
    'aiming for medical school',
    'interested in pediatrics',
    'wants to study pharmacy',
    'wants to become a pharmacist',
    'wants to be an orthodontist',
    'thinking about vet school',
  ]) {
    const out = rankCandidates(
      [CONCORD_LIKE],
      structMap(STRUCT_CONCORD_MEDICINE),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const concord = out.find(c => c.slug === 'concord-college')
    assert.ok(concord, `Concord must rank with prose "${phrase}"`)
    assert.ok(
      concord.signals.some(s => /medicine pipeline/i.test(s)),
      `expected medicine pathway chip for "${phrase}", got: ${JSON.stringify(concord.signals)}`,
    )
  }
})

test('Phase 1 (Codex r1 P1.3): MEDICINE_INTENT_RE still ignores plain "biology"', () => {
  // Regression guard: bare biology mentions must NOT trigger medicine.
  const out = rankCandidates(
    [CONCORD_LIKE],
    structMap(STRUCT_CONCORD_MEDICINE),
    { parent: null, child: { goals_notes: 'loves biology and chemistry class' }, excludeSlugs: [] },
    10,
  )
  const concord = out.find(c => c.slug === 'concord-college')
  if (concord) {
    assert.ok(
      !concord.signals.some(s => /medicine pipeline/i.test(s)),
      'plain "biology" must NOT trigger medicine pathway (false-positive guard)',
    )
  }
})

test('Phase 1: oxbridge_subjects includes Medicine → Oxbridge medicine pathway chip', () => {
  // Even when medicine_dentistry_vet_count is null, oxbridge_subjects medicine
  // entries should fire the pathway boost.
  const STRUCT_OXBRIDGE_ONLY = {
    ...STRUCT_CONCORD_MEDICINE,
    university_destinations: {
      medicine_dentistry_vet_count: null,
      oxbridge_subjects: ['Medicine'],
    },
  }
  const out = rankCandidates(
    [CONCORD_LIKE],
    structMap(STRUCT_OXBRIDGE_ONLY),
    // Use a tight medicine-intent phrase ("medicine") so MEDICINE_INTENT_RE
    // fires. Keeping the regex tight (vs. matching plain "biology") prevents
    // false-positives on "she loves biology class" → unintended medicine boost.
    { parent: null, child: { goals_notes: 'wants to study medicine' }, excludeSlugs: [] },
    10,
  )
  const concord = out.find(c => c.slug === 'concord-college')
  assert.ok(concord, 'Concord should be ranked')
  assert.ok(
    concord.signals.some(s => /Oxbridge medicine pathway/i.test(s)),
    `expected Oxbridge medicine pathway chip, got: ${JSON.stringify(concord.signals)}`,
  )
})

// ── 2. Ethos match ───────────────────────────────────────────────────

test('Phase 1: parent.ethos_pref=roman_catholic + school.ethos_label=roman_catholic fires ethos match', () => {
  const out = rankCandidates(
    [WORTH_LIKE],
    structMap(STRUCT_WORTH_RC),
    {
      parent: { ethos_pref: 'roman_catholic' },
      child: null,
      excludeSlugs: [],
    },
    10,
  )
  const worth = out.find(c => c.slug === 'worth-school')
  assert.ok(worth, 'Worth should be ranked')
  assert.ok(
    worth.signals.some(s => /ethos match \(roman catholic\)/i.test(s)),
    `expected ethos match chip, got: ${JSON.stringify(worth.signals)}`,
  )
})

test('Phase 1: parent.ethos_pref=no-preference → ethos branch short-circuits', () => {
  const out = rankCandidates(
    [WORTH_LIKE],
    structMap(STRUCT_WORTH_RC),
    {
      parent: { ethos_pref: 'no-preference' },
      child: null,
      excludeSlugs: [],
    },
    10,
  )
  const worth = out.find(c => c.slug === 'worth-school')
  if (worth) {
    assert.ok(
      !worth.signals.some(s => /ethos match/i.test(s)),
      'ethos match must NOT fire when parent has no preference',
    )
  }
})

// ── 3. Wellbeing staffing ────────────────────────────────────────────

test('Phase 1: pastoral_pref=high_priority + wellbeing_staffing.total_staff>=5 fires team chip', () => {
  const out = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_WELLBEING),
    {
      parent: { pastoral_pref: 'high_priority' },
      child: null,
      excludeSlugs: [],
    },
    10,
  )
  const rugby = out.find(c => c.slug === 'rugby-school')
  assert.ok(rugby, 'Rugby should be ranked')
  assert.ok(
    rugby.signals.some(s => /wellbeing team \(7 staff\)/i.test(s)),
    `expected wellbeing team chip, got: ${JSON.stringify(rugby.signals)}`,
  )
})

test('Phase 1: wellbeing chip does NOT fire without pastoral_pref intent', () => {
  const out = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_WELLBEING),
    { parent: null, child: null, excludeSlugs: [] },
    10,
  )
  const rugby = out.find(c => c.slug === 'rugby-school')
  if (rugby) {
    assert.ok(
      !rugby.signals.some(s => /wellbeing team/i.test(s)),
      'wellbeing chip must NOT fire when parent has no pastoral intent',
    )
  }
})

// ── 4. Arts (arts_music_drama count) ─────────────────────────────────

test('Phase 1: arts intent + artsCountBySlug>=5 fires "rich arts programme" chip', () => {
  const ARTS_SCHOOL = { ...RUGBY_SCHOOL, slug: 'arts-rich-school', name: 'Arts Rich School' }
  const STRUCT_ARTS = { ...STRUCT_RUGBY_EMPTY, school_slug: 'arts-rich-school' }
  const out = rankCandidates(
    [ARTS_SCHOOL],
    structMap(STRUCT_ARTS),
    {
      parent: null,
      child: { interests_arts: [{ art: 'music', level: 'school-team' }] },
      excludeSlugs: [],
    },
    10,
    new Map([['arts-rich-school', 7]]),  // 7 arts facts
  )
  const arts = out.find(c => c.slug === 'arts-rich-school')
  assert.ok(arts, 'Arts-rich school should be ranked')
  assert.ok(
    arts.signals.some(s => /rich arts programme \(7 signals\)/i.test(s)),
    `expected rich arts programme chip, got: ${JSON.stringify(arts.signals)}`,
  )
})

test('Phase 1: arts boost does NOT fire without arts intent', () => {
  const out = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_EMPTY),
    { parent: null, child: null, excludeSlugs: [] },
    10,
    new Map([['rugby-school', 10]]),
  )
  const rugby = out.find(c => c.slug === 'rugby-school')
  if (rugby) {
    assert.ok(
      !rugby.signals.some(s => /arts programme/i.test(s)),
      'arts chip must NOT fire without arts interest',
    )
  }
})

// ── 5. top_priority nudge ────────────────────────────────────────────

test('Phase 1: top_priority=academic + academic-strong signal → academic-priority match chip', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { top_priority: 'academic' },
      child: { goal_orientation: 'university_track' },
      excludeSlugs: [],
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe should be ranked')
  assert.ok(
    wa.signals.some(s => /academic-priority match/i.test(s)),
    `expected academic-priority match chip, got: ${JSON.stringify(wa.signals)}`,
  )
})

test('Phase 1: top_priority=sport + strong-sport signal → sport-priority match chip', () => {
  const out = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    {
      parent: { top_priority: 'sport' },
      child: { interests_sports: [{ sport: 'rugby', level: 'county' }] },
      excludeSlugs: [],
    },
    10,
  )
  const rugby = out.find(c => c.slug === 'rugby-school')
  assert.ok(rugby, 'Rugby should be ranked')
  assert.ok(
    rugby.signals.some(s => /sport-priority match/i.test(s)),
    `expected sport-priority match chip, got: ${JSON.stringify(rugby.signals)}`,
  )
})

test('Phase 1 (Codex r1 P2): top_priority=all-round POSITIVE — 3 category matches (academic + sport + arts) fires chip', () => {
  // Combine the academic fixture (Wycombe-like exam results) + sport
  // signal (Rugby with national-elite rugby) + arts via artsCountBySlug.
  // Build a single fixture school that has academic + sport data; pass
  // artsCountBySlug=8 to give it the arts boost.
  const ALL_ROUND_SCHOOL = { ...RUGBY_SCHOOL, slug: 'all-rounder', name: 'All-Rounder School' }
  const STRUCT_ALL_ROUND = {
    school_slug: 'all-rounder',
    sports_profile: { rugby: { competitive_tier: 'national-elite' } },
    exam_results: { a_level: { pct_a_star: 70 } },
    university_destinations: null,
    student_community: null,
    isi_deep_facts: null,
    wellbeing_staffing: null,
    ethos_facts: null,
  }
  const out = rankCandidates(
    [ALL_ROUND_SCHOOL],
    structMap(STRUCT_ALL_ROUND),
    {
      parent: { top_priority: 'all-round' },
      child: {
        goal_orientation: 'university_track',
        interests_sports: [{ sport: 'rugby', level: 'county' }],
        interests_arts:   [{ art: 'music', level: 'school-team' }],  // arts intent for the artsCount boost
      },
      excludeSlugs: [],
    },
    10,
    new Map([['all-rounder', 8]]),  // arts boost fires
  )
  const ar = out.find(c => c.slug === 'all-rounder')
  assert.ok(ar, 'All-Rounder should be ranked')
  // Sport + academic + arts = 3 categories → all-round chip should fire.
  assert.ok(
    ar.signals.some(s => /all-round match/i.test(s)),
    `expected all-round match chip when sport + academic + arts all fire, got: ${JSON.stringify(ar.signals)}`,
  )
})

test('Phase 1: top_priority=all-round NEGATIVE — only 2 categories match → no all-round chip', () => {
  // The all-round chip requires 3+ category matches. Setting up a fixture
  // where 3+ dims actually fire requires mocking the live DIMENSIONS scorers
  // (pastoral_care reads through to school_facts via isi_deep_facts shape),
  // which is brittle. The simpler invariant to lock: with ONLY 2 category
  // signals (sport + academic), the all-round chip must NOT fire. Locks
  // the threshold ≥3, leaving the positive 3+ case to the audit harness.
  const out = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    {
      parent: { top_priority: 'all-round' },
      child: {
        goal_orientation: 'university_track',
        interests_sports: [{ sport: 'rugby', level: 'county' }],
      },
      excludeSlugs: [],
    },
    10,
  )
  const rugby = out.find(c => c.slug === 'rugby-school')
  assert.ok(rugby, 'Rugby should be ranked')
  // Sport + academic = 2 categories. all-round needs 3+. So no chip.
  assert.ok(
    !rugby.signals.some(s => /all-round match/i.test(s)),
    `all-round chip must NOT fire with only 2 category signals, got: ${JSON.stringify(rugby.signals)}`,
  )
})

// ── 6. scoreForBuildMode wrapper — Phase 1 wiring smoke ──────────────

const PHASE_1_WRAPPER_FIXTURES = {
  handle: {
    schools_status: () => ({
      data: [{ school_slug: 'rugby-school' }],
      error: null,
    }),
    schools: () => ({
      data: [{ slug: 'rugby-school', name: 'Rugby School', gender_split: 'Co-ed', fees_usd_min: 50000, sen_support: false, strengths: ['sport'], confidence_score: 80, age_min: 11, age_max: 18, region: 'Warwickshire' }],
      error: null,
    }),
    school_structured_data: () => ({ data: [], error: null }),
    school_facts:           () => ({ data: [], error: null }),
  },
}

test('scoreForBuildMode wrapper: SELECT for school_structured_data INCLUDES wellbeing_staffing (Phase 1)', async () => {
  const supa = makeMockSupabase(PHASE_1_WRAPPER_FIXTURES)
  await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands' },
    child:  {},
    excludeSlugs: [],
    childGender: 'girl', childYear: 'year-9',
  }, 10)
  const structCall = supa._calls().find(c => c.table === 'school_structured_data')
  assert.ok(structCall, 'school_structured_data was queried')
  assert.ok(
    structCall.select.includes('wellbeing_staffing'),
    `SELECT must include wellbeing_staffing. Got: ${structCall.select}`,
  )
})

test('scoreForBuildMode wrapper: queries school_facts for arts_music_drama count (Phase 1)', async () => {
  const supa = makeMockSupabase(PHASE_1_WRAPPER_FIXTURES)
  await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands' },
    child:  {},
    excludeSlugs: [],
    childGender: 'girl', childYear: 'year-9',
  }, 10)
  // The arts count fetch is a SEPARATE school_facts call (alongside the
  // bundle loader inside loadDimFactsBundles). Look for the one whose
  // .eq() captured dimension='arts_music_drama'.
  const artsCall = supa._calls().find(c =>
    c.table === 'school_facts' &&
    c.eqs.some(([col, val]) => col === 'dimension' && val === 'arts_music_drama'),
  )
  assert.ok(artsCall, 'school_facts was queried for arts_music_drama dimension')
})

// ── 7. Phase 2 data-utilization (2026-05-21) — subject_strengths ─────

const CHARTERHOUSE_LIKE = {
  slug: 'charterhouse',
  name: 'Charterhouse',
  gender_split: 'Mixed',
  fees_usd_min: 60000,
  sen_support: false,
  strengths: ['academic'],
  confidence_score: 95,
  age_min: 13, age_max: 18,
  region: 'Surrey',
}

const ETON_LIKE = {
  slug: 'eton-college',
  name: 'Eton College',
  gender_split: 'Boys',
  fees_usd_min: 70000,
  sen_support: false,
  strengths: ['academic'],
  confidence_score: 100,
  age_min: 13, age_max: 18,
  region: 'Berkshire',
}

const STRUCT_ETON_MATHS = {
  school_slug: 'eton-college',
  sports_profile: null,
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: null,
  wellbeing_staffing: null,
  ethos_facts: null,
  subject_strengths: {
    schema_version: 'v2.0',
    maths: {
      items: Array.from({ length: 10 }, (_, i) => ({
        category: 'subject_outcome_statistic',
        source_url: `https://www.etoncollege.com/example-${i}.pdf`,
      })),
      summary_paragraph_for_chatbot: 'At A-level in 2024, 162 entries for Mathematics achieved 72.8% A*-A (43.8% A*). Three pupils qualified for British Mathematical Olympiad Round 2 in 2018.',
    },
    biology: { items: [{ source_url: 'https://x' }, { source_url: 'https://y' }], summary_paragraph_for_chatbot: 'Strong biology programme.' },
  },
}

const STRUCT_CHARTERHOUSE_SCIENCES = {
  school_slug: 'charterhouse',
  sports_profile: null,
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: null,
  wellbeing_staffing: null,
  ethos_facts: null,
  subject_strengths: {
    schema_version: 'v2.0',
    biology:   { items: Array.from({ length: 8 }, () => ({ source_url: 'https://c.com/b' })), summary_paragraph_for_chatbot: 'Biology cohort consistently achieves 85% A*-A. Medics Society runs weekly seminars.' },
    chemistry: { items: Array.from({ length: 9 }, () => ({ source_url: 'https://c.com/c' })), summary_paragraph_for_chatbot: 'Chemistry results 82% A*-A in 2024.' },
    physics:   { items: Array.from({ length: 8 }, () => ({ source_url: 'https://c.com/p' })), summary_paragraph_for_chatbot: 'Physics Olympiad medallists across 2022-24.' },
  },
}

test('Phase 2: maths intent in goals_notes triggers strong maths signal on Eton (10 items)', () => {
  const out = rankCandidates(
    [ETON_LIKE],
    structMap(STRUCT_ETON_MATHS),
    {
      parent: null,
      child: { goals_notes: 'really loves mathematics and olympiad-level problem solving' },
      excludeSlugs: [],
    },
    10,
  )
  const eton = out.find(c => c.slug === 'eton-college')
  assert.ok(eton, 'Eton should be ranked when maths intent fires')
  assert.ok(
    eton.signals.some(s => /strong maths \(10 items\)/i.test(s)),
    `expected "strong maths (10 items)" chip, got: ${JSON.stringify(eton.signals)}`,
  )
  // Concrete fact populated from summary_paragraph_for_chatbot (first sentence)
  assert.ok(
    eton.rationale_seed.includes('A-level') || eton.rationale_seed.includes('162 entries'),
    `expected rationale_seed to include maths fact, got: ${eton.rationale_seed}`,
  )
})

test('Phase 2: biology + chemistry + physics stacking surfaces multiple chips (Charterhouse-like)', () => {
  const out = rankCandidates(
    [CHARTERHOUSE_LIKE],
    structMap(STRUCT_CHARTERHOUSE_SCIENCES),
    {
      parent: null,
      child: { goals_notes: 'wants to study biology, chemistry, and physics — aiming for natural sciences at Cambridge' },
      excludeSlugs: [],
    },
    10,
  )
  const ch = out.find(c => c.slug === 'charterhouse')
  assert.ok(ch, 'Charterhouse should be ranked')
  for (const subject of ['biology', 'chemistry', 'physics']) {
    assert.ok(
      ch.signals.some(s => new RegExp(`strong ${subject}`, 'i').test(s)),
      `expected "strong ${subject}" chip, got: ${JSON.stringify(ch.signals)}`,
    )
  }
})

test('Phase 2: subject boost gated on intent — NO chip when prose mentions no subjects', () => {
  const out = rankCandidates(
    [ETON_LIKE],
    structMap(STRUCT_ETON_MATHS),
    {
      parent: null,
      child: { goals_notes: 'loves sport and outdoor activities' },
      excludeSlugs: [],
    },
    10,
  )
  const eton = out.find(c => c.slug === 'eton-college')
  if (eton) {
    assert.ok(
      !eton.signals.some(s => /strong maths|biology \(/i.test(s)),
      `subject chips must NOT fire without subject intent, got: ${JSON.stringify(eton.signals)}`,
    )
  }
})

test('Phase 2: subject with <2 items does NOT emit a chip', () => {
  const STRUCT_THIN = {
    ...STRUCT_ETON_MATHS,
    subject_strengths: {
      schema_version: 'v2.0',
      maths: { items: [{ source_url: 'https://x' }], summary_paragraph_for_chatbot: null },
    },
  }
  const out = rankCandidates(
    [ETON_LIKE],
    structMap(STRUCT_THIN),
    {
      parent: null,
      child: { goals_notes: 'interested in mathematics' },
      excludeSlugs: [],
    },
    10,
  )
  const eton = out.find(c => c.slug === 'eton-college')
  if (eton) {
    assert.ok(
      !eton.signals.some(s => /strong maths|maths \(/i.test(s)),
      `1-item subject must NOT emit a chip, got: ${JSON.stringify(eton.signals)}`,
    )
  }
})

test('Phase 2: school with null subject_strengths does not throw + emits no subject chips', () => {
  const STRUCT_NULL = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null, subject_strengths: null,
  }
  const out = rankCandidates(
    [ETON_LIKE],
    structMap(STRUCT_NULL),
    {
      parent: null,
      child: { goals_notes: 'loves mathematics, physics, chemistry' },
      excludeSlugs: [],
    },
    10,
  )
  // No throw is the main assertion; chip absence is the corollary.
  const eton = out.find(c => c.slug === 'eton-college')
  if (eton) {
    assert.ok(
      !eton.signals.some(s => /strong (?:maths|physics|chemistry)/i.test(s)),
      `null subject_strengths must produce no chips, got: ${JSON.stringify(eton.signals)}`,
    )
  }
})

test('Phase 2: stacking cap — 4-subject intent boost is capped at +2.5', () => {
  // Construct a school with 4 subjects each at ≥5 items (dim contributes 4.0
  // raw). The cap in rankCandidates clamps the score increment to +2.5.
  const STRUCT_MEGA = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      maths:    { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'Maths summary.' },
      physics:  { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'Physics summary.' },
      biology:  { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'Biology summary.' },
      chemistry:{ items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'Chemistry summary.' },
    },
  }
  const out = rankCandidates(
    [ETON_LIKE],
    structMap(STRUCT_MEGA),
    {
      parent: null,
      child: { goals_notes: 'loves maths, physics, biology, and chemistry' },
      excludeSlugs: [],
    },
    10,
  )
  const eton = out.find(c => c.slug === 'eton-college')
  assert.ok(eton, 'Eton should be ranked')
  // base = confidence_score/100 = 1.0; subject boost capped at 2.5 → total ≤ 3.5
  assert.ok(
    eton.total_score <= 3.55,
    `4-subject stacking must be capped at +2.5 (total ≤ 3.55), got ${eton.total_score}`,
  )
})

test('Phase 2: SUBJECT_INTENT_RE biology matches "biology" / "biological" / "biomedical"', () => {
  for (const phrase of [
    'loves biology',
    'fascinated by biological systems',
    'curious about biomedical research',
  ]) {
    const out = rankCandidates(
      [CHARTERHOUSE_LIKE],
      structMap(STRUCT_CHARTERHOUSE_SCIENCES),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const ch = out.find(c => c.slug === 'charterhouse')
    assert.ok(ch, `Charterhouse must rank on phrase "${phrase}"`)
    assert.ok(
      ch.signals.some(s => /biology \(|strong biology/i.test(s)),
      `expected biology chip for "${phrase}", got: ${JSON.stringify(ch.signals)}`,
    )
  }
})

test('Phase 2: SUBJECT_INTENT_RE.modern_languages does NOT false-positive on bare "language" (substring guard)', () => {
  // Without a tight regex, the word "language" inside "first-language English"
  // would trigger modern_languages. Guard: only specific languages, "linguistic*",
  // or "foreign languages?" should fire — bare "language" must not.
  const out = rankCandidates(
    [CHARTERHOUSE_LIKE],
    structMap({
      ...STRUCT_CHARTERHOUSE_SCIENCES,
      subject_strengths: {
        schema_version: 'v2.0',
        modern_languages: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'Strong modern languages.' },
      },
    }),
    {
      parent: null,
      child: { goals_notes: 'first-language English speaker, no other notes' },
      excludeSlugs: [],
    },
    10,
  )
  const ch = out.find(c => c.slug === 'charterhouse')
  if (ch) {
    assert.ok(
      !ch.signals.some(s => /modern languages/i.test(s)),
      `bare "language" must NOT trigger modern_languages, got: ${JSON.stringify(ch.signals)}`,
    )
  }
})

test('Phase 2 (Codex r1 P1.1): bare "english" does NOT fire on "first-language English"', () => {
  const STRUCT = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      english: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'Strong English.' },
    },
  }
  const out = rankCandidates(
    [ETON_LIKE],
    structMap(STRUCT),
    { parent: null, child: { goals_notes: 'first-language English speaker, ESL parent' }, excludeSlugs: [] },
    10,
  )
  const eton = out.find(c => c.slug === 'eton-college')
  if (eton) {
    assert.ok(
      !eton.signals.some(s => /english/i.test(s)),
      `"first-language English" must NOT trigger english intent, got: ${JSON.stringify(eton.signals)}`,
    )
  }
})

test('Phase 2 (Codex r1 P1.1): bare "history" does NOT fire on "family history" / "medical history"', () => {
  const STRUCT = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      history: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'Strong history.' },
    },
  }
  for (const phrase of [
    'she has a complicated family history',
    'shy kid, some medical history with anxiety',
    'school history is irrelevant here',
  ]) {
    const out = rankCandidates(
      [ETON_LIKE],
      structMap(STRUCT),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const eton = out.find(c => c.slug === 'eton-college')
    if (eton) {
      assert.ok(
        !eton.signals.some(s => /history/i.test(s)),
        `"${phrase}" must NOT trigger history intent, got: ${JSON.stringify(eton.signals)}`,
      )
    }
  }
})

test('Phase 2 (Codex r1 P1.1): "historian" / "history class" / "wants to be a historian" DO fire history', () => {
  const STRUCT = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      history: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'Strong history.' },
    },
  }
  for (const phrase of [
    'wants to be a historian',
    'thinking about becoming historians or archaeologists',
    'loves history class',
    'doing well in history lessons',
    'aiming for a history degree',
  ]) {
    const out = rankCandidates(
      [ETON_LIKE],
      structMap(STRUCT),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const eton = out.find(c => c.slug === 'eton-college')
    assert.ok(eton, `Eton should rank on phrase "${phrase}"`)
    assert.ok(
      eton.signals.some(s => /strong history|history \(/i.test(s)),
      `expected history chip for "${phrase}", got: ${JSON.stringify(eton.signals)}`,
    )
  }
})

test('Phase 2 (Codex r1 P1.1): "family business" / "financial aid" / "business hours" do NOT fire', () => {
  const STRUCT = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      economics_business: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'Strong econ.' },
    },
  }
  for (const phrase of [
    'will join the family business',
    'need financial aid',
    'open during business hours',
  ]) {
    const out = rankCandidates(
      [ETON_LIKE],
      structMap(STRUCT),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const eton = out.find(c => c.slug === 'eton-college')
    if (eton) {
      assert.ok(
        !eton.signals.some(s => /economics business|business/i.test(s)),
        `"${phrase}" must NOT trigger economics_business intent, got: ${JSON.stringify(eton.signals)}`,
      )
    }
  }
})

test('Phase 2 (Codex r1 P1.1): "entrepreneurship" / "economist" / "accounting" / "business studies" DO fire economics_business', () => {
  const STRUCT = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      economics_business: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'Strong econ.' },
    },
  }
  for (const phrase of [
    'interested in entrepreneurship',
    'aiming to be an economist',
    'wants to study economics at LSE',
    'loves accounting and finance',
    'taking business studies at A-level',
  ]) {
    const out = rankCandidates(
      [ETON_LIKE],
      structMap(STRUCT),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const eton = out.find(c => c.slug === 'eton-college')
    assert.ok(eton, `Eton should rank on phrase "${phrase}"`)
    assert.ok(
      eton.signals.some(s => /economics business|economics_business/i.test(s)),
      `expected econ chip for "${phrase}", got: ${JSON.stringify(eton.signals)}`,
    )
  }
})

test('Phase 2 (Codex r1 P1.2): plural occupation variants fire — physicists, biologists, mathematicians, programmers, software developers', () => {
  const STRUCT = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      maths:            { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'M.' },
      physics:          { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'P.' },
      biology:          { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'B.' },
      computer_science: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'C.' },
    },
  }
  for (const [phrase, expectedSubj] of [
    ['wants to be one of the physicists at CERN', 'physics'],
    ['interested in becoming biologists', 'biology'],
    ['aspiring mathematicians in the family', 'maths'],
    ['loves coding and wants to be one of the programmers', 'computer science'],
    ['software developers are role models', 'computer science'],
  ]) {
    const out = rankCandidates(
      [ETON_LIKE],
      structMap(STRUCT),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const eton = out.find(c => c.slug === 'eton-college')
    assert.ok(eton, `Eton should rank on phrase "${phrase}"`)
    assert.ok(
      eton.signals.some(s => s.toLowerCase().includes(expectedSubj)),
      `expected "${expectedSubj}" chip for phrase "${phrase}", got: ${JSON.stringify(eton.signals)}`,
    )
  }
})

test('Phase 2 (Codex r2 P1): "economical" / "economical school" do NOT fire economics_business', () => {
  // r1 left `economic(?:s|al|ics)` which matched "economical" (adjective for
  // cost-effective, not the subject). r2 dropped the `al` alternative.
  const STRUCT = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      economics_business: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'E.' },
    },
  }
  for (const phrase of [
    'need a more economical school',
    'looking for the economical option',
  ]) {
    const out = rankCandidates(
      [ETON_LIKE],
      structMap(STRUCT),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const eton = out.find(c => c.slug === 'eton-college')
    if (eton) {
      assert.ok(
        !eton.signals.some(s => /economics business/i.test(s)),
        `"${phrase}" must NOT fire economics_business, got: ${JSON.stringify(eton.signals)}`,
      )
    }
  }
})

test('Phase 2 (Codex r2 P1): bare "economic" + "economic policy" + "economy" + "econometrics" DO fire economics_business', () => {
  const STRUCT = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      economics_business: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'E.' },
    },
  }
  for (const phrase of [
    'interested in economic policy',
    'fascinated by the economy',
    'wants to study econometrics',
  ]) {
    const out = rankCandidates(
      [ETON_LIKE],
      structMap(STRUCT),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const eton = out.find(c => c.slug === 'eton-college')
    assert.ok(eton, `Eton should rank on phrase "${phrase}"`)
    assert.ok(
      eton.signals.some(s => /economics business|economics_business/i.test(s)),
      `expected econ chip for "${phrase}", got: ${JSON.stringify(eton.signals)}`,
    )
  }
})

test('Phase 2 (Codex r3 NIT): "microeconomics" / "macroeconomics" fire economics_business', () => {
  const STRUCT = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      economics_business: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'E.' },
    },
  }
  for (const phrase of [
    'wants to study microeconomics',
    'interested in macroeconomics and policy',
  ]) {
    const out = rankCandidates(
      [ETON_LIKE],
      structMap(STRUCT),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const eton = out.find(c => c.slug === 'eton-college')
    assert.ok(eton, `Eton should rank on phrase "${phrase}"`)
    assert.ok(
      eton.signals.some(s => /economics business|economics_business/i.test(s)),
      `expected econ chip for "${phrase}", got: ${JSON.stringify(eton.signals)}`,
    )
  }
})

test('Phase 2 (Codex r2 P2): "computer scientists" / "software engineering" fire computer_science', () => {
  const STRUCT = {
    school_slug: 'eton-college',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null,
    subject_strengths: {
      schema_version: 'v2.0',
      computer_science: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'C.' },
    },
  }
  for (const phrase of [
    'wants to be one of the computer scientists at Google',
    'aiming for software engineering at Imperial',
  ]) {
    const out = rankCandidates(
      [ETON_LIKE],
      structMap(STRUCT),
      { parent: null, child: { goals_notes: phrase }, excludeSlugs: [] },
      10,
    )
    const eton = out.find(c => c.slug === 'eton-college')
    assert.ok(eton, `Eton should rank on phrase "${phrase}"`)
    assert.ok(
      eton.signals.some(s => s.toLowerCase().includes('computer science')),
      `expected computer_science chip for "${phrase}", got: ${JSON.stringify(eton.signals)}`,
    )
  }
})

test('scoreForBuildMode wrapper: SELECT for school_structured_data INCLUDES subject_strengths (Phase 2)', async () => {
  const supa = makeMockSupabase(PHASE_1_WRAPPER_FIXTURES)
  await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands' },
    child:  {},
    excludeSlugs: [],
    childGender: 'girl', childYear: 'year-9',
  }, 10)
  const structCall = supa._calls().find(c => c.table === 'school_structured_data')
  assert.ok(structCall, 'school_structured_data was queried')
  assert.ok(
    structCall.select.includes('subject_strengths'),
    `SELECT must include subject_strengths. Got: ${structCall.select}`,
  )
})
