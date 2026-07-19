import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComparisonData, ComparisonRow, RowCell, SchoolColumn, WinnerRule } from '@/components/nana/comparison-placeholder'
import { assertUserId } from './school-name-overrides'
import { GENERAL_ROW_WINNER_RULES, GENERAL_ROW_SLUG_BY_NAME, COHORT_ELIGIBLE_SLUGS, gapQuestionFor } from './research-room/seed-rows'
import { REGION_BUCKETS } from './uk-regions'

// Slice 5.5b — lens-aware single-source comparison loader.
//
// Pre-5.5: this file held nine hardcoded canonical rows (fees, A*–A,
// Oxbridge, ...) plus a side-load of comparison_rows for chat-added rows.
// Post-5.5: ALL rows live in comparison_rows. The General-lens rows are
// seeded by lib/research-room/seed-rows.ts on first load; child_fit rows
// will follow in slice 5.5e/h. The cell builders moved to seed-rows.ts.

export type LensKind = 'general' | 'child_fit'

type ComparisonRowDb = {
  id:                  string
  row_name:            string
  group_name:          string
  weight:              number
  cell_data:           Record<string, { value?: string | number | null; source?: string | null; note?: string; numeric?: number | null }> | null
  sort_order:          number
  lens_kind:           'general' | 'child_fit' | 'chat'
  // Slice 6.5: NULL for base/seed/chat rows; UUID of the parent topic
  // lens for rows born inside `create_topic_lens`. The loader filters
  // these out unless that lens IS the session's active lens.
  created_by_lens_id:  string | null
  created_at:          string
}

type RowCellData = {
  value?: string | number | null
  source?: string | null
  note?: string | null
  // Research Room redesign (data side, 2026-07-16): raw numeric value
  // behind `value` when the underlying field is genuinely numeric (fees,
  // percentages, scores). See RowCell['numericValue'] in comparison-placeholder.ts.
  numeric?: number | null
}

