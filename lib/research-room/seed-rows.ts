import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  KNOWN_FULL_BOARDING_NAMES,
  normalizeSchoolName,
  effectiveBoardingGrade,
  type BoardingGrade,
} from '@/lib/school-name-overrides'
import { boardingGradeNote } from '@/lib/server/research-room/evidence-packs'
import type { WinnerRule, FitBand, BoardingMix } from '@/components/nana/comparison-placeholder'
import {
  type BriefProfile,
  isIbCurriculum,
  isSportPriority,
  isAcademicPriority,
  isFullOrWeeklyBoarding,
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
  // Research Room redesign (data side, 2026-07-16): raw numeric value behind
  // `value` (e.g. 44400 for "£44,400", 62 for "62%"), so the presentation
  // layer can compare/mark a row winner without parsing the display string.
  // Set only by builders whose underlying field is genuinely numeric;
  // undefined for free-text cells (school type, location, sport tiers, ...).
  numeric?: number
  // RRV-5: see FitBand in comparison-placeholder.ts. `value` stays the
  // plain factual reading (e.g. the raw tier string) deliberately — `band`
  // carries the parent-facing word + discrete-segment position, kept
  // separate so cellFromRaw's shared verdict-tab path is unaffected (see
  // loadLensRows in lib/research-comparison.ts, which attaches this).
  band?: FitBand
  // RRV-5: see BoardingMix in comparison-placeholder.ts. Only set when a
  // real per-school board/day % exists — never derived from the
  // categorical boarding_grade enum.
  mix?: BoardingMix
  // RRV-7 (2026-07-20): raw drive-time minutes behind a "NN min" value, so
  // loadLensRows can plot the travel corridor without parsing the display
  // string. Parallel-field rule (same as band/mix): cellFromRaw in
  // lib/research-comparison.ts must NEVER read this — it feeds
  // loadVerdictRows, whose output is hashed into the verdict cache key.
  // Existing sessions pick it up via reconcileSeededRows' canonicalJson
  // diff on next load (RRV-5 precedent, no migration).
  minutes?: number
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
  // RRV-5: the categorical enum (see lib/school-name-overrides.ts) — always
  // read through effectiveBoardingGrade(name, boarding_grade), never raw,
  // so the curated Merchiston/day-only overrides apply.
  boarding_grade: string | null
}

// One row of school_notion_backfill (Phase 1 sidecar). `parsed` holds the
// fields the parser was confident enough to write — extractor is still the
// primary source; Notion fills nulls per the precedence rules. See
// scripts/sync-notion-schools.mjs FIELD_RULES.
//
// Codex r1 P2: deliberately omit `flagged_review` from this type. Cell builders
// must NEVER surface flagged values (Wellington `66% (9-8)` GCSE trap, Sevenoaks
// `IB 3957%`, etc.) — keeping the property out of the type prevents accidental
// reads and keeps the SELECT lean.
type NotionBackfillRow = {
  school_slug: string
  status:      string
  parsed:      Record<string, unknown> | null
}

type SeedContext = {
  meta:   SchoolMeta
  struct: StructuredRow | null
  notion: NotionBackfillRow | null
  // RRV-5: only the brief-aware builders that need to judge "does this
  // school match what the family asked for" (buildBoardingLifeFit's muted
  // flag) read this. General builders ignore it — it's optional so their
  // signatures don't need to change. Null for legacy/anonymous flows,
  // matching seedResearchSession's existing `profile: BriefProfile | null`.
  profile?: BriefProfile | null
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
  // Research Room redesign (data side, 2026-07-16): which direction "wins"
  // this row for the comparison table's winner mark. Omitted specs default
  // to 'neutral' via GENERAL_ROW_WINNER_RULES below — the safer default
  // when a row's cells aren't a clean, universally-agreed-direction metric
  // (fees, free text, qualitative tiers).
  winnerRule?: WinnerRule
}

// ─── Notion sidecar accessors ───────────────────────────────────────────────
//
// The sync writes only safe-to-surface values to `parsed` (extractor was null
// OR no conflict was detected). Anything that needed manual reconciliation
// landed in `flagged_review` and we deliberately do NOT read those here.
// Cell-builder rule: extractor first; if null, fall back to notion.parsed[key].

function notionParsed(notion: NotionBackfillRow | null, field: string): unknown {
  if (!notion?.parsed) return null
  const v = (notion.parsed as Record<string, unknown>)[field]
  return v == null ? null : v
}

function notionParsedNumber(notion: NotionBackfillRow | null, field: string): number | null {
  const v = notionParsed(notion, field)
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Format a parsed-fee value (scalar or {min,max}) as £XX,XXX or £XX,XXX–£XX,XXX.
function formatGbp(value: number | { min: number; max: number }): string {
  if (typeof value === 'number') return `£${Math.round(value).toLocaleString()}`
  const { min, max } = value
  if (min === max) return `£${Math.round(min).toLocaleString()}`
  return `£${Math.round(min).toLocaleString()}–£${Math.round(max).toLocaleString()}`
}

// Read a parsed-fee value: number or {min,max} object. Returns null if neither.
function notionParsedFee(notion: NotionBackfillRow | null, field: string): number | { min: number; max: number } | null {
  const v = notionParsed(notion, field)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof v === 'object') {
    const o = v as { min?: unknown; max?: unknown }
    if (typeof o.min === 'number' && typeof o.max === 'number') return { min: o.min, max: o.max }
  }
  return null
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
    const m = obj.drive_time_min_estimate ?? obj.minutes ?? obj.travel_minutes ?? obj.drive_minutes ?? obj.duration_minutes
    // RRV-7: `minutes` mirrors the numeric value for the travel corridor
    // (parallel field — see the CellValue comment). The string branch
    // deliberately stays minutes-less: an unparsed free-text time can't be
    // plotted honestly. (2026-07-20 trace: all 99 UK-pool Heathrow entries
    // are numeric drive_time_min_estimate, so the string branch is dormant.)
    if (typeof m === 'number' && m > 0) return { value: `${m} min`, source: 'location_profile', minutes: m }
    if (typeof m === 'string' && m.trim()) return { value: m, source: 'location_profile' }
  }
  return null
}

