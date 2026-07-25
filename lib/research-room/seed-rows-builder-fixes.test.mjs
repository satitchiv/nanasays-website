// Phase 2 builder-bug fixes (2026-05-15) — regression test
//
// Tests the 3 fixes to seed-rows.ts that surfaced from the 2026-05-15
// comparison-table audit:
//   - buildHeathrowMinutes:    extractor writes `drive_time_min_estimate`, not `minutes`
//   - buildLowestBoardingEntry: extractor writes `entry_point` (string), not `year`/`age`
//   - buildY9Y10Admissions:    same root cause as above (renamed/generalized to
//     buildEntryTimeline by RRV-4, 2026-07-20 — see that section below)
//
// Strategy: two layers per fix.
//   (1) Source-level pattern assertions — assert the patched code IS in seed-rows.ts.
//       Catches reverts/regressions even before logic runs.
//   (2) Logic tests — re-implement the patched function inline and run against
//       real extractor fixtures (Lancing, ACS, Rugby, Wellington) so the
//       behaviour is provable.
//
// Why inline re-implementation? seed-rows.ts uses `import 'server-only'`
// (cannot load under raw node). The existing seed-rows-keys.test.mjs uses
// the same source-text approach for the same reason.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'seed-rows.ts'), 'utf8')

// ─── Layer 1: source-level assertions ─────────────────────────────────────

test('buildHeathrowMinutes reads drive_time_min_estimate first', () => {
  assert.match(
    source,
    /obj\.drive_time_min_estimate\s*\?\?\s*obj\.minutes/,
    'expected `obj.drive_time_min_estimate ?? obj.minutes` chain in buildHeathrowMinutes',
  )
})

test('buildLowestBoardingEntry walks [entry_point, year, age] in that priority', () => {
  // Per Codex r2: the candidate array IS the source of truth for priority order.
  // The old `o.entry_point ?? o.year ?? o.age` pattern was replaced because it
  // masked numeric year/age when entry_point was a non-null-but-unparseable string.
  const fnSrc = source.slice(source.indexOf('function buildLowestBoardingEntry'), source.indexOf('function buildBoardingPupils'))
  assert.match(
    fnSrc,
    /\[o\.entry_point,\s*o\.year,\s*o\.age\]/,
    'expected candidate array [o.entry_point, o.year, o.age] in priority order',
  )
})

