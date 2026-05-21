// rr-8-build3-sibling-gender-year chat-quality (2026-05-21) —
// UK academic-year helper tests.
//
// These are pure-function tests; no server-only stub needed.
//
// Run via:
//   cd website
//   node --experimental-strip-types --test \
//     lib/server/research-room/uk-school-year.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseIsoDateOnly,
  academicStartYear,
  ukSchoolYearNumber,
  childYearValue,
  buildUkYearHint,
} from './uk-school-year.ts'

// ── parseIsoDateOnly ─────────────────────────────────────────────────

test('parseIsoDateOnly: valid YYYY-MM-DD round-trips to UTC midnight', () => {
  const d = parseIsoDateOnly('2012-02-02')
  assert.ok(d, 'expected a Date')
  assert.equal(d.getUTCFullYear(), 2012)
  assert.equal(d.getUTCMonth(), 1)   // 0-indexed: February
  assert.equal(d.getUTCDate(), 2)
  assert.equal(d.getUTCHours(), 0)
})

test('parseIsoDateOnly: null / undefined / empty / malformed → null', () => {
  assert.equal(parseIsoDateOnly(null), null)
  assert.equal(parseIsoDateOnly(undefined), null)
  assert.equal(parseIsoDateOnly(''), null)
  assert.equal(parseIsoDateOnly('not-a-date'), null)
  assert.equal(parseIsoDateOnly('2012/02/02'), null)   // wrong separator
  assert.equal(parseIsoDateOnly('12-02-02'), null)     // 2-digit year
  assert.equal(parseIsoDateOnly('2012-2-2'), null)     // no zero-padding
})

test('parseIsoDateOnly: invalid month/day → null (Feb 30 rejected)', () => {
  // Date() will silently roll Feb 30 forward; round-trip check catches it.
  assert.equal(parseIsoDateOnly('2023-02-30'), null)
  assert.equal(parseIsoDateOnly('2023-13-01'), null)   // month 13
  assert.equal(parseIsoDateOnly('2023-00-15'), null)   // month 0
  assert.equal(parseIsoDateOnly('2023-04-31'), null)   // April only has 30 days
})

// ── academicStartYear ────────────────────────────────────────────────

test('academicStartYear: dates BEFORE Sept 1 stay in prior academic year', () => {
  // 2026-05-21 → we are in the 2025-26 academic year → start = 2025.
  assert.equal(academicStartYear(new Date(Date.UTC(2026, 4, 21))), 2025)
  // 2026-01-01 → still 2025-26.
  assert.equal(academicStartYear(new Date(Date.UTC(2026, 0, 1))), 2025)
  // 2026-08-31 → last day before rollover.
  assert.equal(academicStartYear(new Date(Date.UTC(2026, 7, 31))), 2025)
})

test('academicStartYear: Sept 1 IS the rollover day (inclusive)', () => {
  // 2026-09-01 → new academic year 2026-27 begins.
  assert.equal(academicStartYear(new Date(Date.UTC(2026, 8, 1))), 2026)
})

test('academicStartYear: dates AFTER Sept 1 are in the new academic year', () => {
  assert.equal(academicStartYear(new Date(Date.UTC(2026, 8, 2))),  2026)
  assert.equal(academicStartYear(new Date(Date.UTC(2026, 11, 31))), 2026)
})

// ── ukSchoolYearNumber ───────────────────────────────────────────────
//
// Concrete worked examples cover the cutoff edge cases:
//
//   - A child born 2012-02-02 is age 13 on Sept 1 2025 (had birthday by
//     Sept 1 — Feb is < Sept). UK Year on Sept 1 2025 = 13 - 4 = Year 9.
//     For the 2026-27 academic year (Sept 1 2026), they'd be 14 → Year 10.
//
//   - A child born 2012-09-15 is 12 on Sept 1 2025 (Sept 15 birthday hasn't
//     hit yet). UK Year = 12 - 4 = Year 8 (not in entry-point enum →
//     childYearValue returns null).
//
//   - A child born 2012-09-01 (exactly on cutoff) is 13 on Sept 1 2025.
//     UK Year = Year 9.

test('ukSchoolYearNumber: 2012-02-02 in 2025-26 academic year → Year 9', () => {
  assert.equal(ukSchoolYearNumber('2012-02-02', 2025), 9)
})

test('ukSchoolYearNumber: 2012-02-02 in 2026-27 academic year → Year 10', () => {
  assert.equal(ukSchoolYearNumber('2012-02-02', 2026), 10)
})

test('ukSchoolYearNumber: born Sept 1 (exactly on cutoff) counts as had-birthday', () => {
  // Born 2012-09-01 → on Sept 1 2025 they ARE 13 (birthday is Sept 1).
  assert.equal(ukSchoolYearNumber('2012-09-01', 2025), 9)
})

