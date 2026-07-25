import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { KNOWN_FULL_BOARDING_NAMES, normalizeSchoolName } from '@/lib/school-name-overrides'
import {
  approvedNotionBoardingEntry,
  approvedNotionFee,
  approvedNotionNumber,
  approvedNotionValue,
  formatGbp,
  resolveNotionClassSize,
  resolvePupilComposition,
  type NotionBackfillRow,
} from './pupil-composition'
import { generalSeedRowSlug } from './seed-row-names'
import { planSeedRowReconciliation } from './seed-row-reconciliation'
import {
  resolveHeathrowTravel,
} from './travel-data'

// Slice 5.5d — General-lens row seeder.
//
// Populate universally relevant rows so the comparison table never starts
// empty. Every spec has a stable seed key (seed:v1:general:<slug>). Active
// rows are refreshed from the latest structured + approved Notion data on
// each room load; the insert RPC remains idempotent for missing rows.
// Soft-deleted rows stay deleted across re-seeds.
//
// Trust model: this module is `server-only` and the RPC it calls
// (seed_research_session_rows) is GRANTed only to service_role. Cell content
// is computed from the same DB tables loadComparisonData reads, so there's
// no untrusted user content flowing through.

// ─── Types ──────────────────────────────────────────────────────────────────

export type CellValue = {
  value: string | number | null
  source?: string
  note?: string
}

type CellData = Record<string, CellValue>

export type StructuredRow = {
  school_slug:        string
  fees_min:           number | null
  fees_max:           number | null
  fees_currency:      string | null
  exam_results:       Record<string, unknown> | null
  university_destinations: Record<string, unknown> | null
  admissions_format:  Record<string, unknown> | null
  sports_profile:     Record<string, unknown> | null
  student_community:  Record<string, unknown> | null
  location_profile:   Record<string, unknown> | null
  fees_by_grade:      Record<string, unknown> | null
  application_fee_usd: number | null
  bursary_note:       string | null
  curriculum:         unknown[] | null
  languages:          unknown[] | null
  scholarships_available: unknown[] | null
  pastoral_care:      string | null
  pastoral_model:     string | null
  wellbeing_staffing: Record<string, unknown> | null
  school_life:        Record<string, unknown> | null
  facilities:         unknown[] | null
}

export const RESEARCH_ROOM_STRUCTURED_SELECT =
  'school_slug, fees_min, fees_max, fees_currency, exam_results, university_destinations, admissions_format, sports_profile, student_community, location_profile, fees_by_grade, application_fee_usd, bursary_note, curriculum, languages, scholarships_available, pastoral_care, pastoral_model, wellbeing_staffing, school_life, facilities' as const

export type SchoolMeta = {
  slug:          string
  name:          string
  city:          string | null
  region:        string | null
  boarding:      boolean | null
  gender_split:  string | null
  distance_airport?: string | null
}

type SeedContext = {
  meta:   SchoolMeta
  struct: StructuredRow | null
  notion: NotionBackfillRow | null
}

type SeedRowSpec = {
  slug:        string  // seed slug — composed into idempotency_key
  row_name:    string
  group_name:  string
  weight?:     number
  sort_order:  number
  // Returns null when no value is available for this school. Loader
  // renders '—' for absent cells; lenient strictness per the round-1
  // architecture decision.
  build:       (ctx: SeedContext) => CellValue | null
}

// ─── Cell builders (ported from lib/research-comparison.ts) ─────────────────

function buildSchoolType({ meta }: SeedContext): CellValue | null {
  const norm = normalizeSchoolName(meta.name)
  const knownBoarding = KNOWN_FULL_BOARDING_NAMES.has(norm)
  const isBoarding = meta.boarding === true || knownBoarding
  const gender = (meta.gender_split ?? '').toLowerCase()
  const genderLabel =
    gender === 'boys' || gender === 'boys only' ? 'Boys' :
    gender === 'girls' || gender === 'girls only' ? 'Girls' :
    gender ? 'Co-ed' : ''
  const dayLabel = isBoarding ? 'Day + boarding' : 'Day'
  if (!genderLabel && !dayLabel) return null
  return { value: dayLabel, note: genderLabel || undefined }
}

