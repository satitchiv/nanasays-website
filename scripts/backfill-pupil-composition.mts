import { createClient } from '@supabase/supabase-js'
import {
  resolveNotionClassSize,
  resolvePupilComposition,
  type NotionBackfillRow,
} from '../lib/research-room/pupil-composition.ts'

type StoredCell = {
  value?: string | number | null
  source?: string | null
  note?: string
}

type ComparisonRow = {
  id: string
  row_name: string
  cell_data: Record<string, StoredCell> | null
}

const TARGET_ROWS = [
  'Class size',
  'Boarding pupils',
  'International pupils',
  'Day pupils',
  'Boarding ratio',
  'Boarding mix',
] as const

const apply = process.argv.includes('--apply')
const anchorSlug = process.argv
  .find(argument => argument.startsWith('--anchor='))
  ?.slice('--anchor='.length) || 'wells-cathedral-school'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: anchor, error: anchorError } = await supabase
  .from('shortlisted_schools')
  .select('user_id, child_id')
  .eq('school_slug', anchorSlug)
  .order('added_at', { ascending: false })
  .limit(1)
  .maybeSingle()
if (anchorError) throw new Error(`Anchor shortlist lookup failed: ${anchorError.message}`)
if (!anchor?.user_id || !anchor?.child_id) {
  throw new Error(`No child shortlist found for anchor school ${anchorSlug}`)
}