type SchoolMeta = {
  slug:          string
  name:          string
  city:          string | null
  region:        string | null
  boarding:      boolean | null
  gender_split:  string | null
  hero_image:    string | null
  logo_url:      string | null
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

/**
 * Load the comparison surface for one (user, child) pair, scoped to a
 * specific lens tab and a specific research session.
 *
 * Returns the schools header (column metadata) plus the rows that belong
 * in the active lens. Rows live in comparison_rows; the loader does no
 * cell-building of its own. If the session has not been seeded yet, the
 * caller is expected to call seedResearchSession() before calling this.
 *
 * Empty shortlist → empty payload (schools=[], rows=[]).
 * Missing session → schools rendered, but no rows (the seeder runs on
 * the first chat — until then, comparison is read-only empty).
 *
 * Slice 6.5: `activeLensId` is the session's `active_lens_id` (or null).
 * When non-null, rows belonging to that lens (`created_by_lens_id =
 * activeLensId`) are included alongside base/seed/chat rows. When null
 * (or when the active lens is a saved/re-rank lens that has no topic
 * rows attached), all `created_by_lens_id IS NOT NULL` rows are hidden.
 */
export async function loadComparisonData(
  supabase:     SupabaseClient,
  userId:       string,
  childId:      string | null,
  lens:         LensKind,
  sessionId:    string | null,
  activeLensId: string | null = null,
): Promise<ComparisonData> {
  assertUserId(userId, 'loadComparisonData')

  const schools = await loadSchoolColumns(supabase, userId, childId, 'loadComparisonData')

  if (schools.length === 0 || sessionId == null) {
    return { schools, rows: [] }
  }

  // 3. Lens-scoped row read. The active tab's rows + chat rows show
  // together; chat rows whose row_name collides with a base-lens row are
  // de-duped (base wins) so the user sees one row, not two.
  const baseLens = lens  // 'general' | 'child_fit'
  const tableRows = await loadLensRows(supabase, sessionId, schools, baseLens, activeLensId)
  return { schools, rows: tableRows }
}

/**
 * Load the full evidence pool used by the Verdict tab. This deliberately
 * differs from loadComparisonData(): the visible comparison stays lens-scoped,
 * while verdict generation reads all current rows for the session.
 */
export async function loadVerdictEvidenceData(
  supabase:  SupabaseClient,
  userId:    string,
  childId:   string | null,
  sessionId: string | null,
): Promise<ComparisonData> {
  assertUserId(userId, 'loadVerdictEvidenceData')
  const schools = await loadSchoolColumns(supabase, userId, childId, 'loadVerdictEvidenceData')
  if (schools.length === 0 || sessionId == null) {
    return { schools, rows: [] }
  }
  return { schools, rows: await loadVerdictRows(supabase, sessionId, schools) }
}

async function loadSchoolColumns(
  supabase: SupabaseClient,
  userId: string,
  childId: string | null,
  caller: string,
): Promise<SchoolColumn[]> {
  // Shortlist — same scoping as before. Per-child when childId is set,
  // parent-wide otherwise (legacy behavior for users still on the old
  // pre-multi-child flow).
  //
  // Slice 8 Build 2b (2026-05-18): match_reasons is selected here so the
  // comparison column header can render an "Added because:" line. The
  // JSONB column is { reasons: string[]; computed_at; rules_version }
  // (see lib/research-room/match-reasons.ts MatchReasonsRecord). Old
  // shortlist rows pre-Build-2 have match_reasons IS NULL; new chat-add
  // rows where the best-effort reasons write failed also stay null. The
  // render path is null-safe.
  let shortlistQuery = supabase
    .from('shortlisted_schools')
    .select('school_slug, added_at, match_reasons')
    .eq('user_id', userId)
    .order('added_at', { ascending: true })
  shortlistQuery = childId
    ? shortlistQuery.eq('child_id', childId)
    : shortlistQuery.is('child_id', null)
  const { data: rows, error: shortlistError } = await shortlistQuery

  if (shortlistError) {
    throw new Error(`${caller}: shortlist read failed: ${shortlistError.message}`)
  }

  type ShortlistRow = {
    school_slug:   string
    added_at:      string
    match_reasons: { reasons?: unknown; rank_position?: unknown } | null
  }
  // Phase 2.8.6 (2026-05-25): sort by match_reasons.rank_position ASC
  // (recommender-score order) with added_at as tiebreak. Rows missing
  // rank_position (manually-added schools, pre-2.8.6 legacy rows) sort
  // to the end so the recommender's top picks lead.
  const shortlistRowsRaw = (rows ?? []) as ShortlistRow[]
  const RANK_MISSING_SENTINEL = Number.MAX_SAFE_INTEGER
  const rankOf = (r: ShortlistRow): number => {
    const v = r.match_reasons?.rank_position
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : RANK_MISSING_SENTINEL
  }
  const shortlistRows = [...shortlistRowsRaw].sort((a, b) => {
    const ra = rankOf(a)
    const rb = rankOf(b)
    if (ra !== rb) return ra - rb
    // tiebreak: original added_at ASC (already the DB sort order)
    return a.added_at.localeCompare(b.added_at)
  })
  const slugs = shortlistRows.map(r => r.school_slug)
  if (slugs.length === 0) return []

  // Build a slug → addedBecause display string map. Only joins the
  // human-readable reasons array; ignores computed_at / rules_version.
  // Caps to 4 reasons and 120 chars total so the column header doesn't
  // overflow on schools with very long match lists.
  const REASONS_DISPLAY_CAP   = 4
  const REASONS_LENGTH_CAP    = 120
  const addedBecauseBySlug = new Map<string, string | null>()
  for (const r of shortlistRows) {
    const reasonsRaw = r.match_reasons?.reasons
    if (!Array.isArray(reasonsRaw)) {
      addedBecauseBySlug.set(r.school_slug, null)
      continue
    }
    const strings = reasonsRaw
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      .slice(0, REASONS_DISPLAY_CAP)
    if (strings.length === 0) {
      addedBecauseBySlug.set(r.school_slug, null)
      continue
    }
    let joined = strings.join(' · ')
    if (joined.length > REASONS_LENGTH_CAP) {
      joined = joined.slice(0, REASONS_LENGTH_CAP - 1).trimEnd() + '…'
    }
    addedBecauseBySlug.set(r.school_slug, joined)
  }

  // School column headers. We only need light metadata — the seeder is
  // responsible for any structured-data joins that turn into cell content.
  const { data: schoolsRaw, error: schoolsError } = await supabase
    .from('schools')
    .select('slug, name, city, region, boarding, gender_split, hero_image, logo_url')
    .in('slug', slugs)

  if (schoolsError) throw new Error(`${caller}: schools read failed: ${schoolsError.message}`)

  const schoolMap = new Map<string, SchoolMeta>(
    (schoolsRaw ?? []).map((s: SchoolMeta) => [s.slug, s])
  )

  const schools: SchoolColumn[] = []
  for (const slug of slugs) {
    const m = schoolMap.get(slug)
    if (!m) continue
    const metaParts = [m.region ?? m.city, m.gender_split].filter(Boolean)
    schools.push({
      slug,
      name: m.name,
      meta: metaParts.join(' · ') || '—',
      addedBecause: addedBecauseBySlug.get(slug) ?? null,
      heroImage: m.hero_image ?? undefined,
      logoUrl: m.logo_url ?? undefined,
    })
  }
  return schools
}

// ─── Lens-aware row loader ──────────────────────────────────────────────────

// Defensive UUID guard before string-interpolating into a PostgREST .or()
// filter. activeLensId is read from the database in the caller, but the
// regex check costs nothing and protects against future call sites that
// might pass user-derived input.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadLensRows(
  supabase: SupabaseClient,
  sessionId: string,
  schools: SchoolColumn[],
  baseLens: LensKind,
  activeLensId: string | null,
): Promise<ComparisonRow[]> {
  // Read base lens + chat rows in one query. The lens-scoped index
  // idx_comparison_rows_session_lens_active backs this.
  //
  // Slice 6.5 visibility filter:
  //   - No active lens (activeLensId NULL): hide all topic rows
  //     (created_by_lens_id IS NULL only).
  //   - Active lens set: include base/seed/chat (created_by_lens_id IS
  //     NULL) AND any topic rows that belong to that specific lens
  //     (created_by_lens_id = activeLensId). Saved/re-rank lenses have
  //     zero topic rows attached, so the OR-clause is a no-op for them
  //     and only base rows surface — same as pre-6.5.
  let query = supabase
    .from('comparison_rows')
    .select('id, row_name, group_name, weight, cell_data, sort_order, lens_kind, created_by_lens_id, created_at')
    .eq('session_id', sessionId)
    .in('lens_kind', [baseLens, 'chat'])
    .is('undone_at', null)

  if (activeLensId) {
    if (!UUID_RE.test(activeLensId)) {
      throw new Error(`loadLensRows: activeLensId is not a valid UUID`)
    }
    query = query.or(`created_by_lens_id.is.null,created_by_lens_id.eq.${activeLensId}`)
  } else {
    query = query.is('created_by_lens_id', null)
  }

  const { data: rowsRaw, error: rowsError } = await query

  if (rowsError) throw new Error(`comparison_rows read failed: ${rowsError.message}`)

  const all = (rowsRaw ?? []) as ComparisonRowDb[]

  // De-dup: if a chat row has the same (case-insensitive, trimmed) row_name
  // as a base-lens row, drop the chat copy — base wins. Codex round-1
  // flagged this as a visible-set hazard; doing it loader-side keeps the
  // schema simple (per-lens uniqueness only at the DB level).
  const baseNames = new Set(
    all.filter(r => r.lens_kind === baseLens).map(r => normalizeRowName(r.row_name))
  )
  const filtered = all.filter(r => {
    if (r.lens_kind !== 'chat') return true
    return !baseNames.has(normalizeRowName(r.row_name))
  })

  // Sort: base-lens rows by sort_order (the seeder pins these to 100, 200,
  // 300, ...); chat rows fall to the bottom by created_at because they
  // default to sort_order=0. Tiebreaker = created_at for stability.
  filtered.sort((a, b) => {
    const aIsChat = a.lens_kind === 'chat'
    const bIsChat = b.lens_kind === 'chat'
    if (aIsChat !== bIsChat) return aIsChat ? 1 : -1
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.created_at.localeCompare(b.created_at)
  })

  // RRV-2 (never-blank table): resolve any still-empty cell to a cohort
  // range (rung 3) or an Ask-Nana gap chip (rung 4) instead of leaving it
  // as a bare '—'. Only the visible comparison surface gets this treatment
  // — loadVerdictRows (below) deliberately does NOT call this, so the
  // Verdict tab's evidence merge sees exactly what it saw before RRV-2
  // (plain 'value' / 'empty' / 'lights'; per the pre-build review, its own
  // cellText() already treats any unrecognized kind as missing, so no
  // change was needed there either — this is the one and only place the
  // ladder's rungs 3/4 get produced).
  const neededSlugs = new Set<string>()
  for (const r of filtered) {
    const slug = GENERAL_ROW_SLUG_BY_NAME[r.row_name]
    if (slug && COHORT_ELIGIBLE_SLUGS.has(slug)) neededSlugs.add(slug)
  }
  const [cohort, schoolBuckets] = await Promise.all([
    neededSlugs.size > 0 ? loadCohortRanges(supabase, neededSlugs) : null,
    loadSchoolBuckets(supabase, schools.map(s => s.slug)),
  ])

  return filtered.map(r => {
    const slug = GENERAL_ROW_SLUG_BY_NAME[r.row_name]
    const cells: RowCell[] = schools.map(col => {
      const raw = r.cell_data?.[col.slug]
      const base = cellFromRaw(raw, false)
      // Rung 2 tier tag attached here, not inside cellFromRaw — see the
      // comment on cellFromRaw for why (verdict cache-hash stability).
      if (base.kind === 'value') return raw ? { ...base, tier: classifyTier(raw) } : base
      if (base.kind !== 'empty') return base
      const bucket = schoolBuckets.get(col.slug)
      if (cohort && slug && bucket) {
        const range = lookupCohortRange(cohort, slug, bucket)
        if (range) return { kind: 'cohort', note: `not published · similar schools: ${range}` }
      }
      return { kind: 'gap', question: gapQuestionFor(slug, r.row_name, col.name) }
    })
    // group_name lives on the row in the DB. Slice 8 Step 0.6: surface it to
    // the client so ComparisonView can render section headers between
    // groups. emphasis stays available for finer per-row qualifiers
    // (e.g. "annual", "A-level") set by chat proposals; seeded specs leave
    // it unset.
    return {
      id:         `cmp-${r.id}`,
      label:      r.row_name,
      cells,
      removable:  r.lens_kind === 'chat',
      group_name: r.group_name ?? null,
      winnerRule: resolveWinnerRule(r.row_name),
    }
  })
}

