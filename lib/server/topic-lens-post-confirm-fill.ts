// T4.19 — post-confirm projector-fill for OLD topic-lens rows.
//
// Runs after the create_topic_lens RPC returns success on fresh / merged /
// deduped statuses. Reads back the lens's topic rows + the user's current
// shortlist, and backfills any cells that are missing or null with
// deterministic projection-derived values via T4.17 + T4.18's formatters.
//
// Why this exists: T4.18 fires before the RPC and only fills cells that
// Nana's proposal already names. The merge path inside create_topic_lens
// uses a NULL-SAFE filter (WHERE val ->> 'value' IS NOT NULL) before the
// `||` merge, which is desirable for protecting real data from coverage
// drift but leaves freshly-added schools as `—` on existing topic rows
// when the LLM's follow-up proposal omits them. T4.19 is the safety net.
//
// Two clients pattern (live-test fix 2026-05-09):
//   - supabaseUser: the user's auth-bound client. Used for SELECT/UPDATE on
//     comparison_rows where RLS gates owner-only access (the right gate).
//   - supabaseService: a service-role client used ONLY for the
//     school_fact_projections SELECT. The projections table is RLS-locked
//     with no user policy; the chatbot pack assembler already reads it via
//     service role (nana-research/route.ts:49), so we match that pattern.
//     Same data exposure — every cell we surface here is data the chatbot
//     would already have written into a Nana response for this user.
//
// Codex-blessed design 2026-05-09 (transcript: /tmp/codex-t419-design-result.txt).
//
// Codex r1 changes applied:
//   1. MAX_CELL_DATA_BYTES = 16384 — match the RPC input guard so we
//      never grow a row past the 16 KB cap.
//   2. Latest-cell recheck — after the read-modify-write re-read, only
//      keep merge keys whose current cell is still missing/null. Closes
//      the race where a concurrent confirm wrote a real value.
//   3. Shared topicToDimension — imported from topic-lens-projector-fill.ts
//      so T4.18 and T4.19 can never drift on topic-name vocabulary.
//   4. Defense-in-depth user_id filter on UPDATE.

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDimensionEvidencePack, type DimensionEvidencePack } from './dimension-evidence-pack.ts'
import { formatProjectionCell } from './topic-lens-cell-formatters.ts'
import { topicToDimension } from './topic-lens-projector-fill.ts'

const MAX_CELL_DATA_BYTES = 16_384

type Cell = { value: string | number | null; source?: string; note?: string }

export type PostConfirmFillTelemetry = {
  rows_examined: number
  cells_missing: number     // total cells we considered filling
  cells_filled: number      // successfully wrote a projection-derived cell
  cells_unfilled: number    // formatter returned null OR no projection pack
  cells_preserved: number   // re-read showed real value, we kept it
  rows_oversized_skipped: number
  rows_updated: number
  rows_update_failed: number
  schools_with_pack: number
  schools_without_pack: number
}

/**
 * Apply post-confirm projector-fill to a topic lens. Mutates rows in DB
 * via UPDATE; returns telemetry. Safe to call when:
 *   - flag is off (returns null)
 *   - topic name has no dimension mapping (returns null)
 *   - shortlist is empty (returns null)
 *   - lens has no topic rows (returns telemetry with rows_examined=0)
 *   - any individual lookup or update fails (logs + skips that row)
 */