test('ukSchoolYearNumber: born Sept 2 → birthday NOT had yet on Sept 1', () => {
  // Born 2012-09-02 → on Sept 1 2025 they are still 12 (birthday tomorrow).
  // Age 12 - 4 = Year 8.
  assert.equal(ukSchoolYearNumber('2012-09-02', 2025), 8)
})

test('ukSchoolYearNumber: born Dec 31 → birthday near end of calendar year', () => {
  // Born 2014-12-31 → on Sept 1 2025 they are 10 (Dec 31 in 2025 is in the future).
  // Age 10 - 4 = Year 6.
  assert.equal(ukSchoolYearNumber('2014-12-31', 2025), 6)
})

test('ukSchoolYearNumber: clamps out-of-band ages to null', () => {
  // Toddler born 2024 → Year -2 → null.
  assert.equal(ukSchoolYearNumber('2024-01-01', 2025), null)
  // 20-year-old → Year 16 → null.
  assert.equal(ukSchoolYearNumber('2005-01-01', 2025), null)
})

test('ukSchoolYearNumber: null DOB → null', () => {
  assert.equal(ukSchoolYearNumber(null, 2025), null)
  assert.equal(ukSchoolYearNumber('', 2025), null)
  assert.equal(ukSchoolYearNumber('garbage', 2025), null)
})

// ── childYearValue (Year number → enum) ──────────────────────────────

test('childYearValue: maps Y7/Y9/Y10 to canonical enums', () => {
  assert.equal(childYearValue(7),  'year-7')
  assert.equal(childYearValue(9),  'year-9')
  assert.equal(childYearValue(10), 'year-10')
})

test('childYearValue: Y12 and Y13 both map to sixth-form', () => {
  assert.equal(childYearValue(12), 'sixth-form')
  assert.equal(childYearValue(13), 'sixth-form')
})

test('childYearValue: non-entry years return null (Y8, Y11 → not in enum)', () => {
  // Returning null is intentional — we want Nana to ASK rather than
  // confidently misclassify when DOB lands in a non-entry year.
  assert.equal(childYearValue(8),  null)
  assert.equal(childYearValue(11), null)
  assert.equal(childYearValue(6),  null)
  assert.equal(childYearValue(1),  null)
  assert.equal(childYearValue(null), null)
})

// ── buildUkYearHint (integrated) ─────────────────────────────────────
//
// This is what gets injected into the prompt. The shape carries
// BOTH "current academic year" and "next September" so Nana can say
// "Year 9 now, likely Year 10 from September" when relevant — which
// matters during the late-spring / summer parent-research window
// (April-August) when families are actually shortlisting for the
// following September.

test('buildUkYearHint: yoyo (2012-02-02) referenced on 2026-05-21', () => {
  // Real-world test case from the smoke that triggered this fix.
  const ref = new Date(Date.UTC(2026, 4, 21))   // 2026-05-21
  const hint = buildUkYearHint('2012-02-02', ref)
  assert.ok(hint)
  assert.equal(hint.currentLabel,        'Year 9')
  assert.equal(hint.currentValue,        'year-9')
  assert.equal(hint.nextSeptemberLabel,  'Year 10')
  assert.equal(hint.nextSeptemberValue,  'year-10')
})

test('buildUkYearHint: a Y12/Y13 child maps to sixth-form on both sides', () => {
  // Born 2008-06-01 → on Sept 1 2025 = 17 → Year 13.
  // Next September = Year 14 → out of band → null.
  const ref = new Date(Date.UTC(2026, 4, 21))
  const hint = buildUkYearHint('2008-06-01', ref)
  assert.ok(hint)
  assert.equal(hint.currentLabel,       'Year 13')
  assert.equal(hint.currentValue,       'sixth-form')
  assert.equal(hint.nextSeptemberLabel, null)
  assert.equal(hint.nextSeptemberValue, null)
})

test('buildUkYearHint: null DOB → null hint', () => {
  assert.equal(buildUkYearHint(null), null)
  assert.equal(buildUkYearHint(undefined), null)
  assert.equal(buildUkYearHint(''), null)
})

test('buildUkYearHint: Y8 child has labels but no enum mapping', () => {
  // Born 2013-09-15 → on Sept 1 2025 = 11 (birthday not yet) → Year 7?
  // Let's recompute. 2025-2013 = 12, minus 1 (birthday not yet) = 11. Y11-4=Y7.
  // Actually that's Year 7. Let me pick a real Year 8 case.
  // Born 2013-02-01 → on Sept 1 2025 = 12 (birthday by Sept). Y12-4=Y8.
  const ref = new Date(Date.UTC(2026, 4, 21))
  const hint = buildUkYearHint('2013-02-01', ref)
  assert.ok(hint)
  assert.equal(hint.currentLabel, 'Year 8')
  assert.equal(hint.currentValue, null, 'Y8 is not a Build Mode entry year')
  // Next September: Year 9 → entry year.
  assert.equal(hint.nextSeptemberLabel, 'Year 9')
  assert.equal(hint.nextSeptemberValue, 'year-9')
})
