// Phase 2 builder-bug fixes (2026-05-15) — regression test
//
// Tests the 3 fixes to seed-rows.ts that surfaced from the 2026-05-15
// comparison-table audit:
//   - buildHeathrowMinutes:    extractor writes `drive_time_min_estimate`, not `minutes`
//   - buildLowestBoardingEntry: extractor writes `entry_point` (string), not `year`/`age`
//   - buildY9Y10Admissions:    same root cause as above
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

test('buildY9Y10Admissions walks [entry_point, year, age] in that priority', () => {
  const fnSrc = source.slice(source.indexOf('function buildY9Y10Admissions'), source.indexOf('function buildSchoolView'))
  assert.match(
    fnSrc,
    /\[o\.entry_point,\s*o\.year,\s*o\.age\]/,
    'expected candidate array [o.entry_point, o.year, o.age] in priority order',
  )
})

test('buildY9Y10Admissions walks [entry_point, year, age] candidates via helper', () => {
  const fnSrc = source.slice(source.indexOf('function buildY9Y10Admissions'), source.indexOf('function buildSchoolView'))
  assert.match(fnSrc, /for\s*\(\s*const\s+raw\s+of\s*\[o\.entry_point,\s*o\.year,\s*o\.age\]/, 'expected candidate-walk loop (Codex r2)')
  assert.match(fnSrc, /extractUkYearFromString\(raw\)/, 'expected helper call inside candidate-walk')
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
    if (typeof m === 'number' && m > 0) return { value: `${m} min`, source: 'location_profile' }
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

function patchedBuildY9Y10Admissions(struct) {
  const af = struct?.admissions_format
  const ep = af?.entry_points
  if (!Array.isArray(ep)) return null
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
    if (y !== 9 && y !== 10) continue
    const labelRaw = o.entry_point ?? o.label ?? o.note ?? o.requirement
    if (typeof labelRaw === 'string' && labelRaw.trim()) {
      const trimmed = labelRaw.trim().slice(0, 80)
      return { value: trimmed, source: 'admissions_format.entry_points' }
    }
    return { value: `Year ${y} entry`, source: 'admissions_format.entry_points' }
  }
  return null
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
  assert.deepEqual(r, { value: '28 min', source: 'location_profile' })
})

test('buildHeathrowMinutes — Rugby renders 158 min (Heathrow is 3rd in list)', () => {
  const r = patchedBuildHeathrowMinutes(FIXTURE_RUGBY)
  assert.deepEqual(r, { value: '158 min', source: 'location_profile' })
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

// ─── Layer 2: buildY9Y10Admissions logic tests ──────────────────────────

test('buildY9Y10Admissions — Lancing returns first Year 9 entry_point label', () => {
  const r = patchedBuildY9Y10Admissions(FIXTURE_LANCING)
  assert.ok(r != null)
  assert.match(r.value, /Year 9/)
  assert.equal(r.source, 'admissions_format.entry_points')
})

test('buildY9Y10Admissions — Roedean "13+ (Year 9)" returns the entry_point text', () => {
  const r = patchedBuildY9Y10Admissions(FIXTURE_ROEDEAN)
  assert.deepEqual(r, { value: '13+ (Year 9)', source: 'admissions_format.entry_points' })
})

test('buildY9Y10Admissions — no Year 9/10 returns null', () => {
  const r = patchedBuildY9Y10Admissions({
    admissions_format: { entry_points: [{ entry_point: '11+ (Year 7)' }] },
  })
  assert.equal(r, null)
})

// ─── Codex r1 follow-up tests ────────────────────────────────────────────

test('Codex r1 #1: bare "13+ entry" maps to Year 9 (admissions notation)', () => {
  const r = patchedBuildY9Y10Admissions({
    admissions_format: { entry_points: [{ entry_point: '13+ entry' }] },
  })
  assert.deepEqual(r, { value: '13+ entry', source: 'admissions_format.entry_points' },
    '"13+ entry" alone should map to Year 9 — was previously misread')
})

test('Codex r1 #1: bare "13+" in lowest_boarding maps to Year 9 not Year 13', () => {
  const r = patchedBuildLowestBoardingEntry({
    admissions_format: { entry_points: [{ entry_point: '13+' }] },
  })
  assert.deepEqual(r, { value: 'Year 9', source: 'admissions_format.entry_points' })
})

test('Codex r1 #2: "Year 100" must NOT match Year 10 (lookahead guard)', () => {
  const r = patchedBuildY9Y10Admissions({
    admissions_format: { entry_points: [{ entry_point: 'Year 100 (weird)' }] },
  })
  assert.equal(r, null, 'Year 100 must not pass through to Year 9/10 filter')
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

test('Codex r2 #1: same candidate-walk in buildY9Y10Admissions', () => {
  const r = patchedBuildY9Y10Admissions({
    admissions_format: {
      entry_points: [
        { year: 9, entry_point: 'Overseas students' },
      ],
    },
  })
  assert.ok(r != null, 'numeric year=9 must surface when entry_point is unparseable')
  // labelRaw also walks entry_point first, so returns the "Overseas students" string
  assert.equal(r.value, 'Overseas students')
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
