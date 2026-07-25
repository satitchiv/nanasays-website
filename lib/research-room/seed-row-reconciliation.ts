export type GeneratedSeedRow = {
  idempotency_key: string
  group_name: string
  weight: number
  sort_order: number
  cell_data: Record<string, unknown>
}

export type ExistingSeedRow = {
  id: string
  idempotency_key: string | null
  group_name?: string
  weight?: number
  sort_order?: number
  cell_data?: Record<string, unknown> | null
}

export type SeedRowUpdate = {
  id: string
  values: Omit<GeneratedSeedRow, 'idempotency_key'>
}

export type SeedRowReconciliation = {
  updates: SeedRowUpdate[]
  hideIds: string[]
}

const DEPRECATED_SEED_KEYS = new Set([
  'seed:v1:general:school_name',
  'seed:v1:general:school_view',
])

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => item === undefined ? 'null' : stableJson(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`,
    ).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function hasSameValues(
  existing: ExistingSeedRow,
  generated: GeneratedSeedRow,
): boolean {
  return existing.group_name === generated.group_name
    && existing.weight === generated.weight
    && existing.sort_order === generated.sort_order
    && stableJson(existing.cell_data ?? {}) === stableJson(generated.cell_data)
}

/**
 * Existing active seed rows are managed snapshots. Refresh them from the
 * current structured + approved Notion data, but never reactivate a
 * soft-deleted row (soft-deleted rows are intentionally absent from input).
 */
export function planSeedRowReconciliation(
  existingRows: ExistingSeedRow[],
  generatedRows: GeneratedSeedRow[],
): SeedRowReconciliation {
  const generatedByKey = new Map(
    generatedRows.map(row => [row.idempotency_key, row]),
  )
  const updates: SeedRowUpdate[] = []
  const hideIds: string[] = []

  for (const existing of existingRows) {
    const key = existing.idempotency_key
    if (!key) continue
    const generated = generatedByKey.get(key)
    if (
      DEPRECATED_SEED_KEYS.has(key)
      || (generated && Object.keys(generated.cell_data).length === 0)
    ) {
      hideIds.push(existing.id)
      continue
    }
    if (!generated) continue
    if (hasSameValues(existing, generated)) continue
    const { idempotency_key: _key, ...values } = generated
    updates.push({ id: existing.id, values })
  }

  return { updates, hideIds }
}
