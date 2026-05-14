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
} from './umbrella-router.js'

export function umbrellasEnabled() {
  return process.env.NANA_UMBRELLA_V1 === 'on'
}

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

  const factTypes = unionIsiDeepFactTypes(umbrellas)
  if (factTypes.length === 0) {
    // Umbrellas matched but none need ISI deep data (e.g. money_value alone).
    // Profile-field injection happens via the existing schoolFacts retrieval
    // path; we don't duplicate that here.
    logUmbrellaTelemetry('build', slug, umbrellas, 0)
    return null
  }

  const { data: facts, error } = await supabase
    .from('school_facts')
    .select('fact_type, claim, evidence_quote, source_url')
    .eq('school_slug', slug)
    .eq('dimension', 'isi_deep')
    .eq('status', 'active')
    .in('fact_type', factTypes)

  if (error) {
    console.error('[umbrella:build] supabase error', error.message)
    return null
  }
  if (!facts?.length) {
    logUmbrellaTelemetry('build', slug, umbrellas, 0)
    return null
  }

  // De-dup by fact_type — schools sometimes have multiple inspections; keep the
  // first row per fact_type (Supabase returns insertion order by default).
  const seen = new Set()
  const unique = []
  for (const f of facts) {
    if (seen.has(f.fact_type)) continue
    seen.add(f.fact_type)
    unique.push(f)
  }

  const lines = [`── UMBRELLA CONTEXT (${umbrellas.join(' + ')}) ──`]
  lines.push(
    'The following ISI inspection facts are pre-loaded because this question matched the named umbrella concept(s). Cite these alongside any chunk-level evidence below using the exact source_url shown.',
  )
  const sources = []
  for (const f of unique) {
    const claim = typeof f.claim === 'object' && f.claim
      ? Object.entries(f.claim)
          .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(', ')
      : String(f.claim ?? '')
    const quote = f.evidence_quote
      ? ` — quote: "${f.evidence_quote.slice(0, 240)}"`
      : ''
    const src = f.source_url ? ` (source: ${f.source_url})` : ''
    lines.push(`• [${f.fact_type}] ${claim}${quote}${src}`)
    if (f.source_url) sources.push({ source_url: f.source_url, fact_type: f.fact_type })
  }
  lines.push('── END UMBRELLA ──')

  logUmbrellaTelemetry('build', slug, umbrellas, unique.length)
  return { block: lines.join('\n'), sources }
}

function logUmbrellaTelemetry(tag, slug, umbrellas, factCount) {
  console.log(
    `[umbrella:${tag}] slug=${slug} matched=[${umbrellas.join(',')}] isiFacts=${factCount}`,
  )
}
