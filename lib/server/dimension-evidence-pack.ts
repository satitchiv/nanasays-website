// T4.17 — shared evidence-pack reader for school_fact_projections.
//
// One narrow async function consumed by:
//   - assembleResearchContextPack (chatbot, behind NANA_PACK_V1=on)
//   - the Research Room topic-lens projector (T4.18, NANA_TOPIC_LENS_FACTS=on)
//
// Codex-blessed design 2026-05-08 (transcript: /tmp/codex-t417-design-result.txt).

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Currently-trusted projector versions per dimension. Bump only when a new
 * projector version has been smoke-tested in dev. Code-as-config is intentional
 * so version drift requires a deploy, not a runtime DB write.
 */
export const KNOWN_PROJECTION_VERSIONS: Record<string, string> = {
  rugby: 'rugby-projector@1.1.0',
}

export type DimensionEvidencePack = {
  slug: string
  dimension: string
  projection_version: string
  /** Typed projection from quality.projection (canonical 18-key shape for rugby). */
  projection: Record<string, unknown>
  /** Full quality JSONB — includes evidence_urls, extras, partnerships, etc. */
  quality: Record<string, unknown>
  projected_at: string
}

/**
 * Read the latest successful projection for (slug, dimension) at the
 * currently-trusted projection_version.
 *
 * Returns null when:
 *   - dimension is not in KNOWN_PROJECTION_VERSIONS (no trusted version)
 *   - no row at the trusted version with status='success'
 *   - row exists but quality.projection is missing/empty
 *
 * Behaviour-preserving for the chatbot pack assembler today: all 110 rugby
 * schools have v1.1.0 rows after the 2026-05-08 skip-bug fix
 * (commit 0eaa11f), so the version filter is effectively a no-op for
 * coverage but defends against future v1.0.0 regressions.
 */
export async function loadDimensionEvidencePack(
  supabase: SupabaseClient,
  slug: string,
  dimension: string,
): Promise<DimensionEvidencePack | null> {
  const knownVersion = KNOWN_PROJECTION_VERSIONS[dimension]
  if (!knownVersion) return null

  const { data, error } = await supabase
    .from('school_fact_projections')
    .select('id, dimension, projection_version, quality, projected_at')
    .eq('school_slug', slug)
    .eq('dimension', dimension)
    .eq('projection_version', knownVersion)
    .eq('status', 'success')
    .order('projected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const quality = (data as any).quality as Record<string, unknown> | null
  if (!quality) return null

  const projection = quality.projection as Record<string, unknown> | undefined
  if (!projection || Object.keys(projection).length === 0) return null

  return {
    slug,
    dimension,
    projection_version: (data as any).projection_version,
    projection,
    quality,
    projected_at: (data as any).projected_at,
  }
}
