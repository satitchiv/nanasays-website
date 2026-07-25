import { createClient } from '@supabase/supabase-js'
import {
  approvedNotionBoardingEntry,
  approvedNotionFee,
  approvedNotionNumber,
  formatGbp,
  resolveNotionClassSize,
  resolvePupilComposition,
  type NotionBackfillRow,
} from '../lib/research-room/pupil-composition.ts'
import {
  resolveTrustedComparisonCell,
  type DirectComparisonSchool,
} from '../lib/research-room/direct-comparison-row.ts'
import {
  resolveHeathrowTravel,
} from '../lib/research-room/travel-data.ts'

type Cell = {
  value?: string | number | null
  note?: string
  source?: string
  [key: string]: unknown
}

type Row = {
  id: string
  row_name: string
  lens_kind: 'general' | 'child_fit' | 'chat'
  cell_data: Record<string, Cell> | null
}

const apply = process.argv.includes('--apply')
const anchorSlug = process.argv
  .find(argument => argument.startsWith('--anchor='))
  ?.slice('--anchor='.length) || 'wells-cathedral-school'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: anchor, error: anchorError } = await db
  .from('shortlisted_schools')
  .select('user_id, child_id')
  .eq('school_slug', anchorSlug)
  .order('added_at', { ascending: false })
  .limit(1)
  .maybeSingle()
if (anchorError || !anchor?.user_id || !anchor?.child_id) {
  throw new Error(anchorError?.message ?? `No shortlist found for ${anchorSlug}`)
}

