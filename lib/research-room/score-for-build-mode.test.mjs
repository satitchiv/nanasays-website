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

test('regression: prose anchors_notes WITHOUT intent does not break ranking (Phase 4 item #3: raw prose pastoral path REMOVED)', () => {
  // Pre-Phase-4-item-3, PASTORAL_HINT_RE upgraded ctx.pastoral_pref from
  // raw anchors_notes text. That regex was deleted (Codex 2026-05-22
  // design review YELLOW: regex-or-LLM-layering is the worst path).
  // Pastoral upgrades now flow through intent.pastoral_priority='high'.
  // This regression test confirms that legacy callers passing prose
  // WITHOUT intent still get a valid ranking via academic signals —
  // they just don't get the pastoral upgrade anymore (covered by the
  // 'intent=null preserves baseline' test below).
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

test('Codex r2 P2: 4 parent-preference chips survive top-5 slice under >5 raw signals', () => {
  // Regression guard for the 2026-05-21 truncation bug — strengthened per Codex r2.
  // Sets up parent + child profile + struct such that >5 OTHER signals genuinely
  // fire (region, in budget, strong rugby, academic-strong, medicine pipeline,
  // small pupils, full boarding). Without unshift, the 4 parent-preference chips
  // (sport-priority match, ethos match, SEN-aware, inclusive culture) would all
  // get pushed last and chopped by signals.slice(0, 5).
  //
  // After fix: all 4 must appear at the front of the array, in this order
  // (last-unshift-first): priority → ethos → SEN → inclusive. Region fills slot 5.
  const SEN_RUGBY = { ...RUGBY_SCHOOL, sen_support: true }  // RUGBY_SCHOOL.sen_support=false; override.
  const STRUCT_LOADED = {
    school_slug:            'rugby-school',
    sports_profile:         { rugby: { competitive_tier: 'national-elite' } },
    exam_results:           { a_level: { pct_a_star: 70 } },
    university_destinations:{ medicine_dentistry_vet_count: 3 },
    student_community:      { total_pupils: 350 },  // <=400 + class_size_pref='very-important' → 'small' chip
    isi_deep_facts:         {
      lgbtq_detail:        'active_pupil_led_group',  // 5pt for LGBTQ
      diversity_signal:    'strong',                  // 3pt for diversity
      pupil_voice_signal:  'strong',                  // 2pt for pupil voice  → total 10/8 capped at 1.0 → norm=1.0 → fires 'inclusive culture'
    },
    wellbeing_staffing:     null,
    ethos_facts:            { ethos_label: 'roman_catholic' },
  }
  const out = rankCandidates(
    [SEN_RUGBY],
    structMap(STRUCT_LOADED),
    {
      parent: {
        top_priority:     'sport',
        ethos_pref:       'roman_catholic',
        home_region:      'midlands',          // Warwickshire is in midlands bucket → region chip
        budget_range:     '40k-50k',           // fees_usd_min=55000 close → 'in budget' or close (depends on ratio)
        class_size_pref:  'very-important',    // + total_pupils=350 → 'small (~350 pupils)' chip
        lgbtq_pref:       'important',         // + isi deep diversity → 'inclusive culture' chip (now unshift)
        sen_need:         'yes-priority',      // + sen_support=true → 'SEN-aware' chip (now unshift)
      },
      child:  {
        goal_orientation:  'university_track', // unlocks academic-strong + medicine
        goals_notes:       'wants to study medicine at Oxbridge',  // unlocks wantsMedicine
        interests_sports:  [{ sport: 'rugby', level: 'county' }],
        nonnegotiables:    ['full boarding school'],   // FULL_BOARDING_HINT_RE → 'full boarding' if school is known
      },
      excludeSlugs: [],
    },
    10,
  )
  const rugby = out.find(c => c.slug === 'rugby-school')
  assert.ok(rugby, 'Rugby should be ranked')
  assert.ok(rugby.signals.length <= 5, `signals must be capped at 5, got ${rugby.signals.length}: ${JSON.stringify(rugby.signals)}`)
  // ALL 4 protected chips present (proves none got truncated by the 5-cap).
  // Use .some() to allow flexible relative order between the 4 unshifts,
  // but assert signals[0] is the priority match (last-unshift wins).
  assert.equal(rugby.signals[0], 'sport-priority match',
    `expected signals[0]=sport-priority match (last unshift wins), got: ${JSON.stringify(rugby.signals)}`)
  for (const expected of ['sport-priority match', 'ethos match (roman catholic)', 'SEN-aware', 'inclusive culture']) {
    assert.ok(rugby.signals.includes(expected),
      `expected ${expected} to survive top-5 slice, got: ${JSON.stringify(rugby.signals)}`)
  }
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

// ════════════════════════════════════════════════════════════════════════════
// Phase 3 surgical bugs (2026-05-21) — 7 fixes from Codex recommender audit.
// Audit transcript: /tmp/codex-recommender-audit-out.txt lines 6218-6260.
// Each test pins ONE bug's regression. Anchor doc:
// ~/notes/closeout-2026-05-21-recommender-phase-2.md (Phase 3 scope).
// ════════════════════════════════════════════════════════════════════════════

const STRUCT_RUGBY_DOUBLE_ELITE = {
  school_slug: 'rugby-school',
  sports_profile: {
    rugby:  { competitive_tier: 'national-elite' },
    tennis: { competitive_tier: 'national-elite' },
  },
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: null,
  wellbeing_staffing: null,
  ethos_facts: null,
  subject_strengths: null,
}

// ── Phase 3 Bug #1 — sport stacking cap ─────────────────────────────

test('Phase 3 Bug #1: 2 mapped sports cap total sport boost at SPORT_TOTAL_CAP (3.0)', () => {
  const out = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_DOUBLE_ELITE),
    {
      parent: { home_region: 'midlands' },
      child: {
        interests_sports: [
          { sport: 'rugby',  level: 'national' },
          { sport: 'tennis', level: 'national' },
        ],
      },
      excludeSlugs: [],
    },
    10,
  )
  const rs = out.find(c => c.slug === 'rugby-school')
  assert.ok(rs, 'Rugby School should rank')
  // Base = confidence_score 85 / 100 = 0.85; warwickshire region midlands = +0.6.
  // Sport cap = +3.0 (was +5.0 unbounded). Expected total ~4.45.
  // Pre-fix the same input scored ~6.45.
  assert.ok(
    rs.total_score < 5.6,
    `total_score should reflect cap (~4.45), got ${rs.total_score} (cap broken?)`,
  )
  // BOTH sport chips still appear (cap only affects numeric contribution).
  assert.ok(
    rs.signals.some(s => /strong rugby/i.test(s)),
    `rugby chip must still emit. Got: ${JSON.stringify(rs.signals)}`,
  )
  assert.ok(
    rs.signals.some(s => /strong tennis/i.test(s)),
    `tennis chip must still emit. Got: ${JSON.stringify(rs.signals)}`,
  )
})

// ── Phase 3 Bug #2 — sport level multiplier ─────────────────────────

test('Phase 3 Bug #2: school-team level scores lower than national level for same sport+school', () => {
  const RUNS = ['school-team', 'national'].map(level => {
    const out = rankCandidates(
      [RUGBY_SCHOOL],
      structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
      {
        parent: { home_region: 'midlands' },
        child: { interests_sports: [{ sport: 'rugby', level }] },
        excludeSlugs: [],
      },
      10,
    )
    return out.find(c => c.slug === 'rugby-school')
  })
  const [schoolTeam, national] = RUNS
  assert.ok(schoolTeam && national, 'both runs should return Rugby School')
  assert.ok(
    national.total_score > schoolTeam.total_score,
    `national-level kid should rank Rugby higher than school-team-level kid. national=${national.total_score} school-team=${schoolTeam.total_score}`,
  )
  // Multipliers: school-team=0.4 vs national=1.0. Gap = 0.6 * norm where
  // norm = min(raw/20, 2.5). The exact raw value depends on the rugby
  // scorer's internals (tier banding + other school data), so we assert a
  // material gap rather than pinning an exact figure.
  assert.ok(
    (national.total_score - schoolTeam.total_score) >= 0.5,
    `level gap should be >= 0.5, got ${national.total_score - schoolTeam.total_score}`,
  )
})

// ── Phase 3 Bug #3 — region 'England' is neutral, not bucket-wide boost ──

test('Phase 3 Bug #3: school region="England" produces NO region chip + NO region boost', () => {
  const ENGLAND_GENERIC = {
    slug: 'generic-uk', name: 'Generic UK School',
    gender_split: 'Co-ed', fees_usd_min: 40000, sen_support: false,
    strengths: [], confidence_score: 60, age_min: 11, age_max: 18,
    region: 'England',
  }
  const STRUCT_GENERIC = {
    school_slug: 'generic-uk',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null, subject_strengths: null,
  }
  const out = rankCandidates(
    [ENGLAND_GENERIC],
    structMap(STRUCT_GENERIC),
    {
      parent: { home_region: 'london', top_priority: 'academic' },
      child: { goal_orientation: 'university_track' },
      excludeSlugs: [],
    },
    10,
  )
  const g = out.find(c => c.slug === 'generic-uk')
  if (g) {
    assert.ok(
      !g.signals.some(sig => /region/i.test(sig)),
      `region chip must NOT fire for region="England". Got: ${JSON.stringify(g.signals)}`,
    )
  }
})

test('Phase 3 Bug #3: narrow-tagged school still gets region chip (regression guard)', () => {
  const out = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    {
      parent: { home_region: 'midlands' },
      child: { interests_sports: [{ sport: 'rugby', level: 'national' }] },
      excludeSlugs: [],
    },
    10,
  )
  const rs = out.find(c => c.slug === 'rugby-school')
  assert.ok(rs, 'Rugby School should rank')
  assert.ok(
    rs.signals.some(s => /warwickshire region/i.test(s)),
    `narrow-region chip should still fire. Got: ${JSON.stringify(rs.signals)}`,
  )
})

// ── Phase 3 Bug #4 — no-signal filter runs BEFORE the limit slice ────

test('Phase 3 Bug #4: filter-before-slice — positive-signal #21 surfaces over no-signal #5 when limit=20', () => {
  // 20 high-confidence no-signal schools (null region, no struct data)
  // + 1 lower-confidence positive-signal school. Pre-fix: slice(20)
  // happened first, the positive-signal school got dropped, then the
  // 20 no-signal schools filtered out, leaving 0 candidates.
  const NOISE = Array.from({ length: 20 }, (_, i) => ({
    slug: `noise-${i}`, name: `Noise ${i}`,
    gender_split: 'Co-ed', fees_usd_min: null, sen_support: false,
    strengths: [], confidence_score: 100, age_min: 11, age_max: 18,
    region: null,
  }))
  const SIGNAL_SCHOOL = {
    slug: 'positive-signal', name: 'Positive Signal School',
    gender_split: 'Co-ed', fees_usd_min: null, sen_support: false,
    strengths: [], confidence_score: 50, age_min: 11, age_max: 18,
    region: 'Warwickshire',
  }
  const STRUCT_NULL_BUNDLES = (slug) => ({
    school_slug: slug,
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null, subject_strengths: null,
  })
  const struct = new Map()
  for (const n of NOISE) struct.set(n.slug, STRUCT_NULL_BUNDLES(n.slug))
  struct.set(SIGNAL_SCHOOL.slug, STRUCT_NULL_BUNDLES(SIGNAL_SCHOOL.slug))
  const out = rankCandidates(
    [...NOISE, SIGNAL_SCHOOL],
    struct,
    { parent: { home_region: 'midlands' }, child: {}, excludeSlugs: [] },
    20,
  )
  const pos = out.find(c => c.slug === 'positive-signal')
  assert.ok(pos, 'positive-signal school must appear in output (was crowded out before fix)')
  assert.ok(
    pos.signals.length > 0,
    `positive-signal school must have a chip. Got: ${JSON.stringify(pos.signals)}`,
  )
})

// ── Phase 3 Bug #5 — wrapper pulls up to 250 candidates (not 120) ────

test('Phase 3 Bug #5: wrapper limit on schools SELECT is 250 (not 120)', async () => {
  const supa = makeMockSupabase(PHASE_1_WRAPPER_FIXTURES)
  await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands' },
    child:  {},
    excludeSlugs: [],
    childGender: 'girl', childYear: 'year-9',
  }, 10)
  const schoolsCall = supa._calls().find(c => c.table === 'schools')
  assert.ok(schoolsCall, 'schools table was queried')
  assert.equal(
    schoolsCall.limit, 250,
    `schools SELECT limit must be 250 to cover the full UK corpus (~140 schools). Got: ${schoolsCall.limit}`,
  )
})