const [{ data: session, error: sessionError }, { data: shortlist, error: shortlistError }] =
  await Promise.all([
    supabase
      .from('research_sessions')
      .select('id')
      .eq('user_id', anchor.user_id)
      .eq('child_id', anchor.child_id)
      .order('last_active_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('shortlisted_schools')
      .select('school_slug')
      .eq('user_id', anchor.user_id)
      .eq('child_id', anchor.child_id),
  ])
if (sessionError) throw new Error(`Research session lookup failed: ${sessionError.message}`)
if (shortlistError) throw new Error(`Shortlist lookup failed: ${shortlistError.message}`)
if (!session?.id) throw new Error('No Research Room session found for the pilot shortlist')

const slugs = (shortlist ?? []).map(row => row.school_slug)
if (slugs.length === 0) throw new Error('The pilot shortlist is empty')

const [
  { data: schools, error: schoolsError },
  { data: structuredRows, error: structuredError },
  { data: notionRows, error: notionError },
  { data: comparisonRows, error: comparisonError },
] = await Promise.all([
  supabase.from('schools').select('slug, name').in('slug', slugs),
  supabase
    .from('school_structured_data')
    .select('school_slug, student_community, school_life')
    .in('school_slug', slugs),
  supabase
    .from('school_notion_backfill')
    .select('school_slug, status, parsed')
    .in('school_slug', slugs),
  supabase
    .from('comparison_rows')
    .select('id, row_name, cell_data')
    .eq('user_id', anchor.user_id)
    .eq('session_id', session.id)
    .is('undone_at', null)
    .in('row_name', [...TARGET_ROWS]),
])
if (schoolsError) throw new Error(`School lookup failed: ${schoolsError.message}`)
if (structuredError) throw new Error(`Structured-data lookup failed: ${structuredError.message}`)
if (notionError) throw new Error(`Notion sidecar lookup failed: ${notionError.message}`)
if (comparisonError) throw new Error(`Comparison-row lookup failed: ${comparisonError.message}`)

const schoolName = new Map((schools ?? []).map(school => [school.slug, school.name]))
const structured = new Map(
  (structuredRows ?? []).map(row => [
    row.school_slug,
    row as Record<string, unknown>,
  ]),
)
const notion = new Map(
  (notionRows ?? []).map(row => [
    row.school_slug,
    row as NotionBackfillRow,
  ]),
)

function hasValue(cell: StoredCell | null | undefined): boolean {
  return cell?.value != null && cell.value !== ''
}

function resolveCell(rowName: string, slug: string): StoredCell | null {
  if (rowName === 'Class size') {
    return resolveNotionClassSize(notion.get(slug) ?? null)
  }

  const result = resolvePupilComposition(
    structured.get(slug) ?? null,
    notion.get(slug) ?? null,
  )
  if (result.status !== 'ready') return null
  const value = result.composition
  switch (rowName) {
    case 'Boarding pupils':
      return {
        value: `~${value.boarding.toLocaleString()}`,
        note: `${value.boardingPct}% of pupils`,
        source: `${value.source}.boarding`,
      }
    case 'International pupils':
      return value.international == null
        ? null
        : {
            value: `~${value.international.toLocaleString()}`,
            note: value.internationalPct == null
              ? undefined
              : `${value.internationalPct}% of pupils`,
            source: `${value.source}.international`,
          }
    case 'Day pupils':
      return {
        value: `~${value.day.toLocaleString()}`,
        note: `${value.dayPct}% of pupils`,
        source: `${value.source}.day`,
      }
    case 'Boarding ratio':
    case 'Boarding mix':
      return {
        value: `${value.boardingPct}% boarding · ${value.dayPct}% day`,
        source: `${value.source}.boarding_mix`,
      }
    default:
      return null
  }
}

type PlannedFill = {
  row: ComparisonRow
  slug: string
  cell: StoredCell
  previous: StoredCell | null
  action: 'fill' | 'refresh'
}

function managedCell(cell: StoredCell | null | undefined): boolean {
  return typeof cell?.source === 'string'
    && /^(school_structured_data|school_notion_backfill)\./.test(cell.source)
}

function sameCell(left: StoredCell | null | undefined, right: StoredCell): boolean {
  return left?.value === right.value
    && left?.note === right.note
    && left?.source === right.source
}

const planned: PlannedFill[] = []
const rows = (comparisonRows ?? []) as ComparisonRow[]
for (const row of rows) {
  for (const slug of slugs) {
    const cell = resolveCell(row.row_name, slug)
    if (!cell) continue
    const previous = row.cell_data?.[slug] ?? null
    if (!hasValue(previous)) {
      planned.push({ row, slug, cell, previous, action: 'fill' })
    } else if (managedCell(previous) && !sameCell(previous, cell)) {
      planned.push({ row, slug, cell, previous, action: 'refresh' })
    }
  }
}

console.log(`Pupil-composition pilot (${apply ? 'APPLY' : 'DRY RUN'})`)
console.log(`Shortlist: ${slugs.length} schools; existing target rows: ${rows.length}`)

for (const slug of slugs) {
  const result = resolvePupilComposition(
    structured.get(slug) ?? null,
    notion.get(slug) ?? null,
  )
  if (result.reasons.length > 0) {
    console.log(
      `Review note — ${schoolName.get(slug) ?? slug}: ${result.reasons.join('; ')}`,
    )
  }
}

if (planned.length === 0) {
  console.log('No missing cells can be safely filled.')
  process.exit(0)
}

for (const item of planned) {
  console.log(
    `${apply ? item.action === 'fill' ? 'Fill' : 'Refresh' : `Would ${item.action}`}`
    + ` — ${schoolName.get(item.slug) ?? item.slug}`
    + ` / ${item.row.row_name}: ${item.cell.value}`,
  )
}

if (!apply) {
  console.log(`Dry run complete: ${planned.length} safe fills; no database writes.`)
  process.exit(0)
}

let filled = 0
let preserved = 0
let failed = 0
for (const item of planned) {
  const { data: latest, error: latestError } = await supabase
    .from('comparison_rows')
    .select('cell_data')
    .eq('id', item.row.id)
    .eq('user_id', anchor.user_id)
    .is('undone_at', null)
    .maybeSingle()
  if (latestError || !latest) {
    failed += 1
    continue
  }

  const latestCells = (latest.cell_data ?? {}) as Record<string, StoredCell>
  const latestCell = latestCells[item.slug]
  const changedSinceRead = item.action === 'fill'
    ? hasValue(latestCell)
    : !sameCell(latestCell, item.previous ?? {})
  if (changedSinceRead) {
    preserved += 1
    continue
  }

  const { data: updated, error: updateError } = await supabase
    .from('comparison_rows')
    .update({
      cell_data: {
        ...latestCells,
        [item.slug]: item.cell,
      },
    })
    .eq('id', item.row.id)
    .eq('user_id', anchor.user_id)
    .is('undone_at', null)
    .select('id')
    .maybeSingle()
  if (updateError || !updated) {
    failed += 1
  } else {
    filled += 1
  }
}

console.log(`Apply complete: ${filled} filled, ${preserved} concurrently preserved, ${failed} failed.`)
if (failed > 0) process.exitCode = 1
