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
  id:           string
  row_name:     string
  group_name:   string
  weight:       number
  cell_data:    Record<string, { value?: string | number | null; source?: string | null; note?: string }> | null
  sort_order:   number
  lens_kind:    'general' | 'child_fit' | 'chat'
  created_at:   string
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
 */
export async function loadComparisonData(
  supabase:  SupabaseClient,
  userId:    string,
  childId:   string | null,
  lens:      LensKind,
  sessionId: string | null,
): Promise<ComparisonData> {
  assertUserId(userId, 'loadComparisonData')

  // 1. Shortlist — same scoping as before. Per-child when childId is set,
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
    throw new Error(`loadComparisonData: shortlist read failed: ${shortlistError.message}`)
  }

  const slugs = (rows ?? []).map((r: { school_slug: string }) => r.school_slug)
  if (slugs.length === 0) return { schools: [], rows: [] }

  // 2. School column headers. We only need light metadata — the seeder is
  // responsible for any structured-data joins that turn into cell content.
  const { data: schoolsRaw, error: schoolsError } = await supabase
    .from('schools')
    .select('slug, name, city, region, boarding, gender_split')
    .in('slug', slugs)

  if (schoolsError) throw new Error(`loadComparisonData: schools read failed: ${schoolsError.message}`)

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

  if (schools.length === 0 || sessionId == null) {
    return { schools, rows: [] }
  }

  // 3. Lens-scoped row read. The active tab's rows + chat rows show
  // together; chat rows whose row_name collides with a base-lens row are
  // de-duped (base wins) so the user sees one row, not two.
  const baseLens = lens  // 'general' | 'child_fit'
  const tableRows = await loadLensRows(supabase, sessionId, schools, baseLens)
  return { schools, rows: tableRows }
}

// ─── Lens-aware row loader ──────────────────────────────────────────────────

async function loadLensRows(
  supabase: SupabaseClient,
  sessionId: string,
  schools: SchoolColumn[],
  baseLens: LensKind,
): Promise<ComparisonRow[]> {
  // Read both the base lens AND chat rows in one query. The lens-scoped
  // index idx_comparison_rows_session_lens_active backs this.
  const { data: rowsRaw, error: rowsError } = await supabase
    .from('comparison_rows')
    .select('id, row_name, group_name, weight, cell_data, sort_order, lens_kind, created_at')
    .eq('session_id', sessionId)
    .in('lens_kind', [baseLens, 'chat'])
    .is('undone_at', null)

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
    const cells: RowCell[] = schools.map(col => {
      const c = r.cell_data?.[col.slug]
      if (!c || c.value == null || c.value === '') return { kind: 'empty' }
      const primary = typeof c.value === 'number' ? String(c.value) : c.value
      const sub = typeof c.note === 'string' && c.note ? c.note : undefined
      return { kind: 'value', primary, sub }
    })
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

function normalizeRowName(name: string): string {
  return name.trim().toLowerCase()
}
