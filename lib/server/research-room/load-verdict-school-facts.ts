// load-verdict-school-facts.ts (R5-MUST-11 + R6-MUST-3 corrected columns)
//
// Joins schools + school_structured_data to build the SchoolFacts enrichment
// payload the v3 verdict generator needs.
//
// R6-MUST-3: corrected column names + nested key shapes against the real
// production schema (verified against seed-rows.ts:980):
//   - `school_structured_data.school_slug` (NOT `slug`)
//   - `exam_results.gcse.pct_7_to_9`     (NOT `gcse_9_7_pct`)
//   - `exam_results.a_level.pct_a_star_a` (NOT `a_level_a_star_a_pct`)
//   - `exam_results.ib.{average_score | average_points | avg_points}` — first
//     numeric value wins; NUMERIC FACT-RIBBON VALUE ONLY (R11-NIT-1; not used
//     for curriculum inference, that's `schools.curriculum`).
//   - `student_community.total_pupils`, `boarder_count`, `intl_count`,
//     `boarding_pct`, `boarding_ratio` (NOT flat `boarder_pct` / `international_pct`)
//   - `fees_min` / `fees_max` / `fees_currency` (direct columns)
//   - NO `fees_registration` column — only `application_fee_usd` exists
//   - `location_profile.airports[]` may carry Heathrow distance; otherwise
//     compute via haversine from `schools.latitude` / `longitude`
//   - R8-MUST-2 update: `schools.curriculum` (string[] | null) IS the
//     authoritative curriculum source per match-reasons.ts:32+86. Inferring
//     from exam_results.ib presence is explicitly unsafe. We SELECT
//     schools.curriculum and use exam_results only for numeric results.

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SchoolFacts } from './verdict-generator-v3-types'

type SchoolsRow = {
  slug:         string
  name:         string
  city:         string | null
  region:       string | null
  latitude:     number | null
  longitude:    number | null
  gender_split: string | null
  boarding:     string | null
  // R8-MUST-2: authoritative curriculum source. match-reasons.ts:32+86 made
  // this the source of truth — `exam_results.ib` presence is unreliable.
  // Real shape: `string[] | null` (e.g. ['A-level', 'IB']).
  curriculum:   string[] | null
}

type SsdRow = {
  school_slug:         string
  exam_results:        Record<string, unknown> | null
  student_community:   Record<string, unknown> | null
  location_profile:    Record<string, unknown> | null
  fees_min:            number | null
  fees_max:            number | null
  fees_currency:       string | null
  fees_by_grade:       Record<string, unknown> | null
  application_fee_usd: number | null
}

// LHR coordinates for the haversine fallback. R6-Q9 note: surface this in
// the UI as straight-line miles, NOT drive time — drive time depends on roads.
const HEATHROW_LAT = 51.4700
const HEATHROW_LON = -0.4543

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => deg * Math.PI / 180
  const R = 3958.8  // Earth radius in miles
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

