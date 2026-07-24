import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data, error } = await db
  .from('nana_chat_logs')
  .select('question, created_at, parsed_answer')
  .eq('backend', 'comparison_research_request')
  .order('created_at', { ascending: false })

if (error) throw error

const grouped = new Map()
for (const row of data ?? []) {
  const detail = row.parsed_answer && typeof row.parsed_answer === 'object'
    ? row.parsed_answer
    : {}
  const topic = typeof detail.canonical_topic === 'string' && detail.canonical_topic.trim()
    ? detail.canonical_topic.trim()
    : 'Other comparison request'
  const keyName = topic.toLowerCase()
  const current = grouped.get(keyName) ?? {
    topic,
    requests: 0,
    latest: row.created_at,
    sample_questions: [],
    affected_schools: new Set(),
    reasons: new Set(),
  }
  current.requests += 1
  if (row.created_at > current.latest) current.latest = row.created_at
  if (
    typeof row.question === 'string'
    && row.question.trim()
    && !current.sample_questions.includes(row.question.trim())
    && current.sample_questions.length < 5
  ) {
    current.sample_questions.push(row.question.trim())
  }
  for (const slug of Array.isArray(detail.missing_school_slugs) ? detail.missing_school_slugs : []) {
    if (typeof slug === 'string') current.affected_schools.add(slug)
  }
  if (typeof detail.reason === 'string') current.reasons.add(detail.reason)
  grouped.set(keyName, current)
}

const backlog = Array.from(grouped.values())
  .map(item => ({
    topic: item.topic,
    requests: item.requests,
    affected_schools: item.affected_schools.size,
    latest: item.latest,
    reasons: Array.from(item.reasons),
    sample_questions: item.sample_questions,
  }))
  .sort((a, b) => b.requests - a.requests || b.latest.localeCompare(a.latest))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(backlog, null, 2))
} else if (backlog.length === 0) {
  console.log('No comparison research requests have been saved yet.')
} else {
  console.table(backlog.map(item => ({
    topic: item.topic,
    requests: item.requests,
    schools: item.affected_schools,
    latest: item.latest,
  })))
  console.log('\nUse `npm run research:requests -- --json` for sample wording and reasons.')
}