test('buildLowestBoardingEntry walks [entry_point, year, age] candidates via helper', () => {
  const fnSrc = source.slice(source.indexOf('function buildLowestBoardingEntry'), source.indexOf('function buildBoardingPupils'))
  // Object branch: candidate-walk loop
  assert.match(fnSrc, /for\s*\(\s*const\s+raw\s+of\s*\[o\.entry_point,\s*o\.year,\s*o\.age\]/, 'expected candidate-walk loop in object branch (Codex r2)')
  assert.match(fnSrc, /extractUkYearFromString\(raw\)/, 'expected helper call inside candidate-walk')
  // String branch: direct helper call
  assert.match(fnSrc, /extractUkYearFromString\(e\)/, 'expected helper call in string branch')
})

test('extractUkYearFromString helper uses (?!\\d) lookahead to avoid Year 100 → 10', () => {
  const helperSrc = source.slice(source.indexOf('function extractUkYearFromString'))
  assert.match(helperSrc, /year\\s\+\(\\d\{1,2\}\)\(\?\!\\d\)/i, 'expected (?!\\d) lookahead in Year-N regex')
})

test('extractUkYearFromString helper has explicit NN+ admissions notation mapping', () => {
  const helperSrc = source.slice(source.indexOf('const PLUS_TO_YEAR'))
  assert.match(helperSrc, /['"]13\+['"]:\s*9/, 'expected "13+": 9 in PLUS_TO_YEAR')
  assert.match(helperSrc, /['"]11\+['"]:\s*7/, 'expected "11+": 7')
  assert.match(helperSrc, /['"]16\+['"]:\s*12/, 'expected "16+": 12')
})

test('buildLowestBoardingEntry caps Year to 1-13 range (defense-in-depth)', () => {
  const fnSrc = source.slice(source.indexOf('function buildLowestBoardingEntry'), source.indexOf('function buildBoardingPupils'))
  assert.match(fnSrc, /y\s*<\s*1\s*\|\|\s*y\s*>\s*13/, 'expected Year 1-13 range guard')
})

test('buildLowestBoardingEntry mentionsBoarding regex matches boarder/boarders', () => {
  const fnSrc = source.slice(source.indexOf('function buildLowestBoardingEntry'), source.indexOf('function buildBoardingPupils'))
  assert.match(fnSrc, /\\bboard\(\?:ing\|er\|ers\)\?\\b/, 'expected \\bboard(?:ing|er|ers)?\\b regex')
})

// RRV-4 (2026-07-20): buildY9Y10Admissions was renamed + generalized to
// buildEntryTimeline (same DB slug, see seed-rows.ts spec-list comment —
// reconcileSeededRows rewrites row_name/cell_data in place, no migration).
// It keeps the same [entry_point, year, age] candidate-walk, but now
// matches the family's actual profile.child_year instead of hardcoding
// Year 9/10, and returns a classified deadline state instead of the raw
// entry_point label.
test('buildEntryTimeline walks [entry_point, year, age] in that priority', () => {
  const fnSrc = source.slice(source.indexOf('function buildEntryTimeline'), source.indexOf('function buildSchoolView'))
  assert.match(
    fnSrc,
    /\[o\.entry_point,\s*o\.year,\s*o\.age\]/,
    'expected candidate array [o.entry_point, o.year, o.age] in priority order',
  )
})

test('buildEntryTimeline walks [entry_point, year, age] candidates via helper', () => {
  const fnSrc = source.slice(source.indexOf('function buildEntryTimeline'), source.indexOf('function buildSchoolView'))
  assert.match(fnSrc, /for\s*\(\s*const\s+raw\s+of\s*\[o\.entry_point,\s*o\.year,\s*o\.age\]/, 'expected candidate-walk loop (Codex r2)')
  assert.match(fnSrc, /extractUkYearFromString\(raw\)/, 'expected helper call inside candidate-walk')
})

test('buildEntryTimeline matches profile.child_year, no longer hardcodes Year 9/10 only', () => {
  const fnSrc = source.slice(source.indexOf('function buildEntryTimeline'), source.indexOf('function buildSchoolView'))
  assert.match(fnSrc, /CHILD_YEAR_TO_UK_YEAR/, 'expected child_year → UK Year mapping')
  assert.doesNotMatch(fnSrc, /y\s*!==\s*9\s*&&\s*y\s*!==\s*10/, 'must not still hardcode a Year 9/10-only filter')
})

test('classifyDeadlineText never asserts a dated deadline when the source text admits none is stated', () => {
  // Pre-build review must-fix: "7 September 2026 (opens); deadline not
  // explicitly stated..." must not render as a confident dated deadline.
  assert.match(source, /DEADLINE_NOT_STATED/, 'expected an embedded-disclaimer guard before the date regex')
  const fnSrc = source.slice(source.indexOf('function classifyDeadlineText'), source.indexOf('function buildEntryTimeline'))
  const deadlineCheckIdx = fnSrc.indexOf('DEADLINE_NOT_STATED.test')
  const dateParseIdx = fnSrc.indexOf('parseDeadlineDate(trimmed)')
  assert.ok(deadlineCheckIdx > -1 && dateParseIdx > -1 && deadlineCheckIdx < dateParseIdx,
    'DEADLINE_NOT_STATED must be checked BEFORE attempting the date parse')
})

// ─── Layer 2: logic tests against real extractor fixtures ────────────────
//
// Inline re-implementation mirrors seed-rows.ts exactly. Diverging from the
// source means this test should fail — catches divergence as well as
// regression.

function patchedBuildHeathrowMinutes(struct) {
  const lp = struct?.location_profile
  if (!lp || typeof lp !== 'object') return null
  const airports = lp.airports
  if (!Array.isArray(airports)) return null
  for (const a of airports) {
    if (!a || typeof a !== 'object') continue
    const obj = a
    const nameStr = String(obj.name ?? obj.label ?? obj.code ?? '').toLowerCase()
    if (!/heathrow|lhr/.test(nameStr)) continue
    const m = obj.drive_time_min_estimate ?? obj.minutes ?? obj.travel_minutes ?? obj.drive_minutes ?? obj.duration_minutes
    // RRV-7: numeric branch mirrors the parallel `minutes` field (travel
    // corridor); string branch stays minutes-less on purpose.
    if (typeof m === 'number' && m > 0) return { value: `${m} min`, source: 'location_profile', minutes: m }
    if (typeof m === 'string' && m.trim()) return { value: m, source: 'location_profile' }
  }
  return null
}

const PLUS_TO_YEAR = Object.freeze({
  '7+': 3, '8+': 4, '11+': 7, '13+': 9, '14+': 10, '16+': 12,
})

function extractUkYearFromString(s) {
  const yearM = s.match(/\byear\s+(\d{1,2})(?!\d)/i)
  if (yearM) {
    const n = Number(yearM[1])
    if (n >= 1 && n <= 13) return n
  }
  const plusM = s.match(/\b(\d{1,2}\+)/)
  if (plusM && plusM[1] in PLUS_TO_YEAR) {
    return PLUS_TO_YEAR[plusM[1]]
  }
  if (/sixth\s*form/i.test(s)) return 12
  if (!plusM) {
    const anyM = s.match(/\b(\d{1,2})(?!\d)/)
    if (anyM) {
      const n = Number(anyM[1])
      if (n >= 1 && n <= 13) return n
    }
  }
  return null
}

function patchedBuildLowestBoardingEntry(struct) {
  const af = struct?.admissions_format
  const ep = af?.entry_points
  if (!Array.isArray(ep)) return null
  let lowestBoarding = null
  let lowestOverall = null
  for (const e of ep) {
    if (!e) continue
    let y = null
    let mentionsBoarding = false
    if (typeof e === 'object') {
      const o = e
      // Walk candidates so an unparseable entry_point doesn't mask numeric year/age.
      for (const raw of [o.entry_point, o.year, o.age]) {
        if (typeof raw === 'number') { y = raw; break }
        if (typeof raw === 'string') {
          const parsed = extractUkYearFromString(raw)
          if (parsed != null) { y = parsed; break }
        }
      }
      // Deliberately EXCLUDE assessment from blob (per Codex r3) — "exam board" false-positives.
      const blob = `${o.entry_point ?? ''} ${o.label ?? ''} ${o.note ?? ''} ${o.boarding ?? ''}`.toLowerCase()
      mentionsBoarding = /\bboard(?:ing|er|ers)?\b/.test(blob) || o.boarding === true
    } else if (typeof e === 'string') {
      y = extractUkYearFromString(e)
      mentionsBoarding = /\bboard(?:ing|er|ers)?\b/i.test(e)
    }
    if (y == null) continue
    if (y < 1 || y > 13) continue
    if (mentionsBoarding && (lowestBoarding == null || y < lowestBoarding)) lowestBoarding = y
    if (lowestOverall == null || y < lowestOverall) lowestOverall = y
  }
  const pick = lowestBoarding ?? lowestOverall
  if (pick == null) return null
  return { value: `Year ${pick}`, source: 'admissions_format.entry_points' }
}

const CHILD_YEAR_TO_UK_YEAR = Object.freeze({
  'year-7': 7, 'year-9': 9, 'year-10': 10, 'sixth-form': 12,
})

const MONTH_NUM = Object.freeze({
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
})

function patchedParseDeadlineDate(text) {
  const m = text.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i
  )
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = MONTH_NUM[m[2].toLowerCase()]
  const year = m[3]
  const display = `${m[1]} ${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()} ${year}`
  return { iso: `${year}-${month}-${day}`, display }
}

const NO_DATA_TEXT = /^not (specified|stated|explicitly stated)|^(n\/?a|unknown|tbc|tbd)$/i
const DEADLINE_NOT_STATED = /deadline\s+(is\s+)?not\s+(explicitly\s+)?stated|deadline\s+not\s+specified/i
const LOOKS_LIKE_FEE = /[£$¥]\s?\d/

function patchedTruncateAtWord(s, max) {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.4 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

function patchedClassifyDeadlineText(text) {
  if (!text) return null
  const trimmed = text.trim()
  if (!trimmed || NO_DATA_TEXT.test(trimmed)) return null
  if (/rolling|no formal|no deadline|none\s*[—-]|year.?round|throughout|any\s*time|anytime/i.test(trimmed)) {
    return { value: 'Rolling admissions', source: 'admissions_format.entry_points', entryState: 'rolling' }
  }
  if (DEADLINE_NOT_STATED.test(trimmed)) return null
  const dated = patchedParseDeadlineDate(trimmed)
  if (dated) {
    return { value: dated.display, source: 'admissions_format.entry_points', entryState: 'dated', deadlineIso: dated.iso }
  }
  if (LOOKS_LIKE_FEE.test(trimmed)) return null
  return { value: patchedTruncateAtWord(trimmed, 70), source: 'admissions_format.entry_points', entryState: 'vague' }
}

function patchedBuildEntryTimeline({ struct, profile }) {
  const af = struct?.admissions_format
  const ep = af?.entry_points
  if (!Array.isArray(ep) || ep.length === 0) return null
  const targetYear = profile?.child_year ? CHILD_YEAR_TO_UK_YEAR[profile.child_year] ?? null : null
  let matched = null, matchedYear = null
  let lowest = null, lowestYear = null
  for (const e of ep) {
    if (!e || typeof e !== 'object') continue
    const o = e
    let y = null
    for (const raw of [o.entry_point, o.year, o.age]) {
      if (typeof raw === 'number') { y = raw; break }
      if (typeof raw === 'string') {
        const parsed = extractUkYearFromString(raw)
        if (parsed != null) { y = parsed; break }
      }
    }
    if (y == null || y < 1 || y > 13) continue
    if (targetYear != null && y === targetYear && matched == null) { matched = o; matchedYear = y }
    if (lowestYear == null || y < lowestYear) { lowestYear = y; lowest = o }
  }
  const use = matched ?? lowest
  const useYear = matchedYear ?? lowestYear
  if (!use) return null
  const deadlineRaw = typeof use.registration_deadline === 'string' ? use.registration_deadline : null
  const assessRaw = typeof use.assessment_date === 'string' ? use.assessment_date : null
  const classified = patchedClassifyDeadlineText(deadlineRaw) ?? patchedClassifyDeadlineText(assessRaw)
  if (!classified) return null
  return { ...classified, note: useYear != null ? `Year ${useYear} entry` : undefined }
}

// ─── Fixtures from real Supabase data 2026-05-15 ────────────────────────

const FIXTURE_ACS_COBHAM = {
  location_profile: {
    airports: [
      { name: 'Heathrow', distance_km: 14, drive_time_min_estimate: 28 },
      { name: 'Gatwick', distance_km: 26, drive_time_min_estimate: 44 },
    ],
  },
}

const FIXTURE_RUGBY = {
  location_profile: {
    airports: [
      { name: 'Birmingham', distance_km: 34, drive_time_min_estimate: 54 },
      { name: 'Luton', distance_km: 82, drive_time_min_estimate: 117 },
      { name: 'Heathrow', distance_km: 114, drive_time_min_estimate: 158 },
    ],
  },
}

const FIXTURE_LANCING = {
  admissions_format: {
    entry_points: [
      { assessment: 'Familiarisation Day', entry_point: 'Year 9 (Third Form, age ~13) — Advance Programme' },
      { assessment: null, entry_point: 'Year 9 (Third Form, age ~13) — Direct 13+ entry' },
      { assessment: null, entry_point: 'Year 10 (Fourth Form, age ~14)' },
      { assessment: null, entry_point: 'Sixth Form (age 16+)' },
    ],
  },
}

const FIXTURE_ROEDEAN = {
  admissions_format: {
    entry_points: [
      { entry_point: '11+ (Year 7)', assessment: 'Entrance tests' },
      { entry_point: '13+ (Year 9)', assessment: 'Entrance tests' },
      { entry_point: '16+ (Year 12)', assessment: 'Academic record' },
    ],
  },
}

const FIXTURE_AMPLEFORTH = {
  admissions_format: {
    entry_points: [
      { entry_point: '11+ (Year 7)' },
      { entry_point: '13+ (Year 9)' },
      { entry_point: '14-15 (Year 10-11)' },
      { entry_point: '16+ (Year 12 - Sixth Form)' },
      { entry_point: 'Overseas students' },
    ],
  },
}

// ─── Layer 2: buildHeathrowMinutes logic tests ───────────────────────────

test('buildHeathrowMinutes — ACS Cobham renders 28 min', () => {
  const r = patchedBuildHeathrowMinutes(FIXTURE_ACS_COBHAM)
  assert.deepEqual(r, { value: '28 min', source: 'location_profile', minutes: 28 })
})

test('buildHeathrowMinutes — Rugby renders 158 min (Heathrow is 3rd in list)', () => {
  const r = patchedBuildHeathrowMinutes(FIXTURE_RUGBY)
  assert.deepEqual(r, { value: '158 min', source: 'location_profile', minutes: 158 })
})

test('buildHeathrowMinutes — empty struct returns null', () => {
  assert.equal(patchedBuildHeathrowMinutes({}), null)
  assert.equal(patchedBuildHeathrowMinutes({ location_profile: {} }), null)
  assert.equal(patchedBuildHeathrowMinutes({ location_profile: { airports: [] } }), null)
})

test('buildHeathrowMinutes — no Heathrow in list returns null', () => {
  const r = patchedBuildHeathrowMinutes({
    location_profile: { airports: [{ name: 'Gatwick', drive_time_min_estimate: 30 }] },
  })
  assert.equal(r, null)
})

// ─── Layer 2: buildLowestBoardingEntry logic tests ───────────────────────

test('buildLowestBoardingEntry — Lancing renders Year 9', () => {
  const r = patchedBuildLowestBoardingEntry(FIXTURE_LANCING)
  assert.deepEqual(r, { value: 'Year 9', source: 'admissions_format.entry_points' })
})

test('buildLowestBoardingEntry — Roedean renders Year 7 (lowest)', () => {
  const r = patchedBuildLowestBoardingEntry(FIXTURE_ROEDEAN)
  assert.deepEqual(r, { value: 'Year 7', source: 'admissions_format.entry_points' })
})

test('buildLowestBoardingEntry — Ampleforth-style "14-15 (Year 10-11)" extracts Year 10', () => {
  // The Year N regex picks "Year 10", not the leading "14" or "15"
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: { entry_points: [{ entry_point: '14-15 (Year 10-11)' }] },
  })
  assert.deepEqual(r, { value: 'Year 10', source: 'admissions_format.entry_points' })
})

test('buildLowestBoardingEntry — out-of-range year (e.g. "Year 99") gets capped out', () => {
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: { entry_points: [{ entry_point: 'Year 99 (weird)' }] },
  })
  assert.equal(r, null, 'Year 99 outside 1-13 range, should not render')
})

test('buildLowestBoardingEntry — empty/missing returns null', () => {
  assert.equal(patchedBuildLowestBoardingEntry({}), null)
  assert.equal(patchedBuildLowestBoardingEntry({ admissions_format: {} }), null)
  assert.equal(patchedBuildLowestBoardingEntry({ admissions_format: { entry_points: [] } }), null)
})

// ─── Layer 2: buildEntryTimeline (RRV-4) logic tests ─────────────────────
//
// Multi-year fixture so child_year-matching is actually exercised: Year 7
// is rolling, Year 9 has a clean dated deadline, Sixth Form's text admits
// no deadline is stated (must NOT misread the incidental date inside it).
const FIXTURE_TIMELINE_MULTI_YEAR = {
  admissions_format: {
    entry_points: [
      { entry_point: '11+ (Year 7)', registration_deadline: 'Rolling admissions — no fixed deadline' },
      { entry_point: '13+ (Year 9)', registration_deadline: '13 November 2026' },
      { entry_point: 'Sixth Form (16+)', registration_deadline: '7 September 2026 (opens); deadline not explicitly stated but registration for 2027 entry opens 7 Sept 2026' },
    ],
  },
}

test('buildEntryTimeline — Roedean "13+ (Year 9)" with no profile falls back to lowest entry point', () => {
  // ROEDEAN fixture has no registration_deadline/assessment_date at all
  // (pre-RRV-4 fixture) — classifyDeadlineText(null) returns null on both,
  // so the row has nothing to render, same as the old function on this
  // fixture's shape. Confirms the candidate-walk/fallback still runs even
  // when there's no deadline text to classify.
  const r = patchedBuildEntryTimeline({ struct: FIXTURE_ROEDEAN, profile: null })
  assert.equal(r, null, 'no registration_deadline/assessment_date anywhere in this fixture')
})

test('buildEntryTimeline — matches profile.child_year to the RIGHT entry point (not hardcoded 9/10)', () => {
  const rYear7 = patchedBuildEntryTimeline({ struct: FIXTURE_TIMELINE_MULTI_YEAR, profile: { child_year: 'year-7' } })
  assert.deepEqual(rYear7, { value: 'Rolling admissions', source: 'admissions_format.entry_points', entryState: 'rolling', note: 'Year 7 entry' },
    'a Year-7 family must see the Year 7 row, not fall through to Year 9')

  const rYear9 = patchedBuildEntryTimeline({ struct: FIXTURE_TIMELINE_MULTI_YEAR, profile: { child_year: 'year-9' } })
  assert.deepEqual(rYear9, { value: '13 November 2026', source: 'admissions_format.entry_points', entryState: 'dated', deadlineIso: '2026-11-13', note: 'Year 9 entry' })

  const rSixth = patchedBuildEntryTimeline({ struct: FIXTURE_TIMELINE_MULTI_YEAR, profile: { child_year: 'sixth-form' } })
  assert.equal(rSixth, null,
    'Sixth Form text admits "deadline not explicitly stated" — must be a gap, not a misread dated deadline')
})

test('buildEntryTimeline — no profile / not-sure falls back to the lowest entry point overall', () => {
  const rNoProfile = patchedBuildEntryTimeline({ struct: FIXTURE_TIMELINE_MULTI_YEAR, profile: null })
  assert.equal(rNoProfile.note, 'Year 7 entry', 'general-lens/anonymous flow should show the earliest entry point')

  const rNotSure = patchedBuildEntryTimeline({ struct: FIXTURE_TIMELINE_MULTI_YEAR, profile: { child_year: 'not-sure' } })
  assert.equal(rNotSure.note, 'Year 7 entry')
})

test('buildEntryTimeline — target year not offered by this school falls back to lowest overall', () => {
  // Family wants Year 10; this school only offers 7/9/sixth-form.
  const r = patchedBuildEntryTimeline({ struct: FIXTURE_TIMELINE_MULTI_YEAR, profile: { child_year: 'year-10' } })
  assert.equal(r.note, 'Year 7 entry')
})

// ─── Codex r1 follow-up tests ────────────────────────────────────────────

test('Codex r1 #1: bare "13+ entry" maps to Year 9 (admissions notation) — RRV-4 buildEntryTimeline', () => {
  const r = patchedBuildEntryTimeline({
    struct: { admissions_format: { entry_points: [{ entry_point: '13+ entry', registration_deadline: '13 November 2026' }] } },
    profile: null,
  })
  assert.equal(r?.note, 'Year 9 entry', '"13+ entry" alone should map to Year 9 — was previously misread')
})

test('Codex r1 #1: bare "13+" in lowest_boarding maps to Year 9 not Year 13', () => {
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: { entry_points: [{ entry_point: '13+' }] },
  })
  assert.deepEqual(r, { value: 'Year 9', source: 'admissions_format.entry_points' })
})

test('Codex r1 #2: "Year 100" must NOT match Year 10 (lookahead guard) — RRV-4 buildEntryTimeline', () => {
  const r = patchedBuildEntryTimeline({
    struct: { admissions_format: { entry_points: [{ entry_point: 'Year 100 (weird)' }] } },
    profile: null,
  })
  assert.equal(r, null, 'Year 100 is out of the 1-13 range guard, so no entry point should match at all')
})

test('Codex r1 #2: "Year 100" rejects in lowest_boarding too', () => {
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: { entry_points: [{ entry_point: 'Year 100' }] },
  })
  assert.equal(r, null)
})

