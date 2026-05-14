import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { KNOWN_FULL_BOARDING_NAMES, normalizeSchoolName } from '@/lib/school-name-overrides'
import {
  type BriefProfile,
  isIbCurriculum,
  isSportPriority,
} from './brief-predicates'
import { canonicalJson } from './canonical-json'

// Slice 5.5d / Slice 8 Build 2 — General-lens row seeder.
//
// On first load of a Research Room session, populate ~18 universally-relevant
// rows so the comparison table never starts empty. Re-runs are idempotent
// because every spec carries a stable seed key (seed:v1:general:<slug>) and
// the database-level partial unique on (session_id, idempotency_key) skips
// duplicate inserts.
//
// Slice 8 Build 2 added brief-aware specs (`seed:v1:general:brief_<slug>`)
// gated on the parent's child_profile, plus reconcileSeededRows() which
// runs BEFORE the RPC to (a) soft-delete brief rows whose gate is no
// longer satisfied, (b) refresh cell_data on existing rows so they
// reflect the latest shortlist (the RPC's ON CONFLICT DO NOTHING would
// otherwise leave them stale), and (c) reactivate previously-soft-deleted
// brief rows when the brief re-gates them. Manual user-soft-deletes can
// therefore be reactivated by a brief change — see the Codex r2 Q1 note
// in reconcileSeededRows.
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

// ─── Brief-aware cell builders (Slice 8 Build 2) ────────────────────────────
//
// These cells fire only when the parent's brief gates them on. They surface
// data from sports_profile.<sport>.competitive_tier / strength_signals and
// from school_facts when the topic-score columns are populated. Cells return
// null when their underlying field is empty — the row still seeds (so the
// topic appears in Build 4's weighting) but renders '—' for that school.

function sportTierCell(
  struct: StructuredRow | null,
  sportKey: 'rugby' | 'tennis' | 'cricket' | 'hockey' | 'football' | 'netball',
): CellValue | null {
  const sport = (struct?.sports_profile as Record<string, unknown> | null | undefined)?.[sportKey]
  if (!sport || typeof sport !== 'object') return null
  const obj = sport as Record<string, unknown>
  const tier = obj.competitive_tier
  if (typeof tier !== 'string' || !tier.trim()) return null
  // Most cells benefit from a fixture-count hint when present (e.g. tennis
  // shows team counts via SOCS discovery). Keep the cell compact: tier label
  // as the primary value, optional fixture count in note.
  const teams = obj.team_count ?? obj.teams ?? obj.fixtures_count
  const note = typeof teams === 'number' && teams > 0 ? `${teams} teams` : undefined
  return { value: tier.charAt(0).toUpperCase() + tier.slice(1), note, source: `sports_profile.${sportKey}` }
}

function buildRugbyStrength({ struct }: SeedContext): CellValue | null {
  return sportTierCell(struct, 'rugby')
}
function buildTennisStrength({ struct }: SeedContext): CellValue | null {
  return sportTierCell(struct, 'tennis')
}
function buildCricketStrength({ struct }: SeedContext): CellValue | null {
  return sportTierCell(struct, 'cricket')
}
function buildHockeyStrength({ struct }: SeedContext): CellValue | null {
  return sportTierCell(struct, 'hockey')
}
function buildFootballStrength({ struct }: SeedContext): CellValue | null {
  return sportTierCell(struct, 'football')
}