// ─── RRV-2 never-blank ladder: rungs 3 (cohort) & 4 (gap) ──────────────────

type SchoolBucket = { schoolType: string | null; boarding: boolean | null; regionBucket: string | null }

// Reverse index of REGION_BUCKETS (schools.region string → bucket name),
// built once at module load. ~100 short strings — negligible cost.
const REGION_TO_BUCKET = new Map<string, string>()
for (const [bucket, regions] of Object.entries(REGION_BUCKETS)) {
  for (const region of regions) REGION_TO_BUCKET.set(region.toLowerCase().trim(), bucket)
}

async function loadSchoolBuckets(supabase: SupabaseClient, slugs: string[]): Promise<Map<string, SchoolBucket>> {
  const out = new Map<string, SchoolBucket>()
  if (slugs.length === 0) return out
  const { data, error } = await supabase
    .from('schools')
    .select('slug, school_type, boarding, region')
    .in('slug', slugs)
  if (error || !data) return out  // best-effort — a lookup failure just means these schools skip rung 3
  for (const row of data as { slug: string; school_type: string | null; boarding: boolean | null; region: string | null }[]) {
    out.set(row.slug, {
      schoolType:   row.school_type,
      boarding:     row.boarding,
      regionBucket: row.region ? (REGION_TO_BUCKET.get(row.region.toLowerCase().trim()) ?? null) : null,
    })
  }
  return out
}