function buildClassSize({ notion }: SeedContext): CellValue | null {
  // Extractor doesn't currently surface class_size; Notion fills it.
  // Notion shape (parser v1.0.2):
  //   { senior?: number|{min,max}, sixth?: number|{min,max} }
  //   OR { average: number|{min,max} }
  // 2026-05-19: range averages (e.g. "12-15" → {average:{min:12,max:15}}) now
  // supported via fmtBucket on the average branch.
  const parsed = notionParsed(notion, 'class_size')
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as { senior?: unknown; sixth?: unknown; average?: unknown }
  const fmtBucket = (v: unknown): string | null => {
    if (typeof v === 'number') return String(v)
    if (v && typeof v === 'object') {
      const r = v as { min?: unknown; max?: unknown }
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

function buildTotalPupils({ struct, notion }: SeedContext): CellValue | null {
  const sc = struct?.student_community as Record<string, unknown> | null | undefined
  const ext = typeof sc?.total_pupils === 'number' ? sc.total_pupils as number : null
  // Conflict-gated in the sync — Notion's parsed value is only set when extractor
  // was empty, so the precedence here is just "extractor first, else Notion".
  const total = ext ?? notionParsedNumber(notion, 'total_pupils')
  if (total == null) return null
  let bucket = ''
  if (total <= 400) bucket = 'Small'
  else if (total <= 800) bucket = 'Mid-size'
  else if (total <= 1200) bucket = 'Larger'
  else bucket = 'Very large'
  const source = ext != null ? 'student_community.total_pupils' : 'notion.parsed.total_pupils'
  return { value: `~${total.toLocaleString()}`, note: bucket, source, numeric: total }
}

// Map UK "NN+" admissions notation to its corresponding Year. Per Codex pre-flight:
// "13+" is admissions notation (entry to Year 9), NOT Year 13. This shared map +
// the helper below prevent buildLowestBoardingEntry and buildY9Y10Admissions from
// drifting on this rule.
const PLUS_TO_YEAR: Readonly<Record<string, number>> = Object.freeze({
  '7+':  3,
  '8+':  4,
  '11+': 7,
  '13+': 9,
  '14+': 10,
  '16+': 12,
})

// Extract a UK Year (1-13) from a free-text entry_point string. Order of precedence:
//   1. "Year N" with (?!\d) lookahead so "Year 100" doesn't match "Year 10"
//   2. "NN+" admissions notation via PLUS_TO_YEAR (covers "13+", "11+", etc.)
//   3. "Sixth Form" mention → Year 12
//   4. Bare-digit fallback ONLY when no admissions notation present, capped 1-13
// Returns null when nothing valid is extractable.
function extractUkYearFromString(s: string): number | null {
  // 1. "Year N" with no trailing digit
  const yearM = s.match(/\byear\s+(\d{1,2})(?!\d)/i)
  if (yearM) {
    const n = Number(yearM[1])
    if (n >= 1 && n <= 13) return n
  }
  // 2. NN+ admissions notation
  const plusM = s.match(/\b(\d{1,2}\+)/)
  if (plusM && plusM[1] in PLUS_TO_YEAR) {
    return PLUS_TO_YEAR[plusM[1]]
  }
  // 3. Sixth Form
  if (/sixth\s*form/i.test(s)) return 12
  // 4. Bare-digit fallback (only when no NN+ is present — guards against "13+ entry"
  //    being misread as Year 13).
  if (!plusM) {
    const anyM = s.match(/\b(\d{1,2})(?!\d)/)
    if (anyM) {
      const n = Number(anyM[1])
      if (n >= 1 && n <= 13) return n
    }
  }
  return null
}

function buildLowestBoardingEntry({ struct, notion }: SeedContext): CellValue | null {
  const af = struct?.admissions_format as Record<string, unknown> | null | undefined
  const ep = af?.entry_points
  // Notion fallback when extractor's entry_points array is missing/empty
  // (e.g. Rugby School in the original audit). Notion stores a normalised
  // integer 1-13. We return early so the existing extractor logic still
  // runs first when entry_points is present.
  //
  // Codex r1 P2: the sync's readExtractorField() treats any non-empty
  // entry_points as "extractor present" and skips Notion writes. So the
  // SECOND fallback below (entries present but pick == null) is defensive
  // dead code today, but worth keeping in case the sync predicate gets
  // tightened later to mean "can parse a year."
  if (!Array.isArray(ep) || ep.length === 0) {
    const n = notionParsedNumber(notion, 'lowest_boarding_entry')
    if (n != null && n >= 1 && n <= 13) {
      return { value: `Year ${n}`, source: 'notion.parsed.lowest_boarding_entry' }
    }
    return null
  }
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
      // Extractor writes free-text `entry_point` (e.g. "Year 9 (Third Form, age ~13)").
      // Legacy/alternative shapes used numeric `year`/`age`. Walk all candidates in
      // priority order and stop at the FIRST that yields a usable value — this avoids
      // entry_point="Overseas students" (unparseable) masking a numeric `year: 9`.
      // Per Codex r2 finding.
      for (const raw of [o.entry_point, o.year, o.age]) {
        if (typeof raw === 'number') { y = raw; break }
        if (typeof raw === 'string') {
          const parsed = extractUkYearFromString(raw)
          if (parsed != null) { y = parsed; break }
        }
      }
      // Boarding signal blob: include entry_point text + adjacent metadata fields.
      // Deliberately EXCLUDE `assessment` — per Codex r3, "Set by the exam board"
      // would false-positive on the boarding regex and incorrectly flag day-only
      // entries as boarding entries (worst-case: Year 7 with exam-board assessment
      // beats a real Year 9 boarder row for lowest-boarding-entry).
      // Use \bboard regex (not board\b) so "boarder"/"boarders" also matches.
      const blob = `${o.entry_point ?? ''} ${o.label ?? ''} ${o.note ?? ''} ${o.boarding ?? ''}`.toLowerCase()
      mentionsBoarding = /\bboard(?:ing|er|ers)?\b/.test(blob) || o.boarding === true
    } else if (typeof e === 'string') {
      y = extractUkYearFromString(e)
      mentionsBoarding = /\bboard(?:ing|er|ers)?\b/i.test(e)
    }
    if (y == null) continue
    // Valid UK Year range is 1-13 (Codex sanity check). Out-of-range = parser bug or wild data.
    if (y < 1 || y > 13) continue
    if (mentionsBoarding && (lowestBoarding == null || y < lowestBoarding)) lowestBoarding = y
    if (lowestOverall == null || y < lowestOverall) lowestOverall = y
  }
  const pick = lowestBoarding ?? lowestOverall
  if (pick == null) {
    // Extractor entries existed but nothing parsed cleanly — try Notion.
    const n = notionParsedNumber(notion, 'lowest_boarding_entry')
    if (n != null && n >= 1 && n <= 13) {
      return { value: `Year ${n}`, source: 'notion.parsed.lowest_boarding_entry' }
    }
    return null
  }
  return { value: `Year ${pick}`, source: 'admissions_format.entry_points' }
}

function buildBoardingPupils({ struct, notion }: SeedContext): CellValue | null {
  // Extractor's student_community.boarder_count is mostly NULL today —
  // Notion is the de-facto source. Honour extractor if it ever lands a value.
  const sc = struct?.student_community as Record<string, unknown> | null | undefined
  const ext = typeof sc?.boarder_count === 'number' ? sc.boarder_count as number : null
  if (ext != null) return { value: `~${ext.toLocaleString()}`, source: 'student_community.boarder_count', numeric: ext }
  const n = notionParsedNumber(notion, 'boarder_count')
  if (n != null) return { value: `~${n.toLocaleString()}`, source: 'notion.parsed.boarder_count', numeric: n }
  return null
}

function buildInternationalPupils({ struct, notion }: SeedContext): CellValue | null {
  const sc = struct?.student_community as Record<string, unknown> | null | undefined
  const ext = typeof sc?.intl_count === 'number' ? sc.intl_count as number : null
  if (ext != null) return { value: `~${ext.toLocaleString()}`, source: 'student_community.intl_count', numeric: ext }
  const n = notionParsedNumber(notion, 'intl_count')
  if (n != null) return { value: `~${n.toLocaleString()}`, source: 'notion.parsed.intl_count', numeric: n }
  return null
}

function buildDayPupils({ struct, notion }: SeedContext): CellValue | null {
  // 2026-05-19 — derive day pupils from total_pupils − boarder_count when both
  // come from the SAME source family. Mixing extractor's total with Notion's
  // boarder count would compare different cohort definitions / snapshot dates,
  // so each branch (extractor / Notion) only fires when both sides are present
  // for that source. Sanity: total > boarders (≤0 ⇒ data error, fall through).
  const sc = struct?.student_community as Record<string, unknown> | null | undefined
  const extTotal    = typeof sc?.total_pupils  === 'number' ? sc.total_pupils  as number : null
  const extBoarders = typeof sc?.boarder_count === 'number' ? sc.boarder_count as number : null
  if (extTotal != null && extBoarders != null && extTotal > extBoarders) {
    const day = extTotal - extBoarders
    return {
      value:  `~${day.toLocaleString()}`,
      source: 'derived: student_community.total_pupils − boarder_count',
      note:   'Total − Boarders',
      numeric: day,
    }
  }
  const notionTotal    = notionParsedNumber(notion, 'total_pupils')
  const notionBoarders = notionParsedNumber(notion, 'boarder_count')
  if (notionTotal != null && notionBoarders != null && notionTotal > notionBoarders) {
    const day = notionTotal - notionBoarders
    return {
      value:  `~${day.toLocaleString()}`,
      source: 'derived: notion.parsed.total_pupils − boarder_count',
      note:   'Total − Boarders',
      numeric: day,
    }
  }
  return null
}

// RRV-5 (2026-07-20): word-only fallback when no real board/day % exists
// but the categorical boarding_grade does — never a fabricated proportion.
// Kept short (fits a table cell); the full honest sentence from
// boardingGradeNote() goes in `note`, not `value`.
const BOARDING_GRADE_MIX_WORD: Readonly<Record<Exclude<BoardingGrade, 'unknown'>, string>> = Object.freeze({
  'full-dominant': 'Predominantly boarding',
  'offers-full':   'Offers full boarding',
  'weekly-only':   'Weekly/flexi only',
  'day-only':      'Day school',
})

function buildBoardingRatio({ meta, struct, notion }: SeedContext): CellValue | null {
  // Codex r1 P1: extractor (extract-batch-culture.js) writes student_community.boarding_pct
  // as a percentage 0-100. Earlier draft of this builder read `boarding_ratio` which never
  // existed in extractor data — Notion was always winning by default. Read both keys; if a
  // value < 1 sneaks in (legacy fraction shape), treat as 0-1 and rescale.
  const sc = struct?.student_community as Record<string, unknown> | null | undefined
  let ext: number | null = null
  for (const k of ['boarding_pct', 'boarding_ratio']) {
    const v = sc?.[k]
    if (typeof v === 'number' && Number.isFinite(v)) { ext = v; break }
  }
  if (ext != null) {
    const pct = ext > 0 && ext <= 1 ? ext * 100 : ext
    const rounded = Math.round(pct)
    // RRV-5: this IS a real per-school proportion (student_community.boarding_pct),
    // so — and only so — a genuine 2-segment board/day bar is honest here.
    return {
      value: `${rounded}%`,
      source: ext === sc?.boarding_pct ? 'student_community.boarding_pct' : 'student_community.boarding_ratio',
      numeric: rounded,
      mix: { boardPct: rounded, dayPct: 100 - rounded },
    }
  }
  const n = notionParsedNumber(notion, 'boarding_ratio')
  if (n != null) {
    // Notion stores percentages as 75.6 (already %, not 0.756). Round for display.
    const rounded = Math.round(n)
    return { value: `${rounded}%`, source: 'notion.parsed.boarding_ratio', numeric: rounded, mix: { boardPct: rounded, dayPct: 100 - rounded } }
  }
  // RRV-5: no real proportion on record for this school — fall back to the
  // categorical boarding_grade as an honest WORD (never a fabricated %).
  // effectiveBoardingGrade layers the curated Merchiston/day-only overrides
  // over the raw column, same as buildBoardingLifeFit.
  const grade = effectiveBoardingGrade(meta.name, meta.boarding_grade)
  if (grade === 'unknown') return null
  return {
    value: BOARDING_GRADE_MIX_WORD[grade],
    source: 'schools.boarding_grade',
    note: boardingGradeNote(grade),
  }
}

function buildGcsePct({ struct, notion }: SeedContext): CellValue | null {
  const gcse = (struct?.exam_results as Record<string, unknown> | null | undefined)?.gcse as
    | Record<string, unknown>
    | undefined
  const pct = gcse?.pct_7_to_9
  if (typeof pct === 'number') return { value: `${Math.round(pct)}%`, source: 'exam_results.gcse', numeric: Math.round(pct) }
  // Conflict-gated: Notion's parsed value only set when extractor was empty.
  // The (9-8) trap was caught in the parser — anything in parsed is safely 9-7.
  const n = notionParsedNumber(notion, 'gcse_pct')
  if (n != null) return { value: `${Math.round(n)}%`, source: 'notion.parsed.gcse_pct', numeric: Math.round(n) }
  // Wellington / Harrow only publish 9-8, not 9-7. Promoted into a separate slot
  // (gcse_pct_alt_band) so parsed.gcse_pct's 9-7 invariant stays intact; cell
  // renders the band inline so the column-default "GCSE 9–7" header isn't a lie.
  const alt = notionParsed(notion, 'gcse_pct_alt_band')
  if (typeof alt === 'string' && alt.length > 0) {
    return { value: alt, source: 'notion.parsed.gcse_pct_alt_band' }
  }
  return null
}

function buildALevelPct({ struct, notion }: SeedContext): CellValue | null {
  const al = (struct?.exam_results as Record<string, unknown> | null | undefined)?.a_level as
    | Record<string, unknown>
    | undefined
  const pct = al?.pct_a_star_a
  if (typeof pct === 'number') return { value: `${Math.round(pct)}%`, source: 'exam_results.a_level', numeric: Math.round(pct) }
  const n = notionParsedNumber(notion, 'a_level_pct')
  if (n != null) return { value: `${Math.round(n)}%`, source: 'notion.parsed.a_level_pct', numeric: Math.round(n) }
  return null
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
  if (Array.isArray(rows)) {
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
    if (max != null) return { value: `${sym}${Math.round(max).toLocaleString()}`, source: 'fees_by_grade', numeric: Math.round(max) }
  }
  // Notion fallback (Phase 1) — value is GBP scalar or {min,max}.
  const fee = notionParsedFee(notion, 'boarding_fee_term')
  if (fee != null) {
    const numeric = typeof fee === 'number' ? fee : fee.max
    return { value: formatGbp(fee), source: 'notion.parsed.boarding_fee_term', numeric }
  }
  return null
}

function buildAnnualBoardingFee({ struct, notion }: SeedContext): CellValue | null {
  const min = typeof struct?.fees_min === 'number' ? struct.fees_min : null
  const max = typeof struct?.fees_max === 'number' ? struct.fees_max : null
  if (min != null || max != null) {
    const cur = struct?.fees_currency ?? 'GBP'
    const sym = cur === 'GBP' ? '£' : cur === 'USD' ? '$' : ''
    const fmt = (n: number) => `${sym}${n.toLocaleString()}`
    if (min != null && max != null && max !== min) {
      return { value: `${fmt(min)}–${fmt(max)}`, source: 'school_structured_data.fees', numeric: min }
    }
    const single = min ?? max!
    return { value: fmt(single), source: 'school_structured_data.fees', numeric: single }
  }
  // Notion fallback — conflict-gated, so only set when extractor was empty.
  const fee = notionParsedFee(notion, 'boarding_fee_year')
  if (fee != null) {
    const numeric = typeof fee === 'number' ? fee : fee.max
    return { value: formatGbp(fee), source: 'notion.parsed.boarding_fee_year', numeric }
  }
  return null
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
      return { value: `${sym}${Math.round(bestNumber).toLocaleString()}`, source: 'compulsory_extras', numeric: Math.round(bestNumber) }
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
          return { value: `£${cleaned.toLocaleString()}`, source: 'process_steps', numeric: cleaned }
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
    // Extractor writes free-text `entry_point` (e.g. "Year 9 (Third Form, age ~13)").
    // Walk candidates in priority order so an unparseable entry_point doesn't mask
    // a structured numeric `year`/`age`. Per Codex r2 finding — keeps lockstep with
    // buildLowestBoardingEntry. The helper handles "13+ entry" → Year 9 correctly.
    let y: number | null = null
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

// RRV-5 (2026-07-20): real tier vocabularies, queried live against
// production (project ckofdbjfbxoxxxtedmqa) — the code comment this
// replaced guessed "Elite/Strong/Developing" but that vocabulary doesn't
// exist in the data. Rugby's extractor uses a genuinely different 5-rung
// scale (includes a bare 'national' rung, no 'local') than the other four
// sports' 4-rung scale. Order is low → high; index+1 = band.filled.
const RUGBY_TIER_SCALE = ['recreational', 'regional', 'national', 'national-strong', 'national-elite'] as const
const OTHER_SPORT_TIER_SCALE = ['local', 'regional', 'national-strong', 'national-elite'] as const

// Parent-facing words for band.word — deliberately NOT the raw tier slug
// (kept as `value` unchanged, see below) and NOT the mock's exact wording
// (that was illustrative copy over sample data). Short, plain, no jargon.
const TIER_BAND_WORDS: Readonly<Record<string, string>> = Object.freeze({
  recreational:     'Recreational',
  local:            'Local',
  regional:         'Regional',
  national:         'National',
  'national-strong': 'National',
  'national-elite': 'National elite',
})

function sportTierBand(sportKey: 'rugby' | 'tennis' | 'cricket' | 'hockey' | 'football' | 'netball', tier: string): FitBand | undefined {
  const scale = sportKey === 'rugby' ? RUGBY_TIER_SCALE : OTHER_SPORT_TIER_SCALE
  const idx = (scale as readonly string[]).indexOf(tier)
  // Not in this sport's known scale (and not 'unknown', already filtered
  // out by the caller) — future extractor vocab drift. Render the raw
  // value as plain text (today's behaviour) rather than a bar that implies
  // a position on a scale we don't actually recognise.
  if (idx === -1) return undefined
  const word = TIER_BAND_WORDS[tier]
  if (!word) return undefined
  return { word, filled: idx + 1, total: scale.length }
}

function sportTierCell(
  struct: StructuredRow | null,
  sportKey: 'rugby' | 'tennis' | 'cricket' | 'hockey' | 'football' | 'netball',
): CellValue | null {
  const sport = (struct?.sports_profile as Record<string, unknown> | null | undefined)?.[sportKey]
  if (!sport || typeof sport !== 'object') return null
  const obj = sport as Record<string, unknown>
  const tier = obj.competitive_tier
  if (typeof tier !== 'string' || !tier.trim()) return null
  // RRV-5 fix: 'unknown' is a real, populated extractor value (the sport
  // was found but no competitive tier could be assessed) — it is NOT a
  // real claim about the school and must not render as if it were one.
  // Falls through to the RRV-2 Ask-Nana gap chip like any other absent cell.
  if (tier.trim().toLowerCase() === 'unknown') return null
  // Most cells benefit from a fixture-count hint when present (e.g. tennis
  // shows team counts via SOCS discovery). Keep the cell compact: tier label
  // as the primary value, optional fixture count in note.
  const teams = obj.team_count ?? obj.teams ?? obj.fixtures_count
  const note = typeof teams === 'number' && teams > 0 ? `${teams} teams` : undefined
  return {
    value: tier.charAt(0).toUpperCase() + tier.slice(1),
    note,
    source: `sports_profile.${sportKey}`,
    band: sportTierBand(sportKey, tier.trim().toLowerCase()),
  }
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
      return { value: `${points} avg`, note: 'IB diploma', source: 'exam_results.ib', numeric: points }
    }
    return { value: 'Offered', source: 'exam_results.ib' }
  }
  return null
}

