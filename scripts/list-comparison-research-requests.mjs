import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const data = []
const pageSize = 1000
for (let from = 0; ; from += pageSize) {
  const { data: page, error } = await db
    .from('research_room_topic_requests')
    .select('user_id, original_query, topic_label, normalized_topic, school_slugs, missing_school_slugs, reason, status, requested_at, last_seen_at')
    .order('requested_at', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw error
  data.push(...(page ?? []))
  if ((page ?? []).length < pageSize) break
}

const grouped = new Map()
for (const row of data) {
  const topic = typeof row.topic_label === 'string' && row.topic_label.trim()
    ? row.topic_label.trim()
    : 'Other comparison request'
  const keyName = typeof row.normalized_topic === 'string' && row.normalized_topic.trim()
    ? row.normalized_topic.trim()
    : topic.toLowerCase()
  const current = grouped.get(keyName) ?? {
    topic,
    requests: 0,
    latest: row.last_seen_at ?? row.requested_at,
    sample_questions: [],
    affected_schools: new Set(),
    parents: new Set(),
    reasons: new Set(),
    statuses: new Map(),
  }
  current.requests += 1
  const latest = row.last_seen_at ?? row.requested_at
  if (latest > current.latest) current.latest = latest
  if (
    typeof row.original_query === 'string'
    && row.original_query.trim()
    && !current.sample_questions.includes(row.original_query.trim())
    && current.sample_questions.length < 5
  ) {
    current.sample_questions.push(row.original_query.trim())
  }
  for (const slug of [
    ...(Array.isArray(row.school_slugs) ? row.school_slugs : []),
    ...(Array.isArray(row.missing_school_slugs) ? row.missing_school_slugs : []),
  ]) {
    if (typeof slug === 'string') current.affected_schools.add(slug)
  }
  if (typeof row.user_id === 'string') current.parents.add(row.user_id)
  if (typeof row.reason === 'string') current.reasons.add(row.reason)
  if (typeof row.status === 'string') {
    current.statuses.set(row.status, (current.statuses.get(row.status) ?? 0) + 1)
  }
  grouped.set(keyName, current)
}

const backlog = Array.from(grouped.values())
  .map(item => ({
    topic: item.topic,
    requests: item.requests,
    unique_parents: item.parents.size,
    affected_schools: item.affected_schools.size,
    latest: item.latest,
    statuses: Object.fromEntries(item.statuses),
    reasons: Array.from(item.reasons),
    sample_questions: item.sample_questions,
  }))
  .sort((a, b) => b.requests - a.requests || b.latest.localeCompare(a.latest))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(backlog, null, 2))
} else if (backlog.length === 0) {
  console.log('No dedicated Research Room comparison requests have been saved yet.')
} else {
  console.table(backlog.map(item => ({
    topic: item.topic,
    requests: item.requests,
    parents: item.unique_parents,
    schools: item.affected_schools,
    status: Object.entries(item.statuses)
      .map(([status, count]) => `${status}:${count}`)
      .join(', '),
    latest: item.latest,
  })))
  console.log('\nUse `npm run research:requests -- --json` for sample wording and reasons.')
}
