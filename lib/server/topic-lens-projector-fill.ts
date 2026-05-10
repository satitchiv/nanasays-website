// T4.18 — post-validation projector-fill for propose_create_topic_lens.
//
// Runs after extractProposedActionsTwoPass returns a validated topic-lens
// proposal. Pre-fetches school_fact_projections for the shortlist once,
// then walks each embedded_row's cell_data and fills slugs whose value
// is null with deterministic projection-derived cells.
//
// Behaviour:
//   - Existing LLM-emitted cells with non-null values are PRESERVED (never overwritten).
//   - Only null/missing slug entries are candidates for projector fill.
//   - Per-dimension support gated by KNOWN_PROJECTION_VERSIONS in
//     dimension-evidence-pack.ts. Today: rugby only.
//   - Flag-gated by NANA_TOPIC_LENS_FACTS=on. When off, this is a no-op.
//   - Uses Promise.allSettled so a single bad lookup degrades to null-fill,
//     never throws into the chat path.
//
// Codex-blessed design 2026-05-08 (transcript: /tmp/codex-t418-design-result.txt).

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDimensionEvidencePack, type DimensionEvidencePack } from './dimension-evidence-pack.ts'
import { formatProjectionCell } from './topic-lens-cell-formatters.ts'

type Cell = { value: string | number | null; source?: string; note?: string }
type EmbeddedRow = {
  row_name: string
  group_name: string
  weight?: number
  cell_data: Record<string, Cell>
}
type TopicLensProposal = {
  kind: 'propose_create_topic_lens'
  topic_name: string
  lens_name: string
  base_lens_kind: string
  embedded_rows: EmbeddedRow[]
  visible_base_rows?: string[]
  lens_question?: string
}
type ProposedActions = Record<string, any>

/**
 * Map topic_name to the dimension key used by KNOWN_PROJECTION_VERSIONS.
 * Today: only 'rugby' is supported. Returns null if no mapping.
 *
 * Exported so T4.19 (post-confirm-fill) shares the same vocabulary —
 * Codex r1 (T4.19): preventing drift between T4.18 and T4.19.
 */
export function topicToDimension(topicName: string): string | null {
  const t = String(topicName || '').toLowerCase().trim()
  if (!t) return null
  // Rugby aliases — Nana sometimes generates "Rugby" / "rugby union" / "rugby football"
  if (/^rugby(\s|$|[-_])/.test(t) || t === 'rugby' || /\brugby\b/.test(t)) return 'rugby'
  return null
}

export type ProjectorFillTelemetry = {
  filled: number       // total cells filled
  matched: number      // cells whose row_name matched a formatter rule
  no_match: number     // cells with null value but no formatter rule matched
  no_data: number      // cells whose rule matched but projection field was missing
  schools_with_pack: number
  schools_without_pack: number
}

/**
 * Apply projector-fill to all propose_create_topic_lens entries in a
 * validated proposed_actions object. Mutates `actions` in place.
 *
 * Safe to call when:
 *   - actions is null
 *   - no propose_create_topic_lens entries exist
 *   - flag is off (returns immediately)
 *   - any lookup fails (logs + falls through)
 */
export async function applyTopicLensProjectorFill(
  supabase: SupabaseClient,
  actions: ProposedActions | null,
  shortlistSlugs: string[],
): Promise<ProjectorFillTelemetry | null> {
  if (process.env.NANA_TOPIC_LENS_FACTS !== 'on') return null
  if (!actions || typeof actions !== 'object') return null

  // Find all topic-lens proposals (there may be 0..N, though current
  // extractor caps at 1 per response).
  const topicProposals: Array<{ key: string; proposal: TopicLensProposal }> = []
  for (const [key, p] of Object.entries(actions)) {
    if (p && typeof p === 'object' && (p as any).kind === 'propose_create_topic_lens') {
      topicProposals.push({ key, proposal: p as TopicLensProposal })
    }
  }
  if (topicProposals.length === 0) return null

  const tel: ProjectorFillTelemetry = {
    filled: 0, matched: 0, no_match: 0, no_data: 0,
    schools_with_pack: 0, schools_without_pack: 0,
  }

  for (const { proposal } of topicProposals) {
    const dimension = topicToDimension(proposal.topic_name)
    if (!dimension) continue  // unsupported topic; leave as-is

    // Pre-fetch projections for all shortlist slugs in parallel.
    // Promise.allSettled so one failure doesn't reject the batch.
    const settled = await Promise.allSettled(
      shortlistSlugs.map((sl) => loadDimensionEvidencePack(supabase, sl, dimension)),
    )
    const packBySlug = new Map<string, DimensionEvidencePack | null>()
    for (let i = 0; i < shortlistSlugs.length; i++) {
      const r = settled[i]
      const pack = r.status === 'fulfilled' ? r.value : null
      packBySlug.set(shortlistSlugs[i], pack)
      if (pack) tel.schools_with_pack++
      else tel.schools_without_pack++
    }

    // Walk embedded_rows; fill null cells where formatter matches.
    for (const row of proposal.embedded_rows) {
      if (!row || typeof row !== 'object' || !row.cell_data) continue
      for (const slug of shortlistSlugs) {
        const cell = row.cell_data[slug]
        if (!cell) continue
        // Only fill cells that are explicitly null-valued (validator's
        // post-fill marker for missing evidence). Don't overwrite real
        // LLM-emitted values.
        if (cell.value !== null) continue

        const pack = packBySlug.get(slug)
        if (!pack) continue  // no projection data for this slug; leave null

        const formatted = formatProjectionCell(dimension, row.row_name, pack.projection)
        if (formatted == null) {
          // Could be either no_match (rule didn't fire) or no_data (rule
          // fired but field missing). We don't distinguish here without
          // re-running the rules; bucket as no_match for now.
          tel.no_match++
          continue
        }
        // Replace the null cell with the projector-derived cell.
        // Validator already pads the slug into cell_data, so we mutate
        // in place.
        row.cell_data[slug] = {
          value: formatted.value,
          ...(formatted.source ? { source: formatted.source } : {}),
        }
        tel.filled++
        tel.matched++
      }
    }
  }

  return tel
}