// RRV-5 (2026-07-20): "Academic stretch" — a fit bar for families whose
// top priority is academic. Reuses the exact same real numbers the
// always-shown GCSE/A-level rows already read (no new extraction); this
// row's only job is to translate a real % into a plain-word bucket for a
// parent who told us this specifically matters. A-level preferred when
// present (older Y12/13 shortlists) since it's the more direct "stretch"
// signal; falls back to GCSE for younger entrants. Thresholds below are a
// founder-set display bucketing (like the fees/pastoral 'neutral'
// winnerRule decisions elsewhere in this file), calibrated to the live
// percentile spread queried 2026-07-20 (GCSE p10/p50/p90 = 45/75/95,
// A-level p10/p50/p90 = 39/60/85) — not an extracted or externally
// benchmarked scale.
function academicBand(pct: number, kind: 'gcse' | 'a_level'): FitBand {
  const cuts = kind === 'gcse' ? [55, 75, 88] : [45, 65, 80]
  const words = ['Developing', 'Moderate', 'Strong', 'Exceptional']
  let idx = cuts.findIndex(c => pct < c)
  if (idx === -1) idx = cuts.length
  return { word: words[idx], filled: idx + 1, total: 4 }
}

function buildAcademicStretch({ struct, notion }: SeedContext): CellValue | null {
  const al = (struct?.exam_results as Record<string, unknown> | null | undefined)?.a_level as
    | Record<string, unknown>
    | undefined
  const alPct = al?.pct_a_star_a
  if (typeof alPct === 'number') {
    return { value: `${Math.round(alPct)}%`, source: 'exam_results.a_level', numeric: Math.round(alPct), band: academicBand(alPct, 'a_level') }
  }
  const gcse = (struct?.exam_results as Record<string, unknown> | null | undefined)?.gcse as
    | Record<string, unknown>
    | undefined
  const gcsePct = gcse?.pct_7_to_9
  if (typeof gcsePct === 'number') {
    return { value: `${Math.round(gcsePct)}%`, source: 'exam_results.gcse', numeric: Math.round(gcsePct), band: academicBand(gcsePct, 'gcse') }
  }
  const alN = notionParsedNumber(notion, 'a_level_pct')
  if (alN != null) return { value: `${Math.round(alN)}%`, source: 'notion.parsed.a_level_pct', numeric: Math.round(alN), band: academicBand(alN, 'a_level') }
  const gcseN = notionParsedNumber(notion, 'gcse_pct')
  if (gcseN != null) return { value: `${Math.round(gcseN)}%`, source: 'notion.parsed.gcse_pct', numeric: Math.round(gcseN), band: academicBand(gcseN, 'gcse') }
  return null
}