test('Codex r1 #9: explicit `boarder` mention sets mentionsBoarding (not just `boarding`)', () => {
  // Two entries: Year 7 with no boarding signal, Year 9 with "boarders" mention
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: {
      entry_points: [
        { entry_point: 'Year 7 (day only)' },
        { entry_point: 'Year 9', note: 'first year boarders accepted here' },
      ],
    },
  })
  assert.deepEqual(r, { value: 'Year 9', source: 'admissions_format.entry_points' },
    'lowest BOARDING entry should pick Year 9, not the lower Year 7 (which is day-only)')
})

test('Codex r2 #1: structured numeric year FALLBACK fires when entry_point unparseable', () => {
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: {
      entry_points: [
        { year: 7, entry_point: 'unparseable garbage no digits or year keyword' },
      ],
    },
  })
  // Per Codex r2: walk candidates [entry_point, year, age] and stop at first parseable.
  // entry_point yields null from helper → fall through to year=7.
  assert.deepEqual(r, { value: 'Year 7', source: 'admissions_format.entry_points' },
    'numeric year=7 must surface when entry_point is unparseable string')
})

test('Codex r2 #1: same candidate-walk in buildEntryTimeline (RRV-4)', () => {
  const r = patchedBuildEntryTimeline({
    struct: {
      admissions_format: {
        entry_points: [
          { year: 9, entry_point: 'Overseas students', registration_deadline: 'Rolling admissions' },
        ],
      },
    },
    profile: null,
  })
  assert.ok(r != null, 'numeric year=9 must surface when entry_point is unparseable')
  assert.equal(r.note, 'Year 9 entry', 'the year candidate-walk still resolves via numeric `year` when entry_point text is unparseable')
})

