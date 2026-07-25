import { createClient } from '@supabase/supabase-js'
import { resolveAddedSchoolComparisonCell } from '../lib/research-room/backfill-added-school.ts'
import { SUPPORTED_COMPARISONS } from '../lib/research-room/comparison-catalog.ts'
import type { DirectComparisonSchool } from '../lib/research-room/direct-comparison-row.ts'
import type { NotionBackfillRow } from '../lib/research-room/pupil-composition.ts'
import { RESEARCH_ROOM_STRUCTURED_SELECT } from '../lib/research-room/seed-rows.ts'

const GENERAL_ROWS = [
  'School type',
  'Location',
  'Travel from Heathrow',
  'Class size',
  'Total pupils',
  'Lowest boarding entry',
  'Boarding pupils',
  'International pupils',
  'Day pupils',
  'Boarding ratio',
  'GCSE 9–7',
  'A-level A*–A',
  'Boarding fee · per term',
  'Boarding fee · per year',
  'Registration fee',
  'Year 9 / 10 admissions',
] as const

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const [
  { data: structuredRows, error: structuredError },
  { data: notionRows, error: notionError },
  { count: ukDirectoryCount, error: ukDirectoryError },
] = await Promise.all([
  db.from('school_structured_data')
    .select(RESEARCH_ROOM_STRUCTURED_SELECT)
    .order('school_slug'),
  db.from('school_notion_backfill')
    .select('school_slug, status, parsed, raw_properties'),
  db.from('schools')
    .select('slug', { count: 'exact', head: true })
    .eq('country', 'United Kingdom'),
])
if (structuredError || notionError || ukDirectoryError) {
  throw new Error(
    structuredError?.message
    ?? notionError?.message
    ?? ukDirectoryError?.message,
  )
}

const structured = structuredRows ?? []
const slugs = structured.map(row => row.school_slug)
const { data: schoolRows, error: schoolError } = await db
  .from('schools')
  .select('slug, name, city, region, country, boarding, gender_split, distance_airport')
  .in('slug', slugs)
if (schoolError) throw new Error(schoolError.message)

const schoolBySlug = new Map((schoolRows ?? []).map(row => [row.slug, row]))
const notionBySlug = new Map(
  (notionRows ?? []).map(row => [row.school_slug, row as NotionBackfillRow]),
)

type AuditFailure = {
  school_slug: string
  row_name: string
  reason: string
}

const failures: AuditFailure[] = []
const generalCoverage = new Map(GENERAL_ROWS.map(row => [row, 0]))
const supportedCoverage = new Map(SUPPORTED_COMPARISONS.map(row => [row.label, 0]))
const generalCountsBySchool = new Map<string, number>()
const notionUsed = new Set<string>()

function usableValue(value: unknown): boolean {
  return (typeof value === 'string' && value.trim().length > 0)
    || (typeof value === 'number' && Number.isFinite(value))
}

function auditCell(
  school: DirectComparisonSchool,
  notion: NotionBackfillRow | null,
  rowName: string,
  kind: 'general' | 'supported',
): boolean {
  let cell
  try {
    cell = resolveAddedSchoolComparisonCell(rowName, school, notion)
  } catch (error) {
    failures.push({
      school_slug: school.slug,
      row_name: rowName,
      reason: error instanceof Error ? error.message : 'resolver threw',
    })
    return false
  }
  if (!cell) return false
  if (!usableValue(cell.value)) {
    failures.push({
      school_slug: school.slug,
      row_name: rowName,
      reason: 'resolver returned an unusable value',
    })
    return false
  }
  if (
    rowName === 'Travel from Heathrow'
    && !['location_profile', 'schools.distance_airport'].includes(cell.source ?? '')
  ) {
    failures.push({
      school_slug: school.slug,
      row_name: rowName,
      reason: `unexpected Heathrow source: ${cell.source ?? 'none'}`,
    })
  }
  if (
    rowName === 'Boarding fee · per term'
    && cell.source === 'school_structured_data.fees'
  ) {
    failures.push({
      school_slug: school.slug,
      row_name: rowName,
      reason: 'annual fee source leaked into the per-term row',
    })
  }
  if (cell.source?.startsWith('school_notion_backfill.')) notionUsed.add(school.slug)
  if (kind === 'general') {
    generalCoverage.set(rowName as typeof GENERAL_ROWS[number], (generalCoverage.get(
      rowName as typeof GENERAL_ROWS[number],
    ) ?? 0) + 1)
  } else {
    supportedCoverage.set(rowName, (supportedCoverage.get(rowName) ?? 0) + 1)
  }
  return true
}

for (const row of structured) {
  const meta = schoolBySlug.get(row.school_slug)
  if (!meta) {
    failures.push({
      school_slug: row.school_slug,
      row_name: '*',
      reason: 'structured row has no matching schools row',
    })
    continue
  }
  const school: DirectComparisonSchool = {
    ...meta,
    structured: row as unknown as Record<string, unknown>,
  }
  const notion = notionBySlug.get(row.school_slug) ?? null
  let generalCount = 0
  for (const rowName of GENERAL_ROWS) {
    if (auditCell(school, notion, rowName, 'general')) generalCount += 1
  }
  generalCountsBySchool.set(school.slug, generalCount)
  for (const comparison of SUPPORTED_COMPARISONS) {
    auditCell(school, notion, comparison.label, 'supported')
  }
}

const zeroGeneralSchools = [...generalCountsBySchool]
  .filter(([, count]) => count === 0)
  .map(([slug]) => slug)
const summary = {
  uk_directory_schools: ukDirectoryCount ?? 0,
  data_backed_schools: structured.length,
  comparison_ready_uk_schools: [...schoolBySlug.values()]
    .filter(school => school.country === 'United Kingdom').length,
  matching_school_records: schoolBySlug.size,
  approved_notion_rows: (notionRows ?? []).filter(row =>
    ['clean', 'matched'].includes(row.status),
  ).length,
  schools_using_notion_fallback: notionUsed.size,
  resolver_failures: failures.length,
  schools_with_zero_general_rows: zeroGeneralSchools.length,
  general_coverage: Object.fromEntries(generalCoverage),
  supported_coverage: Object.fromEntries(supportedCoverage),
}

console.log(JSON.stringify(
  process.argv.includes('--json')
    ? { ...summary, zero_general_schools: zeroGeneralSchools, failures }
    : summary,
  null,
  2,
))

if (
  schoolBySlug.size !== structured.length
  || failures.length > 0
  || zeroGeneralSchools.length > 0
) {
  process.exitCode = 1
}