// RRV-5: "Boarding life fit" — a fit bar for families who told us they
// want full or weekly boarding. Same categorical source as "Boarding mix"
// below (boarding_grade), but answers a different, personalised question:
// does THIS school's boarding life match what YOU asked for, not just what
// proportion of pupils board. `filled` encodes the enum's real monotone
// order (day-only < weekly-only < offers-full < full-dominant); `muted`
// flags a genuine preference mismatch, never "low confidence".
function buildBoardingLifeFit({ meta, profile }: SeedContext): CellValue | null {
  const grade = effectiveBoardingGrade(meta.name, meta.boarding_grade)
  if (grade === 'unknown') return null
  const wantsFull = profile?.boarding_pref === 'full'
  const BANDS: Record<Exclude<BoardingGrade, 'unknown'>, { word: string; filled: number; muted: boolean }> = {
    'full-dominant': { word: 'Core strength', filled: 4, muted: false },
    'offers-full':   { word: 'Offers full',   filled: 3, muted: false },
    'weekly-only':   { word: 'Weekly option', filled: 2, muted: wantsFull },
    'day-only':      { word: 'Mostly day',    filled: 1, muted: true },
  }
  const b = BANDS[grade]
  // Unlike the sport-tier rows (pre-existing, raw tier string already
  // flowed to the Verdict tab before RRV-5), this row is brand new — no
  // legacy `value` shape to preserve. Use the same short word for both
  // `value` and `band.word` rather than leaking the raw enum slug
  // ("full-dominant") to any consumer that doesn't render `band`.
  return {
    value: b.word,
    source: 'schools.boarding_grade',
    note: boardingGradeNote(grade),
    band: { word: b.word, filled: b.filled, total: 4, muted: b.muted },
  }
}

