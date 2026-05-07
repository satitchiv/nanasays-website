import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { KNOWN_FULL_BOARDING_NAMES, normalizeSchoolName } from '@/lib/school-name-overrides'

// Slice 5.5d — General-lens row seeder.
//
// On first load of a Research Room session, populate ~18 universally-relevant
// rows so the comparison table never starts empty. Re-runs are idempotent
// because every spec carries a stable seed key (seed:v1:general:<slug>) and
// the database-level partial unique on (session_id, idempotency_key) skips
// duplicate inserts. Soft-deleted rows stay deleted across re-seeds — the
// idempotency match short-circuits the INSERT before the lens-scoped
// active-name unique index gets a vote.
//
// Trust model: this module is `server-only` and the RPC it calls
// (seed_research_session_rows) is GRANTed only to service_role. Cell content
// is computed from the same DB tables loadComparisonData reads, so there's
// no untrusted user content flowing through.

// ─── Types ──────────────────────────────────────────────────────────────────

type CellValue = {
  value: string | number | null
  source?: string
  note?: string
}

type CellData = Record<string, CellValue>

type StructuredRow = {
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
}

type SchoolMeta = {
  slug:          string
  name:          string
  city:          string | null
  region:        string | null
  boarding:      boolean | null
  gender_split:  string | null
}

type SeedContext = {
  meta:   SchoolMeta
  struct: StructuredRow | null
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

function buildHeathrowMinutes({ struct }: SeedContext): CellValue | null {
  const lp = struct?.location_profile
  if (!lp || typeof lp !== 'object') return null
  const airports = (lp as { airports?: unknown }).airports
  if (!Array.isArray(airports)) return null
  // location_profile.airports[] entries vary in shape — grab the one whose
  // name/code mentions Heathrow and pull the minutes value.
  for (const a of airports) {
    if (!a || typeof a !== 'object') continue
    const obj = a as Record<string, unknown>
    const nameStr = String(obj.name ?? obj.label ?? obj.code ?? '').toLowerCase()
    if (!/heathrow|lhr/.test(nameStr)) continue
    const m = obj.minutes ?? obj.travel_minutes ?? obj.drive_minutes ?? obj.duration_minutes
    if (typeof m === 'number' && m > 0) return { value: `${m} min`, source: 'location_profile' }
    if (typeof m === 'string' && m.trim()) return { value: m, source: 'location_profile' }
  }
  return null
}

function buildClassSize(_: SeedContext): CellValue | null {
  // Pending chunk-mining (slice 5.5g). Renders '—' until the extractor lands.
  return null
}

function buildTotalPupils({ struct }: SeedContext): CellValue | null {
  const total = (struct?.student_community as Record<string, unknown> | undefined)?.total_pupils
  if (typeof total !== 'number') return null
  let bucket = ''
  if (total <= 400) bucket = 'Small'
  else if (total <= 800) bucket = 'Mid-size'
  else if (total <= 1200) bucket = 'Larger'
  else bucket = 'Very large'
  return { value: `~${total.toLocaleString()}`, note: bucket }
}

function buildLowestBoardingEntry({ struct }: SeedContext): CellValue | null {
  const af = struct?.admissions_format as Record<string, unknown> | null | undefined
  const ep = af?.entry_points
  if (!Array.isArray(ep)) return null
  // Find the lowest year/age across entry points that mentions boarding,
  // or fall back to the lowest year overall if none flag boarding explicitly.
  let lowestBoarding: number | null = null
  let lowestOverall: number | null = null
  for (const e of ep) {
    if (!e) continue
    let y: number | null = null
    let mentionsBoarding = false
    if (typeof e === 'object') {
      const o = e as Record<string, unknown>
      const rawYear = o.year ?? o.age
      if (typeof rawYear === 'number') y = rawYear
      else if (typeof rawYear === 'string') {
        const m = rawYear.match(/\d+/)
        if (m) y = Number(m[0])
      }
      const blob = `${o.label ?? ''} ${o.note ?? ''} ${o.boarding ?? ''}`.toLowerCase()
      mentionsBoarding = /boarding|board\b/.test(blob) || o.boarding === true
    } else if (typeof e === 'string') {
      const m = e.match(/\d+/)
      if (m) y = Number(m[0])
      mentionsBoarding = /boarding|board\b/i.test(e)
    }
    if (y == null) continue
    if (mentionsBoarding && (lowestBoarding == null || y < lowestBoarding)) lowestBoarding = y
    if (lowestOverall == null || y < lowestOverall) lowestOverall = y
  }
  const pick = lowestBoarding ?? lowestOverall
  if (pick == null) return null
  return { value: `Year ${pick}`, source: 'admissions_format.entry_points' }
}

function buildBoardingPupils(_: SeedContext): CellValue | null {
  // Pending re-extraction (slice 5.5h) — student_community.boarding_pct is
  // mostly NULL across the corpus.
  return null
}

function buildInternationalPupils(_: SeedContext): CellValue | null {
  return null  // pending 5.5h
}

function buildDayPupils(_: SeedContext): CellValue | null {
  return null  // pending 5.5h
}

function buildBoardingRatio(_: SeedContext): CellValue | null {
  return null  // depends on the three above
}

function buildGcsePct({ struct }: SeedContext): CellValue | null {
  const gcse = (struct?.exam_results as Record<string, unknown> | null | undefined)?.gcse as
    | Record<string, unknown>
    | undefined
  const pct = gcse?.pct_7_to_9
  if (typeof pct !== 'number') return null
  return { value: `${Math.round(pct)}%`, source: 'exam_results.gcse' }
}

function buildALevelPct({ struct }: SeedContext): CellValue | null {
  const al = (struct?.exam_results as Record<string, unknown> | null | undefined)?.a_level as
    | Record<string, unknown>
    | undefined
  const pct = al?.pct_a_star_a
  if (typeof pct !== 'number') return null
  return { value: `${Math.round(pct)}%`, source: 'exam_results.a_level' }
}

function buildBoardingFeeTerm({ struct }: SeedContext): CellValue | null {
  // 2026-05-08 audit (Theo's shortlist): fees_by_grade.rows[] contains
  // per_term values for senior-school boarding rows in 4/6 schools.
  // Pick the highest per-term boarding figure as a proxy for the
  // standard senior boarding fee — flexi-boarding rows are lower and
  // prep-school rows are too small to compare across schools.
  const rows = (struct?.fees_by_grade as Record<string, unknown> | null | undefined)?.rows
  if (!Array.isArray(rows)) return null
  const cur = (struct?.fees_by_grade as { currency?: string } | null | undefined)?.currency ?? struct?.fees_currency ?? 'GBP'
  const sym = cur === 'GBP' ? '£' : cur === 'USD' ? '$' : ''
  let max: number | null = null
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const phase = String(o.phase ?? '').toLowerCase()
    if (!/boarding|7 nights/.test(phase)) continue
    if (/flexi/.test(phase)) continue
    const per = typeof o.per_term === 'number' ? o.per_term : (typeof o.per_term === 'string' ? Number(o.per_term) : null)
    if (per && (max == null || per > max)) max = per
  }
  if (max == null) return null
  return { value: `${sym}${Math.round(max).toLocaleString()}`, source: 'fees_by_grade' }
}

