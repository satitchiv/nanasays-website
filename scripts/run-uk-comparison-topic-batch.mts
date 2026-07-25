import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  buildComparisonTopicBatchReport,
  type ComparisonBatchSchool,
} from '../lib/research-room/comparison-topic-batch.ts'
import {
  resolveAddedSchoolComparisonCell,
} from '../lib/research-room/backfill-added-school.ts'
import {
  SUPPORTED_COMPARISONS,
} from '../lib/research-room/comparison-catalog.ts'
import type { DirectComparisonSchool } from '../lib/research-room/direct-comparison-row.ts'
import type { NotionBackfillRow } from '../lib/research-room/pupil-composition.ts'
import {
  manualRunKey,
  planSchedulerRowUpdate,
  scheduledRunKey,
  type SchedulerCell,
  type SchedulerComparisonRow,
} from '../lib/research-room/uk-comparison-scheduler.ts'
import {
  RESEARCH_ROOM_STRUCTURED_SELECT,
} from '../lib/research-room/seed-rows.ts'

const PAGE_SIZE = 1000
const SCHOOL_SLUG_CHUNK_SIZE = 100
const SCHEDULER_KEY = 'uk-research-room-comparisons-v1'
const jsonOutput = process.argv.includes('--json')
const applyMode = process.argv.includes('--apply')
const scheduledMode = process.argv.includes('--scheduled')
const mode = applyMode ? 'apply' as const : 'dry-run' as const
const requestedRunKey = process.argv.find(argument => argument.startsWith('--run-key='))?.slice('--run-key='.length)
const runKey = requestedRunKey
  || (scheduledMode ? scheduledRunKey(new Date()) : manualRunKey(new Date()))

const FOUNDATION_ROWS = [
  { id: 'foundation_school_type', label: 'School type' },
  { id: 'foundation_location', label: 'Location' },
  { id: 'foundation_heathrow', label: 'Travel from Heathrow' },
  { id: 'foundation_class_size', label: 'Class size' },
  { id: 'foundation_total_pupils', label: 'Total pupils' },
  { id: 'foundation_boarding_entry', label: 'Lowest boarding entry' },
  { id: 'foundation_boarding_pupils', label: 'Boarding pupils' },
  { id: 'foundation_international_pupils', label: 'International pupils' },
  { id: 'foundation_day_pupils', label: 'Day pupils' },
  { id: 'foundation_boarding_ratio', label: 'Boarding ratio' },
  { id: 'foundation_gcse', label: 'GCSE 9–7' },
  { id: 'foundation_a_level', label: 'A-level A*–A' },
  { id: 'foundation_boarding_fee_term', label: 'Boarding fee · per term' },
  { id: 'foundation_boarding_fee_year', label: 'Boarding fee · per year' },
  { id: 'foundation_registration_fee', label: 'Registration fee' },
  { id: 'foundation_y9_y10_admissions', label: 'Year 9 / 10 admissions' },
] as const

type PageError = { message: string; code?: string }
type RowRecord = SchedulerComparisonRow & { session_id: string }
type SessionRecord = {
  id: string
  user_id: string
  child_id: string | null
  school_slug: string
}
type ShortlistRecord = {
  user_id: string
  child_id: string | null
  school_slug: string
}
type CoverageRow = {
  label: string
  ready_schools: number
  missing_schools: number
  coverage_percent: number
  requested_count: number
}

function requireEnvironment(): { url: string; serviceKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
  }
  return { url, serviceKey }
}