// ─── Spec list ──────────────────────────────────────────────────────────────
// sort_order uses 100, 200, 300, ... so future specs can slot between
// existing values without renumbering the whole list.

// Research Room redesign (data side, 2026-07-16): winnerRule per spec.
//   - gcse_pct / a_level_pct: exam results — higher-is-better.
//   - boarding_fee_term / boarding_fee_year / registration_fee: fees/price —
//     explicit founder decision, 'neutral' (cheapest isn't always "best").
//   - everything else here is either free text (location, entry windows),
//     a logistics/preference field with no universal "better" direction
//     (travel time, class size, pupil counts, boarding ratio), or a row
//     that never actually populates (school_view) — 'neutral' per the
//     "if genuinely unsure, default to neutral" rule. Omitted winnerRule
//     also resolves to 'neutral' via GENERAL_ROW_WINNER_RULES below; set
//     explicitly here anyway for readability.
const GENERAL_SPECS: SeedRowSpec[] = [
  // 'School name' was in the v1 spec but redundant with column headers,
  // dropped in v1.1. Existing rows in deployed sessions get a one-shot
  // soft-delete via the migration that ships alongside this change.
  { slug: 'school_type',           row_name: 'School type',                 group_name: 'About',      sort_order:  200, build: buildSchoolType, winnerRule: 'neutral' },
  { slug: 'location',              row_name: 'Location',                    group_name: 'About',      sort_order:  300, build: buildLocation, winnerRule: 'neutral' },
  { slug: 'heathrow_minutes',      row_name: 'Travel from Heathrow',        group_name: 'About',      sort_order:  400, build: buildHeathrowMinutes, winnerRule: 'neutral' },
  { slug: 'class_size',            row_name: 'Class size',                  group_name: 'Pastoral',   sort_order:  500, build: buildClassSize, winnerRule: 'neutral' },
  { slug: 'total_pupils',          row_name: 'Total pupils',                group_name: 'Pastoral',   sort_order:  600, build: buildTotalPupils, winnerRule: 'neutral' },
  { slug: 'lowest_boarding_entry', row_name: 'Lowest boarding entry',       group_name: 'Admissions', sort_order:  700, build: buildLowestBoardingEntry, winnerRule: 'neutral' },
  { slug: 'boarding_pupils',       row_name: 'Boarding pupils',             group_name: 'Pastoral',   sort_order:  800, build: buildBoardingPupils, winnerRule: 'neutral' },
  { slug: 'international_pupils',  row_name: 'International pupils',        group_name: 'Pastoral',   sort_order:  900, build: buildInternationalPupils, winnerRule: 'neutral' },
  { slug: 'day_pupils',            row_name: 'Day pupils',                  group_name: 'Pastoral',   sort_order: 1000, build: buildDayPupils, winnerRule: 'neutral' },
  // RRV-5 (2026-07-20): renamed 'Boarding ratio' → 'Boarding mix' — the
  // builder now emits a real board/day bar OR an honest boarding_grade
  // word (never a fabricated 3-way split), so the label needed to stop
  // promising a single ratio number. Slug/idempotency-key UNCHANGED
  // (boarding_ratio) so seedResearchSession's reconcile path rewrites
  // row_name + cell_data on every existing session's next load — no
  // migration, no duplicate row. See buildBoardingRatio for the ladder.
  { slug: 'boarding_ratio',        row_name: 'Boarding mix',                group_name: 'Pastoral',   sort_order: 1100, build: buildBoardingRatio, winnerRule: 'neutral' },
  { slug: 'gcse_pct',              row_name: 'GCSE 9–7',                    group_name: 'Academics',  sort_order: 1200, build: buildGcsePct, winnerRule: 'higher-is-better' },
  { slug: 'a_level_pct',           row_name: 'A-level A*–A',                group_name: 'Academics',  sort_order: 1300, build: buildALevelPct, winnerRule: 'higher-is-better' },
  { slug: 'boarding_fee_term',     row_name: 'Boarding fee · per term',     group_name: 'Fees',       sort_order: 1400, build: buildBoardingFeeTerm, winnerRule: 'neutral' },
  { slug: 'boarding_fee_year',     row_name: 'Boarding fee · per year',     group_name: 'Fees',       sort_order: 1500, build: buildAnnualBoardingFee, winnerRule: 'neutral' },
  { slug: 'registration_fee',      row_name: 'Registration fee',            group_name: 'Fees',       sort_order: 1600, build: buildRegistrationFee, winnerRule: 'neutral' },
  { slug: 'y9_y10_admissions',     row_name: 'Year 9 / 10 admissions',      group_name: 'Admissions', sort_order: 1700, build: buildY9Y10Admissions, winnerRule: 'neutral' },
  { slug: 'school_view',           row_name: 'School view',                 group_name: 'Media',      sort_order: 1800, build: buildSchoolView, winnerRule: 'neutral' },
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
  // shine where. Cell builders read sports_profile.<sport>.competitive_tier;
  // RRV-5 (2026-07-20) gave this a real, queried-live ordinal scale (see
  // RUGBY_TIER_SCALE / OTHER_SPORT_TIER_SCALE above buildRugbyStrength) —
  // 'neutral' stays the winnerRule regardless, per the "if genuinely
  // unsure, default to neutral" rule (a tier isn't a clean single metric).
  { slug: 'rugby_strength',    row_name: 'Rugby strength',    group_name: 'child-specific', sort_order:  50, gate: isSportPriority, build: buildRugbyStrength, winnerRule: 'neutral' },
  { slug: 'tennis_strength',   row_name: 'Tennis strength',   group_name: 'child-specific', sort_order:  60, gate: isSportPriority, build: buildTennisStrength, winnerRule: 'neutral' },
  { slug: 'cricket_strength',  row_name: 'Cricket strength',  group_name: 'child-specific', sort_order:  70, gate: isSportPriority, build: buildCricketStrength, winnerRule: 'neutral' },
  { slug: 'hockey_strength',   row_name: 'Hockey strength',   group_name: 'child-specific', sort_order:  80, gate: isSportPriority, build: buildHockeyStrength, winnerRule: 'neutral' },
  { slug: 'football_strength', row_name: 'Football strength', group_name: 'child-specific', sort_order:  90, gate: isSportPriority, build: buildFootballStrength, winnerRule: 'neutral' },

  // Curriculum — IB diploma offered / avg points. avg_points is a real
  // academic score (IB diploma average, out of 45) — higher-is-better,
  // same bucket as GCSE/A-level pass rates.
  { slug: 'ib_offered',        row_name: 'IB diploma',        group_name: 'child-specific', sort_order: 100, gate: isIbCurriculum, build: buildIbOffered, winnerRule: 'higher-is-better' },

  // RRV-5 (2026-07-20): fit bars — child-priority-labeled, words not
  // scores (mock §4). 'neutral' winnerRule for both: they're translations
  // of an already-numeric/categorical fact into a bucketed word, not a
  // clean independent metric worth a second winner mark.
  { slug: 'academic_stretch',  row_name: 'Academic stretch',    group_name: 'child-specific', sort_order: 110, gate: isAcademicPriority, build: buildAcademicStretch, winnerRule: 'neutral' },
  { slug: 'boarding_life_fit', row_name: 'Boarding life fit',   group_name: 'child-specific', sort_order: 120, gate: isFullOrWeeklyBoarding, build: buildBoardingLifeFit, winnerRule: 'neutral' },
]