type FieldStats = { values: number[] }
// fieldSlug -> "type|boarding|region" (or "type|boarding" for the national
// fallback bucket, region segment omitted) -> collected verified peer values.
type CohortIndex = Map<string, Map<string, FieldStats>>

const MIN_COHORT_PEERS = 4

// One query against school_structured_data — the SAME table the seeder
// itself reads boarding_fee_year/gcse_pct/total_pupils from, so a peer's
// number means the same thing as this school's own cell would. 322 rows
// total codebase-wide (2026-07-20), so fetching the whole table once per
// table load is cheap — no N+1, no per-field re-query.
async function loadCohortRanges(supabase: SupabaseClient, neededSlugs: Set<string>): Promise<CohortIndex> {
  const index: CohortIndex = new Map()
  Array.from(neededSlugs).forEach(slug => index.set(slug, new Map()))

  const { data: ssd, error: ssdError } = await supabase
    .from('school_structured_data')
    .select('school_slug, fees_min, fees_currency, exam_results, student_community')
  if (ssdError || !ssd || ssd.length === 0) return index

  type SsdRow = {
    school_slug: string
    fees_min: number | null
    fees_currency: string | null
    exam_results: Record<string, unknown> | null
    student_community: Record<string, unknown> | null
  }
  const slugs = (ssd as SsdRow[]).map(r => r.school_slug)
  const buckets = await loadSchoolBucketsForCohort(supabase, slugs)

  const addSample = (fieldSlug: string, bucket: SchoolBucket, value: number) => {
    const fieldIndex = index.get(fieldSlug)
    if (!fieldIndex) return
    const keys = bucket.regionBucket
      ? [`${bucket.schoolType}|${bucket.boarding}|${bucket.regionBucket}`, `${bucket.schoolType}|${bucket.boarding}`]
      : [`${bucket.schoolType}|${bucket.boarding}`]
    for (const key of keys) {
      const stats = fieldIndex.get(key) ?? { values: [] }
      stats.values.push(value)
      fieldIndex.set(key, stats)
    }
  }

  for (const row of ssd as SsdRow[]) {
    const b = buckets.get(row.school_slug)
    if (!b || b.schoolType == null || b.boarding == null) continue  // no clean bucket → don't pollute any range

    if (neededSlugs.has('boarding_fee_year') && row.fees_currency === 'GBP' && typeof row.fees_min === 'number') {
      addSample('boarding_fee_year', b, row.fees_min)
    }
    if (neededSlugs.has('gcse_pct')) {
      const gcse = row.exam_results?.gcse as Record<string, unknown> | undefined
      const pct = gcse?.pct_7_to_9
      if (typeof pct === 'number') addSample('gcse_pct', b, pct)
    }
    if (neededSlugs.has('total_pupils')) {
      const total = row.student_community?.total_pupils
      if (typeof total === 'number') addSample('total_pupils', b, total)
    }
  }
  return index
}