test('Codex r2 #1: age-as-string fallback also fires', () => {
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: {
      entry_points: [
        { entry_point: null, year: undefined, age: '13+' },
      ],
    },
  })
  // entry_point null → skip; year undefined → skip; age "13+" string → Year 9
  assert.deepEqual(r, { value: 'Year 9', source: 'admissions_format.entry_points' })
})

test('Codex r3: "exam board" in assessment does NOT false-trigger boarding', () => {
  // Codex r3 finding: previously assessment was in the blob, so "exam board"
  // would match \bboard\b and falsely mark Year 7 as a boarding entry. The fix
  // dropped assessment from the blob.
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: {
      entry_points: [{ entry_point: 'Year 7', assessment: 'Set by the exam board' }],
    },
  })
  // Year 7 still surfaces — but as lowest-OVERALL, not lowest-BOARDING.
  // Single-entry corpus means same result; mixed-entry test below is the real proof.
  assert.deepEqual(r, { value: 'Year 7', source: 'admissions_format.entry_points' })
})

test('Codex r3: mixed rows — Year 7 day-only beats Year 9 boarder ONLY when boarding signal is real', () => {
  // The bug Codex r3 surfaced: if Year 7 has assessment "Set by the exam board" AND
  // Year 9 has note "boarders accepted", buggy code returned Year 7 (the "board" in
  // exam board falsely classified Year 7 as boarding). After fix: returns Year 9.
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: {
      entry_points: [
        { entry_point: 'Year 7', assessment: 'Set by the exam board' },           // day-only, exam board reference
        { entry_point: 'Year 9', note: 'boarders accepted from this year' },      // real boarder row
      ],
    },
  })
  assert.deepEqual(r, { value: 'Year 9', source: 'admissions_format.entry_points' },
    'lowest-BOARDING must be Year 9 because exam-board reference no longer false-matches')
})

