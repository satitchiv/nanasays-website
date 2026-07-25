import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveTrustedComparisonCell,
  type DirectComparisonSchool,
} from './direct-comparison-row'
import { matchComparisonRequest } from './comparison-catalog'
import {
  resolveSeedComparisonCell,
  type SchoolMeta,
  type StructuredRow,
} from './seed-rows'

type StoredCell = {
  value?: string | number | null
  source?: string | null
  note?: string
  checked_at?: string | null
  evidence_kind?: 'nana_database' | 'web_search'
}

type ComparisonRowRecord = {
  id: string
  row_name: string
  cell_data: Record<string, StoredCell> | null
  lens_kind: 'general' | 'child_fit' | 'chat'
}

export type AddedSchoolBackfillResult = {
  status: 'no_session' | 'school_unavailable' | 'complete' | 'partial'
  rows_examined: number
  cells_filled: number
  cells_preserved: number
  cells_unfilled: number
  rows_update_failed: number
  missing_database_topics: string[]
  research_requests_queued: number
}

function hasValue(cell: StoredCell | null | undefined): boolean {
  return cell?.value != null && cell.value !== ''
}

export function resolveAddedSchoolComparisonCell(
  rowName: string,
  school: DirectComparisonSchool,
): StoredCell | null {
  const structured = school.structured as StructuredRow | null
  const meta: SchoolMeta = {
    slug: school.slug,
    name: school.name,
    city: school.city,
    region: school.region,
    boarding: school.boarding,
    gender_split: school.gender_split,
  }

  const seeded = resolveSeedComparisonCell(rowName, meta, structured)
  if (seeded && seeded.value != null && seeded.value !== '') {
    return seeded
  }

  const match = matchComparisonRequest(rowName)
  if (match.kind !== 'supported') return null
  const direct = resolveTrustedComparisonCell(match.label, school)
  if (!direct || direct.value == null || direct.value === '') return null
  return direct
}

function emptyResult(
  status: AddedSchoolBackfillResult['status'],
): AddedSchoolBackfillResult {
  return {
    status,
    rows_examined: 0,
    cells_filled: 0,
    cells_preserved: 0,
    cells_unfilled: 0,
    rows_update_failed: 0,
    missing_database_topics: [],
    research_requests_queued: 0,
  }
}

async function queueMissingDatabaseTopic({
  supabaseService,
  userId,
  childId,
  sessionId,
  schoolSlug,
  topic,
}: {
  supabaseService: SupabaseClient
  userId: string
  childId: string
  sessionId: string
  schoolSlug: string
  topic: string
}): Promise<boolean> {
  const requestId = `shortlist-add:${sessionId}:${schoolSlug}:${topic.toLowerCase()}`
  const { data: existing, error: existingError } = await supabaseService
    .from('nana_chat_logs')
    .select('id')
    .eq('backend', 'comparison_research_request')
    .eq('user_id', userId)
    .contains('parsed_answer', { request_id: requestId })
    .limit(1)
    .maybeSingle()
  if (existingError) throw new Error(`comparison backfill request lookup failed: ${existingError.message}`)
  if (existing?.id) return false

  const requestedAt = new Date().toISOString()
  const { error: insertError } = await supabaseService
    .from('nana_chat_logs')
    .insert({
      user_id: userId,
      question: topic,
      answer_preview: `Comparison research request: ${topic}`,
      backend: 'comparison_research_request',
      model: 'none',
      confidence: 'unavailable',
      parsed_answer: {
        kind: 'comparison_research_request',
        version: 1,
        status: 'requested',
        reason: 'shortlist_school_added',
        canonical_topic: topic,
        original_query: topic,
        child_id: childId,
        school_slugs: [schoolSlug],
        missing_school_slugs: [schoolSlug],
        request_id: requestId,
        source: 'research_room_comparison',
        requested_at: requestedAt,
        notify_when_available: false,
      },
    })
  if (insertError) throw new Error(`comparison backfill request insert failed: ${insertError.message}`)
  return true
}

/**
 * Backfill a newly shortlisted school's cell across every active comparison
 * row in the child's latest Research Room session.
 *
 * Reads/writes comparison rows with the authenticated client so RLS remains
 * authoritative. The service client is used only for canonical school data.
 */
