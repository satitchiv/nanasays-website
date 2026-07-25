const EVIDENCE_METADATA_KEYS = new Set([
  'extracted_at',
  'evidence_url',
  'evidence_urls',
  'source_url',
  'source_urls',
  'model_used',
])

const EMPTY_EVIDENCE_MARKERS = new Set([
  'n/a',
  'na',
  'none',
  'null',
  'not available',
  'not known',
  'no data',
  'unknown',
])

/** True only when a value contains actual evidence, not extraction metadata. */
export function hasMeaningfulEvidenceValue(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized.length > 0 && !EMPTY_EVIDENCE_MARKERS.has(normalized)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(item => hasMeaningfulEvidenceValue(item))
  if (value == null || typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>)
    .some(([key, nestedValue]) => (
      !EVIDENCE_METADATA_KEYS.has(key.toLowerCase())
      && hasMeaningfulEvidenceValue(nestedValue)
    ))
}