test('Codex r1 cleanup: extractUkYearFromString "Sixth Form" → Year 12', () => {
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: { entry_points: [{ entry_point: 'Sixth Form (age 16+)' }] },
  })
  // "16+" matches first (NN+ notation → Year 12). Same answer as Sixth Form path.
  assert.deepEqual(r, { value: 'Year 12', source: 'admissions_format.entry_points' })
})

test('Codex r1 cleanup: bare "Sixth Form" with no 16+ also → Year 12', () => {
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: { entry_points: [{ entry_point: 'Sixth Form entry' }] },
  })
  assert.deepEqual(r, { value: 'Year 12', source: 'admissions_format.entry_points' })
})

// ─── 2026-05-19: buildDayPupils + buildClassSize range-average tests ─────

// Layer 1: source-text assertions on the patched builders.

test('buildDayPupils derives total − boarders from extractor when both present', () => {
  const fnSrc = source.slice(source.indexOf('function buildDayPupils'), source.indexOf('function buildBoardingRatio'))
  assert.match(fnSrc, /total_pupils/,           'expected total_pupils read')
  assert.match(fnSrc, /boarder_count/,          'expected boarder_count read')
  assert.match(fnSrc, /extTotal\s*>\s*extBoarders/,       'expected total > boarders sanity guard (extractor)')
  assert.match(fnSrc, /notionTotal\s*>\s*notionBoarders/, 'expected total > boarders sanity guard (notion)')
  assert.match(fnSrc, /Total\s*−\s*Boarders/,   'expected display note "Total − Boarders"')
})

