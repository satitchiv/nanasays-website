import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  planTopicDemandPromotions,
  type TopicDemandPlan,
  type TopicCatalogEntry,
  type TopicDemandRequest,
} from '../lib/research-room/topic-demand-creator.ts'
import { normalizeTopicDemand } from '../lib/research-room/topic-demand-requests.ts'
import { resolveAddedSchoolComparisonCell } from '../lib/research-room/backfill-added-school.ts'
import { matchComparisonRequest } from '../lib/research-room/comparison-catalog.ts'
import { SUPPORTED_COMPARISON_LABELS } from '../lib/research-room/comparison-catalog.ts'
import { DATABASE_TOPIC_CANDIDATES, type DatabaseTopicCandidate } from '../lib/research-room/database-topic-candidates.ts'
import { RESEARCH_ROOM_STRUCTURED_SELECT, type StructuredRow } from '../lib/research-room/seed-rows.ts'
import type { DirectComparisonSchool } from '../lib/research-room/direct-comparison-row.ts'
import type { NotionBackfillRow } from '../lib/research-room/pupil-composition.ts'
import { manualRunKey, scheduledRunKey } from '../lib/research-room/uk-comparison-scheduler.ts'

const PAGE_SIZE = 1000
const SCHEDULER_KEY = 'research-room-topic-demand-creator-v1'
const jsonOutput = process.argv.includes('--json')
const applyMode = process.argv.includes('--apply')
const scheduledMode = process.argv.includes('--scheduled')
const mode = applyMode ? 'apply' as const : 'dry-run' as const
const requestedRunKey = process.argv.find(argument => argument.startsWith('--run-key='))?.slice('--run-key='.length)
const runKey = requestedRunKey
  || (scheduledMode ? scheduledRunKey(new Date()) : manualRunKey(new Date()))

type PageError = { message: string; code?: string }

type VerifiedContext = {
  schools: DirectComparisonSchool[]
  notionBySlug: Map<string, NotionBackfillRow>
}

const TOPIC_STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'how', 'in', 'is', 'of', 'or', 'the', 'to', 'what', 'where', 'with', 'most'])

function topicTokens(label: string): string[] {
  return normalizeTopicDemand(label)
    .split(' ')
    .filter(token => token.length > 2 && !TOPIC_STOP_WORDS.has(token))
}

function hasVerifiedTextSignal(label: string, school: DirectComparisonSchool, notion: NotionBackfillRow | null): boolean {
  const tokens = topicTokens(label)
  if (tokens.length === 0) return false
  const evidence = JSON.stringify({
    structured: school.structured,
    notion: notion?.status === 'clean' || notion?.status === 'matched'
      ? { parsed: notion.parsed, raw_properties: notion.raw_properties }
      : null,
  }).toLowerCase()
  return tokens.every(token => evidence.includes(token))
}

function measureVerifiedTopicCoverage(label: string, context: VerifiedContext) {
  const match = matchComparisonRequest(label)
  const ready = context.schools.filter(school => {
    if (match.kind === 'supported') {
      const cell = resolveAddedSchoolComparisonCell(match.label, school, context.notionBySlug.get(school.slug) ?? null)
      return cell?.value != null && cell.value !== ''
    }
    return hasVerifiedTextSignal(label, school, context.notionBySlug.get(school.slug) ?? null)
  }).length
  return {
    verified_school_count: ready,
    verified_coverage_percent: context.schools.length === 0 ? 0 : Math.round((ready / context.schools.length) * 1000) / 10,
  }
}

function valueAtPath(value: unknown, path: string): unknown {
  let current = value
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function hasEvidenceValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  return value != null && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0
}

function measureDatabaseCandidateCoverage(candidate: DatabaseTopicCandidate, context: VerifiedContext) {
  const ready = context.schools.filter(school => {
    const notion = context.notionBySlug.get(school.slug)
    return candidate.evidencePaths.some(path => {
      const [root, ...rest] = path.split('.')
      const structuredValue = valueAtPath(school.structured, path)
      if (hasEvidenceValue(structuredValue)) return true
      if (root === 'parsed' || root === 'raw_properties') {
        return hasEvidenceValue(valueAtPath(notion?.parsed, rest.join('.')))
          || hasEvidenceValue(valueAtPath(notion?.raw_properties, rest.join('.')))
      }
      return false
    })
  }).length
  return {
    verified_school_count: ready,
    verified_coverage_percent: context.schools.length === 0 ? 0 : Math.round((ready / context.schools.length) * 1000) / 10,
    evidence_paths: candidate.evidencePaths,
  }
}

function makeDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function readAllPages<T>(
  readPage: (from: number, to: number) => Promise<{ data: T[] | null; error: PageError | null }>,
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

async function claimRun(db: SupabaseClient): Promise<{ claimed: boolean; runId: string | null; existingStatus?: string }> {
  const { data, error } = await db
    .from('research_room_topic_creator_runs')
    .insert({ scheduler_key: SCHEDULER_KEY, run_key: runKey, mode, status: 'running' })
    .select('id')
    .maybeSingle()
  if (!error && data?.id) return { claimed: true, runId: data.id }
  if (error?.code !== '23505') throw new Error(`topic creator run claim failed: ${error?.message ?? 'missing run id'}`)
  const existing = await db
    .from('research_room_topic_creator_runs')
    .select('id, status')
    .eq('scheduler_key', SCHEDULER_KEY)
    .eq('run_key', runKey)
    .maybeSingle()
  if (existing.error || !existing.data?.id) throw new Error(`topic creator duplicate lookup failed: ${existing.error?.message ?? 'run not found'}`)
  return { claimed: false, runId: existing.data.id, existingStatus: existing.data.status }
}

async function finishRun(db: SupabaseClient, runId: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await db
    .from('research_room_topic_creator_runs')
    .update({ ...values, finished_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) throw new Error(`topic creator run log update failed: ${error.message}`)
}

async function loadVerifiedContext(db: SupabaseClient): Promise<VerifiedContext> {
  const [structuredRows, notionRows] = await Promise.all([
    readAllPages<Record<string, unknown>>(
      (from, to) => db.from('school_structured_data').select(RESEARCH_ROOM_STRUCTURED_SELECT).order('school_slug').range(from, to),
      'topic creator structured-data lookup',
    ),
    readAllPages<NotionBackfillRow>(
      (from, to) => db.from('school_notion_backfill').select('school_slug, status, parsed, raw_properties').order('school_slug').range(from, to),
      'topic creator Notion-mirror lookup',
    ),
  ])
  const structuredBySlug = new Map(structuredRows.map(row => [String(row.school_slug), row]))
  const notionBySlug = new Map(notionRows.map(row => [row.school_slug, row]))
  const structuredSlugs = Array.from(structuredBySlug.keys())
  const schools = await readAllPages<DirectComparisonSchool>(
    (from, to) => db
      .from('schools')
      .select('slug, name, city, region, country, boarding, gender_split, distance_airport')
      .eq('country', 'United Kingdom')
      .in('slug', structuredSlugs)
      .order('slug')
      .range(from, to)
      .then(result => ({
        data: (result.data ?? []).map(school => ({
          slug: school.slug,
          name: school.name,
          city: school.city,
          region: school.region,
          boarding: school.boarding,
          gender_split: school.gender_split,
          distance_airport: school.distance_airport,
          structured: structuredBySlug.get(school.slug) as StructuredRow | null ?? null,
        })),
        error: result.error,
      })),
    'topic creator UK school lookup',
  )
  return { schools, notionBySlug }
}

async function main(): Promise<void> {
  const db = makeDb()
  const claim = await claimRun(db)
  if (!claim.claimed) {
    const output = {
      mode,
      run_key: runKey,
      skipped_duplicate: true,
      existing_status: claim.existingStatus,
      topics_promoted: 0,
    }
    console.log(jsonOutput ? JSON.stringify(output, null, 2) : `Research Room topic creator skipped duplicate run ${runKey}`)
    return
  }

  const runId = claim.runId!
  try {
    const [requests, catalog] = await Promise.all([
      readAllPages<TopicDemandRequest>(
        (from, to) => db
          .from('research_room_topic_requests')
          .select('id, request_key, user_id, topic_label, normalized_topic, requested_at, status, promoted_topic_id')
          .order('requested_at')
          .range(from, to),
        'Research Room topic-request lookup',
      ),
      readAllPages<TopicCatalogEntry>(
        (from, to) => db
          .from('research_room_topic_catalog')
          .select('id, label, normalized_topic, demand_count, unique_parent_count, verified_school_count, verified_coverage_percent, evidence_paths, status')
          .order('id')
          .range(from, to),
        'Research Room topic-catalog lookup',
      ),
    ])

    const verifiedContext = await loadVerifiedContext(db)
    const coverageByTopic = new Map(
      Array.from(new Set(requests.map(request => request.normalized_topic))).map(topic => [
        topic,
        measureVerifiedTopicCoverage(topic, verifiedContext),
      ]),
    )
    const plan: TopicDemandPlan = planTopicDemandPromotions({ requests, existingCatalog: catalog, coverageByTopic })
    const existingIds = new Set(catalog.map(entry => entry.id))
    const staticLabels = new Set(SUPPORTED_COMPARISON_LABELS.map(label => label.toLowerCase()))
    const databasePromotions = DATABASE_TOPIC_CANDIDATES
      .filter(candidate => !existingIds.has(`database-${candidate.id}`))
      .filter(candidate => !staticLabels.has(candidate.label.toLowerCase()))
      .map(candidate => ({
        ...candidate,
        coverage: measureDatabaseCandidateCoverage(candidate, verifiedContext),
      }))
      .filter(candidate => candidate.coverage.verified_school_count >= 10)
      .map(candidate => ({
        id: `database-${candidate.id}`,
        label: candidate.label,
        normalized_topic: candidate.label.toLowerCase(),
        demand_count: 0,
        unique_parent_count: 0,
        verified_school_count: candidate.coverage.verified_school_count,
        verified_coverage_percent: candidate.coverage.verified_coverage_percent,
        evidence_paths: candidate.coverage.evidence_paths,
      }))
    const allPromotions = [...databasePromotions, ...plan.promotions]
    if (mode === 'apply') {
      for (const promotion of allPromotions) {
        const { error: upsertError } = await db
          .from('research_room_topic_catalog')
          .upsert({
            id: promotion.id,
            label: promotion.label,
            normalized_topic: promotion.normalized_topic,
            demand_count: promotion.demand_count,
            unique_parent_count: promotion.unique_parent_count,
            verified_school_count: promotion.verified_school_count,
            verified_coverage_percent: promotion.verified_coverage_percent,
            evidence_paths: promotion.evidence_paths ?? [],
            status: 'approved',
            source: promotion.id.startsWith('database-') ? 'database_inventory' : 'parent_demand',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' })
        if (upsertError) throw new Error(`topic promotion failed for ${promotion.id}: ${upsertError.message}`)

        const requestIds = requests
          .filter(request => request.normalized_topic === promotion.normalized_topic)
          .map(request => request.id)
        if (requestIds.length > 0) {
          const { error: updateError } = await db
            .from('research_room_topic_requests')
            .update({ status: 'promoted', promoted_topic_id: promotion.id, last_seen_at: new Date().toISOString() })
            .in('id', requestIds)
          if (updateError) throw new Error(`topic request promotion update failed for ${promotion.id}: ${updateError.message}`)
        }
      }
    }

    const summary = {
      mode,
      run_key: runKey,
      source: 'verified database inventory plus Research Room topic requests',
      source_data: 'verified school_structured_data and approved school_notion_backfill mirror',
      verified_schools_evaluated: verifiedContext.schools.length,
      facts_created: 0,
      requests_evaluated: plan.requestsConsidered,
      candidates_below_threshold: plan.requestsBelowThreshold,
      candidates_without_verified_coverage: plan.candidatesWithoutVerifiedCoverage,
      database_topics_evaluated: DATABASE_TOPIC_CANDIDATES.length,
      database_topics_without_coverage: DATABASE_TOPIC_CANDIDATES.length - databasePromotions.length,
      topics_would_promote: mode === 'dry-run' ? allPromotions : 0,
      topics_promoted: mode === 'apply' ? allPromotions : [],
      requests_marked_promoted: mode === 'apply' ? plan.requestsToPromote.length : 0,
      existing_topics_skipped: plan.requestsAlreadyPromoted,
    }
    await finishRun(db, runId, {
      status: 'succeeded',
      requests_evaluated: plan.requestsConsidered,
      candidates_below_threshold: plan.requestsBelowThreshold,
      topics_promoted: mode === 'apply' ? allPromotions.length : 0,
      requests_marked_promoted: mode === 'apply' ? plan.requestsToPromote.length : 0,
      summary,
    })
    console.log(jsonOutput ? JSON.stringify(summary, null, 2) : `Research Room topic creator (${mode.toUpperCase()}): ${plan.promotions.length} topics ready`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await finishRun(db, runId, { status: 'failed', error_message: message, summary: { mode, run_key: runKey, error: message } })
    throw error
  }
}

await main()