function makeDb(): SupabaseClient {
  const { url, serviceKey } = requireEnvironment()
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function readAllPages<T>(
  readPage: (from: number, to: number) => Promise<{
    data: T[] | null
    error: PageError | null
  }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await readPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${label} failed: ${error.message}`)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function claimRun(db: SupabaseClient): Promise<{
  claimed: boolean
  runId: string | null
  existingStatus?: string
}> {
  const { data, error } = await db
    .from('research_room_comparison_scheduler_runs')
    .insert({
      scheduler_key: SCHEDULER_KEY,
      run_key: runKey,
      mode,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  if (!error && data?.id) return { claimed: true, runId: data.id }
  if (error?.code !== '23505') {
    throw new Error(`scheduler run claim failed: ${error?.message ?? 'missing run id'}`)
  }

  const existing = await db
    .from('research_room_comparison_scheduler_runs')
    .select('id, status')
    .eq('scheduler_key', SCHEDULER_KEY)
    .eq('run_key', runKey)
    .maybeSingle()
  if (existing.error || !existing.data?.id) {
    throw new Error(`scheduler duplicate-run lookup failed: ${existing.error?.message ?? 'run not found'}`)
  }
  return {
    claimed: false,
    runId: existing.data.id,
    existingStatus: existing.data.status,
  }
}

async function finishRun(
  db: SupabaseClient,
  runId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from('research_room_comparison_scheduler_runs')
    .update({ ...values, finished_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) throw new Error(`scheduler run log update failed: ${error.message}`)
}

async function loadVerifiedContext(db: SupabaseClient): Promise<{
  schools: DirectComparisonSchool[]
  notionBySlug: Map<string, NotionBackfillRow>
  requestedCountByTopic: Map<string, number>
}> {
  const [structuredRows, notionRows] = await Promise.all([
    readAllPages(
      (from, to) => db
        .from('school_structured_data')
        .select(RESEARCH_ROOM_STRUCTURED_SELECT)
        .order('school_slug')
        .range(from, to),
      'structured school lookup',
    ),
    readAllPages(
      (from, to) => db
        .from('school_notion_backfill')
        .select('school_slug, status, parsed, raw_properties')
        .order('school_slug')
        .range(from, to),
      'Notion mirror lookup',
    ),
  ])

  const structuredSlugs = structuredRows.map(row => row.school_slug)
  const schoolChunks: string[][] = []
  for (let index = 0; index < structuredSlugs.length; index += SCHOOL_SLUG_CHUNK_SIZE) {
    schoolChunks.push(structuredSlugs.slice(index, index + SCHOOL_SLUG_CHUNK_SIZE))
  }
  const schoolResults = await Promise.all(schoolChunks.map(slugs =>
    db
      .from('schools')
      .select('slug, name, city, region, country, boarding, gender_split, distance_airport')
      .in('slug', slugs)
      .eq('country', 'United Kingdom'),
  ))
  const schoolError = schoolResults.find(result => result.error)?.error
  if (schoolError) throw new Error(`UK school lookup failed: ${schoolError.message}`)

  const structuredBySlug = new Map(
    structuredRows.map(row => [row.school_slug, row as unknown as Record<string, unknown>]),
  )
  const notionBySlug = new Map(
    notionRows.map(row => [row.school_slug, row as NotionBackfillRow]),
  )
  const schools: DirectComparisonSchool[] = schoolResults
    .flatMap(result => result.data ?? [])
    .map(school => ({
      slug: school.slug,
      name: school.name,
      city: school.city,
      region: school.region,
      boarding: school.boarding,
      gender_split: school.gender_split,
      distance_airport: school.distance_airport,
      structured: structuredBySlug.get(school.slug) ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug))

  return { schools, notionBySlug, requestedCountByTopic: new Map() }
}

function buildCoverageReports(
  schools: DirectComparisonSchool[],
  notionBySlug: Map<string, NotionBackfillRow>,
  requestedCountByTopic: Map<string, number>,
) {
  const schoolBySlug = new Map(schools.map(school => [school.slug, school]))
  function resolveBatchCell(topic: { label: string }, school: ComparisonBatchSchool) {
    const fullSchool = schoolBySlug.get(school.slug)
    if (!fullSchool) throw new Error('school disappeared from the batch catalogue')
    return resolveAddedSchoolComparisonCell(topic.label, fullSchool, notionBySlug.get(school.slug) ?? null)
  }

  const foundationReport = buildComparisonTopicBatchReport({
    schools: schools as ComparisonBatchSchool[],
    topics: FOUNDATION_ROWS,
    resolveCell: resolveBatchCell,
  })
  const topicReport = buildComparisonTopicBatchReport({
    schools: schools as ComparisonBatchSchool[],
    topics: SUPPORTED_COMPARISONS,
    requestedCountByTopic,
    resolveCell: resolveBatchCell,
  })
  return { foundationReport, topicReport, schoolBySlug }
}

async function loadActiveRowsAndTargets(db: SupabaseClient): Promise<{
  rows: RowRecord[]
  schoolSlugsBySession: Map<string, string[]>
}> {
  const [rows, sessions, shortlist] = await Promise.all([
    readAllPages(
      (from, to) => db
        .from('comparison_rows')
        .select('id, row_name, cell_data, session_id')
        .is('undone_at', null)
        .order('id')
        .range(from, to),
      'active comparison-row lookup',
    ),
    readAllPages(
      (from, to) => db
        .from('research_sessions')
        .select('id, user_id, child_id, school_slug')
        .order('id')
        .range(from, to),
      'research-session lookup',
    ),
    readAllPages(
      (from, to) => db
        .from('shortlisted_schools')
        .select('user_id, child_id, school_slug')
        .order('user_id')
        .range(from, to),
      'shortlist lookup',
    ),
  ])

  const sessionsByOwner = new Map<string, SessionRecord[]>()
  for (const session of sessions as SessionRecord[]) {
    const key = `${session.user_id}:${session.child_id ?? ''}`
    const entries = sessionsByOwner.get(key) ?? []
    entries.push(session)
    sessionsByOwner.set(key, entries)
  }
  const schoolSlugsBySession = new Map<string, Set<string>>()
  for (const session of sessions as SessionRecord[]) {
    schoolSlugsBySession.set(session.id, new Set([session.school_slug]))
  }
  for (const school of shortlist as ShortlistRecord[]) {
    const key = `${school.user_id}:${school.child_id ?? ''}`
    for (const session of sessionsByOwner.get(key) ?? []) {
      schoolSlugsBySession.get(session.id)?.add(school.school_slug)
    }
  }

  return {
    rows: rows as RowRecord[],
    schoolSlugsBySession: new Map(
      Array.from(schoolSlugsBySession, ([sessionId, slugs]) => [sessionId, Array.from(slugs)]),
    ),
  }
}

function printCoverageTable(coverage: CoverageRow[]) {
  console.table(coverage.map(topic => ({
    row: topic.label,
    ready: topic.ready_schools,
    missing: topic.missing_schools,
    coverage: `${topic.coverage_percent}%`,
    requests: topic.requested_count,
  })))
}

async function main(): Promise<void> {
  const db = makeDb()
  const claim = await claimRun(db)
  if (!claim.claimed) {
    const output = {
      mode,
      scope: 'United Kingdom',
      run_key: runKey,
      skipped_duplicate: true,
      existing_status: claim.existingStatus,
      comparison_row_writes: 0,
    }
    console.log(jsonOutput ? JSON.stringify(output, null, 2) : `Research Room UK scheduler skipped duplicate run ${runKey}`)
    return
  }

  const runId = claim.runId!
  const generatedAt = new Date().toISOString()
  try {
    const context = await loadVerifiedContext(db)
    const { foundationReport, topicReport, schoolBySlug } = buildCoverageReports(
      context.schools,
      context.notionBySlug,
      context.requestedCountByTopic,
    )
    const totals = {
      schools_evaluated: context.schools.length,
      foundation_rows_evaluated: FOUNDATION_ROWS.length,
      comparison_topics_evaluated: SUPPORTED_COMPARISONS.length,
      cells_evaluated: foundationReport.cells_evaluated + topicReport.cells_evaluated,
      ready_cells: foundationReport.ready_cells + topicReport.ready_cells,
      missing_cells: foundationReport.missing_cells + topicReport.missing_cells,
      issues: [...foundationReport.issues, ...topicReport.issues],
    }
    if (
      totals.schools_evaluated === 0
      || totals.issues.length > 0
      || foundationReport.topics_evaluated !== FOUNDATION_ROWS.length
      || topicReport.topics_evaluated !== SUPPORTED_COMPARISONS.length
    ) {
      throw new Error(`verified UK batch failed integrity checks (${totals.issues.length} issues)`)
    }

    const active = await loadActiveRowsAndTargets(db)
    const ukSlugs = new Set(context.schools.map(school => school.slug))
    const checkedAt = new Date().toISOString()
    let rowsEvaluated = 0
    let rowsUpdated = 0
    let cellsFilled = 0
    let cellsPreserved = 0
    let cellsUnfilled = 0
    let rowsUpdateFailed = 0
    const schedulerIssues: string[] = []

    for (const row of active.rows) {
      const targets = new Set<string>([
        ...Object.keys(row.cell_data ?? {}),
        ...(active.schoolSlugsBySession.get(row.session_id) ?? []),
      ])
      const targetSlugs = Array.from(targets).filter(slug => ukSlugs.has(slug))
      if (targetSlugs.length === 0) continue
      rowsEvaluated += 1
      const plan = planSchedulerRowUpdate({
        row,
        schoolSlugs: targetSlugs,
        checkedAt,
        resolveCell: (rowName, schoolSlug): SchedulerCell | null => {
          const school = schoolBySlug.get(schoolSlug)
          if (!school) return null
          return resolveAddedSchoolComparisonCell(
            rowName,
            school,
            context.notionBySlug.get(schoolSlug) ?? null,
          ) as SchedulerCell | null
        },
      })
      cellsFilled += plan.cells_filled
      cellsPreserved += plan.cells_preserved
      cellsUnfilled += plan.cells_unfilled
      schedulerIssues.push(...plan.issues.map(issue => `${row.id}: ${issue}`))
      if (mode !== 'apply' || !plan.changed) continue

      const { data, error } = await db.rpc('merge_uk_comparison_row_cells', {
        p_row_id: row.id,
        p_cells: plan.filled_cells,
      })
      if (error) {
        rowsUpdateFailed += 1
        schedulerIssues.push(`${row.id}: ${error.message}`)
        continue
      }
      const result = Array.isArray(data) ? data[0] : data
      if (typeof result?.filled_count === 'number') {
        cellsFilled -= plan.cells_filled - result.filled_count
      }
      rowsUpdated += 1
    }

    if (schedulerIssues.length > 0) {
      throw new Error(`scheduler cell integrity checks failed (${schedulerIssues.length} issues)`)
    }

    const summary = {
      run_key: runKey,
      mode,
      scope: 'United Kingdom',
      generated_at: generatedAt,
      comparison_row_writes: mode === 'apply' ? rowsUpdated : 0,
      totals,
      scheduler: {
        rows_evaluated: rowsEvaluated,
        rows_updated: mode === 'apply' ? rowsUpdated : 0,
        cells_filled: mode === 'apply' ? cellsFilled : 0,
        cells_would_fill: mode === 'dry-run' ? cellsFilled : 0,
        cells_preserved: cellsPreserved,
        cells_unfilled: cellsUnfilled,
        rows_update_failed: rowsUpdateFailed,
      },
      foundation_rows: foundationReport,
      comparison_topics: topicReport,
    }
    await finishRun(db, runId, {
      status: 'succeeded',
      mode,
      schools_evaluated: context.schools.length,
      rows_evaluated: rowsEvaluated,
      rows_updated: mode === 'apply' ? rowsUpdated : 0,
      cells_filled: mode === 'apply' ? cellsFilled : 0,
      cells_preserved: cellsPreserved,
      cells_unfilled: cellsUnfilled,
      rows_update_failed: rowsUpdateFailed,
      summary,
    })

    if (jsonOutput) {
      console.log(JSON.stringify(summary, null, 2))
    } else {
      console.log(`Research Room UK comparison scheduler (${mode.toUpperCase()})`)
      console.log(`Run key: ${runKey}`)
      console.log(`${context.schools.length} verified UK schools; ${rowsEvaluated} active rows evaluated`)
      console.log(`${mode === 'apply' ? rowsUpdated : 0} comparison rows written; ${cellsFilled} cells ${mode === 'apply' ? 'filled' : 'would fill'}; ${cellsPreserved} populated cells preserved`)
      console.log(`${cellsUnfilled} verified gaps remain; run logged as succeeded`)
      console.log('Foundation rows:')
      printCoverageTable(foundationReport.topics)
      console.log('Searchable comparison topics:')
      printCoverageTable(topicReport.topics)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finishRun(db, runId, {
      status: 'failed',
      mode,
      error_message: message,
      summary: { run_key: runKey, mode, scope: 'United Kingdom', error: message },
    })
    throw error
  }
}

await main()
