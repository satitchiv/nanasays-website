import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  planTopicDemandPromotions,
  type TopicCatalogEntry,
  type TopicDemandRequest,
} from '../lib/research-room/topic-demand-creator.ts'
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
          .select('id, label, normalized_topic, demand_count, unique_parent_count, status')
          .order('id')
          .range(from, to),
        'Research Room topic-catalog lookup',
      ),
    ])

    const plan = planTopicDemandPromotions({ requests, existingCatalog: catalog })
    if (mode === 'apply') {
      for (const promotion of plan.promotions) {
        const { error: upsertError } = await db
          .from('research_room_topic_catalog')
          .upsert({
            id: promotion.id,
            label: promotion.label,
            normalized_topic: promotion.normalized_topic,
            demand_count: promotion.demand_count,
            unique_parent_count: promotion.unique_parent_count,
            status: 'approved',
            source: 'parent_demand',
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
      source: 'Research Room topic requests only',
      facts_created: 0,
      requests_evaluated: plan.requestsConsidered,
      candidates_below_threshold: plan.requestsBelowThreshold,
      topics_would_promote: mode === 'dry-run' ? plan.promotions : 0,
      topics_promoted: mode === 'apply' ? plan.promotions : [],
      requests_marked_promoted: mode === 'apply' ? plan.requestsToPromote.length : 0,
      existing_topics_skipped: plan.requestsAlreadyPromoted,
    }
    await finishRun(db, runId, {
      status: 'succeeded',
      requests_evaluated: plan.requestsConsidered,
      candidates_below_threshold: plan.requestsBelowThreshold,
      topics_promoted: mode === 'apply' ? plan.promotions.length : 0,
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