test('buildDayPupils never mixes extractor total with notion boarders (same-source rule)', () => {
  const fnSrc = source.slice(source.indexOf('function buildDayPupils'), source.indexOf('function buildBoardingRatio'))
  // The extractor branch uses extTotal+extBoarders together; the notion branch uses notion-only.
  // Source-text guard: neither branch should reference the other source's variable.
  const extBranch = fnSrc.slice(fnSrc.indexOf('extTotal != null'), fnSrc.indexOf('notionTotal'))
  assert.doesNotMatch(extBranch, /notionTotal|notionBoarders/, 'extractor branch must not read notion values')
  const notionBranch = fnSrc.slice(fnSrc.indexOf('notionTotal != null'))
  assert.doesNotMatch(notionBranch, /extTotal|extBoarders/, 'notion branch must not read extractor values')
})

test('buildClassSize formats range averages via fmtBucket on o.average', () => {
  const fnSrc = source.slice(source.indexOf('function buildClassSize'), source.indexOf('function buildTotalPupils'))
  // Old code: `if (typeof o.average === 'number')` — narrow, rejects {min,max}.
  // New code: `const avg = fmtBucket(o.average)` — handles both shapes.
  assert.match(fnSrc, /const\s+avg\s*=\s*fmtBucket\(o\.average\)/, 'expected fmtBucket(o.average)')
  assert.match(fnSrc, /~\$\{avg\}\s*avg/, 'expected "~${avg} avg" render')
})