function pickNum(obj: Record<string, unknown> | null | undefined, ...keyPath: string[]): number | undefined {
  if (!obj) return undefined
  let v: unknown = obj
  for (const k of keyPath) {
    if (v == null || typeof v !== 'object') return undefined
    v = (v as Record<string, unknown>)[k]
  }
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * Build a Map<slug, SchoolFacts> for the verdict's enrichment payload.
 *
 * R6-MUST-3: column/key names match real production schema (verified against
 * seed-rows.ts:980).
 *
 * Fee currency discipline (R5-MUST-11):
 *   If `fees_currency` is anything other than 'GBP' (or null/'GBP'),
 *   fee_min/fee_max are SUPPRESSED. The budget-stretch tension and budget-fit
 *   pill don't fire on mis-currency comparisons. Full currency normalisation
 *   is deferred to the fees-currency-schema ticket.
 */
export async function loadVerdictSchoolFacts(
  supabase: SupabaseClient,
  slugs:    string[],
): Promise<Map<string, SchoolFacts>> {
  const out = new Map<string, SchoolFacts>()
  if (slugs.length === 0) return out

  const [schoolsRes, ssdRes] = await Promise.all([
    supabase
      .from('schools')
      .select('slug, name, city, region, latitude, longitude, gender_split, boarding, curriculum')
      .in('slug', slugs),
    supabase
      .from('school_structured_data')
      .select('school_slug, exam_results, student_community, location_profile, fees_min, fees_max, fees_currency, fees_by_grade, application_fee_usd')
      .in('school_slug', slugs),    // R6-MUST-3: school_slug, NOT slug
  ])

  if (schoolsRes.error) throw new Error(`loadVerdictSchoolFacts: schools read failed: ${schoolsRes.error.message}`)
  if (ssdRes.error)     throw new Error(`loadVerdictSchoolFacts: school_structured_data read failed: ${ssdRes.error.message}`)

  const ssdBySlug = new Map<string, SsdRow>()
  for (const row of (ssdRes.data ?? []) as SsdRow[]) {
    ssdBySlug.set(row.school_slug, row)
  }

  for (const school of (schoolsRes.data ?? []) as SchoolsRow[]) {
    const ssd = ssdBySlug.get(school.slug)

    // Fee currency discipline.
    const currency = ssd?.fees_currency ?? 'GBP'
    const feesInGbp = currency === 'GBP' || currency == null
    const fee_min = feesInGbp ? (ssd?.fees_min ?? undefined) : undefined
    const fee_max = feesInGbp ? (ssd?.fees_max ?? undefined) : undefined

    // Heathrow distance — prefer SSD location_profile.airports if present,
    // otherwise compute haversine. Falls through to undefined if neither.
    let heathrow_miles: number | undefined = pickNum(ssd?.location_profile, 'heathrow_miles')
    if (heathrow_miles == null) {
      const airports = (ssd?.location_profile as Record<string, unknown> | undefined)?.airports
      if (Array.isArray(airports)) {
        const lhr = (airports as Array<Record<string, unknown>>).find(a => {
          const code = a.code ?? a.iata ?? a.id
          return typeof code === 'string' && code.toUpperCase() === 'LHR'
        })
        const miles = lhr?.distance_miles
        if (typeof miles === 'number' && Number.isFinite(miles)) heathrow_miles = Math.round(miles)
      }
    }
    if (heathrow_miles == null && school.latitude != null && school.longitude != null) {
      heathrow_miles = haversineMiles(school.latitude, school.longitude, HEATHROW_LAT, HEATHROW_LON)
    }

    // Exam result nested keys (R6-MUST-3 + R7-MUST-3 corrected).
    const a_level_a_star_a_pct = pickNum(ssd?.exam_results, 'a_level', 'pct_a_star_a')
    const gcse_9_7_pct         = pickNum(ssd?.exam_results, 'gcse', 'pct_7_to_9')

    // R7-MUST-3 + R10-NIT: IB key variants. Production data has THREE flavours:
    //   `average_score`, `average_points`, `avg_points`
    // (per match-reasons.ts:29 — IB schema not fully standardised). Try each
    // in order; the first numeric hit wins. This is the NUMERIC fact-ribbon
    // value only; curriculum presence is determined separately from
    // `schools.curriculum` per R8-MUST-2.
    const ib_avg_points =
      pickNum(ssd?.exam_results, 'ib', 'average_score')
      ?? pickNum(ssd?.exam_results, 'ib', 'average_points')
      ?? pickNum(ssd?.exam_results, 'ib', 'avg_points')

    // Student community (R6-MUST-3 corrected). Compute percentages from counts.
    const total_pupils  = pickNum(ssd?.student_community, 'total_pupils')
    const boarder_count = pickNum(ssd?.student_community, 'boarder_count')
    const intl_count    = pickNum(ssd?.student_community, 'intl_count')
    // R9-SHOULD-1: `boarding_pct` is ALWAYS already 0-100 (explicit percent),
    // so don't scale it — a real value of exactly 1.0 (= 1%, very low boarder
    // share) would be misclassified as 100% by the <=1 scaling. ONLY scale
    // `boarding_ratio` when 0 < ratio <= 1 (matches seed-rows.ts:400 behavior).
    const boarding_pct_direct = pickNum(ssd?.student_community, 'boarding_pct')
    const boarding_ratio_raw  = pickNum(ssd?.student_community, 'boarding_ratio')
    const boarding_pct_normalised =
      boarding_pct_direct != null
        ? boarding_pct_direct
        : (boarding_ratio_raw != null
            ? (boarding_ratio_raw > 0 && boarding_ratio_raw <= 1
                ? boarding_ratio_raw * 100
                : boarding_ratio_raw)
            : undefined)

    const boarder_pct =
      boarding_pct_normalised != null ? Math.round(boarding_pct_normalised)
      : (total_pupils != null && total_pupils > 0 && boarder_count != null)
        ? Math.round((boarder_count / total_pupils) * 100)
        : undefined

    const day_pct = boarder_pct != null ? Math.max(0, 100 - boarder_pct) : undefined

    // International % — only when both sources are present (R5-Q7).
    const international_pct =
      total_pupils != null && total_pupils > 0 && intl_count != null
        ? Math.round((intl_count / total_pupils) * 100)
        : undefined

    // R8-MUST-2: Curriculum from authoritative `schools.curriculum` ONLY.
    // Per match-reasons.ts:32+86, this is the source of truth — inferring
    // from `exam_results.ib` presence is explicitly warned against (some
    // schools report partial IB stats but don't actually offer the diploma).
    // `schools.curriculum` is `string[] | null` (e.g. ['A-level', 'IB']).
    const curr = Array.isArray(school.curriculum)
      ? school.curriculum.map(c => String(c).trim()).filter(Boolean)
      : []
    // R9-MUST-1: IB variants. Real `schools.curriculum` entries per the
    // existing canonical-set in match-reasons.ts + recommend-shortlist.ts:
    //   'IB', 'IB Diploma', 'IB Diploma Programme',
    //   'IB Middle Years Programme', 'IB Primary Years Programme',
    //   'International Baccalaureate'
    // A-Level entries seen: 'A-Level', 'A-level', 'A Level', 'A-Levels'.
    // Match any entry that STARTS with "IB" as a word, or contains
    // "International Baccalaureate".
    const hasALevel = curr.some(c => /^a[-\s]?levels?$/i.test(c))
    const hasIB     = curr.some(c => /^ib\b/i.test(c) || /international\s*baccalaureate/i.test(c))
    const curriculum: string | undefined =
      hasALevel && hasIB ? 'A-level + IB'
      : hasALevel        ? 'A-level'
      : hasIB            ? 'IB'
      : (curr.length > 0 ? curr.join(' + ') : undefined)
    // ib_avg_points and a_level_a_star_a_pct above remain as NUMERIC result
    // values for the fact ribbon — they no longer infer curriculum presence.

    const facts: SchoolFacts = {
      slug:                  school.slug,
      name:                  school.name,
      city:                  school.city ?? undefined,
      region:                school.region ?? undefined,
      latitude:              school.latitude ?? undefined,
      longitude:             school.longitude ?? undefined,
      gender_split:          school.gender_split ?? undefined,
      a_level_a_star_a_pct,
      gcse_9_7_pct,
      ib_avg_40_plus_pct:    ib_avg_points,
      total_pupils,
      boarder_pct,
      day_pct,
      international_pct,
      fee_min,
      fee_max,
      fee_registration:      undefined,    // R6-MUST-3: no direct column; application_fee_usd is currency-locked
      heathrow_miles,
      heathrow_drive:        undefined,    // V2 deferred — straight-line miles only for V1
      curriculum,
    }
    out.set(school.slug, facts)
  }

  // Slugs requested but missing from `schools` — emit sparse SchoolFacts so
  // downstream null-safety still works.
  for (const slug of slugs) {
    if (!out.has(slug)) {
      out.set(slug, { slug, name: slug })
    }
  }

  return out
}