function buildLocation({ meta }: SeedContext): CellValue | null {
  const parts = [meta.city, meta.region].filter(Boolean)
  if (parts.length === 0) return null
  return { value: parts.join(', ') }
}

function buildHeathrowMinutes({ meta, struct }: SeedContext): CellValue | null {
  const lp = struct?.location_profile
  const airports = lp && typeof lp === 'object'
    ? (lp as { airports?: unknown }).airports
    : null
  // location_profile.airports[] entries vary in shape — grab the one whose
  // name/code mentions Heathrow and pull the minutes value.
  return resolveHeathrowTravel(airports, meta.distance_airport)
}

function buildClassSize({ notion }: SeedContext): CellValue | null {
  return resolveNotionClassSize(notion)
}

function buildTotalPupils({ struct, notion }: SeedContext): CellValue | null {
  const structuredTotal = (struct?.student_community as Record<string, unknown> | undefined)?.total_pupils
  const total = typeof structuredTotal === 'number'
    ? structuredTotal
    : approvedNotionNumber(notion, 'total_pupils')
  if (total == null) return null
  let bucket = ''
  if (total <= 400) bucket = 'Small'
  else if (total <= 800) bucket = 'Mid-size'
  else if (total <= 1200) bucket = 'Larger'
  else bucket = 'Very large'
  return {
    value: `~${total.toLocaleString()}`,
    note: bucket,
    source: typeof structuredTotal === 'number'
      ? 'student_community.total_pupils'
      : 'school_notion_backfill.parsed.total_pupils',
  }
}

const PLUS_TO_YEAR: Record<string, number> = {
  '7+': 3,
  '8+': 4,
  '9+': 5,
  '10+': 6,
  '11+': 7,
  '12+': 8,
  '13+': 9,
  '14+': 10,
  '16+': 12,
}

function extractUkYearFromString(value: string): number | null {
  const year = value.match(/\byears?\s*(\d{1,2})/i)
  if (year) {
    const number = Number(year[1])
    if (number >= 1 && number <= 13) return number
  }
  const plus = value.match(/\b(\d{1,2}\+)/)
  if (plus?.[1] && PLUS_TO_YEAR[plus[1]]) return PLUS_TO_YEAR[plus[1]]
  if (/sixth\s*form/i.test(value)) return 12
  return null
}

function narrativeBoardingEntry(struct: StructuredRow | null): number | null {
  const schoolLife = struct?.school_life as Record<string, unknown> | null | undefined
  const candidates = [
    schoolLife?.boarding_life,
    struct?.pastoral_care,
  ].filter((value): value is string => typeof value === 'string')
  const years: number[] = []
  for (const text of candidates) {
    const patterns = [
      /boarding houses?\s+(?:are\s+)?available from Year\s+(\d{1,2})/gi,
      /\b(?:girls|boys)\s+Year\s+(\d{1,2})\s*[-–]\s*\d{1,2}/gi,
    ]
    for (const pattern of patterns) {
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text)) != null) {
        const year = Number(match[1])
        if (year >= 1 && year <= 13) years.push(year)
      }
    }
  }
  return years.length > 0 ? Math.min(...years) : null
}