// Layer 2: inline-reimplementation logic tests.

function patchedBuildDayPupils({ struct, notion }) {
  const sc = struct?.student_community
  const extTotal    = typeof sc?.total_pupils  === 'number' ? sc.total_pupils  : null
  const extBoarders = typeof sc?.boarder_count === 'number' ? sc.boarder_count : null
  if (extTotal != null && extBoarders != null && extTotal > extBoarders) {
    return {
      value:  `~${(extTotal - extBoarders).toLocaleString()}`,
      source: 'derived: student_community.total_pupils − boarder_count',
      note:   'Total − Boarders',
    }
  }
  const notionTotal    = typeof notion?.parsed?.total_pupils  === 'number' && Number.isFinite(notion.parsed.total_pupils)  ? notion.parsed.total_pupils  : null
  const notionBoarders = typeof notion?.parsed?.boarder_count === 'number' && Number.isFinite(notion.parsed.boarder_count) ? notion.parsed.boarder_count : null
  if (notionTotal != null && notionBoarders != null && notionTotal > notionBoarders) {
    return {
      value:  `~${(notionTotal - notionBoarders).toLocaleString()}`,
      source: 'derived: notion.parsed.total_pupils − boarder_count',
      note:   'Total − Boarders',
    }
  }
  return null
}