// Separate from loadSchoolBuckets (which scopes to the shortlist) — this
// one scopes to whatever slugs school_structured_data returned, filtered
// to real UK, non-deprecated peers only (excludes the ~21k non-UK rows
// and any superseded/merged school records from polluting a range).
async function loadSchoolBucketsForCohort(supabase: SupabaseClient, slugs: string[]): Promise<Map<string, SchoolBucket>> {
  const out = new Map<string, SchoolBucket>()
  if (slugs.length === 0) return out
  const { data, error } = await supabase
    .from('schools')
    .select('slug, school_type, boarding, region')
    .in('slug', slugs)
    .eq('country', 'United Kingdom')
    .is('deprecated_at', null)
  if (error || !data) return out
  for (const row of data as { slug: string; school_type: string | null; boarding: boolean | null; region: string | null }[]) {
    out.set(row.slug, {
      schoolType:   row.school_type,
      boarding:     row.boarding,
      regionBucket: row.region ? (REGION_TO_BUCKET.get(row.region.toLowerCase().trim()) ?? null) : null,
    })
  }
  return out
}

function lookupCohortRange(index: CohortIndex, slug: string, bucket: SchoolBucket): string | null {
  const fieldIndex = index.get(slug)
  if (!fieldIndex || bucket.schoolType == null || bucket.boarding == null) return null
  const regionKey = bucket.regionBucket ? `${bucket.schoolType}|${bucket.boarding}|${bucket.regionBucket}` : null
  const nationalKey = `${bucket.schoolType}|${bucket.boarding}`
  // Post-build review finding: a region bucket with 1-3 samples used to
  // short-circuit here and return null, even though the national bucket
  // (a superset — addSample always writes both keys) might clear the
  // min-4 bar. Region must WIN only when it clears the bar itself;
  // otherwise fall through to national, same as an empty region bucket.
  const regionStats = regionKey ? fieldIndex.get(regionKey) : undefined
  const stats = (regionStats && regionStats.values.length >= MIN_COHORT_PEERS)
    ? regionStats
    : fieldIndex.get(nationalKey) ?? null
  if (!stats || stats.values.length < MIN_COHORT_PEERS) return null
  const min = Math.min(...stats.values)
  const max = Math.max(...stats.values)
  return formatCohortRange(slug, min, max)
}