function buildLowestBoardingEntry({ struct, notion }: SeedContext): CellValue | null {
  const af = struct?.admissions_format as Record<string, unknown> | null | undefined
  const ep = af?.entry_points
  let lowestBoarding: number | null = null
  for (const e of Array.isArray(ep) ? ep : []) {
    if (!e) continue
    let y: number | null = null
    let mentionsBoarding = false
    if (typeof e === 'object') {
      const o = e as Record<string, unknown>
      for (const raw of [o.entry_point, o.year, o.age]) {
        if (typeof raw === 'number') {
          y = raw
          break
        }
        if (typeof raw === 'string') {
          y = extractUkYearFromString(raw)
          if (y != null) break
        }
      }
      const blob = `${o.entry_point ?? ''} ${o.label ?? ''} ${o.note ?? ''} ${o.boarding ?? ''}`
      mentionsBoarding = /\bboard(?:ing|er|ers)?\b/i.test(blob) || o.boarding === true
    } else if (typeof e === 'string') {
      y = extractUkYearFromString(e)
      mentionsBoarding = /\bboard(?:ing|er|ers)?\b/i.test(e)
    }
    if (y == null || y < 1 || y > 13) continue
    if (mentionsBoarding && (lowestBoarding == null || y < lowestBoarding)) lowestBoarding = y
  }
  if (lowestBoarding != null) {
    return { value: `Year ${lowestBoarding}`, source: 'admissions_format.entry_points' }
  }
  const narrative = narrativeBoardingEntry(struct)
  if (narrative != null) {
    return { value: `Year ${narrative}`, source: 'school_life.boarding_life' }
  }
  const sidecar = approvedNotionBoardingEntry(notion)
  return sidecar
    ? { value: `Year ${sidecar.year}`, source: sidecar.source }
    : null
}

function buildBoardingPupils({ struct, notion }: SeedContext): CellValue | null {
  const result = resolvePupilComposition(
    struct as unknown as Record<string, unknown> | null,
    notion,
  )
  if (result.status !== 'ready') return null
  const { composition } = result
  return {
    value: `~${composition.boarding.toLocaleString()}`,
    note: `${composition.boardingPct}% of pupils`,
    source: `${composition.source}.boarding`,
  }
}

function buildInternationalPupils({ struct, notion }: SeedContext): CellValue | null {
  const result = resolvePupilComposition(
    struct as unknown as Record<string, unknown> | null,
    notion,
  )
  if (result.status !== 'ready') return null
  const { composition } = result
  const international = composition.international
  if (international == null) return null
  return {
    value: `~${international.toLocaleString()}`,
    note: composition.internationalPct == null
      ? undefined
      : `${composition.internationalPct}% of pupils`,
    source: `${composition.source}.international`,
  }
}

function buildDayPupils({ struct, notion }: SeedContext): CellValue | null {
  const result = resolvePupilComposition(
    struct as unknown as Record<string, unknown> | null,
    notion,
  )
  if (result.status !== 'ready') return null
  const { composition } = result
  return {
    value: `~${composition.day.toLocaleString()}`,
    note: `${composition.dayPct}% of pupils`,
    source: `${composition.source}.day`,
  }
}

function buildBoardingRatio({ struct, notion }: SeedContext): CellValue | null {
  const result = resolvePupilComposition(
    struct as unknown as Record<string, unknown> | null,
    notion,
  )
  if (result.status !== 'ready') return null
  const { composition } = result
  return {
    value: `${composition.boardingPct}% boarding · ${composition.dayPct}% day`,
    source: `${composition.source}.boarding_mix`,
  }
}

function buildGcsePct({ struct, notion }: SeedContext): CellValue | null {
  const gcse = (struct?.exam_results as Record<string, unknown> | null | undefined)?.gcse as
    | Record<string, unknown>
    | undefined
  const pct = gcse?.pct_7_to_9
  if (typeof pct === 'number') {
    return { value: `${Math.round(pct)}%`, source: 'exam_results.gcse' }
  }
  const sidecar = approvedNotionNumber(notion, 'gcse_pct')
  if (sidecar != null) {
    return { value: `${Math.round(sidecar)}%`, source: 'school_notion_backfill.parsed.gcse_pct' }
  }
  const alternateBand = approvedNotionValue(notion, 'gcse_pct_alt_band')
  return typeof alternateBand === 'string' && alternateBand.trim()
    ? { value: alternateBand.trim(), source: 'school_notion_backfill.parsed.gcse_pct_alt_band' }
    : null
}