function buildAnnualBoardingFee({ struct }: SeedContext): CellValue | null {
  if (!struct) return null
  const min = typeof struct.fees_min === 'number' ? struct.fees_min : null
  const max = typeof struct.fees_max === 'number' ? struct.fees_max : null
  if (min == null && max == null) return null
  const cur = struct.fees_currency ?? 'GBP'
  const sym = cur === 'GBP' ? '£' : cur === 'USD' ? '$' : ''
  const fmt = (n: number) => `${sym}${n.toLocaleString()}`
  if (min != null && max != null && max !== min) {
    return { value: `${fmt(min)}–${fmt(max)}`, source: 'school_structured_data.fees' }
  }
  return { value: fmt(min ?? max!), source: 'school_structured_data.fees' }
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
    const rawYear = o.year ?? o.age
    let y: number | null = null
    if (typeof rawYear === 'number') y = rawYear
    else if (typeof rawYear === 'string') {
      const m = rawYear.match(/\d+/)
      if (m) y = Number(m[0])
    }
    if (y !== 9 && y !== 10) continue
    const labelRaw = o.label ?? o.note ?? o.requirement
    if (typeof labelRaw === 'string' && labelRaw.trim()) {
      const trimmed = labelRaw.trim().slice(0, 80)
      return { value: trimmed, source: 'admissions_format.entry_points' }
    }
    return { value: `Year ${y} entry`, source: 'admissions_format.entry_points' }
  }
  return null
}

function buildSchoolView(_: SeedContext): CellValue | null {
  return null  // not extracted yet
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
  { slug: 'school_view',           row_name: 'School view',                 group_name: 'Media',      sort_order: 1800, build: buildSchoolView },
]

// ─── Public entrypoint ──────────────────────────────────────────────────────

type ShortlistContext = {
  slugs:     string[]
  schoolMap: Map<string, SchoolMeta>
  structMap: Map<string, StructuredRow>
}

/**
 * Build cell_data for every (spec × school) pair, then call the
 * service-role RPC to bulk-INSERT with ON CONFLICT DO NOTHING.
 *
 * Idempotent: re-runs are no-ops because each spec's idempotency_key is
 * stable across calls. Soft-deleted rows stay soft-deleted.
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
      const cell = spec.build({ meta, struct })
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

  const { data, error } = await supabase.rpc('seed_research_session_rows', {
    p_user_id:    userId,
    p_session_id: sessionId,
    p_specs:      specs,
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
    return { slugs: [], schoolMap: new Map(), structMap: new Map() }
  }

  const [schoolsRes, structRes] = await Promise.all([
    supabase.from('schools')
      .select('slug, name, city, region, boarding, gender_split')
      .in('slug', slugs),
    supabase.from('school_structured_data')
      .select('school_slug, fees_min, fees_max, fees_currency, exam_results, university_destinations, admissions_format, sports_profile, student_community, location_profile, fees_by_grade, application_fee_usd, bursary_note')
      .in('school_slug', slugs),
  ])

  if (schoolsRes.error) throw new Error(`loadShortlistContext: schools read failed: ${schoolsRes.error.message}`)
  if (structRes.error)  throw new Error(`loadShortlistContext: structured read failed: ${structRes.error.message}`)

  const schoolMap = new Map<string, SchoolMeta>(
    (schoolsRes.data ?? []).map((s: SchoolMeta) => [s.slug, s])
  )
  const structMap = new Map<string, StructuredRow>(
    (structRes.data ?? []).map((s: StructuredRow) => [s.school_slug, s])
  )
  return { slugs, schoolMap, structMap }
}