function formatCohortRange(slug: string, min: number, max: number): string {
  if (slug === 'boarding_fee_year') {
    const fmtK = (n: number) => `£${Math.round(n / 1000)}k`
    return min === max ? fmtK(min) : `£${Math.round(min / 1000)}–${Math.round(max / 1000)}k`
  }
  if (slug === 'gcse_pct') {
    return min === max ? `${Math.round(min)}%` : `${Math.round(min)}–${Math.round(max)}%`
  }
  if (slug === 'total_pupils') {
    return min === max ? `${Math.round(min).toLocaleString()} pupils` : `${Math.round(min).toLocaleString()}–${Math.round(max).toLocaleString()} pupils`
  }
  return min === max ? String(Math.round(min)) : `${Math.round(min)}–${Math.round(max)}`
}

async function loadVerdictRows(
  supabase: SupabaseClient,
  sessionId: string,
  schools: SchoolColumn[],
): Promise<ComparisonRow[]> {
  const { data: rowsRaw, error: rowsError } = await supabase
    .from('comparison_rows')
    .select('id, row_name, group_name, weight, cell_data, sort_order, lens_kind, created_at')
    .eq('session_id', sessionId)
    .in('lens_kind', ['general', 'child_fit', 'chat'])
    .is('undone_at', null)

  if (rowsError) throw new Error(`verdict comparison_rows read failed: ${rowsError.message}`)

  const lensPriority: Record<ComparisonRowDb['lens_kind'], number> = {
    child_fit: 0,
    general:  1,
    chat:     2,
  }
  const sorted = ((rowsRaw ?? []) as ComparisonRowDb[]).slice().sort((a, b) => {
    const lp = lensPriority[a.lens_kind] - lensPriority[b.lens_kind]
    if (lp !== 0) return lp
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.created_at.localeCompare(b.created_at)
  })

  type MergedRow = {
    label: string
    ids: string[]
    cells: RowCell[]
    // R7-MUST-5 (verdict v3): track which underlying comparison_rows.id
    // contributed the current best-evidence cell for each school column.
    // Aligned with the schools array by index. `undefined` for empty cells.
    cellOriginIdBySchool: (string | undefined)[]
    firstOrder: number
    group_name: string | null
    winnerRule: WinnerRule
  }

  const merged = new Map<string, MergedRow>()
  sorted.forEach((row, idx) => {
    const key = normalizeRowName(row.row_name)
    const incomingCells = schools.map(col => cellFromRaw(row.cell_data?.[col.slug], true))
    const current = merged.get(key)
    if (!current) {
      merged.set(key, {
        label: row.row_name,
        ids: [row.id],
        cells: incomingCells,
        cellOriginIdBySchool: incomingCells.map(c => c.kind === 'empty' ? undefined : row.id),
        firstOrder: idx,
        // Slice 8 Step 0.6: first-seen row wins (sorted by lens priority +
        // sort_order, so the highest-priority group_name surfaces).
        group_name: row.group_name ?? null,
        winnerRule: resolveWinnerRule(row.row_name),
      })
      return
    }

    current.ids.push(row.id)
    for (let i = 0; i < current.cells.length; i++) {
      const existing = current.cells[i]
      const incoming = incomingCells[i]
      const next = betterEvidenceCell(existing, incoming)
      if (next !== existing) {
        current.cells[i] = next
        current.cellOriginIdBySchool[i] = incoming.kind === 'empty' ? undefined : row.id
      }
    }
  })

  return Array.from(merged.values())
    .sort((a, b) => a.firstOrder - b.firstOrder)
    .map(row => ({
      id:                            `cmp-${row.ids.join('|')}`,
      label:                         row.label,
      cells:                         row.cells,
      removable:                     false,
      group_name:                    row.group_name,
      selectedCellOriginIdBySchool:  row.cellOriginIdBySchool,
      winnerRule:                    row.winnerRule,
    }))
}

