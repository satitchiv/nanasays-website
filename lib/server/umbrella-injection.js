/**
 * Umbrella context injection (2026-05-14)
 *
 * Mirrors the pack-prompt-injection.js pattern: env-flag-gated, additive, returns
 * a string block (or null) that the runner stitches into the LLM userMessage.
 *
 * When NANA_UMBRELLA_V1 != 'on', umbrellasEnabled() returns false and runners
 * skip the call entirely. No behavioral change for chat surfaces in that state.
 */

import {
  detectUmbrellas,
  unionIsiDeepFactTypes,
  unionProfileFields,
} from './umbrella-router.js'

export function umbrellasEnabled() {
  return process.env.NANA_UMBRELLA_V1 === 'on'
}

// Mirror of ALLOWED_FACT_FIELDS in tools.js so this module is safe to point at
// arbitrary unionProfileFields() output. Any field not in this set is dropped
// before the supabase projection, so a typo in umbrella-router.js can't expand
// the projected column list to something unintended.
const ALLOWED_PROFILE_FIELDS = new Set([
  'curriculum', 'languages', 'fees_min', 'fees_max', 'fees_currency', 'fees_by_grade',
  'scholarships_available', 'bursary_note', 'admissions_format', 'exam_results',
  'university_destinations', 'sports_profile', 'pastoral_care', 'pastoral_model',
  'wellbeing_staffing', 'student_community', 'school_life', 'policies_summary',
  'location_profile', 'facilities', 'staff', 'grade_levels', 'accreditations',
  'contacts', 'sixth_form_curriculum',
])

const PROFILE_FIELD_CHAR_CAP = 700
const PROFILE_BLOCK_CHAR_CAP = 6000

/**
 * Load ISI-deep facts matching the umbrella's fact_types for one school, then
 * format them as a context block.
 *
 * Returns null when flag is off, no umbrella matches, or no relevant ISI deep
 * facts exist for this school. Otherwise returns { block, sources } where:
 *   - block: string to splice into the LLM userMessage extras
 *   - sources: Array<{ source_url, fact_type }> — caller pushes these into
 *     retrieval.umbrella_sources so validateAnswer allowlists the URLs (else
 *     the validator's "URL not in retrieved chunks" gate fires and the UI
 *     hides the citations).
 *
 * The block format mirrors RESEARCH CONTEXT PACK delimiters so the LLM sees a
 * consistent "side context" structure.
 */
export async function buildUmbrellaContextString(supabase, slug, question) {
  if (!umbrellasEnabled()) return null
  if (!slug || !question) return null

  const umbrellas = detectUmbrellas(question)
  if (umbrellas.length === 0) return null

  // v1.1: load both ISI deep facts AND profile fields in parallel, then merge.
  // Either side can return [] independently — money_value has no ISI deep types
  // but rich profile fields; safety has both. The combined block fires whenever
  // at least one side yields something to render.
  const [isi, profile] = await Promise.all([
    loadIsiDeepFacts(supabase, slug, unionIsiDeepFactTypes(umbrellas)),
    loadProfileFields(supabase, slug, unionProfileFields(umbrellas)),
  ])

  const isiLines      = renderIsiFactLines(isi)
  const profileLines  = renderProfileFieldLines(profile)

  if (isiLines.length === 0 && profileLines.length === 0) {
    logUmbrellaTelemetry(slug, umbrellas, 0, 0)
    return null
  }

  const lines = [`── UMBRELLA CONTEXT (${umbrellas.join(' + ')}) ──`]
  lines.push(
    'The following facts are pre-loaded because this question matched the named umbrella concept(s). Cite alongside any chunk-level evidence below using the exact source_url shown.',
  )

  if (isiLines.length > 0) {
    lines.push('', 'ISI INSPECTION FACTS:')
    lines.push(...isiLines.formatted)
  }
  if (profileLines.length > 0) {
    lines.push('', 'PROFILE FIELDS:')
    lines.push(...profileLines.formatted)
  }
  lines.push('── END UMBRELLA ──')

  const sources = dedupSources([...isiLines.sources, ...profileLines.sources])

  logUmbrellaTelemetry(slug, umbrellas, isi.length, profileLines.fieldCount)
  return { block: lines.join('\n'), sources }
}

async function loadIsiDeepFacts(supabase, slug, factTypes) {
  if (factTypes.length === 0) return []
  const { data, error } = await supabase
    .from('school_facts')
    .select('fact_type, claim, evidence_quote, source_url')
    .eq('school_slug', slug)
    .eq('dimension', 'isi_deep')
    .eq('status', 'active')
    .in('fact_type', factTypes)
  if (error) {
    console.error('[umbrella:isi] supabase error', error.message)
    return []
  }
  // De-dup by fact_type — schools sometimes have multiple inspections; keep
  // the first row per fact_type (Supabase returns insertion order by default).
  const seen = new Set()
  const unique = []
  for (const f of (data || [])) {
    if (seen.has(f.fact_type)) continue
    seen.add(f.fact_type)
    unique.push(f)
  }
  return unique
}