function buildALevelPct({ struct, notion }: SeedContext): CellValue | null {
  const al = (struct?.exam_results as Record<string, unknown> | null | undefined)?.a_level as
    | Record<string, unknown>
    | undefined
  const pct = al?.pct_a_star_a
  if (typeof pct === 'number') {
    return { value: `${Math.round(pct)}%`, source: 'exam_results.a_level' }
  }
  const sidecar = approvedNotionNumber(notion, 'a_level_pct')
  return sidecar == null
    ? null
    : { value: `${Math.round(sidecar)}%`, source: 'school_notion_backfill.parsed.a_level_pct' }
}

function buildBoardingFeeTerm({ struct, notion }: SeedContext): CellValue | null {
  // 2026-05-08 audit (Theo's shortlist): fees_by_grade.rows[] contains
  // per_term values for senior-school boarding rows in 4/6 schools.
  // Pick the highest per-term boarding figure as a proxy for the
  // standard senior boarding fee — flexi-boarding rows are lower and
  // prep-school rows are too small to compare across schools.
  const rows = (struct?.fees_by_grade as Record<string, unknown> | null | undefined)?.rows
  const cur = (struct?.fees_by_grade as { currency?: string } | null | undefined)?.currency ?? struct?.fees_currency ?? 'GBP'
  const sym = cur === 'GBP' ? '£' : cur === 'USD' ? '$' : ''
  let max: number | null = null
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const phase = String(o.phase ?? '').toLowerCase()
    if (!/boarding|7 nights/.test(phase)) continue
    if (/flexi/.test(phase)) continue
    const per = typeof o.per_term === 'number' ? o.per_term : (typeof o.per_term === 'string' ? Number(o.per_term) : null)
    if (per && (max == null || per > max)) max = per
  }
  if (max != null) {
    return { value: `${sym}${Math.round(max).toLocaleString()}`, source: 'fees_by_grade' }
  }
  const sidecar = approvedNotionFee(notion, 'boarding_fee_term')
  return sidecar == null
    ? null
    : { value: formatGbp(sidecar), source: 'school_notion_backfill.parsed.boarding_fee_term' }
}

function buildAnnualBoardingFee({ struct, notion }: SeedContext): CellValue | null {
  const min = typeof struct?.fees_min === 'number' ? struct.fees_min : null
  const max = typeof struct?.fees_max === 'number' ? struct.fees_max : null
  if (min != null || max != null) {
    const cur = struct?.fees_currency ?? 'GBP'
    const sym = cur === 'GBP' ? '£' : cur === 'USD' ? '$' : ''
    const fmt = (n: number) => `${sym}${n.toLocaleString()}`
    if (min != null && max != null && max !== min) {
      return { value: `${fmt(min)}–${fmt(max)}`, source: 'school_structured_data.fees' }
    }
    return { value: fmt(min ?? max!), source: 'school_structured_data.fees' }
  }
  const sidecar = approvedNotionFee(notion, 'boarding_fee_year')
  return sidecar == null
    ? null
    : { value: formatGbp(sidecar), source: 'school_notion_backfill.parsed.boarding_fee_year' }
}