// RRV-2 rung 2: classify an already-populated cell's provenance from marks
// the seed-row builders already write — a leading '~' on the value (the
// existing "approximate" convention: buildTotalPupils/buildClassSize/
// buildDayPupils/...) or a `source` starting 'derived:' (cross-column
// arithmetic, e.g. day pupils = total − boarders). NOT a new data source —
// classifying data that's already there. Per the pre-build review: a
// school_facts-backed rung 2 was scoped out because that table has zero
// rows for any of these 17 comparison fields today (verified live
// 2026-07-20) — wiring it in would've been dead code claiming coverage it
// doesn't have. Revisit if/when RRV-1's extraction sweep populates it.
function classifyTier(c: RowCellData): 'derived' | undefined {
  if (typeof c.source === 'string' && c.source.startsWith('derived:')) return 'derived'
  if (typeof c.value === 'string' && c.value.startsWith('~')) return 'derived'
  return undefined
}

// Post-build review finding: `tier` must NOT be attached here — cellFromRaw
// is shared with loadVerdictRows, and the verdict route hashes its rows
// verbatim into the evidence-cache key (verdict-generator.ts inputHash).
// Attaching tier unconditionally would silently change that hash for
// nearly every session (any `~`-marked cell) and trigger a needless cache
// miss + regeneration call. Tier is attached ONLY in loadLensRows below,
// which is the one path RRV-2 touches — loadVerdictRows stays byte-for-
// byte what it returned before this feature.
function cellFromRaw(c: RowCellData | undefined, includeSource: boolean): RowCell {
  if (!c || c.value == null || c.value === '') return { kind: 'empty' }
  const primary = typeof c.value === 'number' ? String(c.value) : c.value
  const subParts = [
    typeof c.note === 'string' && c.note.trim() ? c.note.trim() : null,
    includeSource && typeof c.source === 'string' && c.source.trim() ? c.source.trim() : null,
  ].filter((p): p is string => Boolean(p))
  const sub = subParts.length > 0 ? subParts.join(' · ') : undefined
  const numericValue = typeof c.numeric === 'number' && Number.isFinite(c.numeric) ? c.numeric : undefined
  return { kind: 'value', primary, sub, numericValue }
}

// Research Room redesign (data side, 2026-07-16): resolve a row's winner
// direction from its seeded-row lookup (lib/research-room/seed-rows.ts),
// keyed by the exact row_name every GENERAL_SPECS/BRIEF_SPECS entry writes
// verbatim to comparison_rows.row_name. Chat-added rows and any row_name
// not in the lookup fall back to 'neutral' — the safer default when the
// row's semantic meaning (and therefore which direction "wins") isn't known.
function resolveWinnerRule(rowName: string): WinnerRule {
  return GENERAL_ROW_WINNER_RULES[rowName] ?? 'neutral'
}

function evidenceCellScore(cell: RowCell): number {
  if (cell.kind === 'empty') return 0
  if (cell.kind === 'lights') return 5 + cell.lights.length
  // RRV-2: 'cohort'/'gap' cells never actually reach here — the ladder that
  // produces them only runs in loadLensRows, not loadVerdictRows (see the
  // ladder's own comment above) — but the type guard is needed regardless
  // so this compiles against the widened RowCell union. Scored same as
  // empty: neither carries a citable fact.
  if (cell.kind !== 'value') return 0
  let score = 10
  if (cell.sub && /https?:\/\//.test(cell.sub)) score += 4
  if (cell.sub) score += 1
  if (cell.primary.length > 40) score += 1
  return score
}

function betterEvidenceCell(existing: RowCell, incoming: RowCell): RowCell {
  if (evidenceCellScore(incoming) > evidenceCellScore(existing)) return incoming
  return existing
}

function normalizeRowName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}