function buildIbOffered({ struct }: SeedContext): CellValue | null {
  // Schools that offer the IB will have either an exam_results.ib block
  // populated or an admissions_format.curriculum hint. Keep it boolean
  // until Slice 8 follow-up wires the avg-points cell.
  const ib = (struct?.exam_results as Record<string, unknown> | null | undefined)?.ib
  if (ib && typeof ib === 'object') {
    const points = (ib as Record<string, unknown>).avg_points
    if (typeof points === 'number' && points > 0) {
      return { value: `${points} avg`, note: 'IB diploma', source: 'exam_results.ib' }
    }
    return { value: 'Offered', source: 'exam_results.ib' }
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
  { slug: 'school_view',           row_name: 'School view',                 group_name: 'Media',      sort_order: 1800, build: buildSchoolView },
]

// ─── Brief-aware specs (Slice 8 Build 2) ────────────────────────────────────
//
// Each spec has a gate(profile) predicate. Specs fire only when their gate
// returns true for the parent's brief. Group name is 'child-specific' so the
// loader renders them in the "For your child" section (header wired in
// Slice 8 Step 5, commit 7e9b934). sort_order starts at 50 — brief rows
// appear ABOVE the general rows so the parent sees personalised data first.
//
// Idempotency: rows carry `seed:v1:general:brief_<slug>` keys. The
// `seed:v1:general:` prefix is required by the RPC validator (the
// lens_kind segment must match the spec's `lens_kind`, which is 'general'
// here because brief rows share the general lens). Brief origin is
// encoded as `brief_` inside the slug portion. The slug-collision
// reservation is enforced by `seed-rows-keys.test.mjs` (no GENERAL_SPECS
// slug starts with `brief_`).

type BriefSeedRowSpec = SeedRowSpec & {
  gate: (profile: BriefProfile) => boolean
}

// Build 2 r1 (Codex Q8): drop topic-only specs that have no cell builders
// wired today (pastoral_depth, sen_support, inclusive_culture, weekend_programme,
// music_programme, drama_programme). They previously seeded rows full of '—'
// and added UX noise without surfacing comparable data. When the loader
// learns to read school_facts.pastoral_care_score / inclusive_culture_score
// AND `extracurricular`-style fields, re-introduce them with real builders.
const BRIEF_SPECS: BriefSeedRowSpec[] = [
  // Sport priority — 5 sport-strength rows so the parent sees which schools
  // shine where. Cell builders read sports_profile.<sport>.competitive_tier.
  { slug: 'rugby_strength',    row_name: 'Rugby strength',    group_name: 'child-specific', sort_order:  50, gate: isSportPriority, build: buildRugbyStrength },
  { slug: 'tennis_strength',   row_name: 'Tennis strength',   group_name: 'child-specific', sort_order:  60, gate: isSportPriority, build: buildTennisStrength },
  { slug: 'cricket_strength',  row_name: 'Cricket strength',  group_name: 'child-specific', sort_order:  70, gate: isSportPriority, build: buildCricketStrength },
  { slug: 'hockey_strength',   row_name: 'Hockey strength',   group_name: 'child-specific', sort_order:  80, gate: isSportPriority, build: buildHockeyStrength },
  { slug: 'football_strength', row_name: 'Football strength', group_name: 'child-specific', sort_order:  90, gate: isSportPriority, build: buildFootballStrength },

  // Curriculum — IB diploma offered / avg points.
  { slug: 'ib_offered',        row_name: 'IB diploma',        group_name: 'child-specific', sort_order: 100, gate: isIbCurriculum, build: buildIbOffered },
]

/**
 * Filter BRIEF_SPECS to the ones that fire for this profile. Exported as a
 * pure function so unit tests can assert spec selection without a DB.
 */
export function briefSpecsForProfile(profile: BriefProfile | null): BriefSeedRowSpec[] {
  if (!profile) return []
  return BRIEF_SPECS.filter(spec => spec.gate(profile))
}

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
  profile: BriefProfile | null = null,
): Promise<{ inserted: number } | null> {
  if (ctx.slugs.length === 0) return { inserted: 0 }

  // Build per-school cell_data for a single spec.
  const buildCells = (spec: SeedRowSpec): CellData => {
    const cell_data: CellData = {}
    for (const slug of ctx.slugs) {
      const meta = ctx.schoolMap.get(slug)
      if (!meta) continue
      const struct = ctx.structMap.get(slug) ?? null
      const cell = spec.build({ meta, struct })
      if (cell == null || cell.value == null || cell.value === '') continue
      cell_data[slug] = cell
    }
    return cell_data
  }

  const generalSpecs = GENERAL_SPECS.map(spec => ({
    idempotency_key: `seed:v1:general:${spec.slug}`,
    lens_kind:       'general',
    row_name:        spec.row_name,
    group_name:      spec.group_name,
    weight:          spec.weight ?? 1.0,
    sort_order:      spec.sort_order,
    cell_data:       buildCells(spec),
  }))

  // Brief-aware specs fire only when the parent's profile gates them on.
  // Profile is null for legacy/anonymous flows — no brief rows in that case.
  //
  // Key prefix stays `seed:v1:general:` so the existing seed_research_session_rows
  // RPC validator (which requires the lens_kind segment to match the spec's
  // `lens_kind`) accepts them. Brief origin is encoded in the slug as `brief_`.
  // Slug format: brief_<slug> stays within the [a-zA-Z0-9_-]{1,40} cap.
  const briefSpecs = briefSpecsForProfile(profile).map(spec => ({
    idempotency_key: `seed:v1:general:brief_${spec.slug}`,
    lens_kind:       'general',
    row_name:        spec.row_name,
    group_name:      spec.group_name,
    weight:          spec.weight ?? 1.0,
    sort_order:      spec.sort_order,
    cell_data:       buildCells(spec),
  }))

  const specs = [...briefSpecs, ...generalSpecs]

  // Build 2 r1/r2/r3: seeded-row reconcile.
  //
  // Three categories of existing seeded rows on every seed pass:
  //   1. SOFT-DELETE — row exists, key NOT in current spec set, currently
  //      active → set undone_at = now. (Brief-only in practice; general
  //      specs don't churn.)
  //   2. REFRESH — row exists, key IN current spec set, currently active →
  //      rewrite cell_data + row_name + group/sort/weight from fresh spec
  //      so cells reflect the latest shortlist + struct data. Without this,
  //      ON CONFLICT DO NOTHING in the RPC means existing rows keep stale
  //      cells when the shortlist grows.
  //   3. REACTIVATE — row exists, key IN current spec set, currently
  //      undone → clear undone_at AND rewrite cell_data.
  //
  // r3 P1: reconcile applies to BOTH brief and general seeded rows. A
  // pre-existing bug affected general rows: when the shortlist grew,
  // existing Location/Fees/GCSE rows didn't get cells for the new column
  // because the RPC's ON CONFLICT DO NOTHING short-circuited the insert.
  // Sharing the reconcile path for both row classes is the cleanest fix.
  //
  // user_id filter on the reads (r2 Q6 defense-in-depth — service-role
  // already bypasses RLS but adds a clean ownership predicate).
  //
  // Caveat (brief-only): today we cannot distinguish "system soft-delete
  // (brief changed)" from "user soft-delete (parent dismissed the row from
  // the UI)". The reactivate path can therefore bring a parent-dismissed
  // row back when their brief later re-gates the spec. Tracked as a
  // Build 2 v1 known limitation; the fix is a new `undone_reason` column
  // (deferred to a Build 3 follow-up). See Codex r2 Q1.
  try {
    await reconcileSeededRows(supabase, userId, sessionId, specs)
  } catch (e) {
    console.error('[seedResearchSession reconcile]', e)
  }

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
 * Reconcile seeded rows (general + brief) with the parent's CURRENT brief
 * and shortlist.
 *
 * specs: the freshly-built spec payloads (cell_data already computed
 *   against the current shortlist + struct data). Pass general + brief
 *   together — the reconcile loop treats them uniformly.
 *
 * For each existing seeded row on this session/user (identified by the
 * `seed:v1:general:` idempotency-key prefix):
 *   - key NOT in spec set + active → soft-delete
 *   - key IN  spec set + active    → refresh cell_data/metadata
 *   - key IN  spec set + undone    → reactivate AND refresh cell_data
 *
 * Best-effort: any single update failure logs and proceeds.
 *
 * r3 P1: previously this only handled brief rows. Extended to general
 * rows so the "shortlist grew, existing rows have empty cells for the
 * new column" bug also gets fixed.
 */
type SeededSpecPayload = {
  idempotency_key: string
  row_name:        string
  group_name:      string
  weight:          number
  sort_order:      number
  cell_data:       CellData
}

async function reconcileSeededRows(
  supabase: SupabaseClient,
  userId:   string,
  sessionId: string,
  specs:    SeededSpecPayload[],
): Promise<void> {
  // LIKE pattern matches all `seed:v1:general:*` rows (both brief and
  // general — brief rows are `seed:v1:general:brief_<slug>` per the
  // RPC-validator-compatible namespacing).
  //
  // r3 Q2: select cell_data + metadata too so the loop can skip no-op
  // UPDATEs (most page loads find nothing changed). Avoids ~23 write
  // round-trips per render when the shortlist + brief are stable.
  const { data, error } = await supabase
    .from('comparison_rows')
    .select('id, idempotency_key, undone_at, row_name, group_name, weight, sort_order, cell_data')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .like('idempotency_key', 'seed:v1:general:%')

  if (error || !data) return

  const specByKey = new Map(specs.map(s => [s.idempotency_key, s]))
  type Row = {
    id: string
    idempotency_key: string
    undone_at: string | null
    row_name: string
    group_name: string
    weight: number
    sort_order: number
    cell_data: CellData
  }
  const rows = data as Row[]

  const toSoftDelete: string[] = []
  const toRefresh:    Array<{ id: string; spec: SeededSpecPayload; reactivate: boolean }> = []

  for (const row of rows) {
    const spec = specByKey.get(row.idempotency_key)
    if (!spec) {
      // Row whose key is no longer in the active spec set — soft-delete
      // (only fires for brief rows in practice; general specs don't
      // churn between page loads).
      if (row.undone_at == null) toSoftDelete.push(row.id)
      continue
    }
    // Skip no-op refreshes. If the row is active AND every refreshable
    // field already matches the spec's value, there's nothing to write.
    // Reactivation (undone → active) ALWAYS triggers a write so cells
    // are guaranteed fresh after the parent re-engages.
    const reactivate = row.undone_at != null
    const unchanged =
      !reactivate &&
      row.row_name   === spec.row_name &&
      row.group_name === spec.group_name &&
      Number(row.weight)     === spec.weight &&
      row.sort_order === spec.sort_order &&
      // r4 P3 fix: Postgres jsonb does NOT preserve object key order on
      // round-trips. Comparing with plain JSON.stringify would flag
      // semantically-equal rows as "changed" whenever Postgres serialized
      // keys in a different order than our build loop. Use canonicalJson
      // (recursive key-sort) to get a stable byte-level representation.
      canonicalJson(row.cell_data) === canonicalJson(spec.cell_data)
    if (unchanged) continue
    toRefresh.push({ id: row.id, spec, reactivate })
  }

  if (toSoftDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('comparison_rows')
      .update({ undone_at: new Date().toISOString() })
      .in('id', toSoftDelete)
    if (delErr) console.warn('[reconcileSeededRows soft-delete]', delErr.message)
  }

  // Sequential per-row UPDATEs — N is at most |GENERAL_SPECS| + |BRIEF_SPECS|
  // (~23 today). Most page loads find every row unchanged via the
  // canonicalJson diff above, so N tends toward 0 in practice. When the
  // shortlist or brief actually changes, N = number of affected rows.
  for (const { id, spec, reactivate } of toRefresh) {
    const patch: Record<string, unknown> = {
      row_name:   spec.row_name,
      group_name: spec.group_name,
      weight:     spec.weight,
      sort_order: spec.sort_order,
      cell_data:  spec.cell_data,
    }
    if (reactivate) patch.undone_at = null
    const { error: updErr } = await supabase
      .from('comparison_rows')
      .update(patch)
      .eq('id', id)
    if (updErr) console.warn('[reconcileSeededRows refresh]', spec.idempotency_key, updErr.message)
  }
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
