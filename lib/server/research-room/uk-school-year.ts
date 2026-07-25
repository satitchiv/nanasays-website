// rr-8-build3-sibling-gender-year chat-quality (2026-05-21) — UK
// academic-year math from date_of_birth.
//
// UK convention: school year starts September 1. A child's "Year N" is
// determined by their age on Sept 1 of that academic year:
//   age 11 on Sept 1 → Year 7
//   age 13 on Sept 1 → Year 9
//   age 14 on Sept 1 → Year 10
//   age 16 on Sept 1 → Year 12 / Lower Sixth
//   age 17 on Sept 1 → Year 13 / Upper Sixth
//
// Used by build-mode-prompt.ts to render a birthday-derived suggestion
// in the sibling_basics opener — "From the birthday, I have yoyo as
// Year 9 now, likely Year 10 from September." — so Nana feels smart
// about context the system already knows, instead of asking the
// parent to retype it.
//
// Pure functions, no dependencies. Tests in uk-school-year.test.mjs.

import type { BuildModeExtractionHTTP } from './build-mode-schemas.ts'

/** child_year enum values used elsewhere in Build Mode. */
type ChildYearValue = NonNullable<BuildModeExtractionHTTP['child_year']>

/**
 * Parse a YYYY-MM-DD string into a UTC Date. Returns null on any
 * malformed input — keeps the type narrow at call sites.
 */
export function parseIsoDateOnly(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  // Defensive: reject invalid date components (e.g. "2023-02-30").
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (Number.isNaN(dt.getTime())) return null
  // Round-trip check so "2023-02-30" → "2023-03-02" gets rejected.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt
}

/**
 * The September-1 academic year that the given reference date FALLS
 * INTO. Examples (with ref date in same year):
 *   - 2026-05-21 → 2025 (we're in the 2025-26 academic year)
 *   - 2026-09-01 → 2026 (academic year just rolled over)
 *   - 2026-08-31 → 2025 (still in old academic year)
 */
export function academicStartYear(ref: Date = new Date()): number {
  const y = ref.getUTCFullYear()
  const sep1 = new Date(Date.UTC(y, 8, 1))  // month 8 = September (zero-indexed)
  return ref >= sep1 ? y : y - 1
}

/**
 * UK school Year NUMBER (e.g. 7, 9, 10, 12, 13) for a child with the
 * given DOB, attending the academic year that begins in `startYear`.
 * Returns null for unparseable DOB or for ages outside the UK school
 * range (Year 1 = age 5, Year 13 = age 17 on Sept 1; we don't suggest
 * outside that band).
 */
export function ukSchoolYearNumber(dobIso: string | null | undefined, startYear: number): number | null {
  const dob = parseIsoDateOnly(dobIso ?? null)
  if (!dob) return null

  const birthYear  = dob.getUTCFullYear()
  const birthMonth = dob.getUTCMonth()   // 0-indexed
  const birthDay   = dob.getUTCDate()

  // The child has had their birthday BEFORE Sept 1 of startYear when:
  //   birth month < September, OR
  //   birth month === September AND birth day === 1 (born on the cutoff)
  // Codex's helper used `birthMonth < 8 || (birthMonth === 8 && birthDay <= 1)`.
  // That's correct: Sept 1 (cutoff) = month 8, day 1. A child born EXACTLY
  // on Sept 1 has had their birthday by Sept 1 (inclusive).
  const birthdayBySep1 = birthMonth < 8 || (birthMonth === 8 && birthDay <= 1)

  // Age on Sept 1 of the academic year.
  const ageOnSep1 = startYear - birthYear - (birthdayBySep1 ? 0 : 1)

  // UK Year = age on Sept 1 minus 4 (Year 1 = age 5).
  const yearNumber = ageOnSep1 - 4

  // Clamp to the realistic UK school band (Year 1 through Year 13).
  if (yearNumber < 1 || yearNumber > 13) return null
  return yearNumber
}

/**
 * Map a UK Year NUMBER to the canonical Build Mode child_year enum
 * value. The enum only covers entry points the parent might pick
 * (Y7, Y9, Y10, Sixth Form). For non-entry years (Y8, Y11) we return
 * null so the prompt asks rather than confidently misclassifying.
 *
 * Y12/Y13 both map to 'sixth-form'.
 */
export function childYearValue(yearNumber: number | null): ChildYearValue | null {
  if (yearNumber === 7)  return 'year-7'
  if (yearNumber === 9)  return 'year-9'
  if (yearNumber === 10) return 'year-10'
  if (yearNumber === 12 || yearNumber === 13) return 'sixth-form'
  return null
}

/**
 * What gets rendered into the prompt as a "birthday hint" for
 * sibling_basics opener turns. Returns null when no useful inference
 * is possible (no DOB, or DOB → out-of-range year).
 */
export type UkYearHint = {
  /** "Year 9" — current academic year. */
  currentLabel: string | null
  /** 'year-9' — canonical enum value for the current year, if it maps. */
  currentValue: ChildYearValue | null
  /** "Year 10" — academic year starting next September. */
  nextSeptemberLabel: string | null
  /** 'year-10' — canonical enum value for next September, if it maps. */
  nextSeptemberValue: ChildYearValue | null
}

export function buildUkYearHint(
  dobIso: string | null | undefined,
  ref: Date = new Date(),
): UkYearHint | null {
  const currentStart = academicStartYear(ref)
  const currentYear  = ukSchoolYearNumber(dobIso, currentStart)
  const nextYear     = ukSchoolYearNumber(dobIso, currentStart + 1)

  if (currentYear == null && nextYear == null) return null

  return {
    currentLabel:        currentYear != null ? `Year ${currentYear}` : null,
    currentValue:        childYearValue(currentYear),
    nextSeptemberLabel:  nextYear    != null ? `Year ${nextYear}`    : null,
    nextSeptemberValue:  childYearValue(nextYear),
  }
}
