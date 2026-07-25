import { createClient } from '@supabase/supabase-js'
import {
  SUPPORTED_COMPARISONS,
  isDatabaseOnlyComparison,
} from '../lib/research-room/comparison-catalog.ts'
import {
  resolveTrustedComparisonCell,
  type DirectComparisonSchool,
} from '../lib/research-room/direct-comparison-row.ts'

const EXPANSION_IDS = [
  'curriculum_qualifications',
  'admissions_assessment',
  'pastoral_wellbeing',
  'wellbeing_team',
  'boarding_life',
  'music',
  'clubs',
  'facilities',
  'languages',
  'scholarships',
] as const

const STRUCTURED_SELECT =
  'school_slug, curriculum, languages, scholarships_available, admissions_format, pastoral_care, pastoral_model, wellbeing_staffing, school_life, facilities' as const
const MIN_GLOBAL_COVERAGE = 0.3

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
}

const requestedSlugs = process.argv
  .find(argument => argument.startsWith('--slugs='))
  ?.slice('--slugs='.length)
  .split(',')
  .map(slug => slug.trim())
  .filter(Boolean)

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: structuredRows, error: structuredError } = await supabase
  .from('school_structured_data')
  .select(STRUCTURED_SELECT)
  .range(0, 999)
if (structuredError) throw structuredError

const availableStructuredRows = requestedSlugs?.length
  ? structuredRows.filter(row => requestedSlugs.includes(row.school_slug))
  : structuredRows
const slugs = availableStructuredRows.map(row => row.school_slug)
if (slugs.length === 0) throw new Error('No structured school rows matched the audit scope')

const { data: schoolRows, error: schoolsError } = await supabase
  .from('schools')
  .select('slug, name, city, region, boarding, gender_split')
  .in('slug', slugs)
  .range(0, 999)
if (schoolsError) throw schoolsError

const structuredBySlug = new Map(
  availableStructuredRows.map(row => [row.school_slug, row as Record<string, unknown>]),
)
const schools: DirectComparisonSchool[] = schoolRows.map(school => ({
  ...school,
  structured: structuredBySlug.get(school.slug) ?? null,
}))

console.log(`Research Room comparison audit: ${schools.length} schools`)
let failed = false
for (const id of EXPANSION_IDS) {
  const comparison = SUPPORTED_COMPARISONS.find(item => item.id === id)
  if (!comparison || !isDatabaseOnlyComparison(id)) {
    console.error(`${id}: catalogue configuration is incomplete`)
    failed = true
    continue
  }

  const cells = schools.map(school => ({
    school,
    cell: resolveTrustedComparisonCell(comparison.label, school),
  }))
  const filled = cells.filter(({ cell }) => cell?.value != null && cell.value !== '')
  const invalid = filled.filter(({ cell }) =>
    String(cell?.value ?? '').length > 80
    || String(cell?.note ?? '').length > 120
    || cell?.evidence_kind !== 'nana_database'
    || (id === 'admissions_assessment' && cell?.value === 'Application steps published')
    || (id === 'wellbeing_team' && !/\bstaff(?: member)?\b/i.test(String(cell?.value ?? '')))
    || (id === 'wellbeing_team' && /\broles?\b/i.test(String(cell?.value ?? ''))))
  const missing = cells
    .filter(({ cell }) => cell?.value == null || cell.value === '')
    .map(({ school }) => school.name)

  const coverageRatio = filled.length / schools.length
  const requiredCoverage = schools.length > 20 ? MIN_GLOBAL_COVERAGE : 0
  if (
    filled.length === 0
    || invalid.length > 0
    || coverageRatio < requiredCoverage
  ) failed = true
  const coverage = Math.round((filled.length / schools.length) * 100)
  console.log(
    `${comparison.label}: ${filled.length}/${schools.length} (${coverage}%)`
    + (missing.length > 0 && schools.length <= 20 ? `; needs checking: ${missing.join(', ')}` : ''),
  )
}

if (failed) process.exitCode = 1