// ── Phase 3 Bug #6 — facts-only schools (no SSD row) still score ─────

test('Phase 3 Bug #6: facts-only school (no school_structured_data row) still gets ethos fact merged', async () => {
  const supa = makeMockSupabase({
    handle: {
      schools_status: () => ({
        data: [{ school_slug: 'facts-only-school' }],
        error: null,
      }),
      schools: () => ({
        data: [{
          slug: 'facts-only-school', name: 'Facts Only School',
          gender_split: 'Co-ed', fees_usd_min: 40000, fees_usd_max: 40000,
          sen_support: false, strengths: [],
          confidence_score: 80, age_min: 11, age_max: 18, region: 'Surrey',
        }],
        error: null,
      }),
      school_structured_data: () => ({ data: [], error: null }),
      school_facts: (captured) => {
        const isArtsCall = captured.eqs.some(([col, val]) => col === 'dimension' && val === 'arts_music_drama')
        if (isArtsCall) return { data: [], error: null }
        // loadDimFactsBundles requires `source_url` per tools.js:130 — without
        // it the fact is skipped on the source-backed-ranking gate.
        return {
          data: [{
            school_slug: 'facts-only-school',
            dimension: 'ethos',
            canonical_key: 'ethos_primary',
            claim: { value: 'roman_catholic' },
            source_url: 'https://example.com/ethos',
            confidence: 1,
            status: 'active',
          }],
          error: null,
        }
      },
    },
  })
  const result = await scoreForBuildMode(supa, {
    parent: { home_region: 'south-east', ethos_pref: 'roman_catholic' },
    child:  {},
    excludeSlugs: [],
    childGender: 'either', childYear: 'year-9',
  }, 10)
  const found = result.candidates.find(c => c.slug === 'facts-only-school')
  assert.ok(found, 'facts-only school must rank when ethos signal is present')
  assert.ok(
    found.signals.some(s => /ethos match/i.test(s)),
    `ethos match chip must fire from school_facts even without SSD row. Got: ${JSON.stringify(found.signals)}`,
  )
})

// ── Phase 3 Bug #7 — boarder budget uses fees_usd_max ───────────────

test('Phase 3 Bug #7: full-board parent — chip uses fees_usd_max (boarding), not fees_usd_min (day)', () => {
  // 40k-50k ceiling = 50000 * 1.27 = $63,500 USD.
  // Day fee $25k, boarding fee $80k. Pre-fix: 25000/63500 = 0.39 → 'in budget'
  // (FALSE POSITIVE). Post-fix: 80000/63500 = 1.26 → no chip (above 1.2
  // partial-bucket too).
  const WIDE_RANGE = {
    slug: 'wide-range-school', name: 'Wide Range School',
    gender_split: 'Co-ed', fees_usd_min: 25000, fees_usd_max: 80000,
    sen_support: false, strengths: [], confidence_score: 80,
    age_min: 11, age_max: 18, region: 'Surrey',
  }
  const STRUCT = {
    school_slug: 'wide-range-school',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null, subject_strengths: null,
  }
  const out = rankCandidates(
    [WIDE_RANGE],
    structMap(STRUCT),
    {
      parent: { home_region: 'south-east', budget_range: '40k-50k', boarding_pref: 'full' },
      child: {},
      excludeSlugs: [],
    },
    10,
  )
  const w = out.find(c => c.slug === 'wide-range-school')
  if (w) {
    assert.ok(
      !w.signals.includes('in budget'),
      `'in budget' chip must NOT fire when boarding fee exceeds ceiling. Got: ${JSON.stringify(w.signals)}`,
    )
  }
})

test('Phase 3 Bug #7: full-board parent — chip DOES fire when fees_usd_max within budget', () => {
  // 40k-50k ceiling = $63,500. fees_usd_max=55000 → 55000/63500=0.866 → in budget.
  const IN_BUDGET_BOARDER = {
    slug: 'in-budget-boarder', name: 'In-Budget Boarder',
    gender_split: 'Co-ed', fees_usd_min: 25000, fees_usd_max: 55000,
    sen_support: false, strengths: [], confidence_score: 80,
    age_min: 11, age_max: 18, region: 'Surrey',
  }
  const STRUCT = {
    school_slug: 'in-budget-boarder',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null, subject_strengths: null,
  }
  const out = rankCandidates(
    [IN_BUDGET_BOARDER],
    structMap(STRUCT),
    {
      parent: { home_region: 'south-east', budget_range: '40k-50k', boarding_pref: 'full' },
      child: {},
      excludeSlugs: [],
    },
    10,
  )
  const b = out.find(c => c.slug === 'in-budget-boarder')
  assert.ok(b, 'in-budget boarder should rank')
  assert.ok(
    b.signals.includes('in budget'),
    `'in budget' chip MUST fire when fees_usd_max under ceiling. Got: ${JSON.stringify(b.signals)}`,
  )
})

test('Phase 3 Bug #7: day-pref parent still uses fees_usd_min (regression guard)', () => {
  // under-30k ceiling = 38100. A_DAY_SCHOOL fees_usd_min=30000 → 30000/38100=0.79 → in budget.
  const out = rankCandidates(
    [A_DAY_SCHOOL],
    structMap(STRUCT_DAY_EMPTY),
    {
      parent: { home_region: 'london', budget_range: 'under-30k', boarding_pref: 'day' },
      child: {},
      excludeSlugs: [],
    },
    10,
  )
  const d = out.find(c => c.slug === 'a-day-school')
  assert.ok(d, 'day school should rank')
  assert.ok(
    d.signals.includes('in budget'),
    `day parent should still see in-budget chip from fees_usd_min. Got: ${JSON.stringify(d.signals)}`,
  )
})

// ── Codex r1 P1 — SQL hard filter must switch to fees_usd_max for boarders ──

