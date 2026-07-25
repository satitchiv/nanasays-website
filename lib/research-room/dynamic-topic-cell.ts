import type { DirectComparisonCell, DirectComparisonSchool } from './direct-comparison-row'
import { hasMeaningfulEvidenceValue } from './topic-evidence'

export type DatabaseTopicCatalogTopic = {
  id: string
  label: string
  evidence_paths: string[]
}

const METADATA_KEYS = new Set([
  'extracted_at',
  'evidence_url',
  'evidence_urls',
  'source_url',
  'source_urls',
  'model_used',
])

const MAX_VALUE_LENGTH = 180
const MAX_NOTE_LENGTH = 140

function valueAtPath(value: unknown, path: string): unknown {
  let current = value
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function compactText(value: string, maxLength: number): string {
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned
}

function scalarText(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim()
    return text.length > 0 ? text : null
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function compactObject(value: Record<string, unknown>): { value: string | null; note?: string } {
  const notes = scalarText(value.notes)
  if (notes) {
    const details = Object.entries(value)
      .filter(([key, nested]) => key !== 'notes' && !METADATA_KEYS.has(key.toLowerCase()) && scalarText(nested))
      .slice(0, 3)
      .map(([key, nested]) => `${key.replace(/_/g, ' ')}: ${scalarText(nested)}`)
    return {
      value: compactText(notes, MAX_VALUE_LENGTH),
      ...(details.length > 0 ? { note: compactText(details.join(' · '), MAX_NOTE_LENGTH) } : {}),
    }
  }

  const entries = Object.entries(value)
    .filter(([key, nested]) => !METADATA_KEYS.has(key.toLowerCase()) && hasMeaningfulEvidenceValue(nested))
    .slice(0, 5)
    .map(([key, nested]) => `${key.replace(/_/g, ' ')}: ${formatEvidenceValue(nested, MAX_VALUE_LENGTH)}`)
  return { value: entries.length > 0 ? compactText(entries.join(' · '), MAX_VALUE_LENGTH) : null }
}

function formatEvidenceValue(value: unknown, maxLength = MAX_VALUE_LENGTH): string {
  const scalar = scalarText(value)
  if (scalar) return compactText(scalar, maxLength)
  if (Array.isArray(value)) {
    const items = value
      .filter(item => hasMeaningfulEvidenceValue(item))
      .slice(0, 8)
      .map(item => {
        if (item && typeof item === 'object' && !Array.isArray(item)) return compactObject(item as Record<string, unknown>).value ?? ''
        return formatEvidenceValue(item, maxLength)
      })
      .filter(Boolean)
    return compactText(items.join('; '), maxLength)
  }
  if (value && typeof value === 'object') return compactObject(value as Record<string, unknown>).value ?? ''
  return ''
}

function formatDynamicCell(value: unknown, topic: DatabaseTopicCatalogTopic): DirectComparisonCell | null {
  if (!hasMeaningfulEvidenceValue(value)) return null
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const formatted = compactObject(value as Record<string, unknown>)
    if (!formatted.value) return null
    return {
      value: formatted.value,
      ...(formatted.note ? { note: formatted.note } : {}),
      source: `nana_database:${topic.id}`,
      evidence_kind: 'nana_database',
    }
  }
  const formatted = formatEvidenceValue(value)
  return formatted
    ? { value: formatted, source: `nana_database:${topic.id}`, evidence_kind: 'nana_database' }
    : null
}

export function resolveDatabaseTopicCell(
  topic: DatabaseTopicCatalogTopic,
  school: DirectComparisonSchool,
): DirectComparisonCell | null {
  for (const path of topic.evidence_paths) {
    const value = valueAtPath(school.structured, path)
    const cell = formatDynamicCell(value, topic)
    if (cell) return cell
  }
  return null
}