const [{ data: session, error: sessionError }, { data: shortlist, error: shortlistError }] =
  await Promise.all([
    db.from('research_sessions')
      .select('id')
      .eq('user_id', anchor.user_id)
      .eq('child_id', anchor.child_id)
      .order('last_active_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('shortlisted_schools')
      .select('school_slug')
      .eq('user_id', anchor.user_id)
      .eq('child_id', anchor.child_id),
  ])
if (sessionError || !session?.id) throw new Error(sessionError?.message ?? 'No session found')
if (shortlistError) throw new Error(shortlistError.message)

const slugs = (shortlist ?? []).map(row => row.school_slug)
const [
  { data: schoolRows, error: schoolError },
  { data: structuredRows, error: structuredError },
  { data: notionRows, error: notionError },
  { data: rows, error: rowsError },
] = await Promise.all([
  db.from('schools')
    .select('slug, name, city, region, boarding, gender_split, distance_airport')
    .in('slug', slugs),
  db.from('school_structured_data').select('*').in('school_slug', slugs),
  db.from('school_notion_backfill')
    .select('school_slug, status, parsed, raw_properties')
    .in('school_slug', slugs),
  db.from('comparison_rows')
    .select('id, row_name, lens_kind, cell_data')
    .eq('user_id', anchor.user_id)
    .eq('session_id', session.id)
    .is('undone_at', null),
])
if (schoolError || structuredError || notionError || rowsError) {
  throw new Error(
    schoolError?.message
    ?? structuredError?.message
    ?? notionError?.message
    ?? rowsError?.message,
  )
}

const structuredBySlug = new Map(
  (structuredRows ?? []).map(row => [row.school_slug, row as Record<string, unknown>]),
)
const notionBySlug = new Map(
  (notionRows ?? []).map(row => [row.school_slug, row as NotionBackfillRow]),
)
const schools = new Map<string, DirectComparisonSchool>(
  (schoolRows ?? []).map(school => [
    school.slug,
    {
      ...school,
      structured: structuredBySlug.get(school.slug) ?? null,
    },
  ]),
)

function sameCell(left: Cell | null | undefined, right: Cell): boolean {
  return left?.value === right.value
    && left?.note === right.note
    && left?.source === right.source
}

function heathrowCell(slug: string): Cell | null {
  const structured = structuredBySlug.get(slug)
  const profile = structured?.location_profile
  const airports = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? (profile as Record<string, unknown>).airports
    : null
  return resolveHeathrowTravel(
    airports,
    schools.get(slug)?.distance_airport,
  )
}

function feeTerm(structured: Record<string, unknown>, notion: NotionBackfillRow | null): Cell | null {
  const fees = structured.fees_by_grade
  const record = fees && typeof fees === 'object' && !Array.isArray(fees)
    ? fees as Record<string, unknown>
    : null
  let maximum: number | null = null
  for (const raw of Array.isArray(record?.rows) ? record.rows : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const row = raw as Record<string, unknown>
    const phase = String(row.phase ?? '').toLowerCase()
    if (!/boarding|7 nights/.test(phase) || /flexi/.test(phase)) continue
    const amount = typeof row.per_term === 'number'
      ? row.per_term
      : Number(row.per_term)
    if (Number.isFinite(amount) && amount > 0 && (maximum == null || amount > maximum)) {
      maximum = amount
    }
  }
  if (maximum != null) {
    const currency = record?.currency ?? structured.fees_currency
    const symbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : ''
    return { value: `${symbol}${Math.round(maximum).toLocaleString()}`, source: 'fees_by_grade' }
  }
  const sidecar = approvedNotionFee(notion, 'boarding_fee_term')
  return sidecar == null
    ? null
    : { value: formatGbp(sidecar), source: 'school_notion_backfill.parsed.boarding_fee_term' }
}

function annualFee(structured: Record<string, unknown>, notion: NotionBackfillRow | null): Cell | null {
  const min = typeof structured.fees_min === 'number' ? structured.fees_min : null
  const max = typeof structured.fees_max === 'number' ? structured.fees_max : null
  if (min != null || max != null) {
    const symbol = structured.fees_currency === 'USD'
      ? '$'
      : structured.fees_currency === 'GBP' ? '£' : ''
    const format = (value: number) => `${symbol}${value.toLocaleString()}`
    return {
      value: min != null && max != null && min !== max
        ? `${format(min)}–${format(max)}`
        : format(min ?? max!),
      source: 'school_structured_data.fees',
    }
  }
  const sidecar = approvedNotionFee(notion, 'boarding_fee_year')
  return sidecar == null
    ? null
    : { value: formatGbp(sidecar), source: 'school_notion_backfill.parsed.boarding_fee_year' }
}

function resolveManagedCell(rowName: string, slug: string): Cell | null {
  const structured = structuredBySlug.get(slug) ?? {}
  const notion = notionBySlug.get(slug) ?? null
  const community = structured.student_community
  const communityRecord = community && typeof community === 'object' && !Array.isArray(community)
    ? community as Record<string, unknown>
    : null

  if (rowName === 'Class size') return resolveNotionClassSize(notion)
  if (rowName === 'Lowest boarding entry') {
    const entry = approvedNotionBoardingEntry(notion)
    return entry == null
      ? null
      : { value: `Year ${entry.year}`, source: entry.source }
  }
  if (rowName === 'Total pupils') {
    const structuredTotal = typeof communityRecord?.total_pupils === 'number'
      ? communityRecord.total_pupils
      : null
    const total = structuredTotal ?? approvedNotionNumber(notion, 'total_pupils')
    if (total == null) return null
    const bucket = total <= 400 ? 'Small' : total <= 800 ? 'Mid-size' : total <= 1200 ? 'Larger' : 'Very large'
    return {
      value: `~${total.toLocaleString()}`,
      note: bucket,
      source: structuredTotal == null
        ? 'school_notion_backfill.parsed.total_pupils'
        : 'student_community.total_pupils',
    }
  }

  if (['Boarding pupils', 'International pupils', 'Day pupils', 'Boarding ratio', 'Boarding mix'].includes(rowName)) {
    const result = resolvePupilComposition(structured, notion)
    if (result.status !== 'ready') return null
    const value = result.composition
    if (rowName === 'Boarding pupils') {
      return {
        value: `~${value.boarding.toLocaleString()}`,
        note: `${value.boardingPct}% of pupils`,
        source: `${value.source}.boarding`,
      }
    }
    if (rowName === 'International pupils') {
      return value.international == null ? null : {
        value: `~${value.international.toLocaleString()}`,
        note: value.internationalPct == null ? undefined : `${value.internationalPct}% of pupils`,
        source: `${value.source}.international`,
      }
    }
    if (rowName === 'Day pupils') {
      return {
        value: `~${value.day.toLocaleString()}`,
        note: `${value.dayPct}% of pupils`,
        source: `${value.source}.day`,
      }
    }
    return {
      value: `${value.boardingPct}% boarding · ${value.dayPct}% day`,
      source: `${value.source}.boarding_mix`,
    }
  }

  const examResults = structured.exam_results
  const exam = examResults && typeof examResults === 'object' && !Array.isArray(examResults)
    ? examResults as Record<string, unknown>
    : null
  if (rowName === 'GCSE 9–7') {
    const gcse = exam?.gcse && typeof exam.gcse === 'object' && !Array.isArray(exam.gcse)
      ? exam.gcse as Record<string, unknown>
      : null
    const pct = typeof gcse?.pct_7_to_9 === 'number'
      ? gcse.pct_7_to_9
      : approvedNotionNumber(notion, 'gcse_pct')
    return pct == null ? null : {
      value: `${Math.round(pct)}%`,
      source: typeof gcse?.pct_7_to_9 === 'number'
        ? 'exam_results.gcse'
        : 'school_notion_backfill.parsed.gcse_pct',
    }
  }
  if (rowName === 'A-level A*–A') {
    const level = exam?.a_level && typeof exam.a_level === 'object' && !Array.isArray(exam.a_level)
      ? exam.a_level as Record<string, unknown>
      : null
    const pct = typeof level?.pct_a_star_a === 'number'
      ? level.pct_a_star_a
      : approvedNotionNumber(notion, 'a_level_pct')
    return pct == null ? null : {
      value: `${Math.round(pct)}%`,
      source: typeof level?.pct_a_star_a === 'number'
        ? 'exam_results.a_level'
        : 'school_notion_backfill.parsed.a_level_pct',
    }
  }
  if (rowName === 'Boarding fee · per term') return feeTerm(structured, notion)
  if (rowName === 'Boarding fee · per year') return annualFee(structured, notion)
  return null
}

const changes: Array<{ row: Row; cells: Record<string, Cell>; notes: string[] }> = []
let hideSchoolView = false

for (const row of (rows ?? []) as Row[]) {
  if (row.row_name === 'School view' && row.lens_kind === 'general') {
    hideSchoolView = true
    continue
  }
  const next = { ...(row.cell_data ?? {}) }
  const notes: string[] = []

  for (const slug of slugs) {
    let current = next[slug]
    if (row.row_name === 'Travel from Heathrow') {
      const expected = heathrowCell(slug)
      const trusted = expected
        ? sameCell(current, expected)
        : current?.source === 'location_profile'
      if (current?.value != null && !trusted) {
        delete next[slug]
        current = undefined
        notes.push(`${slug}: removed non-Heathrow fallback`)
      }
      if (current?.value == null && expected) {
        next[slug] = expected
        notes.push(`${slug}: filled from ${expected.source}`)
      }
    }
    if (
      row.row_name === 'Lowest boarding entry'
      && current?.value != null
      && !/^(admissions_format|school_life|school_notion_backfill)\./.test(current.source ?? '')
    ) {
      delete next[slug]
      notes.push(`${slug}: removed unscoped boarding-entry fallback`)
      continue
    }

    const managed = row.lens_kind === 'general'
      ? resolveManagedCell(row.row_name, slug)
      : null
    if (managed && !sameCell(current, managed)) {
      next[slug] = managed
      notes.push(`${slug}: refreshed managed value`)
      continue
    }

    if (row.lens_kind === 'chat' && (current?.value == null || current.value === '')) {
      const school = schools.get(slug)
      const direct = school ? resolveTrustedComparisonCell(row.row_name, school) : null
      if (direct?.value != null && direct.value !== '') {
        next[slug] = direct
        notes.push(`${slug}: filled from structured data`)
      }
    }
  }

  if (notes.length > 0) changes.push({ row, cells: next, notes })
}

console.log(`Research Room repair (${apply ? 'APPLY' : 'DRY RUN'})`)
for (const change of changes) {
  console.log(`${change.row.row_name}: ${change.notes.join('; ')}`)
}
if (hideSchoolView) console.log('School view: hide all-empty seeded row')
console.log(`${changes.length} rows to update; ${hideSchoolView ? 1 : 0} row to hide.`)

if (!apply) process.exit(0)

let updated = 0
for (const change of changes) {
  const { error } = await db.from('comparison_rows')
    .update({ cell_data: change.cells })
    .eq('id', change.row.id)
    .eq('user_id', anchor.user_id)
    .is('undone_at', null)
  if (error) throw new Error(`Row update failed: ${error.message}`)
  updated += 1
}
if (hideSchoolView) {
  const { error } = await db.from('comparison_rows')
    .update({ undone_at: new Date().toISOString() })
    .eq('user_id', anchor.user_id)
    .eq('session_id', session.id)
    .eq('lens_kind', 'general')
    .eq('row_name', 'School view')
    .is('undone_at', null)
  if (error) throw new Error(`School view cleanup failed: ${error.message}`)
}
console.log(`Repair complete: ${updated} rows updated; ${hideSchoolView ? 1 : 0} empty row hidden.`)