function buildRegistrationFee({ struct }: SeedContext): CellValue | null {
  // 2026-05-08 audit: registration fee data lives in three places.
  //   1. fees_by_grade.compulsory_extras[] (named 'Registration fee ...'):
  //      Clifton has £180 / £200.
  //   2. application_fee_usd column: Clifton has $200 (mirror of #1).
  //   3. admissions_format.process_steps[] free text — pull the £-amount
  //      via regex when no structured value exists. Found: Kingswood £150,
  //      Kings College £240, Plymouth (registration mentioned, no £).
  // Prefer #1 → #3 (skip #2 — currency-coerced USD is misleading for UK).
  const cur = (struct?.fees_by_grade as { currency?: string } | null | undefined)?.currency ?? struct?.fees_currency ?? 'GBP'
  const sym = cur === 'GBP' ? '£' : cur === 'USD' ? '$' : ''

  // (1) compulsory_extras
  const extras = (struct?.fees_by_grade as Record<string, unknown> | null | undefined)?.compulsory_extras
  if (Array.isArray(extras)) {
    let bestNumber: number | null = null
    for (const e of extras) {
      if (!e || typeof e !== 'object') continue
      const o = e as Record<string, unknown>
      const name = String(o.name ?? '').toLowerCase()
      if (!/registration|application/.test(name)) continue
      const py = typeof o.per_year === 'number' ? o.per_year : (typeof o.per_year === 'string' ? Number(o.per_year) : null)
      if (py && (bestNumber == null || py > bestNumber)) bestNumber = py
    }
    if (bestNumber != null) {
      return { value: `${sym}${Math.round(bestNumber).toLocaleString()}`, source: 'compulsory_extras' }
    }
  }

  // (3) admissions_format.process_steps regex
  const steps = (struct?.admissions_format as Record<string, unknown> | null | undefined)?.process_steps
  if (Array.isArray(steps)) {
    for (const s of steps) {
      if (typeof s !== 'string') continue
      if (!/registration/i.test(s)) continue
      // £ followed by 2-5 digits (commas optional). Take the first match.
      const m = s.match(/£\s?([0-9][0-9,]{1,5})/)
      if (m) {
        const cleaned = Number(m[1].replace(/,/g, ''))
        if (Number.isFinite(cleaned) && cleaned > 0) {
          return { value: `£${cleaned.toLocaleString()}`, source: 'process_steps' }
        }
      }
    }
  }

  return null
}

function buildY9Y10Admissions({ struct }: SeedContext): CellValue | null {
  const af = struct?.admissions_format as Record<string, unknown> | null | undefined
  const ep = af?.entry_points
  if (!Array.isArray(ep)) return null
  // Look for an entry point at year 9 or 10 and surface its label/note.
  for (const e of ep) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    let y: number | null = null
    for (const raw of [o.entry_point, o.year, o.age]) {
      if (typeof raw === 'number') {
        y = raw
        break
      }
      if (typeof raw === 'string') {
        y = extractUkYearFromString(raw)
        if (y != null) break
      }
    }
    if (y !== 9 && y !== 10) continue
    const timeline = [o.registration_deadline, o.assessment_date]
      .find(value => typeof value === 'string' && value.trim())
    if (typeof timeline === 'string') {
      const entryPoint = typeof o.entry_point === 'string' ? o.entry_point.trim() : `Year ${y}`
      return {
        value: timeline.trim().slice(0, 80),
        note: `${entryPoint} entry`,
        source: 'admissions_format.entry_points',
      }
    }
  }
  return null
}

// ─── Spec list ──────────────────────────────────────────────────────────────
// sort_order uses 100, 200, 300, ... so future specs can slot between
// existing values without renumbering the whole list.

