import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { omitComparisonSchoolCell } from './comparison-cell-data'

export type RemovedSchoolPruneResult = {
  status: 'complete' | 'no_session' | 'partial'
  rows_examined: number
  rows_updated: number
  rows_failed: number
}

export async function pruneRemovedSchoolComparisonCells({
  supabase,
  userId,
  childId,
  schoolSlug,
}: {
  supabase: SupabaseClient
  userId: string
  childId: string
  schoolSlug: string
}): Promise<RemovedSchoolPruneResult> {
  const { data: session, error: sessionError } = await supabase
    .from('research_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('child_id', childId)
    .order('last_active_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (sessionError) throw new Error(`comparison prune session lookup failed: ${sessionError.message}`)
  if (!session?.id) {
    return { status: 'no_session', rows_examined: 0, rows_updated: 0, rows_failed: 0 }
  }

  const { data: rows, error: rowsError } = await supabase
    .from('comparison_rows')
    .select('id, cell_data')
    .eq('user_id', userId)
    .eq('session_id', session.id)
    .is('undone_at', null)
  if (rowsError) throw new Error(`comparison prune row lookup failed: ${rowsError.message}`)

  const result: RemovedSchoolPruneResult = {
    status: 'complete',
    rows_examined: rows?.length ?? 0,
    rows_updated: 0,
    rows_failed: 0,
  }
  for (const row of rows ?? []) {
    const planned = omitComparisonSchoolCell(row.cell_data, schoolSlug)
    if (!planned.changed) continue

    // Re-read immediately before the update so a concurrent cell backfill is
    // not overwritten by the earlier list snapshot.
    const { data: latest, error: latestError } = await supabase
      .from('comparison_rows')
      .select('cell_data')
      .eq('id', row.id)
      .eq('user_id', userId)
      .is('undone_at', null)
      .maybeSingle()
    if (latestError || !latest) {
      result.rows_failed += 1
      continue
    }
    const next = omitComparisonSchoolCell(latest.cell_data, schoolSlug)
    if (!next.changed) continue

    const { data: updated, error: updateError } = await supabase
      .from('comparison_rows')
      .update({ cell_data: next.cells })
      .eq('id', row.id)
      .eq('user_id', userId)
      .is('undone_at', null)
      .select('id')
      .maybeSingle()
    if (updateError || !updated) {
      result.rows_failed += 1
      continue
    }
    result.rows_updated += 1
  }
  if (result.rows_failed > 0) result.status = 'partial'
  return result
}
