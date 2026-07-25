import { matchComparisonRequest } from './comparison-catalog.ts'

export type ComparisonIdentityRow = {
  row_name: string
  lens_kind: string
  created_by_lens_id?: string | null
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function comparisonSemanticKey(rowName: string): string {
  const match = matchComparisonRequest(rowName)
  return match.kind === 'supported'
    ? `supported:${match.id}`
    : `topic:${normalize(match.canonicalTopic)}`
}

export function comparisonDisplayLabel(
  rowName: string,
  lensKind: string,
): string {
  // Seeded/base rows often carry a more precise unit or scope than the
  // autocomplete catalogue. For example, per-term and per-year boarding
  // fees both map to the broad "Boarding fees" topic. Keep those labels.
  if (lensKind !== 'chat') return rowName
  const match = matchComparisonRequest(rowName)
  return match.kind === 'supported' ? match.label : rowName
}

export function removeComparisonRowDuplicates<T extends ComparisonIdentityRow>(
  rows: T[],
  baseLens: string,
  activeLensId: string | null = null,
): T[] {
  // Historical topic lenses can contain a lens-specific row with exactly the
  // same label as an unscoped base row. Keep one, preferring the active
  // lens-specific version. Do not canonicalize base-to-base comparisons:
  // "Boarding fee · per term" and "· per year" are intentionally distinct.
  const baseRows: T[] = []
  const baseIndexByName = new Map<string, number>()
  for (const row of rows) {
    if (row.lens_kind !== baseLens) continue
    const name = normalize(row.row_name)
    const existingIndex = baseIndexByName.get(name)
    if (existingIndex == null) {
      baseIndexByName.set(name, baseRows.length)
      baseRows.push(row)
      continue
    }
    const existing = baseRows[existingIndex]
    const candidateIsActive = activeLensId != null
      && row.created_by_lens_id === activeLensId
    const existingIsActive = activeLensId != null
      && existing?.created_by_lens_id === activeLensId
    if (candidateIsActive && !existingIsActive) baseRows[existingIndex] = row
  }

  const baseKeys = new Set(
    baseRows.map(row => comparisonSemanticKey(row.row_name)),
  )
  const seenChatKeys = new Set<string>()
  const chatRows = rows.filter(row => {
    if (row.lens_kind !== 'chat') return false
    const key = comparisonSemanticKey(row.row_name)
    if (baseKeys.has(key) || seenChatKeys.has(key)) return false
    seenChatKeys.add(key)
    return true
  })

  return [...baseRows, ...chatRows]
}