async function loadProfileFields(supabase, slug, fields) {
  const safe = fields.filter((f) => ALLOWED_PROFILE_FIELDS.has(f))
  if (safe.length === 0) return { row: null, fields: [] }
  const cols = ['school_slug', ...safe].join(', ')
  const { data, error } = await supabase
    .from('school_structured_data')
    .select(cols)
    .eq('school_slug', slug)
    .maybeSingle()
  if (error) {
    console.error('[umbrella:profile] supabase error', error.message)
    return { row: null, fields: safe }
  }
  return { row: data || null, fields: safe }
}

function renderIsiFactLines(facts) {
  const formatted = []
  const sources = []
  for (const f of facts) {
    const claim = typeof f.claim === 'object' && f.claim
      ? Object.entries(f.claim)
          .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(', ')
      : String(f.claim ?? '')
    const quote = f.evidence_quote
      ? ` — quote: "${f.evidence_quote.slice(0, 240)}"`
      : ''
    const src = f.source_url ? ` (source: ${f.source_url})` : ''
    formatted.push(`• [${f.fact_type}] ${claim}${quote}${src}`)
    if (f.source_url) sources.push({ source_url: f.source_url, fact_type: f.fact_type })
  }
  return { formatted, sources, length: formatted.length }
}

function renderProfileFieldLines({ row, fields }) {
  if (!row || fields.length === 0) return { formatted: [], sources: [], length: 0, fieldCount: 0 }
  const formatted = []
  const sources = []
  let totalChars = 0
  let fieldCount = 0
  for (const field of fields) {
    const value = row[field]
    if (value == null) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue

    const rendered = renderFieldValue(value)
    if (!rendered) continue

    const line = `• [${field}] ${rendered}`
    if (totalChars + line.length > PROFILE_BLOCK_CHAR_CAP) {
      formatted.push(`• (${fields.length - fieldCount} more profile field(s) truncated for token budget)`)
      break
    }
    formatted.push(line)
    totalChars += line.length
    fieldCount += 1

    for (const url of extractSourceUrls(value)) {
      sources.push({ source_url: url, field })
    }
  }
  return { formatted, sources, length: formatted.length, fieldCount }
}

// Render one JSONB field value as a compact string for the LLM. Strips noisy
// keys (source URLs are surfaced via the line metadata and the validator
// allowlist, not the inline render), caps long strings, and falls back to
// truncated JSON for anything that doesn't have a more natural shape.
function renderFieldValue(value) {
  if (value == null) return null
  if (typeof value === 'string') return _truncate(value, PROFILE_FIELD_CHAR_CAP)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    if (value.every((v) => typeof v === 'string')) {
      return _truncate(value.join(', '), PROFILE_FIELD_CHAR_CAP)
    }
    return _truncate(JSON.stringify(value), PROFILE_FIELD_CHAR_CAP)
  }
  if (typeof value === 'object') {
    const omit = new Set(['source_url', 'source_urls', 'evidence_urls', 'evidence_quote', 'source_published_date'])
    const compact = {}
    for (const [k, v] of Object.entries(value)) {
      if (omit.has(k)) continue
      compact[k] = v
    }
    if (Object.keys(compact).length === 0) return null
    return _truncate(JSON.stringify(compact), PROFILE_FIELD_CHAR_CAP)
  }
  return null
}

// Recursively pull anything that looks like a URL out of a JSONB value. The
// schema across school_structured_data fields is irregular (source_url,
// source_urls[], evidence_urls[], bullying_policy_url, etc.), so we walk the
// whole tree rather than trying to enumerate per-field shapes.
function extractSourceUrls(value) {
  const out = []
  const visit = (v) => {
    if (v == null) return
    if (typeof v === 'string') {
      if (/^https?:\/\//.test(v)) out.push(v)
      return
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item)
      return
    }
    if (typeof v === 'object') {
      for (const inner of Object.values(v)) visit(inner)
    }
  }
  visit(value)
  return out
}

function dedupSources(sources) {
  const seen = new Set()
  const out = []
  for (const s of sources) {
    if (!s?.source_url || seen.has(s.source_url)) continue
    seen.add(s.source_url)
    out.push(s)
  }
  return out
}

function _truncate(str, max) {
  if (typeof str !== 'string') return str
  return str.length > max ? `${str.slice(0, max - 1)}…` : str
}

function logUmbrellaTelemetry(slug, umbrellas, isiFactCount, profileFieldCount) {
  console.log(
    `[umbrella:build] slug=${slug} matched=[${umbrellas.join(',')}] isiFacts=${isiFactCount} profileFields=${profileFieldCount}`,
  )
}
