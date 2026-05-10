import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComparisonData, ComparisonRow, RowCell, SchoolColumn } from '@/components/nana/comparison-placeholder'
import { assertUserId } from './school-name-overrides'

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
  cell_data:           Record<string, { value?: string | number | null; source?: string | null; note?: string }> | null
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
}

type SchoolMeta = {
  slug:          string
  name:          string
  city:          string | null
  region:        string | null
  boarding:      boolean | null
  gender_split:  string | null
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
  let shortlistQuery = supabase
    .from('shortlisted_schools')
    .select('school_slug, added_at')
    .eq('user_id', userId)
    .order('added_at', { ascending: true })
  shortlistQuery = childId
    ? shortlistQuery.eq('child_id', childId)
    : shortlistQuery.is('child_id', null)
  const { data: rows, error: shortlistError } = await shortlistQuery

  if (shortlistError) {
    throw new Error(`${caller}: shortlist read failed: ${shortlistError.message}`)
  }

  const slugs = (rows ?? []).map((r: { school_slug: string }) => r.school_slug)
  if (slugs.length === 0) return []

  // School column headers. We only need light metadata — the seeder is
  // responsible for any structured-data joins that turn into cell content.
  const { data: schoolsRaw, error: schoolsError } = await supabase
    .from('schools')
    .select('slug, name, city, region, boarding, gender_split')
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

  return filtered.map(r => {
    const cells: RowCell[] = schools.map(col => cellFromRaw(r.cell_data?.[col.slug], false))
    // group_name lives on the row in the DB but isn't shown next to every
    // label — repeating "Pastoral" / "Academics" alongside each row is
    // visual noise. Section-header rendering can use group_name later.
    // emphasis stays available for finer per-row qualifiers (e.g. "annual",
    // "A-level") set by chat proposals; seeded specs leave it unset.
    return {
      id:        `cmp-${r.id}`,
      label:     r.row_name,
      cells,
      removable: r.lens_kind === 'chat',
    }
  })
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
    firstOrder: number
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
        firstOrder: idx,
      })
      return
    }

    current.ids.push(row.id)
    current.cells = current.cells.map((existing, i) => betterEvidenceCell(existing, incomingCells[i]))
  })

  return Array.from(merged.values())
    .sort((a, b) => a.firstOrder - b.firstOrder)
    .map(row => ({
      id: `cmp-${row.ids.join('|')}`,
      label: row.label,
      cells: row.cells,
      removable: false,
    }))
}

function cellFromRaw(c: RowCellData | undefined, includeSource: boolean): RowCell {
  if (!c || c.value == null || c.value === '') return { kind: 'empty' }
  const primary = typeof c.value === 'number' ? String(c.value) : c.value
  const subParts = [
    typeof c.note === 'string' && c.note.trim() ? c.note.trim() : null,
    includeSource && typeof c.source === 'string' && c.source.trim() ? c.source.trim() : null,
  ].filter((p): p is string => Boolean(p))
  const sub = subParts.length > 0 ? subParts.join(' · ') : undefined
  return { kind: 'value', primary, sub }
}

function evidenceCellScore(cell: RowCell): number {
  if (cell.kind === 'empty') return 0
  if (cell.kind === 'lights') return 5 + cell.lights.length
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