test('buildDayPupils — extractor branch derives 870 - 700 = 170', () => {
  const r = patchedBuildDayPupils({ struct: { student_community: { total_pupils: 870, boarder_count: 700 } }, notion: null })
  assert.deepEqual(r, {
    value:  '~170',
    source: 'derived: student_community.total_pupils − boarder_count',
    note:   'Total − Boarders',
  })
})

test('buildDayPupils — notion branch fires when extractor side absent', () => {
  const r = patchedBuildDayPupils({
    struct: { student_community: { total_pupils: null, boarder_count: 320 } },
    notion: { parsed: { total_pupils: 600, boarder_count: 320 } },
  })
  assert.deepEqual(r, {
    value:  '~280',
    source: 'derived: notion.parsed.total_pupils − boarder_count',
    note:   'Total − Boarders',
  })
})

test('buildDayPupils — returns null when total ≤ boarders (data error)', () => {
  // Negative day pupils = boarding-only school or bad data. Don't surface.
  const r = patchedBuildDayPupils({ struct: { student_community: { total_pupils: 500, boarder_count: 500 } }, notion: null })
  assert.equal(r, null)
})

test('buildDayPupils — returns null when neither source is complete', () => {
  assert.equal(patchedBuildDayPupils({ struct: null, notion: null }), null)
  assert.equal(patchedBuildDayPupils({ struct: { student_community: { total_pupils: 600 } }, notion: null }), null) // boarders missing
  assert.equal(patchedBuildDayPupils({ struct: null, notion: { parsed: { total_pupils: 600 } } }), null)            // boarders missing
})

test('buildDayPupils — does NOT mix extractor total with notion boarders', () => {
  // Bedford-style data: extractor has total but not boarders, Notion has both.
  // Earlier (naive) impl might mix extTotal + notionBoarders. We must not.
  // Verify by setting up a state where mixing would produce a value but
  // each-source-alone returns null on one side.
  const r = patchedBuildDayPupils({
    struct: { student_community: { total_pupils: 1000, boarder_count: null } },
    notion: { parsed: { total_pupils: null, boarder_count: 400 } },
  })
  assert.equal(r, null, 'must not derive when extractor total + notion boarders only')
})

// buildClassSize range-average logic
function patchedBuildClassSize({ notion }) {
  const parsed = notion?.parsed?.class_size
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed
  const fmtBucket = (v) => {
    if (typeof v === 'number') return String(v)
    if (v && typeof v === 'object') {
      const r = v
      if (typeof r.min === 'number' && typeof r.max === 'number') {
        return r.min === r.max ? String(r.min) : `${r.min}–${r.max}`
      }
    }
    return null
  }
  const senior = fmtBucket(o.senior)
  const sixth = fmtBucket(o.sixth)
  if (senior && sixth) return { value: `Senior ${senior} · Sixth ${sixth}`, source: 'notion.parsed.class_size' }
  if (senior) return { value: senior, source: 'notion.parsed.class_size' }
  if (sixth) return { value: sixth, source: 'notion.parsed.class_size' }
  const avg = fmtBucket(o.average)
  if (avg) return { value: `~${avg} avg`, source: 'notion.parsed.class_size' }
  return null
}

test('buildClassSize — scalar average renders "~14 avg" (Group B)', () => {
  const r = patchedBuildClassSize({ notion: { parsed: { class_size: { average: 14 } } } })
  assert.equal(r.value, '~14 avg')
})

test('buildClassSize — range average renders "~12–15 avg" (Group B range)', () => {
  const r = patchedBuildClassSize({ notion: { parsed: { class_size: { average: { min: 12, max: 15 } } } } })
  assert.equal(r.value, '~12–15 avg')
})

test('buildClassSize — senior-only scalar still renders just the number', () => {
  const r = patchedBuildClassSize({ notion: { parsed: { class_size: { senior: 11 } } } })
  assert.equal(r.value, '11')
})

test('buildClassSize — senior+sixth renders combined string', () => {
  const r = patchedBuildClassSize({ notion: { parsed: { class_size: { senior: 16, sixth: 12 } } } })
  assert.equal(r.value, 'Senior 16 · Sixth 12')
})

test('buildClassSize — senior range + sixth scalar (eton)', () => {
  const r = patchedBuildClassSize({ notion: { parsed: { class_size: { senior: { min: 20, max: 25 }, sixth: 10 } } } })
  assert.equal(r.value, 'Senior 20–25 · Sixth 10')
})