/**
 * Filter BRIEF_SPECS to the ones that fire for this profile. Exported as a
 * pure function so unit tests can assert spec selection without a DB.
 */
export function briefSpecsForProfile(profile: BriefProfile | null): BriefSeedRowSpec[] {
  if (!profile) return []
  return BRIEF_SPECS.filter(spec => spec.gate(profile))
}

// ─── Row winner-rule lookup (Research Room redesign, data side, 2026-07-16) ─
//
// Keyed by the exact row_name string every spec above writes verbatim to
// comparison_rows.row_name (see seedResearchSession's buildCells → the RPC
// btrim()s but does not otherwise alter it). Consumed by
// lib/research-comparison.ts to resolve ComparisonRow.winnerRule without
// that module needing to know each spec's semantics. Includes BOTH
// GENERAL_SPECS and BRIEF_SPECS — brief rows carry `lens_kind: 'general'`
// in the DB (see seedResearchSession) but their row_name is unique enough
// (e.g. "Rugby strength") that a plain row_name keyed map works fine
// without needing the brief_ slug prefix.
//
// Rows not in this map (chat-added rows, any future row_name not seeded
// here) resolve to 'neutral' at the call site — the safer default.
export const GENERAL_ROW_WINNER_RULES: Readonly<Record<string, WinnerRule>> = Object.freeze(
  Object.fromEntries(
    [...GENERAL_SPECS, ...BRIEF_SPECS].map(spec => [spec.row_name, spec.winnerRule ?? 'neutral'])
  )
)