const GENERAL_SPECS: SeedRowSpec[] = [
  // 'School name' was in the v1 spec but redundant with column headers,
  // dropped in v1.1. Existing rows in deployed sessions get a one-shot
  // soft-delete via the migration that ships alongside this change.
  { slug: 'school_type',           row_name: 'School type',                 group_name: 'About',      sort_order:  200, build: buildSchoolType },
  { slug: 'location',              row_name: 'Location',                    group_name: 'About',      sort_order:  300, build: buildLocation },
  { slug: 'heathrow_minutes',      row_name: 'Travel from Heathrow',        group_name: 'About',      sort_order:  400, build: buildHeathrowMinutes },
  { slug: 'class_size',            row_name: 'Class size',                  group_name: 'Pastoral',   sort_order:  500, build: buildClassSize },
  { slug: 'total_pupils',          row_name: 'Total pupils',                group_name: 'Pastoral',   sort_order:  600, build: buildTotalPupils },
  { slug: 'lowest_boarding_entry', row_name: 'Lowest boarding entry',       group_name: 'Admissions', sort_order:  700, build: buildLowestBoardingEntry },
  { slug: 'boarding_pupils',       row_name: 'Boarding pupils',             group_name: 'Pastoral',   sort_order:  800, build: buildBoardingPupils },
  { slug: 'international_pupils',  row_name: 'International pupils',        group_name: 'Pastoral',   sort_order:  900, build: buildInternationalPupils },
  { slug: 'day_pupils',            row_name: 'Day pupils',                  group_name: 'Pastoral',   sort_order: 1000, build: buildDayPupils },
  { slug: 'boarding_ratio',        row_name: 'Boarding ratio',              group_name: 'Pastoral',   sort_order: 1100, build: buildBoardingRatio },
  { slug: 'gcse_pct',              row_name: 'GCSE 9–7',                    group_name: 'Academics',  sort_order: 1200, build: buildGcsePct },
  { slug: 'a_level_pct',           row_name: 'A-level A*–A',                group_name: 'Academics',  sort_order: 1300, build: buildALevelPct },
  { slug: 'boarding_fee_term',     row_name: 'Boarding fee · per term',     group_name: 'Fees',       sort_order: 1400, build: buildBoardingFeeTerm },
  { slug: 'boarding_fee_year',     row_name: 'Boarding fee · per year',     group_name: 'Fees',       sort_order: 1500, build: buildAnnualBoardingFee },
  { slug: 'registration_fee',      row_name: 'Registration fee',            group_name: 'Fees',       sort_order: 1600, build: buildRegistrationFee },
  { slug: 'y9_y10_admissions',     row_name: 'Year 9 / 10 admissions',      group_name: 'Admissions', sort_order: 1700, build: buildY9Y10Admissions },
]

/**
 * Resolve one existing seeded row for a newly added school. This reuses the
 * exact builders used at session creation, so shortlist additions cannot
 * drift from the original comparison values.
 */