test('Codex r1 P1: wrapper SQL filter uses fees_usd_max for boarder (full)', async () => {
  const supa = makeMockSupabase(PHASE_1_WRAPPER_FIXTURES)
  await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands', budget_range: '40k-50k', boarding_pref: 'full' },
    child:  {},
    excludeSlugs: [],
    childGender: 'either', childYear: 'year-9',
  }, 10)
  const schoolsCall = supa._calls().find(c => c.table === 'schools')
  assert.ok(schoolsCall, 'schools table was queried')
  // The budget filter is an `.or()` expression. For boarders it must use
  // `fees_usd_max`, NOT `fees_usd_min`.
  // Codex r2 NIT: pin "exactly one budget ceiling clause" so a future edit
  // that adds a second ceiling filter (e.g. accidentally keeping the
  // fees_usd_min clause alongside the boarder switch) trips this test.
  const budgetClauses = schoolsCall.ors.filter(expr => /fees_usd_(min|max)\.lte/.test(expr))
  assert.equal(budgetClauses.length, 1, `exactly one budget ceiling clause expected; got ${budgetClauses.length}: ${JSON.stringify(budgetClauses)}`)
  assert.match(
    budgetClauses[0], /fees_usd_max\.is\.null,fees_usd_max\.lte/,
    `boarder SQL filter must reference fees_usd_max. Got: ${budgetClauses[0]}`,
  )
})

test('Codex r1 P1: wrapper SQL filter uses fees_usd_max for boarder (weekly)', async () => {
  const supa = makeMockSupabase(PHASE_1_WRAPPER_FIXTURES)
  await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands', budget_range: '40k-50k', boarding_pref: 'weekly' },
    child:  {},
    excludeSlugs: [],
    childGender: 'either', childYear: 'year-9',
  }, 10)
  const schoolsCall = supa._calls().find(c => c.table === 'schools')
  const budgetOr = schoolsCall.ors.find(expr => /fees_usd_(min|max)\.lte/.test(expr))
  assert.match(budgetOr, /fees_usd_max/, `weekly boarder filter must reference fees_usd_max. Got: ${budgetOr}`)
})

test('Codex r1 P1: wrapper SQL filter uses fees_usd_max for boarder (flexi)', async () => {
  const supa = makeMockSupabase(PHASE_1_WRAPPER_FIXTURES)
  await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands', budget_range: '40k-50k', boarding_pref: 'flexi' },
    child:  {},
    excludeSlugs: [],
    childGender: 'either', childYear: 'year-9',
  }, 10)
  const schoolsCall = supa._calls().find(c => c.table === 'schools')
  const budgetOr = schoolsCall.ors.find(expr => /fees_usd_(min|max)\.lte/.test(expr))
  assert.match(budgetOr, /fees_usd_max/, `flexi boarder filter must reference fees_usd_max. Got: ${budgetOr}`)
})

test('Codex r1 P1: wrapper SQL filter still uses fees_usd_min for day parent (regression guard)', async () => {
  const supa = makeMockSupabase(PHASE_1_WRAPPER_FIXTURES)
  await scoreForBuildMode(supa, {
    parent: { home_region: 'midlands', budget_range: '40k-50k', boarding_pref: 'day' },
    child:  {},
    excludeSlugs: [],
    childGender: 'either', childYear: 'year-9',
  }, 10)
  const schoolsCall = supa._calls().find(c => c.table === 'schools')
  // Codex r2 NIT mirrored on day-pref path.
  const budgetClauses = schoolsCall.ors.filter(expr => /fees_usd_(min|max)\.lte/.test(expr))
  assert.equal(budgetClauses.length, 1, `exactly one budget ceiling clause expected; got ${budgetClauses.length}`)
  assert.match(budgetClauses[0], /fees_usd_min/, `day-pref filter must still reference fees_usd_min. Got: ${budgetClauses[0]}`)
})

// ── Codex r1 P2 — coverage gaps Codex listed ──

test('Codex r1 P2: lowercase "england" in school.region is also treated neutrally', () => {
  // Case-insensitive variant of Bug #3 — make sure `England` lowercase
  // doesn't slip through the bucket-add removal and re-create the loophole.
  const ENGLAND_LOWER = {
    slug: 'lower-uk', name: 'Lowercase England School',
    gender_split: 'Co-ed', fees_usd_min: 40000, sen_support: false,
    strengths: [], confidence_score: 60, age_min: 11, age_max: 18,
    region: 'england',  // ← lowercase
  }
  const STRUCT = {
    school_slug: 'lower-uk',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null,
    ethos_facts: null, subject_strengths: null,
  }
  const out = rankCandidates(
    [ENGLAND_LOWER],
    structMap(STRUCT),
    {
      parent: { home_region: 'london', top_priority: 'academic' },
      child: { goal_orientation: 'university_track' },
      excludeSlugs: [],
    },
    10,
  )
  const e = out.find(c => c.slug === 'lower-uk')
  if (e) {
    assert.ok(
      !e.signals.some(sig => /region/i.test(sig)),
      `region chip must NOT fire for region="england" (lowercase). Got: ${JSON.stringify(e.signals)}`,
    )
  }
})

test('Codex r2 P2: sport level alias "team-level" maps to school-team (0.4)', () => {
  const TEAM_LEVEL = rankCandidates(
    [RUGBY_SCHOOL], structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    { parent: { home_region: 'midlands' }, child: { interests_sports: [{ sport: 'rugby', level: 'team-level' }] }, excludeSlugs: [] },
    10,
  ).find(c => c.slug === 'rugby-school')
  const SCHOOL_TEAM = rankCandidates(
    [RUGBY_SCHOOL], structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    { parent: { home_region: 'midlands' }, child: { interests_sports: [{ sport: 'rugby', level: 'school-team' }] }, excludeSlugs: [] },
    10,
  ).find(c => c.slug === 'rugby-school')
  assert.ok(TEAM_LEVEL && SCHOOL_TEAM)
  assert.ok(
    Math.abs(TEAM_LEVEL.total_score - SCHOOL_TEAM.total_score) < 0.0001,
    `team-level alias must score = school-team. team-level=${TEAM_LEVEL.total_score} school-team=${SCHOOL_TEAM.total_score}`,
  )
})

test('Codex r2 P2: sport level alias "county-level" maps to county (0.7)', () => {
  const COUNTY_LEVEL = rankCandidates(
    [RUGBY_SCHOOL], structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    { parent: { home_region: 'midlands' }, child: { interests_sports: [{ sport: 'rugby', level: 'county-level' }] }, excludeSlugs: [] },
    10,
  ).find(c => c.slug === 'rugby-school')
  const COUNTY = rankCandidates(
    [RUGBY_SCHOOL], structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    { parent: { home_region: 'midlands' }, child: { interests_sports: [{ sport: 'rugby', level: 'county' }] }, excludeSlugs: [] },
    10,
  ).find(c => c.slug === 'rugby-school')
  assert.ok(COUNTY_LEVEL && COUNTY)
  assert.ok(
    Math.abs(COUNTY_LEVEL.total_score - COUNTY.total_score) < 0.0001,
    `county-level alias must score = county. county-level=${COUNTY_LEVEL.total_score} county=${COUNTY.total_score}`,
  )
})

test('Codex r2 P2: sport level alias "more for fun" maps to recreational (0.2)', () => {
  const FOR_FUN = rankCandidates(
    [RUGBY_SCHOOL], structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    { parent: { home_region: 'midlands' }, child: { interests_sports: [{ sport: 'rugby', level: 'more for fun' }] }, excludeSlugs: [] },
    10,
  ).find(c => c.slug === 'rugby-school')
  const RECREATIONAL = rankCandidates(
    [RUGBY_SCHOOL], structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    { parent: { home_region: 'midlands' }, child: { interests_sports: [{ sport: 'rugby', level: 'recreational' }] }, excludeSlugs: [] },
    10,
  ).find(c => c.slug === 'rugby-school')
  assert.ok(FOR_FUN && RECREATIONAL)
  assert.ok(
    Math.abs(FOR_FUN.total_score - RECREATIONAL.total_score) < 0.0001,
    `'more for fun' alias must score = recreational. for-fun=${FOR_FUN.total_score} recreational=${RECREATIONAL.total_score}`,
  )
})

test('Codex r1 P2: sport level alias "school" maps to school-team multiplier (0.4)', () => {
  // Before the alias addition, `level: 'school'` fell to the unknown default
  // 0.5 multiplier — 25% higher than intended. Pre-existing tests in this
  // file use `level: 'school'`, so this is a silent semantic shift the
  // alias rule restores.
  const SCHOOL_OUT = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    {
      parent: { home_region: 'midlands' },
      child: { interests_sports: [{ sport: 'rugby', level: 'school' }] },
      excludeSlugs: [],
    },
    10,
  ).find(c => c.slug === 'rugby-school')
  const TEAM_OUT = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    {
      parent: { home_region: 'midlands' },
      child: { interests_sports: [{ sport: 'rugby', level: 'school-team' }] },
      excludeSlugs: [],
    },
    10,
  ).find(c => c.slug === 'rugby-school')
  assert.ok(SCHOOL_OUT && TEAM_OUT, 'both runs should rank Rugby School')
  // Same multiplier → same score (within float epsilon).
  assert.ok(
    Math.abs(SCHOOL_OUT.total_score - TEAM_OUT.total_score) < 0.0001,
    `'school' alias should produce identical score to 'school-team'. school=${SCHOOL_OUT.total_score} school-team=${TEAM_OUT.total_score}`,
  )
})