export async function applyPostConfirmTopicLensFill(
  supabaseUser: SupabaseClient,
  supabaseService: SupabaseClient,
  userId: string,
  lensId: string,
  topicName: string,
  shortlistSlugs: string[],
): Promise<PostConfirmFillTelemetry | null> {
  if (process.env.NANA_TOPIC_LENS_FACTS !== 'on') return null

  const dimension = topicToDimension(topicName)
  if (!dimension) return null

  // De-duplicate shortlist defensively — duplicates would cause us to
  // book-keep cells_missing twice for the same slug.
  const slugs = Array.from(new Set(shortlistSlugs.filter((s) => typeof s === 'string' && s.length > 0)))
  if (slugs.length === 0) return null

  // 1. Read all topic rows for this lens. Scope by full predicate
  //    (user_id + created_by_lens_id + undone_at) — Codex r2 nit:
  //    helper should not rely on RLS + route provenance alone.
  //    Uses the user-bound client; RLS allows owner SELECT.
  const { data: rows, error: rowsErr } = await supabaseUser
    .from('comparison_rows')
    .select('id, row_name, cell_data')
    .eq('user_id', userId)
    .eq('created_by_lens_id', lensId)
    .is('undone_at', null)
  if (rowsErr) {
    console.error('[T4.19] read rows failed:', rowsErr.message ?? rowsErr)
    return null
  }
  if (!rows || rows.length === 0) {
    return {
      rows_examined: 0, cells_missing: 0, cells_filled: 0, cells_unfilled: 0,
      cells_preserved: 0, rows_oversized_skipped: 0, rows_updated: 0,
      rows_update_failed: 0,
      schools_with_pack: 0, schools_without_pack: 0,
    }
  }

  // 2. Pre-fetch projection packs for the shortlist (parallel, allSettled).
  //    Uses the service-role client because school_fact_projections has
  //    RLS enabled with no user-scoped policy. Same pattern as the
  //    chatbot pack assembler (nana-research/route.ts uses service role
  //    end-to-end). The data we surface is non-sensitive — same school
  //    info Nana already cites in chat responses.
  const settled = await Promise.allSettled(
    slugs.map((sl) => loadDimensionEvidencePack(supabaseService, sl, dimension)),
  )
  const packBySlug = new Map<string, DimensionEvidencePack | null>()
  let schoolsWithPack = 0
  for (let i = 0; i < slugs.length; i++) {
    const r = settled[i]
    const pack = r.status === 'fulfilled' ? r.value : null
    packBySlug.set(slugs[i], pack)
    if (pack) schoolsWithPack++
  }

  const tel: PostConfirmFillTelemetry = {
    rows_examined: rows.length,
    cells_missing: 0, cells_filled: 0, cells_unfilled: 0, cells_preserved: 0,
    rows_oversized_skipped: 0, rows_updated: 0, rows_update_failed: 0,
    schools_with_pack: schoolsWithPack,
    schools_without_pack: slugs.length - schoolsWithPack,
  }

  // 3. Build per-row planned-merge payloads.
  type PlannedUpdate = { id: string; merge: Record<string, Cell> }
  const planned: PlannedUpdate[] = []
  for (const row of rows) {
    const cellData = (row.cell_data && typeof row.cell_data === 'object' ? row.cell_data : {}) as Record<string, Cell>
    const merge: Record<string, Cell> = {}
    for (const slug of slugs) {
      const existing = cellData[slug]
      const isMissing = !existing || existing.value === null || existing.value === undefined
      if (!isMissing) continue
      tel.cells_missing++
      const pack = packBySlug.get(slug)
      if (!pack) { tel.cells_unfilled++; continue }
      const formatted = formatProjectionCell(dimension, row.row_name, pack.projection)
      if (!formatted) { tel.cells_unfilled++; continue }
      merge[slug] = formatted.source
        ? { value: formatted.value, source: formatted.source }
        : { value: formatted.value }
      tel.cells_filled++
    }
    if (Object.keys(merge).length > 0) planned.push({ id: row.id, merge })
  }

  if (planned.length === 0) return tel

  // 4. Apply per-row read-modify-write with latest-cell recheck.
  //    Codex r2 nit: scope re-read + update with full predicate
  //    (user_id + created_by_lens_id + undone_at) defense-in-depth.
  //    Codex r2 Q7: track planned-fill count locally so a true throw
  //    after planning rolls back cells_filled correctly.
  await Promise.allSettled(
    planned.map(async (u) => {
      let plannedThisRow = 0
      try {
        // Re-read the latest cell_data at write-time. A concurrent confirm
        // (e.g. user double-clicked, or two tabs racing) might have written
        // real values for some of our planned slugs since we built `merge`.
        const { data: cur, error: curErr } = await supabaseUser
          .from('comparison_rows')
          .select('cell_data')
          .eq('id', u.id)
          .eq('user_id', userId)
          .eq('created_by_lens_id', lensId)
          .is('undone_at', null)
          .maybeSingle()
        if (curErr || !cur) {
          tel.rows_update_failed++
          // Roll back the cells_filled count we already incremented
          // during planning — the cells were never written.
          tel.cells_filled -= Object.keys(u.merge).length
          tel.cells_unfilled += Object.keys(u.merge).length
          if (curErr) console.error('[T4.19] re-read failed for row', u.id, curErr.message ?? curErr)
          return
        }

        const curCells = (cur.cell_data && typeof cur.cell_data === 'object' ? cur.cell_data : {}) as Record<string, Cell>

        // Latest-cell recheck — only keep merge keys whose current cell is
        // still missing/null. If a concurrent write filled it with a real
        // value, preserve that.
        const safeMerge: Record<string, Cell> = {}
        for (const [slug, cell] of Object.entries(u.merge)) {
          const cur = curCells[slug]
          const stillMissing = !cur || cur.value === null || cur.value === undefined
          if (stillMissing) {
            safeMerge[slug] = cell
            plannedThisRow++
          } else {
            tel.cells_preserved++
            tel.cells_filled--  // back out the bookkeeping; the planned fill didn't happen
          }
        }
        if (Object.keys(safeMerge).length === 0) return  // all races lost; nothing to write

        const merged = { ...curCells, ...safeMerge }

        // 16 KB cap — match the RPC's input-side guard. If our merge would
        // push the row over the limit, skip it. Better to leave a — cell
        // than to grow comparison_rows past the existing invariant.
        const mergedBytes = Buffer.byteLength(JSON.stringify(merged), 'utf8')
        if (mergedBytes > MAX_CELL_DATA_BYTES) {
          tel.rows_oversized_skipped++
          // Roll back the cells_filled bookkeeping for this row's slugs.
          tel.cells_filled -= plannedThisRow
          tel.cells_unfilled += plannedThisRow
          plannedThisRow = 0  // mark accounted-for so outer catch doesn't double-roll-back
          console.warn('[T4.19] row oversized after merge, skipping', { row_id: u.id, bytes: mergedBytes })
          return
        }

        const { error: updErr } = await supabaseUser
          .from('comparison_rows')
          .update({ cell_data: merged })
          .eq('id', u.id)
          .eq('user_id', userId)
          .eq('created_by_lens_id', lensId)
          .is('undone_at', null)
        if (updErr) {
          tel.rows_update_failed++
          console.error('[T4.19] update failed for row', u.id, updErr.message ?? updErr)
          // Roll back the cells_filled bookkeeping for this row's slugs.
          tel.cells_filled -= plannedThisRow
          tel.cells_unfilled += plannedThisRow
          plannedThisRow = 0
          return
        }
        tel.rows_updated++
        plannedThisRow = 0  // success — bookkeeping already correct
      } catch (e) {
        // True thrown error after planning. Roll back any planned fills
        // that haven't already been accounted for.
        tel.rows_update_failed++
        if (plannedThisRow > 0) {
          tel.cells_filled -= plannedThisRow
          tel.cells_unfilled += plannedThisRow
        }
        console.error('[T4.19] unexpected error in row update', u.id, e)
      }
    }),
  )

  return tel
}
