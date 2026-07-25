import { createClient } from '@supabase/supabase-js'
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
  RESEARCH_ROOM_STRUCTURED_SELECT,
} from '../lib/research-room/seed-rows.ts'

const PAGE_SIZE = 1000
const SCHOOL_SLUG_CHUNK_SIZE = 100
const jsonOutput = process.argv.includes('--json')
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

if (process.argv.includes('--apply')) {
  throw new Error(
    'This pilot is deliberately dry-run only. Add a reviewed apply path before scheduling writes.',
  )
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function readAllPages<T>(
  readPage: (from: number, to: number) => Promise<{
    data: T[] | null
    error: { message: string } | null
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

const [structuredRows, notionRows, researchRequests] = await Promise.all([
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
  readAllPages(
    (from, to) => db
      .from('nana_chat_logs')
      .select('parsed_answer')
      .eq('backend', 'comparison_research_request')
      .order('created_at')
      .range(from, to),
    'comparison request lookup',
  ),
])

const structuredSlugs = structuredRows.map(row => row.school_slug)
const schoolChunks: string[][] = []
for (
  let index = 0;
  index < structuredSlugs.length;
  index += SCHOOL_SLUG_CHUNK_SIZE
) {
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
  structuredRows.map(row => [
    row.school_slug,
    row as unknown as Record<string, unknown>,
  ]),
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
  .sort((left, right) =>
    left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug)
  )

const ukSlugs = new Set(schools.map(school => school.slug))
const requestedCountByTopic = new Map<string, number>()
for (const request of researchRequests) {
  const detail = request.parsed_answer
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) continue
  const record = detail as Record<string, unknown>
  const missing = Array.isArray(record.missing_school_slugs)
    ? record.missing_school_slugs
    : []
  if (!missing.some(slug => typeof slug === 'string' && ukSlugs.has(slug))) continue
  const topic = typeof record.canonical_topic === 'string'
    ? record.canonical_topic.trim().toLowerCase()
    : ''
  if (!topic) continue
  requestedCountByTopic.set(topic, (requestedCountByTopic.get(topic) ?? 0) + 1)
}

const schoolBySlug = new Map(schools.map(school => [school.slug, school]))
function resolveBatchCell(
  topic: { id: string; label: string },
  school: ComparisonBatchSchool,
) {
  const fullSchool = schoolBySlug.get(school.slug)
  if (!fullSchool) throw new Error('school disappeared from the batch catalogue')
  return resolveAddedSchoolComparisonCell(
    topic.label,
    fullSchool,
    notionBySlug.get(school.slug) ?? null,
  )
}

const [foundationReport, topicReport] = [
  buildComparisonTopicBatchReport({
    schools: schools as ComparisonBatchSchool[],
    topics: FOUNDATION_ROWS,
    resolveCell: resolveBatchCell,
  }),
  buildComparisonTopicBatchReport({
    schools: schools as ComparisonBatchSchool[],
    topics: SUPPORTED_COMPARISONS,
    requestedCountByTopic,
    resolveCell: resolveBatchCell,
  }),
]
const totals = {
  schools_evaluated: schools.length,
  foundation_rows_evaluated: FOUNDATION_ROWS.length,
  comparison_topics_evaluated: SUPPORTED_COMPARISONS.length,
  cells_evaluated: foundationReport.cells_evaluated + topicReport.cells_evaluated,
  ready_cells: foundationReport.ready_cells + topicReport.ready_cells,
  missing_cells: foundationReport.missing_cells + topicReport.missing_cells,
  issues: [...foundationReport.issues, ...topicReport.issues],
}

const generatedAt = new Date().toISOString()
const output = {
  mode: 'dry-run',
  scope: 'United Kingdom',
  generated_at: generatedAt,
  database_writes: 0,
  totals,
  foundation_rows: foundationReport,
  comparison_topics: topicReport,
}

function printCoverageTable(
  coverage: typeof foundationReport.topics,
) {
  console.table(coverage.map(topic => ({
    row: topic.label,
    ready: topic.ready_schools,
    missing: topic.missing_schools,
    coverage: `${topic.coverage_percent}%`,
    requests: topic.requested_count,
  })))
}

if (jsonOutput) {
  console.log(JSON.stringify(output, null, 2))
} else {
  console.log('Research Room UK comparison-topic batch (DRY RUN)')
  console.log(`Generated: ${generatedAt}`)
  console.log(
    `${totals.schools_evaluated} comparison-ready UK schools × `
    + `(${totals.foundation_rows_evaluated} foundation rows + `
    + `${totals.comparison_topics_evaluated} topics) = ${totals.cells_evaluated} checks`,
  )
  console.log(
    `${totals.ready_cells} ready cells; ${totals.missing_cells} verified gaps; `
    + `${totals.issues.length} integrity issues`,
  )
  console.log('Foundation rows:')
  printCoverageTable(foundationReport.topics)
  console.log('Searchable comparison topics:')
  printCoverageTable(topicReport.topics)
  const priority = [...topicReport.topics]
    .filter(topic => topic.missing_schools > 0)
    .sort((left, right) =>
      right.requested_count - left.requested_count
      || right.missing_schools - left.missing_schools
      || left.label.localeCompare(right.label)
    )
    .slice(0, 10)
  console.log('Next ten searchable-topic gap priorities:')
  for (const [index, topic] of priority.entries()) {
    console.log(
      `${index + 1}. ${topic.label}: ${topic.missing_schools} missing`
      + (topic.requested_count > 0 ? `; ${topic.requested_count} parent requests` : ''),
    )
  }
  console.log('Dry run complete: 0 database writes.')
}

if (
  totals.schools_evaluated === 0
  || foundationReport.topics_evaluated !== FOUNDATION_ROWS.length
  || topicReport.topics_evaluated !== SUPPORTED_COMPARISONS.length
  || totals.issues.length > 0
) {
  process.exitCode = 1
}