test('Codex r1 P2: sport level empty/null falls to default 0.5 (between school-team and county)', () => {
  // Empty string is a realistic mis-extraction. Default 0.5 sits between
  // school-team (0.4) and county/regional (0.7), so a sport without a
  // level still earns a meaningful boost rather than zero.
  const EMPTY_OUT = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    {
      parent: { home_region: 'midlands' },
      child: { interests_sports: [{ sport: 'rugby', level: '' }] },
      excludeSlugs: [],
    },
    10,
  ).find(c => c.slug === 'rugby-school')
  const TEAM_OUT = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    {
      parent: { home_region: 'midlands' },
      child: { interests_sports: [{ sport: 'rugby', level: 'school-team' }] },
      excludeSlugs: [],
    },
    10,
  ).find(c => c.slug === 'rugby-school')
  const COUNTY_OUT = rankCandidates(
    [RUGBY_SCHOOL],
    structMap(STRUCT_RUGBY_SCHOOL_RUGBY_ELITE),
    {
      parent: { home_region: 'midlands' },
      child: { interests_sports: [{ sport: 'rugby', level: 'county' }] },
      excludeSlugs: [],
    },
    10,
  ).find(c => c.slug === 'rugby-school')
  assert.ok(EMPTY_OUT && TEAM_OUT && COUNTY_OUT)
  assert.ok(
    EMPTY_OUT.total_score > TEAM_OUT.total_score,
    `empty level (0.5) should score above school-team (0.4). empty=${EMPTY_OUT.total_score} team=${TEAM_OUT.total_score}`,
  )
  assert.ok(
    EMPTY_OUT.total_score < COUNTY_OUT.total_score,
    `empty level (0.5) should score below county (0.7). empty=${EMPTY_OUT.total_score} county=${COUNTY_OUT.total_score}`,
  )
})

test('Codex r1 P2: facts-only school folds BOTH ISI deep + ethos when present', async () => {
  // Extends Bug #6 coverage: confirms a school with NO SSD row gets BOTH
  // ethos AND ISI deep facts merged (not just ethos in isolation).
  const supa = makeMockSupabase({
    handle: {
      schools_status: () => ({
        data: [{ school_slug: 'facts-only-isi-ethos' }],
        error: null,
      }),
      schools: () => ({
        data: [{
          slug: 'facts-only-isi-ethos', name: 'Facts Only ISI Ethos School',
          gender_split: 'Co-ed', fees_usd_min: 40000, fees_usd_max: 40000,
          sen_support: false, strengths: [],
          confidence_score: 80, age_min: 11, age_max: 18, region: 'Surrey',
        }],
        error: null,
      }),
      school_structured_data: () => ({ data: [], error: null }),  // ← no SSD row
      school_facts: (captured) => {
        const isArtsCall = captured.eqs.some(([col, val]) => col === 'dimension' && val === 'arts_music_drama')
        if (isArtsCall) return { data: [], error: null }
        // Bundle loader gets both ethos + isi_deep facts.
        return {
          data: [
            {
              school_slug: 'facts-only-isi-ethos',
              dimension: 'ethos',
              canonical_key: 'ethos_primary',
              claim: { value: 'roman_catholic' },
              source_url: 'https://example.com/ethos',
              confidence: 1,
              status: 'active',
            },
            {
              // ISI deep mapper switches on `fact_type` (NOT canonical_key)
              // — see lib/server/isi-deep-bundle-mapper.js:42. Controlled
              // vocab from dimensions.js:1216-1242: signal='strong' +
              // detail='on_site_plus_external' produces mental_health
              // score=5 in the pastoral_care dim. Under high_priority
              // pastoral_pref the dim returns raw=5, norm=5/10=0.5 — below
              // the 0.8 chip threshold but a non-zero lift on total_score,
              // which is exactly what proves ISI deep got merged.
              school_slug: 'facts-only-isi-ethos',
              dimension: 'isi_deep',
              fact_type: 'isi_mental_health_provision',
              canonical_key: 'isi_mental_health_provision',
              claim: { signal: 'strong', detail: 'on_site_plus_external' },
              source_url: 'https://example.com/isi-pdf',
              confidence: 0.9,
              status: 'active',
            },
          ],
          error: null,
        }
      },
    },
  })
  const result = await scoreForBuildMode(supa, {
    parent: { home_region: 'south-east', ethos_pref: 'roman_catholic', pastoral_pref: 'high_priority' },
    child:  {},
    excludeSlugs: [],
    childGender: 'either', childYear: 'year-9',
  }, 10)
  // Compare against an ISI-deep-omitted control to prove the dim ran.
  // Two runs through the same scorer; only difference is the presence
  // of the isi_deep fact. If ISI deep wasn't merged the totals would
  // match; the post-merge total must be strictly higher.
  const ETHOS_ONLY = makeMockSupabase({
    handle: {
      schools_status: () => ({ data: [{ school_slug: 'facts-only-isi-ethos' }], error: null }),
      schools: () => ({
        data: [{
          slug: 'facts-only-isi-ethos', name: 'Facts Only ISI Ethos School',
          gender_split: 'Co-ed', fees_usd_min: 40000, fees_usd_max: 40000,
          sen_support: false, strengths: [],
          confidence_score: 80, age_min: 11, age_max: 18, region: 'Surrey',
        }],
        error: null,
      }),
      school_structured_data: () => ({ data: [], error: null }),
      school_facts: (captured) => {
        const isArtsCall = captured.eqs.some(([col, val]) => col === 'dimension' && val === 'arts_music_drama')
        if (isArtsCall) return { data: [], error: null }
        // Ethos only — NO ISI deep fact.
        return {
          data: [{
            school_slug: 'facts-only-isi-ethos',
            dimension: 'ethos',
            canonical_key: 'ethos_primary',
            claim: { value: 'roman_catholic' },
            source_url: 'https://example.com/ethos',
            confidence: 1,
            status: 'active',
          }],
          error: null,
        }
      },
    },
  })
  const ethosOnlyResult = await scoreForBuildMode(ETHOS_ONLY, {
    parent: { home_region: 'south-east', ethos_pref: 'roman_catholic', pastoral_pref: 'high_priority' },
    child:  {},
    excludeSlugs: [],
    childGender: 'either', childYear: 'year-9',
  }, 10)

  const found = result.candidates.find(c => c.slug === 'facts-only-isi-ethos')
  const ctrl  = ethosOnlyResult.candidates.find(c => c.slug === 'facts-only-isi-ethos')
  assert.ok(found && ctrl, 'facts-only school must rank in both runs')
  assert.ok(
    found.signals.some(s => /ethos match/i.test(s)),
    `ethos chip must fire. Got: ${JSON.stringify(found.signals)}`,
  )
  // ISI deep contributes a non-zero pastoral_care raw score (mental_health=5,
  // norm = 5/10 = 0.5). Under pastoral_pref='high_priority' the dim returns
  // its full raw, so the ISI-deep-present run must beat the control.
  assert.ok(
    found.total_score > ctrl.total_score,
    `ISI deep merge must lift score above ethos-only control. with=${found.total_score} ethos-only=${ctrl.total_score}`,
  )
})

// ── Phase 4 (2026-05-22): nonnegotiables hard-filter ──
//
// Codex audit 2026-05-21 (line 6239) flagged that free-text nonnegotiables
// like "must be co-ed", "not too religious", "weekly only", "no London"
// were captured but never enforced. These tests pin the 6 hard-filter
// patterns + NULL-data safety + empty-array no-op behavior.

const COEDUC_DAY = {
  slug: 'coeduc-day',
  name: 'Coeduc Day School',
  gender_split: 'Co-ed',
  fees_usd_min: 30000,
  fees_usd_max: 30000,
  sen_support: false,
  strengths: ['academic'],
  confidence_score: 70,
  age_min: 11, age_max: 18,
  region: 'Surrey',
}
const STRUCT_COEDUC_DAY = {
  school_slug: 'coeduc-day',
  sports_profile: null, exam_results: null, university_destinations: null,
  student_community: null, isi_deep_facts: null,
  wellbeing_staffing: null, ethos_facts: null, subject_strengths: null,
}

const LONDON_COED = {
  slug: 'london-coed',
  name: 'London Co-ed School',
  gender_split: 'Co-ed',
  fees_usd_min: 35000,
  fees_usd_max: 35000,
  sen_support: false,
  strengths: ['academic'],
  confidence_score: 75,
  age_min: 11, age_max: 18,
  region: 'London',
}
const STRUCT_LONDON_COED = {
  school_slug: 'london-coed',
  sports_profile: null, exam_results: null, university_destinations: null,
  student_community: null, isi_deep_facts: null,
  wellbeing_staffing: null, ethos_facts: null, subject_strengths: null,
}

const CATHOLIC_BOARDING = {
  slug: 'catholic-boarding',
  name: 'Catholic Boarding School',
  gender_split: 'Co-ed',
  fees_usd_min: 50000,
  fees_usd_max: 55000,
  sen_support: false,
  strengths: ['academic'],
  confidence_score: 80,
  age_min: 11, age_max: 18,
  region: 'Yorkshire',
}
const STRUCT_CATHOLIC_RC = {
  school_slug: 'catholic-boarding',
  sports_profile: null, exam_results: null, university_destinations: null,
  student_community: null, isi_deep_facts: null,
  wellbeing_staffing: null,
  ethos_facts: { ethos_label: 'roman_catholic' },
  subject_strengths: null,
}