export async function backfillAddedSchoolComparisonCells({
  supabaseUser,
  supabaseService,
  userId,
  childId,
  schoolSlug,
}: {
  supabaseUser: SupabaseClient
  supabaseService: SupabaseClient
  userId: string
  childId: string
  schoolSlug: string
}): Promise<AddedSchoolBackfillResult> {
  const { data: session, error: sessionError } = await supabaseUser
    .from('research_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('child_id', childId)
    .order('last_active_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (sessionError) throw new Error(`comparison backfill session lookup failed: ${sessionError.message}`)
  if (!session?.id) return emptyResult('no_session')

  const [schoolResult, structuredResult, rowsResult] = await Promise.all([
    supabaseService
      .from('schools')
      .select('slug, name, city, region, boarding, gender_split')
      .eq('slug', schoolSlug)
      .maybeSingle(),
    supabaseService
      .from('school_structured_data')
      .select('school_slug, fees_min, fees_max, fees_currency, exam_results, university_destinations, admissions_format, sports_profile, student_community, location_profile, fees_by_grade, application_fee_usd, bursary_note')
      .eq('school_slug', schoolSlug)
      .maybeSingle(),
    supabaseUser
      .from('comparison_rows')
      .select('id, row_name, cell_data, lens_kind')
      .eq('user_id', userId)
      .eq('session_id', session.id)
      .is('undone_at', null),
  ])

  if (schoolResult.error) {
    throw new Error(`comparison backfill school lookup failed: ${schoolResult.error.message}`)
  }
  if (structuredResult.error) {
    throw new Error(`comparison backfill structured lookup failed: ${structuredResult.error.message}`)
  }
  if (rowsResult.error) {
    throw new Error(`comparison backfill row lookup failed: ${rowsResult.error.message}`)
  }
  if (!schoolResult.data) return emptyResult('school_unavailable')

  const school: DirectComparisonSchool = {
    slug: schoolResult.data.slug,
    name: schoolResult.data.name,
    city: schoolResult.data.city,
    region: schoolResult.data.region,
    boarding: schoolResult.data.boarding,
    gender_split: schoolResult.data.gender_split,
    structured: (structuredResult.data as Record<string, unknown> | null) ?? null,
  }
  const rows = (rowsResult.data ?? []) as ComparisonRowRecord[]
  const result: AddedSchoolBackfillResult = {
    status: 'complete',
    rows_examined: rows.length,
    cells_filled: 0,
    cells_preserved: 0,
    cells_unfilled: 0,
    rows_update_failed: 0,
    missing_database_topics: [],
    research_requests_queued: 0,
  }
  const missingTopics = new Set<string>()

  for (const row of rows) {
    if (hasValue(row.cell_data?.[schoolSlug])) {
      result.cells_preserved += 1
      continue
    }

    const cell = resolveAddedSchoolComparisonCell(row.row_name, school)
    if (!cell) {
      result.cells_unfilled += 1
      if (row.lens_kind === 'chat') {
        const match = matchComparisonRequest(row.row_name)
        missingTopics.add(
          match.kind === 'supported' ? match.label : match.canonicalTopic,
        )
      }
      continue
    }

    // Re-read immediately before updating so a concurrent row refresh is not
    // overwritten by the snapshot read above.
    const { data: latest, error: latestError } = await supabaseUser
      .from('comparison_rows')
      .select('cell_data')
      .eq('id', row.id)
      .eq('user_id', userId)
      .is('undone_at', null)
      .maybeSingle()
    if (latestError || !latest) {
      result.rows_update_failed += 1
      continue
    }
    const latestCells = (latest.cell_data ?? {}) as Record<string, StoredCell>
    if (hasValue(latestCells[schoolSlug])) {
      result.cells_preserved += 1
      continue
    }

    const { data: updated, error: updateError } = await supabaseUser
      .from('comparison_rows')
      .update({
        cell_data: {
          ...latestCells,
          [schoolSlug]: cell,
        },
      })
      .eq('id', row.id)
      .eq('user_id', userId)
      .is('undone_at', null)
      .select('id')
      .maybeSingle()
    if (updateError || !updated) {
      result.rows_update_failed += 1
      continue
    }
    result.cells_filled += 1
  }

  result.missing_database_topics = Array.from(missingTopics)
  for (const topic of result.missing_database_topics) {
    try {
      const queued = await queueMissingDatabaseTopic({
        supabaseService,
        userId,
        childId,
        sessionId: session.id,
        schoolSlug,
        topic,
      })
      if (queued) result.research_requests_queued += 1
    } catch (requestError) {
      // Cell hydration remains successful even if backlog telemetry fails.
      console.error('[comparison backfill] missing-topic queue failed', requestError)
      result.status = 'partial'
    }
  }
  if (result.rows_update_failed > 0) result.status = 'partial'
  return result
}