export function resolveSeedComparisonCell(
  rowName: string,
  meta: SchoolMeta,
  struct: StructuredRow | null,
  notion: NotionBackfillRow | null = null,
): CellValue | null {
  const slug = generalSeedRowSlug(rowName)
  const spec = GENERAL_SPECS.find(item => item.slug === slug)
  return spec?.build({ meta, struct, notion }) ?? null
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

type ShortlistContext = {
  slugs:     string[]
  schoolMap: Map<string, SchoolMeta>
  structMap: Map<string, StructuredRow>
  notionMap: Map<string, NotionBackfillRow>
}

/**
 * Build cell_data for every (spec × school) pair, refresh active managed
 * rows, then call the service-role RPC to insert any missing populated rows.
 *
 * Idempotent: each spec's idempotency_key is stable across calls.
 * Soft-deleted rows stay soft-deleted.
 */
export async function seedResearchSession(
  supabase: SupabaseClient,
  userId:   string,
  sessionId: string,
  ctx: ShortlistContext,
): Promise<{ inserted: number } | null> {
  if (ctx.slugs.length === 0) return { inserted: 0 }

  const specs = GENERAL_SPECS.map(spec => {
    const cell_data: CellData = {}
    for (const slug of ctx.slugs) {
      const meta = ctx.schoolMap.get(slug)
      if (!meta) continue
      const struct = ctx.structMap.get(slug) ?? null
      const notion = ctx.notionMap.get(slug) ?? null
      const cell = spec.build({ meta, struct, notion })
      if (cell == null || cell.value == null || cell.value === '') continue
      cell_data[slug] = cell
    }
    return {
      idempotency_key: `seed:v1:general:${spec.slug}`,
      lens_kind:       'general',
      row_name:        spec.row_name,
      group_name:      spec.group_name,
      weight:          spec.weight ?? 1.0,
      sort_order:      spec.sort_order,
      cell_data,
    }
  })

  // The seed RPC is insert-only. Reconcile active v1 seed rows first so
  // older sessions gain newly available structured/Notion values whenever
  // they are opened. Soft-deleted rows are deliberately excluded and are
  // never reactivated.
  const { data: existingRows, error: existingError } = await supabase
    .from('comparison_rows')
    .select('id, idempotency_key, group_name, weight, sort_order, cell_data')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .like('idempotency_key', 'seed:v1:general:%')
    .is('undone_at', null)

  if (existingError) {
    console.error('[seedResearchSession reconcile read]', existingError.message)
  } else {
    const reconciliation = planSeedRowReconciliation(existingRows ?? [], specs)
    const reconciledAt = new Date().toISOString()
    const results = await Promise.all([
      ...reconciliation.updates.map(update =>
        supabase
          .from('comparison_rows')
          .update(update.values)
          .eq('id', update.id)
          .eq('user_id', userId)
          .eq('session_id', sessionId)
          .is('undone_at', null),
      ),
      ...reconciliation.hideIds.map(id =>
        supabase
          .from('comparison_rows')
          .update({ undone_at: reconciledAt })
          .eq('id', id)
          .eq('user_id', userId)
          .eq('session_id', sessionId)
          .is('undone_at', null),
      ),
    ])
    for (const result of results) {
      if (result.error) {
        console.error('[seedResearchSession reconcile write]', result.error.message)
      }
    }
  }

  const populatedSpecs = specs.filter(spec => Object.keys(spec.cell_data).length > 0)
  const { data, error } = await supabase.rpc('seed_research_session_rows', {
    p_user_id:    userId,
    p_session_id: sessionId,
    p_specs:      populatedSpecs,
  })

  if (error) {
    // Don't throw — seeding is best-effort. The page falls through to
    // loadComparisonData which renders whatever rows DO exist.
    console.error('[seedResearchSession]', error.message ?? error)
    return null
  }

  const row = Array.isArray(data) ? data[0] : data
  return { inserted: typeof row?.inserted_count === 'number' ? row.inserted_count : 0 }
}

/**
 * Load the schools/struct context used by both the seeder and the loader.
 * Exposed so page.tsx can run shortlist queries once and feed both consumers.
 */
export async function loadShortlistContext(
  supabase: SupabaseClient,
  userId:   string,
  childId:  string | null,
): Promise<ShortlistContext> {
  let q = supabase
    .from('shortlisted_schools')
    .select('school_slug')
    .eq('user_id', userId)
    .order('added_at', { ascending: true })
  q = childId ? q.eq('child_id', childId) : q.is('child_id', null)
  const { data: rows, error } = await q
  if (error) throw new Error(`loadShortlistContext: shortlist read failed: ${error.message}`)

  const slugs = (rows ?? []).map((r: { school_slug: string }) => r.school_slug)
  if (slugs.length === 0) {
    return { slugs: [], schoolMap: new Map(), structMap: new Map(), notionMap: new Map() }
  }

  const [schoolsRes, structRes, notionRes] = await Promise.all([
    supabase.from('schools')
      .select('slug, name, city, region, boarding, gender_split, distance_airport')
      .in('slug', slugs),
    supabase.from('school_structured_data')
      .select(RESEARCH_ROOM_STRUCTURED_SELECT)
      .in('school_slug', slugs),
    supabase.from('school_notion_backfill')
      .select('school_slug, status, parsed, raw_properties')
      .in('school_slug', slugs),
  ])

  if (schoolsRes.error) throw new Error(`loadShortlistContext: schools read failed: ${schoolsRes.error.message}`)
  if (structRes.error)  throw new Error(`loadShortlistContext: structured read failed: ${structRes.error.message}`)
  if (notionRes.error) {
    // The sidecar supplements structured extraction. A temporary read failure
    // must not make the whole comparison room unavailable.
    console.warn(`[loadShortlistContext] Notion sidecar read failed: ${notionRes.error.message}`)
  }

  const schoolMap = new Map<string, SchoolMeta>(
    (schoolsRes.data ?? []).map((s: SchoolMeta) => [s.slug, s])
  )
  const structMap = new Map<string, StructuredRow>(
    (structRes.data ?? []).map((s: StructuredRow) => [s.school_slug, s])
  )
  const notionMap = new Map<string, NotionBackfillRow>(
    ((notionRes.error ? [] : notionRes.data) ?? [])
      .map((row: NotionBackfillRow) => [row.school_slug, row])
  )
  return { slugs, schoolMap, structMap, notionMap }
}