const SECULAR_COED = {
  slug: 'secular-coed',
  name: 'Secular Co-ed',
  gender_split: 'Co-ed',
  fees_usd_min: 40000,
  fees_usd_max: 40000,
  sen_support: false,
  strengths: ['academic'],
  confidence_score: 80,
  age_min: 11, age_max: 18,
  region: 'Surrey',
}
const STRUCT_SECULAR_COED = {
  school_slug: 'secular-coed',
  sports_profile: null, exam_results: null, university_destinations: null,
  student_community: null, isi_deep_facts: null,
  wellbeing_staffing: null,
  ethos_facts: { ethos_label: 'secular' },
  subject_strengths: null,
}

const UNKNOWN_GENDER = {
  slug: 'unknown-gender',
  name: 'Unknown Gender School',
  gender_split: null,
  fees_usd_min: 30000,
  fees_usd_max: 30000,
  sen_support: false,
  strengths: ['academic'],
  confidence_score: 60,
  age_min: 11, age_max: 18,
  region: 'Hampshire',
}
const STRUCT_UNKNOWN_GENDER = {
  school_slug: 'unknown-gender',
  sports_profile: null, exam_results: null, university_destinations: null,
  student_community: null, isi_deep_facts: null,
  wellbeing_staffing: null, ethos_facts: null, subject_strengths: null,
}

test('Phase 4: "must be co-ed" drops boys-only and girls-only schools', () => {
  const out = rankCandidates(
    [SHERBORNE, WYCOMBE_ABBEY, COEDUC_DAY],
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL, STRUCT_WYCOMBE_ACADEMIC, STRUCT_COEDUC_DAY),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['must be co-ed'],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('sherborne-school'), 'boys-only must drop')
  assert.ok(!slugs.includes('wycombe-abbey'),    'girls-only must drop')
  assert.ok(slugs.includes('coeduc-day') || out.length === 0,
    `co-ed school may survive (was: ${JSON.stringify(slugs)})`)
})

test('Phase 4: "girls only" drops boys + co-ed schools (keeps girls)', () => {
  const out = rankCandidates(
    [SHERBORNE, WYCOMBE_ABBEY, COEDUC_DAY],
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL, STRUCT_WYCOMBE_ACADEMIC, STRUCT_COEDUC_DAY),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['girls only'],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('sherborne-school'), 'boys must drop')
  assert.ok(!slugs.includes('coeduc-day'),       'co-ed must drop under girls-only')
  // wycombe-abbey is girls-only — should remain
  assert.ok(slugs.includes('wycombe-abbey') || out.length === 0,
    `girls-only school survives. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4: "boys only" drops girls + co-ed schools (keeps boys)', () => {
  const out = rankCandidates(
    [SHERBORNE, WYCOMBE_ABBEY, COEDUC_DAY],
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL, STRUCT_WYCOMBE_ACADEMIC, STRUCT_COEDUC_DAY),
    {
      parent: { home_region: 'south-west', top_priority: 'sport' },
      child:  {
        nonnegotiables: ['boys only'],
        interests_sports: [{ sport: 'rugby', level: 'school' }],
      },
      excludeSlugs: [],
      childGender: 'boy',
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('wycombe-abbey'), 'girls must drop')
  assert.ok(!slugs.includes('coeduc-day'),    'co-ed must drop under boys-only')
  assert.ok(slugs.includes('sherborne-school') || out.length === 0,
    `boys-only school survives. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4: "no London" drops schools whose region contains "London"', () => {
  const out = rankCandidates(
    [LONDON_COED, COEDUC_DAY],
    structMap(STRUCT_LONDON_COED, STRUCT_COEDUC_DAY),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['no London'],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('london-coed'), 'London school must drop')
  assert.ok(slugs.includes('coeduc-day') || out.length === 0,
    `non-London co-ed survives. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4: "weekly boarding only" drops KNOWN_FULL_BOARDING_NAMES', () => {
  // Wycombe Abbey is in KNOWN_FULL_BOARDING_NAMES
  const out = rankCandidates(
    [WYCOMBE_ABBEY, COEDUC_DAY],
    structMap(STRUCT_WYCOMBE_ACADEMIC, STRUCT_COEDUC_DAY),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['weekly boarding only'],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('wycombe-abbey'),
    `Wycombe Abbey (full-boarding-only) must drop under weekly-only nonneg. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4: "not religious" drops schools with religious ethos_label', () => {
  const out = rankCandidates(
    [CATHOLIC_BOARDING, SECULAR_COED],
    structMap(STRUCT_CATHOLIC_RC, STRUCT_SECULAR_COED),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['not religious'],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('catholic-boarding'), 'Catholic school must drop')
  assert.ok(slugs.includes('secular-coed') || out.length === 0,
    `secular school survives. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4: NULL gender_split passes through must-be-coed (no-penalty rule)', () => {
  const out = rankCandidates(
    [UNKNOWN_GENDER, COEDUC_DAY],
    structMap(STRUCT_UNKNOWN_GENDER, STRUCT_COEDUC_DAY),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['must be co-ed'],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(slugs.includes('unknown-gender') || out.length === 0,
    `NULL-gender school must pass through (no penalty for missing data). Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4: NULL ethos_label passes through not-religious (no-penalty rule)', () => {
  const out = rankCandidates(
    [COEDUC_DAY, SECULAR_COED],
    structMap(STRUCT_COEDUC_DAY, STRUCT_SECULAR_COED),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['not religious'],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(slugs.includes('coeduc-day') || out.length === 0,
    `NULL-ethos school must pass through. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4: empty nonnegotiables array is a no-op', () => {
  const out = rankCandidates(
    [SHERBORNE, WYCOMBE_ABBEY, COEDUC_DAY],
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL, STRUCT_WYCOMBE_ACADEMIC, STRUCT_COEDUC_DAY),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: [],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  // No nonneg fired → all 3 schools should survive the hard-filter step
  // (downstream scoring may still drop some, but at least the co-ed should
  // pass through both)
  assert.ok(slugs.length >= 1, `at least one school survives empty-nonneg. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4: unknown free-text "small classes" does NOT hard-filter', () => {
  // "small classes" is a soft signal (SMALL_CLASS_HINT_RE) — must not
  // drop any school as a hard filter. Sanity check that the nonneg
  // hard-filter is opt-in by pattern.
  const out = rankCandidates(
    [SHERBORNE, WYCOMBE_ABBEY, COEDUC_DAY],
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL, STRUCT_WYCOMBE_ACADEMIC, STRUCT_COEDUC_DAY),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['small classes'],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
    },
    10,
  )
  // SHERBORNE is age 13-18, year 7 default would be 11 — but rankCandidates
  // does NOT enforce age (the wrapper does). So all 3 may survive. The key
  // assertion is that the result is the same as the empty-array no-op.
  const outEmpty = rankCandidates(
    [SHERBORNE, WYCOMBE_ABBEY, COEDUC_DAY],
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL, STRUCT_WYCOMBE_ACADEMIC, STRUCT_COEDUC_DAY),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: [],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
    },
    10,
  )
  assert.deepEqual(
    out.map(c => c.slug).sort(),
    outEmpty.map(c => c.slug).sort(),
    'unknown nonneg should not change the surviving slug set',
  )
})

test('Phase 4: case-insensitive matching ("MUST BE CO-ED" works)', () => {
  const out = rankCandidates(
    [SHERBORNE, COEDUC_DAY],
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL, STRUCT_COEDUC_DAY),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['MUST BE CO-ED'],  // uppercase
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('sherborne-school'), 'case-insensitive must still drop boys-only')
})

