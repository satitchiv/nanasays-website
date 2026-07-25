// Slice 8 Build 2 r4 — canonical JSON stringify.
//
// Pure function. Returns a stable string representation of any
// JSON-serializable value with all object keys sorted recursively. Used
// by the seed-rows reconcile loop to compare app-built spec.cell_data
// against Postgres jsonb-round-tripped row.cell_data without false
// positives from key-order differences.
//
// Why this matters: Postgres `jsonb` (note: not `json`) does NOT
// preserve insertion order. A value `{a: 1, b: 2}` may come back as
// `{"b": 2, "a": 1}` depending on Postgres's internal representation.
// Plain JSON.stringify on both sides would flag those as different and
// trigger an unnecessary UPDATE on every page load.
//
// Arrays are compared in index order (their semantics depend on
// position, unlike object keys). Primitives use their natural JSON
// representation. `undefined` is treated like JSON.stringify treats it:
// object values become absent, array elements become null.

export function canonicalJson(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v)
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) {
    return '[' + v.map(item => canonicalJson(item)).join(',') + ']'
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort()
    const parts: string[] = []
    for (const k of keys) {
      const val = (v as Record<string, unknown>)[k]
      if (val === undefined) continue  // mirror JSON.stringify on undefined values
      parts.push(JSON.stringify(k) + ':' + canonicalJson(val))
    }
    return '{' + parts.join(',') + '}'
  }
  // Functions, symbols, bigints — not expected in cell_data. Mirror
  // JSON.stringify: return 'null' for unsupported types to keep callers
  // safe rather than throw.
  return 'null'
}
