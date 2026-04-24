/**
 * provenance.ts — frontend mirror of scripts/lib/no-guess.js readers.
 *
 * Fields that went through the Phase-1 "never guess" enforcement are stored
 * as structured objects: { value, evidence, validation }. Legacy fields are
 * still raw scalars. These helpers let UI components consume either shape
 * without branching, and expose the provenance for display when present.
 */

export type ExtractionMethod =
  | 'deterministic_counter'
  | 'llm_extraction'
  | 'pdf_extraction'
  | 'manual'

export type ValidationStatus =
  | 'accepted'
  | 'pending'
  | 'not_found'
  | 'quote_mismatch'
  | 'no_evidence'
  | 'rejected'

export type Evidence = {
  url: string | null
  quote: string | null
  method: ExtractionMethod
  count_rule: string | null
  knowledge_id: string | null
  retrieved_at: string
}

export type Validation = {
  status: ValidationStatus
  quote_found: boolean | null
  extractor_version: string
  reason?: string
}

export type Provenanced<T> = {
  value: T | null
  evidence: Evidence | null
  validation: Validation
}

// Must mirror scripts/lib/no-guess.js (kept in sync by hand).
const EVIDENCE_METHODS = new Set<ExtractionMethod>([
  'deterministic_counter',
  'llm_extraction',
  'pdf_extraction',
  'manual',
])
const VALIDATION_STATUSES = new Set<ValidationStatus>([
  'accepted',
  'pending',
  'not_found',
  'quote_mismatch',
  'no_evidence',
  'rejected',
])

/**
 * Strict shape-check: only true for a proper Phase-1 provenanced fact, not
 * any old object that happens to have a `value` key. Mirror of backend.
 */
export function isProvenancedFact(v: unknown): boolean {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return false
  const obj = v as { value?: unknown; evidence?: unknown; validation?: unknown }
  if (!Object.prototype.hasOwnProperty.call(obj, 'value')) return false
  if (!Object.prototype.hasOwnProperty.call(obj, 'evidence')) return false
  if (!obj.validation || typeof obj.validation !== 'object' || Array.isArray(obj.validation)) return false
  const validation = obj.validation as { status?: ValidationStatus }
  if (!validation.status || !VALIDATION_STATUSES.has(validation.status)) return false
  if (obj.evidence == null) return validation.status === 'not_found'
  if (typeof obj.evidence !== 'object' || Array.isArray(obj.evidence)) return false
  const evidence = obj.evidence as { method?: ExtractionMethod }
  return !!(evidence.method && EVIDENCE_METHODS.has(evidence.method))
}

/**
 * Read the scalar value. Only unwraps a proper provenanced fact; a raw
 * scalar is returned as-is; a malformed object is returned as-is (so
 * downstream callers can see the broken shape rather than silently
 * receiving the bogus value key).
 */
export function readValue<T = unknown>(v: Provenanced<T> | T | null | undefined): T | null {
  if (v == null) return null
  if (isProvenancedFact(v)) return (v as Provenanced<T>).value
  return v as T
}

export function readEvidence(v: unknown): Evidence | null {
  if (!isProvenancedFact(v)) return null
  return ((v as Provenanced<unknown>).evidence) ?? null
}

export function readValidation(v: unknown): Validation | null {
  if (!isProvenancedFact(v)) return null
  return (v as Provenanced<unknown>).validation ?? null
}

/**
 * True if the value is a raw pre-Phase-1 scalar (no provenance attached).
 * Explicitly NOT true for:
 *   - null/undefined (no data, not "legacy")
 *   - proper Provenanced<T> objects (they have evidence, not legacy)
 *   - malformed objects with a `value` key but wrong shape (these are bugs,
 *     not legacy — UI should flag them loudly, not paper over as "legacy")
 */
export function isLegacyScalar(v: unknown): boolean {
  if (v == null) return false
  if (isProvenancedFact(v)) return false
  return typeof v !== 'object' || Array.isArray(v)
}

/**
 * Human-readable label for a provenance method. Used in UI chips/tooltips.
 */
export function methodLabel(method: ExtractionMethod | null | undefined): string {
  switch (method) {
    case 'deterministic_counter': return 'Counted from source'
    case 'llm_extraction':        return 'Extracted (AI + quote verified)'
    case 'pdf_extraction':        return 'Extracted from PDF'
    case 'manual':                return 'Manually verified'
    default:                      return 'Source unknown'
  }
}