// RRV-2 (never-blank table, 2026-07-20): row_name → seed slug, same
// precedent as GENERAL_ROW_WINNER_RULES above. Lets the comparison loader
// map a DB row back to "which field is this" without re-deriving it from
// free-text labels — used to (a) decide whether a cohort peer-range is
// computable for an empty cell (COHORT_ELIGIBLE_SLUGS below) and (b) build
// a natural-language Ask-Nana question. Rows not in this map (chat-added
// rows, any future row_name not seeded here) get undefined — the loader
// falls back to a generic question built from the row label.
export const GENERAL_ROW_SLUG_BY_NAME: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    [...GENERAL_SPECS, ...BRIEF_SPECS].map(spec => [spec.row_name, spec.slug])
  )
)

// RRV-6 (evidence chips, 2026-07-20): seed slug → school_facts.dimension,
// for rows whose claim has real, quote-backed evidence to show behind it.
// Live-data check 2026-07-20: only dimension='rugby' has quote-bearing
// school_facts rows today (2,051 rows / 110 schools; evidence_quote is
// non-null on ~93 of those schools after dedupe). tennis_strength/
// cricket_strength/hockey_strength/football_strength read the same
// sports_profile.<sport>.competitive_tier shape as rugby_strength (see
// sportTierCell above) but their sports have zero rows in school_facts —
// wiring them here with no data would show a "0 sources" chip that implies
// coverage that doesn't exist. Add an entry once a sport's own extraction
// pipeline (mirroring scripts/extract-rugby-facts.js) lands real quotes.
export const EVIDENCE_DIMENSION_BY_ROW_SLUG: Readonly<Record<string, string>> = Object.freeze({
  rugby_strength: 'rugby',
})

// Slugs for which a cohort peer-range (RRV-2 rung 3) is worth attempting.
// Scoped tight and deliberately: only fields (a) sourced from
// school_structured_data (the same table the seeder itself reads, so a
// peer's range matches the semantics of this school's own cell — no
// mixing in schools.* flat-column USD conversions or notion-only fields)
// and (b) with real coverage in that table (checked live 2026-07-20:
// boarding_fee_year 122/322 GBP rows, gcse_pct 81/322, total_pupils
// 138/322 — all comfortably above a min-4-peer bar; a_level_pct (6 rows
// codebase-wide) and class_size (0 rows in school_structured_data — only
// ever populated via Notion) are excluded, they'd almost never clear the
// bar and aren't worth a whitelist entry). Everything NOT in this set
// still gets a rung-4 Ask-Nana chip when empty — cohort is an optional
// rung, not a requirement for "never blank".
export const COHORT_ELIGIBLE_SLUGS: ReadonlySet<string> = new Set([
  'boarding_fee_year',
  'gcse_pct',
  'total_pupils',
])

