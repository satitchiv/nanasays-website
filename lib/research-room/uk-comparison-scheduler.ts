export type SchedulerCell = {
  value?: string | number | null
  source?: string | null
  note?: string | null
  checked_at?: string | null
  evidence_kind?: 'nana_database' | 'web_search'
}

export type SchedulerComparisonRow = {
  id: string
  row_name: string
  cell_data: Record<string, SchedulerCell> | null
}

export type SchedulerRowPlan = {
  row_id: string
  changed: boolean
  cell_data: Record<string, SchedulerCell>
  filled_cells: Record<string, SchedulerCell>
  cells_filled: number
  cells_preserved: number
  cells_unfilled: number
  rejected_candidates: number
  issues: string[]
}

export type SchedulerRunMode = 'dry-run' | 'apply'

export function hasSchedulerCellValue(
  cell: SchedulerCell | null | undefined,
): boolean {
  return (typeof cell?.value === 'string' && cell.value.trim().length > 0)
    || (typeof cell?.value === 'number' && Number.isFinite(cell.value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function asCell(value: unknown): SchedulerCell | null {
  return isRecord(value) ? value as SchedulerCell : null
}

/**
 * Merge only verified database cells into an existing Research Room row.
 *
 * A populated cell is an existing fact owned by a parent or an earlier
 * trusted/researched pass. Keeping it is deliberate: it protects stronger
 * evidence (including a sourced web-research cell) from being replaced by a
 * scheduler snapshot. Empty placeholders may be filled, but never with a
 * web-search candidate.
 */
export function planSchedulerRowUpdate({
  row,
  schoolSlugs,
  resolveCell,
  checkedAt,
}: {
  row: SchedulerComparisonRow
  schoolSlugs: readonly string[]
  resolveCell: (rowName: string, schoolSlug: string) => SchedulerCell | null
  checkedAt: string
}): SchedulerRowPlan {
  const original = row.cell_data
  if (!isRecord(original)) {
    return {
      row_id: row.id,
      changed: false,
      cell_data: {},
      filled_cells: {},
      cells_filled: 0,
      cells_preserved: 0,
      cells_unfilled: 0,
      rejected_candidates: 0,
      issues: ['comparison row cell_data is not an object'],
    }
  }

  const cellData = { ...original } as Record<string, SchedulerCell>
  const filledCells: Record<string, SchedulerCell> = {}
  let cellsFilled = 0
  let cellsPreserved = 0
  let cellsUnfilled = 0
  let rejectedCandidates = 0
  const issues: string[] = []

  for (const schoolSlug of Array.from(new Set(schoolSlugs)).sort()) {
    const existing = asCell(cellData[schoolSlug])
    if (hasSchedulerCellValue(existing)) {
      cellsPreserved += 1
      continue
    }

    let candidate: SchedulerCell | null
    try {
      candidate = resolveCell(row.row_name, schoolSlug)
    } catch (error) {
      cellsUnfilled += 1
      issues.push(`${schoolSlug}: ${error instanceof Error ? error.message : 'resolver threw'}`)
      continue
    }

    if (!candidate || !hasSchedulerCellValue(candidate)) {
      cellsUnfilled += 1
      continue
    }
    if (candidate.evidence_kind === 'web_search') {
      cellsUnfilled += 1
      rejectedCandidates += 1
      issues.push(`${schoolSlug}: web-search evidence rejected by UK scheduler`)
      continue
    }

    cellData[schoolSlug] = {
      ...candidate,
      checked_at: candidate.checked_at ?? checkedAt,
      evidence_kind: 'nana_database',
    }
    filledCells[schoolSlug] = cellData[schoolSlug]
    cellsFilled += 1
  }

  return {
    row_id: row.id,
    changed: cellsFilled > 0,
    cell_data: cellData,
    filled_cells: filledCells,
    cells_filled: cellsFilled,
    cells_preserved: cellsPreserved,
    cells_unfilled: cellsUnfilled,
    rejected_candidates: rejectedCandidates,
    issues,
  }
}

export function scheduledRunKey(date: Date): string {
  const bucketHour = date.getUTCHours() < 12 ? 0 : 12
  const bucket = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    bucketHour,
  ))
  return `slot:${bucket.toISOString()}`
}

export function manualRunKey(date: Date, nonce = Math.random().toString(36).slice(2)): string {
  return `manual:${date.toISOString()}:${nonce}`
}