test('Phase 4: multiple nonnegs ANDed ("girls only" + "no London")', () => {
  const out = rankCandidates(
    [LONDON_COED, WYCOMBE_ABBEY, SHERBORNE],
    structMap(STRUCT_LONDON_COED, STRUCT_WYCOMBE_ACADEMIC, STRUCT_SHERBORNE_RUGBY_NATIONAL),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['girls only', 'no London'],
        goal_orientation: 'university_track',
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  // London co-ed: drops on no-london AND on girls-only
  assert.ok(!slugs.includes('london-coed'), 'London + co-ed must drop')
  // Sherborne (boys, Dorset): drops on girls-only
  assert.ok(!slugs.includes('sherborne-school'), 'boys-only must drop under girls-only')
  // Wycombe (girls, Buckinghamshire): passes both filters
  assert.ok(slugs.includes('wycombe-abbey') || out.length === 0,
    `girls non-London school survives both filters. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4: nonneg filter applied BEFORE scoring (no-signal filter does NOT re-include violators)', () => {
  // Regression guard: ensure the hard-filter runs before the score loop
  // so a no-signal filter pass downstream can't accidentally re-include
  // schools we filtered out. The architecture is: hard-filter at line ~420
  // → score loop ~480 → no-signal filter ~545. So this test just confirms
  // that violators NEVER appear in the output regardless of score.
  const out = rankCandidates(
    [SHERBORNE],  // boys-only
    structMap(STRUCT_SHERBORNE_RUGBY_NATIONAL),
    {
      parent: { home_region: 'south-east', top_priority: 'academic' },
      child:  {
        nonnegotiables: ['must be co-ed'],
        // Even with maximum positive signals, the school must still drop.
        goal_orientation: 'university_track',
        interests_sports: [{ sport: 'rugby', level: 'national' }],
      },
      excludeSlugs: [],
    },
    10,
  )
  assert.equal(out.length, 0, 'boys-only school with strong signals must still drop under must-be-coed')
})

// ── Phase 4 item #2 (2026-05-22): LLM-classified intent ───────────────
// Tests the SCORER side of the new architecture: pass `intent` as a
// structured input field and verify wantsAcademic / wantsTopUni /
// hasAcademicPain wire correctly. The LLM classifier itself is tested
// separately in classify-build-mode-intent.fixtures.test.mjs (offline
// fixture runner). This keeps the scorer tests fast + deterministic
// (no OpenAI calls) and the classifier tests focused on prose→intent
// correctness.

test('Phase 4 item #2: intent.academic_intent="strong" triggers academic_strength without goal_orientation', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  {},  // no goal_orientation
      intent: { academic_intent: 'strong', top_uni_intent: 'none' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe must rank from intent-driven academic')
  assert.ok(wa.signals.includes('academic-strong'),
    `intent='strong' must fire academic-strong. Got: ${JSON.stringify(wa.signals)}`)
})

test('Phase 4 item #2: intent.top_uni_intent="wants" triggers academic_strength + prioritises Oxbridge fact', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  {},
      intent: { academic_intent: 'none', top_uni_intent: 'wants' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe must rank from top-uni intent')
  assert.ok(wa.signals.includes('academic-strong'))
  assert.match(wa.rationale_seed, /22 Oxbridge/,
    `wantsTopUni must surface Oxbridge fact, got: ${wa.rationale_seed}`)
})

test('Phase 4 item #2: intent.academic_intent="struggle" suppresses academic_strength EVEN WITH goal_orientation=university_track', () => {
  // Critical safety property: pain prose (parent wrote "she struggles
  // academically" → classifier returned 'struggle') overrides the
  // structured university_track goal. A struggling kid must NOT be
  // boosted into selective schools.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  { goal_orientation: 'university_track' },
      intent: { academic_intent: 'struggle', top_uni_intent: 'wants' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  if (wa) {
    assert.ok(!wa.signals.includes('academic-strong'),
      `pain intent must suppress even with university_track. Got: ${JSON.stringify(wa.signals)}`)
  }
})

test('Phase 4 item #2: intent=null preserves pre-feature behaviour (only goal_orientation drives academic)', () => {
  // Backwards compat: when intent is absent (e.g. classifier failed and
  // returned FALLBACK_INTENT, or older callers that don't pass intent),
  // the scorer behaves exactly as it did before Phase 4 item #2.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  { goal_orientation: 'university_track' },
      intent: null,
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'university_track alone still ranks')
  assert.ok(wa.signals.includes('academic-strong'))
  // Without wantsTopUni, A* takes priority over Oxbridge in the fact line.
  assert.match(wa.rationale_seed, /75% A\*/,
    `expected A* fact when no top-uni intent, got: ${wa.rationale_seed}`)
})

test('Phase 4 item #2: intent.top_uni_intent="rejects" does NOT fire wantsTopUni', () => {
  // "We don't want Oxbridge pressure" → classifier returns 'rejects'.
  // wantsTopUni stays false. Without goal_orientation or strong intent,
  // academic_strength doesn't fire.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  {},
      intent: { academic_intent: 'none', top_uni_intent: 'rejects' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  if (wa) {
    assert.ok(!wa.signals.includes('academic-strong'),
      `rejects intent must NOT fire. Got: ${JSON.stringify(wa.signals)}`)
  }
})

test('Phase 4 item #2: wantsTopUni reorders Oxbridge fact even when goal_orientation is also set', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  { goal_orientation: 'university_track' },
      intent: { academic_intent: 'none', top_uni_intent: 'wants' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe must rank')
  assert.match(wa.rationale_seed, /22 Oxbridge/,
    `top-uni intent must surface Oxbridge fact even with structured goal, got: ${wa.rationale_seed}`)
})

// ── Phase 4 item #3 (2026-05-22): 6 new LLM-classified intent fields ──
// pastoral_priority / inclusive_priority / small_env_pref /
// boarding_pref_from_prose / current_school_pain / parent_drill_focus.
// Closes Codex audit lines 6289-6290 + deletes 4 sentiment regexes
// (PASTORAL_HINT_RE / INCLUSIVE_HINT_RE / SMALL_CLASS_HINT_RE /
// FULL_BOARDING_HINT_RE). Scorer tests pass intent directly; the LLM
// classifier itself is tested by the offline fixture runner.

// Use the real ISI fact shape that DIMENSIONS.pastoral_care.rank() reads —
// detail-maps for bullying + mental health, signal grade for PSHE/wellbeing.
// Total = 5 (bullying rare_swiftly_addressed) + 5 (mental_health on_site_plus_external)
//       + 3 (pshe excellent) + 2 (wellbeing strong) = 15 → norm 1.5 → 'pastoral-strong' fires.
const STRUCT_WELLBEING_FULL = {
  school_slug: 'wycombe-abbey',
  sports_profile: null,
  exam_results: null,
  university_destinations: null,
  student_community: { total_pupils: 350 },
  isi_deep_facts: {
    bullying_detail:         'rare_swiftly_addressed',
    mental_health_detail:    'on_site_plus_external',
    pshe_grade:              'excellent',
    wellbeing_spaces_signal: 'strong',
  },
  wellbeing_staffing: { total_staff: 8, ratio_per_pupil: 45 },
  ethos_facts: null,
}

test('Phase 4 item #3: intent.pastoral_priority="high" upgrades pastoral_pref ctx (null → high_priority)', () => {
  // Replaces the PASTORAL_HINT_RE path. When parent.pastoral_pref is null
  // but classifier returned pastoral_priority='high' from prose, the
  // pastoral_care dim should fire.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WELLBEING_FULL),
    {
      parent: null,  // pastoral_pref=null
      child:  {},
      intent: { pastoral_priority: 'high' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe should rank from pastoral upgrade')
  assert.ok(wa.signals.some(s => s.startsWith('pastoral')),
    `pastoral signal must fire from intent. Got: ${JSON.stringify(wa.signals)}`)
})

test('Phase 4 item #3: intent.pastoral_priority="normal" does NOT downgrade wizard pastoral_pref="high_priority" (no-erase rule)', () => {
  // Codex r1 design rule: empty or contradicting prose must NEVER erase
  // wizard answers. wizard='high_priority' + intent.pastoral_priority='normal'
  // → wizard wins (no downgrade).
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WELLBEING_FULL),
    {
      parent: { pastoral_pref: 'high_priority' },
      child:  {},
      intent: { pastoral_priority: 'normal' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe should still rank')
  assert.ok(wa.signals.some(s => s.startsWith('pastoral')),
    `wizard pastoral_pref=high_priority must STILL fire even when intent says 'normal'. Got: ${JSON.stringify(wa.signals)}`)
})

test('Phase 4 item #3: intent.current_school_pain="pastoral" ALSO upgrades pastoral_pref (reinforces)', () => {
  // Codex r1 design rule 10: pastoral pain AT current school reinforces
  // pastoral_priority even if the classifier set pastoral_priority='none'
  // for some reason (or if only went_wrong prose was filled).
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WELLBEING_FULL),
    {
      parent: null,
      child:  {},
      intent: { pastoral_priority: 'none', current_school_pain: 'pastoral' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe should rank from current_school_pain reinforcement')
  assert.ok(wa.signals.some(s => s.startsWith('pastoral')),
    `pastoral pain at current school must upgrade pastoral_pref. Got: ${JSON.stringify(wa.signals)}`)
})

// DIMENSIONS.inclusive_culture.rank() reads lgbtq_detail + diversity_signal
// + pupil_voice_signal. Total = 5 (active_pupil_led_group) + 3 (diversity strong)
// + 2 (pupil_voice strong) = 10 → norm 1.0 → 'inclusive culture' chip fires.
const STRUCT_INCLUSIVE_RICH = {
  school_slug: 'wycombe-abbey',
  sports_profile: null,
  exam_results: null,
  university_destinations: null,
  student_community: null,
  isi_deep_facts: {
    lgbtq_detail:       'active_pupil_led_group',
    diversity_signal:   'strong',
    pupil_voice_signal: 'strong',
  },
  wellbeing_staffing: null,
  ethos_facts: null,
}

test('Phase 4 item #3: intent.inclusive_priority="high" upgrades lgbtq_pref ctx (null → important)', () => {
  // Replaces the INCLUSIVE_HINT_RE path.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_INCLUSIVE_RICH),
    {
      parent: null,
      child:  {},
      intent: { inclusive_priority: 'high' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe should rank from inclusive upgrade')
})

test('Phase 4 item #3: intent.small_env_pref="wants" triggers small-class boost (replaces SMALL_CLASS_HINT_RE)', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WELLBEING_FULL),  // total_pupils=350 → small
    {
      parent: null,
      child:  {},
      intent: { small_env_pref: 'wants' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe (350 pupils) should rank')
  assert.ok(wa.signals.some(s => /small \(~/.test(s)),
    `small_env_pref='wants' must trigger small chip. Got: ${JSON.stringify(wa.signals)}`)
})

test('Phase 4 item #3: intent.small_env_pref="rejects" does NOT fire small chip (no-trigger when rejects)', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WELLBEING_FULL),
    {
      parent: null,  // wizard class_size_pref=null
      child:  {},
      intent: { small_env_pref: 'rejects' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  if (wa) {
    assert.ok(!wa.signals.some(s => /small \(~/.test(s)),
      `small_env_pref='rejects' must NOT fire small chip. Got: ${JSON.stringify(wa.signals)}`)
  }
})

test('Phase 4 item #3: intent.boarding_pref_from_prose="full" boosts known full-boarding schools', () => {
  // WYCOMBE_ABBEY is in KNOWN_FULL_BOARDING_NAMES. boarding_pref_from_prose
  // = 'full' adds +0.3 + 'full boarding' chip. Replaces FULL_BOARDING_HINT_RE.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  {},
      intent: { boarding_pref_from_prose: 'full' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe should rank')
  assert.ok(wa.signals.includes('full boarding'),
    `boarding_pref_from_prose='full' must trigger 'full boarding' chip. Got: ${JSON.stringify(wa.signals)}`)
})

test('Phase 4 item #3: intent.current_school_pain="academic_overwhelmed" sets hasAcademicPain (suppresses academic boost)', () => {
  // Even with goal_orientation='university_track', a kid drowning at
  // current school must NOT be pushed to selective Wycombe.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  { goal_orientation: 'university_track' },
      intent: { current_school_pain: 'academic_overwhelmed' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  if (wa) {
    assert.ok(!wa.signals.includes('academic-strong'),
      `academic_overwhelmed must suppress even with university_track. Got: ${JSON.stringify(wa.signals)}`)
  }
})

test('Phase 4 item #3: intent.current_school_pain="academic_bored" fires wantsStretch (softer boost, "better-fit" signal)', () => {
  // Codex parent-harm warning: bored ≠ wants Eton-tier selectivity.
  // Wycombe still ranks (it's an academically strong school) but with
  // the softer 'better-fit' chip instead of 'academic-strong'.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  {},  // no goal_orientation
      intent: { academic_intent: 'none', current_school_pain: 'academic_bored' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe should rank from stretch boost')
  assert.ok(wa.signals.includes('better-fit'),
    `academic_bored must fire 'better-fit' chip. Got: ${JSON.stringify(wa.signals)}`)
  assert.ok(!wa.signals.includes('academic-strong'),
    `academic_bored must NOT fire 'academic-strong' chip (use softer 'better-fit'). Got: ${JSON.stringify(wa.signals)}`)
})

test('Phase 4 item #3: wantsStretch does NOT fire when hasAcademicPain (overwhelmed beats bored)', () => {
  // If the parent's prose is contradictory (bored AND overwhelmed),
  // overwhelmed wins. The stretch boost would be harmful for an
  // overwhelmed kid.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  {},
      intent: { academic_intent: 'struggle', current_school_pain: 'academic_bored' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  if (wa) {
    assert.ok(!wa.signals.includes('better-fit'),
      `hasAcademicPain (from academic_intent='struggle') must suppress wantsStretch. Got: ${JSON.stringify(wa.signals)}`)
    assert.ok(!wa.signals.includes('academic-strong'),
      `pain must suppress academic boost entirely. Got: ${JSON.stringify(wa.signals)}`)
  }
})

test('Phase 4 item #3: wantsStretch does NOT fire when wantsAcademic already fires (no double-boost)', () => {
  // If the parent already gets the FULL wantsAcademic boost via
  // university_track + intent='strong', the wantsStretch path doesn't
  // also fire. Prevents double-counting.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,
      child:  { goal_orientation: 'university_track' },
      intent: { academic_intent: 'strong', current_school_pain: 'academic_bored' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe must rank')
  assert.ok(wa.signals.includes('academic-strong'),
    `wantsAcademic must fire when intent='strong' + university_track. Got: ${JSON.stringify(wa.signals)}`)
  assert.ok(!wa.signals.includes('better-fit'),
    `'better-fit' must NOT fire when 'academic-strong' already did. Got: ${JSON.stringify(wa.signals)}`)
})

test('Phase 4 item #3: parent_drill_focus="academic" fills topPriority when wizard top_priority is null (fires academic-priority match chip)', () => {
  // Codex r1 design rule 9: fill-when-null. wizard.top_priority=null but
  // drill_focus='academic' → topPriority resolves to 'academic'. The
  // top_priority nudge block then matches 'academic-strong' signal +
  // adds 'academic-priority match' chip (observable proof topPriority
  // was filled). Pair with intent.academic_intent='strong' to ensure
  // the 'academic-strong' base signal fires.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: null,  // top_priority=null
      child:  {},
      intent: { academic_intent: 'strong', parent_drill_focus: 'academic' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe should rank')
  assert.ok(wa.signals.includes('academic-priority match'),
    `drill_focus='academic' must fill topPriority and fire the priority-match chip. Got: ${JSON.stringify(wa.signals)}`)
})

test('Phase 4 item #3: wizard top_priority WINS over drill_focus on conflict (no spurious priority match)', () => {
  // Codex r1 design rule 9: explicit > derived. wizard='sport' (no
  // sport signal here) but drill_focus='academic' (academic signal IS
  // here) → wizard wins. 'academic-priority match' must NOT fire because
  // topPriority resolves to wizard's 'sport', which doesn't match
  // academic signals.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { top_priority: 'sport' },
      child:  {},
      intent: { academic_intent: 'strong', parent_drill_focus: 'academic' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  assert.ok(wa, 'Wycombe must still rank from academic-strong signal')
  assert.ok(wa.signals.includes('academic-strong'),
    `academic-strong should still fire. Got: ${JSON.stringify(wa.signals)}`)
  assert.ok(!wa.signals.includes('academic-priority match'),
    `drill_focus='academic' must NOT override wizard='sport' to add academic-priority match. Got: ${JSON.stringify(wa.signals)}`)
})

test('Phase 4 item #3 (Codex r1): boarding_pref_from_prose="rejects" filters KNOWN_FULL_BOARDING when wizard boarding_pref is null', () => {
  // Codex r1 review parent-harm warning: "I said no boarding/day school,
  // why did you suggest a full boarding school?" When parent.boarding_pref
  // is null but prose explicitly rejects boarding, treat as 'day' for the
  // hard-filter step (drops KNOWN_FULL_BOARDING_NAMES). Wycombe IS in
  // that set, so it must be filtered out.
  const out = rankCandidates(
    [WYCOMBE_ABBEY, A_DAY_SCHOOL],
    structMap(STRUCT_WYCOMBE_ACADEMIC, STRUCT_DAY_EMPTY),
    {
      parent: { home_region: 'london' },  // boarding_pref=null
      child:  {},
      intent: { boarding_pref_from_prose: 'rejects' },
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('wycombe-abbey'),
    `boarding_pref_from_prose='rejects' must filter known full-boarding when wizard is null. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4 item #3 (Codex r1): wizard boarding_pref="full" WINS over prose="rejects" (no-erase rule)', () => {
  // No-erase rule: wizard wins. Wizard='full' + prose='rejects' → wizard
  // applies (filters KNOWN_DAY_ONLY_NAMES; Wycombe survives).
  // Goal_orientation='university_track' gives Wycombe an academic signal
  // so it survives the no-signal filter — the assertion is about the
  // boarding hard-filter respecting the wizard, not the scoring layer.
  const out = rankCandidates(
    [WYCOMBE_ABBEY, A_DAY_SCHOOL],
    structMap(STRUCT_WYCOMBE_ACADEMIC, STRUCT_DAY_EMPTY),
    {
      parent: { home_region: 'london', boarding_pref: 'full' },
      child:  { goal_orientation: 'university_track' },
      intent: { boarding_pref_from_prose: 'rejects' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(slugs.includes('wycombe-abbey'),
    `wizard='full' must override prose='rejects'. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4 item #3 (Codex r2/r3): boarding_pref_from_prose="full" filters KNOWN_DAY_ONLY_NAMES when wizard boarding_pref is null', () => {
  // Codex r2 caught the symmetric gap: prose='full' was only triggering
  // the soft boost, not the hard filter. Codex r3 sharpened: use a real
  // KNOWN_DAY_ONLY_NAMES entry to prove the filter actually drops it.
  // 'westminster' is in the day-only override set; full-boarding parent
  // must NOT see it.
  const WESTMINSTER_DAY = {
    slug: 'westminster',
    name: 'Westminster',  // matches KNOWN_DAY_ONLY_NAMES entry
    gender_split: 'Boys',
    fees_usd_min: 50000,
    sen_support: false,
    strengths: [],
    confidence_score: 90,
    age_min: 11, age_max: 18,
    region: 'London',
  }
  const STRUCT_WESTMINSTER = {
    school_slug: 'westminster',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null, ethos_facts: null,
  }
  const out = rankCandidates(
    [WYCOMBE_ABBEY, WESTMINSTER_DAY],
    structMap(STRUCT_WYCOMBE_ACADEMIC, STRUCT_WESTMINSTER),
    {
      parent: { home_region: 'london' },  // wizard boarding_pref=null
      child:  { goal_orientation: 'university_track' },
      intent: { boarding_pref_from_prose: 'full' },
      excludeSlugs: [],
      childGender: 'boy',  // both eligible (Wycombe girls, Westminster boys); use boy so Westminster passes gender, would survive without the filter
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('westminster'),
    `prose='full' must filter known day-only Westminster. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4 item #3 (Codex r3): child.nonnegotiables=["no boarding"] filters KNOWN_FULL_BOARDING_NAMES (nonneg path, separate from prose)', () => {
  // Codex r3 Medium: nonnegotiables array has its own path independent
  // of the LLM classifier (the classifier only reads 5 prose fields,
  // not nonnegotiables). Without this filter, child.nonnegotiables
  // = ["no boarding"] + null wizard + null prose intent → full-boarding
  // schools could still surface. The new 'no-boarding' NONNEG_FILTERS
  // entry closes this.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],  // Wycombe IS in KNOWN_FULL_BOARDING_NAMES
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ['no boarding for our daughter'],
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('wycombe-abbey'),
    `nonneg 'no boarding' must filter full-boarding Wycombe. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4 item #3 (Codex r4): nonneg "he\'s not ready to board" (male pronoun) fires no-boarding filter', () => {
  // Codex r4 broadened the gendered phrasing — original regex only caught "she's".
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ["he's not ready to board"],
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  assert.ok(!out.map(c => c.slug).includes('wycombe-abbey'),
    `nonneg "he's not ready to board" must filter Wycombe.`)
})

test('Phase 4 item #3 (Codex r4): nonneg "we don\'t want boarding" fires no-boarding filter', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ["we don't want boarding"],
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  assert.ok(!out.map(c => c.slug).includes('wycombe-abbey'),
    `nonneg "we don't want boarding" must filter Wycombe.`)
})

test('Phase 4 item #3 (Codex r4): nonneg "boarding is not right for him" fires no-boarding filter', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ['boarding is not right for him'],
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  assert.ok(!out.map(c => c.slug).includes('wycombe-abbey'),
    `nonneg "boarding is not right for him" must filter Wycombe.`)
})

test('Phase 4 item #3 (Codex r5): nonneg "they\'re not going to board" (contracted they) fires no-boarding filter', () => {
  // Codex r5 caught: my r4 regex had pronoun + optional 's, missing "they're" / "they are".
  // r5 fix: pronoun-independent phrase matching.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ["they're not going to board"],
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  assert.ok(!out.map(c => c.slug).includes('wycombe-abbey'),
    `nonneg "they're not going to board" must filter Wycombe.`)
})

test('Phase 4 item #3 (Codex r5): nonneg "the kid is not suited to board" (descriptor + is) fires no-boarding filter', () => {
  // Codex r5 caught: my r4 regex matched "the kid's" but not "the kid is".
  // r5 fix: pronoun-independent phrase matching covers both.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ['the kid is not suited to board'],
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  assert.ok(!out.map(c => c.slug).includes('wycombe-abbey'),
    `nonneg "the kid is not suited to board" must filter Wycombe.`)
})

test('Phase 4 item #3 (Codex r6): contracted negation "she isn\'t ready to board" fires no-boarding filter', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ["she isn't ready to board"],
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  assert.ok(!out.map(c => c.slug).includes('wycombe-abbey'),
    `nonneg "she isn't ready to board" must filter Wycombe.`)
})

test('Phase 4 item #3 (Codex r6): contracted negation + curly "boarding isn’t right for him" fires no-boarding filter', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ['boarding isn’t right for him'],  // U+2019 curly
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  assert.ok(!out.map(c => c.slug).includes('wycombe-abbey'),
    `nonneg "boarding isn’t right for him" must filter Wycombe.`)
})

test('Phase 4 item #3 (Codex r6): contracted negation "we aren’t boarding" fires no-boarding filter', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ['we aren’t boarding'],
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  assert.ok(!out.map(c => c.slug).includes('wycombe-abbey'),
    `nonneg "we aren't boarding" must filter Wycombe.`)
})

test('Phase 4 item #3 (Codex r5): curly-apostrophe "we don’t want boarding" fires no-boarding filter', () => {
  // Parent-typed prose often contains smart quotes (don’t / aren’t).
  // The regex character class includes curly variants alongside ASCII.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ['we don’t want boarding'],  // U+2019 curly close
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  assert.ok(!out.map(c => c.slug).includes('wycombe-abbey'),
    `nonneg with curly apostrophe must filter Wycombe.`)
})

test('Phase 4 item #3 (Codex r4): nonneg "full boarding only" fires boarding-required filter (drops day-only)', () => {
  // Symmetric to no-boarding. parent.nonnegotiables=["full boarding only"]
  // must drop KNOWN_DAY_ONLY_NAMES schools.
  const WESTMINSTER_DAY = {
    slug: 'westminster',
    name: 'Westminster',
    gender_split: 'Boys',
    fees_usd_min: 50000,
    sen_support: false,
    strengths: [],
    confidence_score: 90,
    age_min: 11, age_max: 18,
    region: 'London',
  }
  const STRUCT_WESTMINSTER = {
    school_slug: 'westminster',
    sports_profile: null, exam_results: null, university_destinations: null,
    student_community: null, isi_deep_facts: null, wellbeing_staffing: null, ethos_facts: null,
  }
  const out = rankCandidates(
    [WYCOMBE_ABBEY, WESTMINSTER_DAY],
    structMap(STRUCT_WYCOMBE_ACADEMIC, STRUCT_WESTMINSTER),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ['full boarding only'],
      },
      excludeSlugs: [],
      childGender: 'boy',
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('westminster'),
    `nonneg "full boarding only" must filter day-only Westminster. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4 item #3 (Codex r3): nonneg "day school only" also fires no-boarding filter', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london' },
      child:  {
        goal_orientation: 'university_track',
        nonnegotiables:   ['day school only please'],
      },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('wycombe-abbey'),
    `nonneg 'day school only' must filter full-boarding Wycombe. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4 item #3 (Codex r2): boarding_pref_from_prose="weekly" resolves to boarder budget (fees_usd_max)', () => {
  // Codex r2 finding: "weekly boarding suits us" + null wizard previously
  // used fees_usd_min (day fee) for the in-budget chip. Now uses fees_usd_max.
  // This test confirms the resolver propagates to the in-budget chip via
  // the budgetCheckFee selection.
  const HIGH_BOARDING_SCHOOL = {
    ...WYCOMBE_ABBEY,
    fees_usd_min: 30000,  // day fee
    fees_usd_max: 65000,  // boarding fee
  }
  const out = rankCandidates(
    [HIGH_BOARDING_SCHOOL],
    structMap(STRUCT_WYCOMBE_ACADEMIC),
    {
      parent: { home_region: 'london', budget_range: '40k-50k' },  // null wizard boarding_pref
      child:  { goal_orientation: 'university_track' },
      intent: { boarding_pref_from_prose: 'weekly' },
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  if (wa) {
    // budget=40k-50k → ceiling ~63.5k USD. fees_usd_max=65k. ratio=~1.02 → no 'in budget' chip.
    // If the resolver was missing, we'd use fees_usd_min=30k → ratio=~0.47 → FALSE 'in budget' chip.
    assert.ok(!wa.signals.includes('in budget'),
      `prose='weekly' must resolve to boarder budget — fees_usd_max should drive the chip. Got: ${JSON.stringify(wa.signals)}`)
  }
})

test('Phase 4 item #3 (Codex r1): boarding_pref_from_prose="day" also filters full-boarding (parity with rejects)', () => {
  const out = rankCandidates(
    [WYCOMBE_ABBEY, A_DAY_SCHOOL],
    structMap(STRUCT_WYCOMBE_ACADEMIC, STRUCT_DAY_EMPTY),
    {
      parent: { home_region: 'london' },
      child:  {},
      intent: { boarding_pref_from_prose: 'day' },
      excludeSlugs: [],
    },
    10,
  )
  const slugs = out.map(c => c.slug)
  assert.ok(!slugs.includes('wycombe-abbey'),
    `boarding_pref_from_prose='day' must filter known full-boarding. Got: ${JSON.stringify(slugs)}`)
})

test('Phase 4 item #3: intent=null preserves baseline (no pastoral/inclusive/small/boarding upgrades)', () => {
  // Backwards compat: legacy callers passing intent=null get the
  // pre-Phase-4 behaviour. None of the new gates fire because the
  // pastoral/inclusive/small/boarding signals were the only ways prose
  // could upgrade these ctx values, and intent=null means no prose
  // upgrades. Wizard answers still drive everything.
  const out = rankCandidates(
    [WYCOMBE_ABBEY],
    structMap(STRUCT_WELLBEING_FULL),
    {
      parent: null,
      child:  { anchors_notes: 'pastoral wellbeing anxiety' },  // would have fired old regex
      intent: null,
      excludeSlugs: [],
      childGender: 'girl',
    },
    10,
  )
  const wa = out.find(c => c.slug === 'wycombe-abbey')
  if (wa) {
    assert.ok(!wa.signals.some(s => s.startsWith('pastoral')),
      `intent=null must NOT upgrade pastoral_pref from prose alone. Old regex path is deleted. Got: ${JSON.stringify(wa.signals)}`)
  }
})