// Natural-language Ask-Nana question per slug. Deliberately NOT the raw
// row_name (e.g. "Boarding fee · per year" reads badly mid-sentence — flagged
// in the RRV-2 pre-build review). Falls back to a generic template built
// from the row label for any slug not listed (chat rows, future specs).
const GAP_QUESTION_TEMPLATES: Readonly<Record<string, (school: string) => string>> = Object.freeze({
  school_type:            (s) => `What type of school is ${s} — day, boarding, or both?`,
  location:                (s) => `Where is ${s} located?`,
  heathrow_minutes:        (s) => `How far is ${s} from Heathrow?`,
  class_size:              (s) => `What is ${s}'s typical class size?`,
  total_pupils:            (s) => `How many pupils does ${s} have?`,
  lowest_boarding_entry:   (s) => `What's the earliest year ${s} accepts boarders?`,
  boarding_pupils:         (s) => `How many boarding pupils does ${s} have?`,
  international_pupils:    (s) => `How many international pupils does ${s} have?`,
  day_pupils:              (s) => `How many day pupils does ${s} have?`,
  boarding_ratio:          (s) => `What's ${s}'s boarding mix — full, weekly, or day?`,
  gcse_pct:                (s) => `What GCSE results does ${s} publish?`,
  a_level_pct:             (s) => `What A-level results does ${s} publish?`,
  boarding_fee_term:       (s) => `What is ${s}'s boarding fee per term?`,
  boarding_fee_year:       (s) => `What is ${s}'s annual boarding fee?`,
  registration_fee:        (s) => `What is ${s}'s registration fee?`,
  y9_y10_admissions:       (s) => `What are ${s}'s Year 9/10 admissions requirements?`,
  school_view:             (s) => `What does ${s} look like — is there a video or photo tour?`,
  rugby_strength:          (s) => `How strong is ${s}'s rugby programme?`,
  tennis_strength:         (s) => `How strong is ${s}'s tennis programme?`,
  cricket_strength:        (s) => `How strong is ${s}'s cricket programme?`,
  hockey_strength:         (s) => `How strong is ${s}'s hockey programme?`,
  football_strength:       (s) => `How strong is ${s}'s football programme?`,
  ib_offered:              (s) => `Does ${s} offer the IB diploma?`,
  academic_stretch:        (s) => `How academically stretching is ${s}?`,
  boarding_life_fit:       (s) => `What's boarding life actually like at ${s}?`,
})

/**
 * Build a ready-to-send Ask-Nana question for an empty cell. `slug` is
 * looked up via GENERAL_ROW_SLUG_BY_NAME by the caller; pass undefined for
 * unmapped rows (chat rows) to get the generic fallback.
 */
export function gapQuestionFor(slug: string | undefined, rowLabel: string, schoolName: string): string {
  const template = slug ? GAP_QUESTION_TEMPLATES[slug] : undefined
  if (template) return template(schoolName)
  // Generic fallback: strip ' · ' qualifier segments (they read fine as a
  // column label, badly mid-sentence — e.g. "Boarding fee · per year").
  const plainLabel = rowLabel.split('·')[0].trim().toLowerCase()
  return `What is ${schoolName}'s ${plainLabel}?`
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

type ShortlistContext = {
  slugs:     string[]
  schoolMap: Map<string, SchoolMeta>
  structMap: Map<string, StructuredRow>
  notionMap: Map<string, NotionBackfillRow>
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
      const notion = ctx.notionMap.get(slug) ?? null
      const cell = spec.build({ meta, struct, notion, profile })
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
    return { slugs: [], schoolMap: new Map(), structMap: new Map(), notionMap: new Map() }
  }

  const [schoolsRes, structRes, notionRes] = await Promise.all([
    supabase.from('schools')
      // RRV-5: boarding_grade added for the "Boarding mix" / "Boarding life
      // fit" rows. Always read through effectiveBoardingGrade(), never raw.
      .select('slug, name, city, region, boarding, gender_split, boarding_grade')
      .in('slug', slugs),
    supabase.from('school_structured_data')
      .select('school_slug, fees_min, fees_max, fees_currency, exam_results, university_destinations, admissions_format, sports_profile, student_community, location_profile, fees_by_grade, application_fee_usd, bursary_note')
      .in('school_slug', slugs),
    // school_notion_backfill is the Phase 1 sidecar — one row per school×Notion-page.
    // Always queried alongside struct so cell builders can fall back per the
    // precedence rules (extractor wins; Notion fills nulls / conflict-gated).
    // Soft-fail (treat as empty) if the table read errors so the comparison
    // table never breaks because of a Notion sync hiccup.
    supabase.from('school_notion_backfill')
      .select('school_slug, status, parsed')
      .in('school_slug', slugs),
  ])

  if (schoolsRes.error) throw new Error(`loadShortlistContext: schools read failed: ${schoolsRes.error.message}`)
  if (structRes.error)  throw new Error(`loadShortlistContext: structured read failed: ${structRes.error.message}`)
  if (notionRes.error) {
    // Don't throw — Notion is supplementary. Log + continue with empty map.
    console.warn(`[loadShortlistContext] notion sidecar read failed: ${notionRes.error.message}`)
  }

  const schoolMap = new Map<string, SchoolMeta>(
    (schoolsRes.data ?? []).map((s: SchoolMeta) => [s.slug, s])
  )
  const structMap = new Map<string, StructuredRow>(
    (structRes.data ?? []).map((s: StructuredRow) => [s.school_slug, s])
  )
  const notionMap = new Map<string, NotionBackfillRow>(
    (notionRes.data ?? []).map((n: NotionBackfillRow) => [n.school_slug, n])
  )
  return { slugs, schoolMap, structMap, notionMap }
}
