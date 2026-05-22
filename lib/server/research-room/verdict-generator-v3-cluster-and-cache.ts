// VERDICT GENERATOR v3 — CLUSTER WITH PROVENANCE + CACHE LOOKUPS (sketch)
//
// Two pieces in one file because they're both tightly bound to the existing
// generator's internals:
//
// 1. clusterRows() — updated to merge contributing_rows[] arrays through the
//    semantic-clustering pass (R3-P2 + R4 cell-level provenance).
//
// 2. loadCachedResearchVerdict() / loadMatchingCachedVerdict() — updated to
//    drop lens_id filtering across all three cache-reader sites
//    (R4-MUST-2: route.ts:74, verdict-generator.ts:973, verdict-generator.ts:988).

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ComparisonRowWithProvenance, ContributingRow, ClusterRowMeta,
  ResearchVerdict, ResearchVerdictRecord,
} from './verdict-generator-v3-types'
import { MAX_CONTRIBUTING_ROWS_PER_CLUSTER } from './verdict-generator-v3-types'

// ── clusterRows — preserves provenance through the semantic merge ───────
//
// Existing v2 implementation collapses near-duplicate rugby/SOCS/fees rows by
// regex pattern (see verdict-generator.ts:246). The v3 version ALSO concats
// contributing_rows[] arrays and tracks which contributing row produced the
// SELECTED cell value per school (cell-level provenance, R4-P2).
//
// The result rows feed into scoreSchools() and the narrative builder.

import type { RowCell } from '@/components/nana/comparison-placeholder'

const ROW_CLUSTERS: Array<{ key: string; pattern: RegExp; preferredLabel: string }> = [
  { key: 'rugby:strength',
    pattern: /^(rugby (standing|strength|strength summary)|recent rugby (success|highlights)|rugby-related note)$/i,
    preferredLabel: 'Rugby strength' },
  { key: 'rugby:rank',
    pattern: /^(rugby rank|dmt( current)? rank|socs( performance)? rank|socs performance|league table)$/i,
    preferredLabel: 'Rugby ranking (DMT / SOCS)' },
  { key: 'fees:annual',
    pattern: /^(boarding fee (range|. per year)|annual fees?)$/i,
    preferredLabel: 'Boarding fee · per year' },
  { key: 'fees:per-term',
    pattern: /^boarding fee . per term$/i,
    preferredLabel: 'Boarding fee · per term' },
  { key: 'tennis:strength',
    pattern: /^(tennis programme strength|tennis standing)$/i,
    preferredLabel: 'Tennis programme strength' },
  { key: 'tennis:teams',
    pattern: /^(number of tennis teams|tennis team count)$/i,
    preferredLabel: 'Tennis team count' },
]

function clusterKey(label: string): { key: string; preferredLabel: string } {
  const norm = label.trim().toLowerCase().replace(/\s+/g, ' ')
  for (const cluster of ROW_CLUSTERS) {
    if (cluster.pattern.test(norm)) return cluster
  }
  return { key: `row:${norm}`, preferredLabel: label }
}

function evidenceCellScore(cell: RowCell): number {
  if (cell.kind === 'empty') return 0
  if (cell.kind === 'lights') return 5 + cell.lights.length
  let score = 10
  if (cell.sub && /https?:\/\//.test(cell.sub)) score += 4
  if (cell.sub) score += 1
  if (cell.primary.length > 40) score += 1
  return score
}

/**
 * Cluster comparison rows by semantic pattern AND carry provenance through.
 *
 * Per-school cell selection:
 *   Within a cluster, for each school we pick the row whose cell has the
 *   highest evidence score (URL > sub > length). We record THAT row's id as
 *   the `selected_cell_origin_id` so cited prose can attribute correctly.
 *
 * Provenance merge:
 *   We concat all rows' `contributing_rows` arrays, then cap at 24 with
 *   truncated=true if we exceed.
 *
 * Output rows match the ComparisonRowWithProvenance shape AND also carry
 * per-school `selected_cell_origin_id` (added under a meta sidecar to avoid
 * polluting the RowCell type).
 */
export function clusterRows(
  rows: ComparisonRowWithProvenance[],
  // R9-SHOULD-3: schoolCount is passed for signature consistency (production
  // callers pass `args.comparisonData.schools.length`) but unused inside this
  // function — each row's `cells` array already carries the right length and
  // contributing_rows are per-school. Prefix `_` to mark intentionally unused.
  _schoolCount: number,
): Array<ComparisonRowWithProvenance & { selectedCellOriginIdBySchool: (string | undefined)[] }> {
  type Bucket = {
    label:                  string
    firstIndex:             number
    cells:                  RowCell[]
    selectedOrigin:         (string | undefined)[]   // per-school
    contributing:           ContributingRow[]
    contributingCount:      number
    ids:                    string[]
  }
  const map = new Map<string, Bucket>()

  rows.forEach((row, idx) => {
    const { key, preferredLabel } = clusterKey(row.label)
    const isClustered = !key.startsWith('row:')
    const bucket = map.get(key)

    if (!bucket) {
      map.set(key, {
        label:                isClustered ? preferredLabel : row.label,
        firstIndex:           idx,
        cells:                row.cells.slice(),
        // R6-MUST-2: take the per-school origin from the UPSTREAM merge layer.
        // Each input row already carries selectedCellOriginIdBySchool from
        // loadVerdictRows; we copy it for the bucket's first row, then overlay
        // when later rows win the cluster-level evidenceCellScore.
        selectedOrigin:       row.selectedCellOriginIdBySchool.slice(),
        contributing:         [...row.contributing_rows],
        contributingCount:    row.contributing_row_count,
        ids:                  [row.contributing_rows[0]?.id ?? `cluster|${idx}`],
      })
      return
    }

    // Per-school: pick whichever cell has the higher evidence score AND
    // update origin to point to that input row's per-school origin
    // (R6-MUST-2: respect the upstream origin, don't squash to contributing[0]).
    bucket.cells = bucket.cells.map((existing, i) => {
      const incoming = row.cells[i] ?? { kind: 'empty' as const }
      if (evidenceCellScore(incoming) > evidenceCellScore(existing)) {
        // Use the input row's per-school origin if known; fall back to its
        // first contributing row id.
        bucket.selectedOrigin[i] =
          row.selectedCellOriginIdBySchool[i] ??
          row.contributing_rows[0]?.id
        return incoming
      }
      return existing
    })
    bucket.contributing.push(...row.contributing_rows)
    bucket.contributingCount += row.contributing_row_count
    bucket.ids.push(...row.contributing_rows.map(c => c.id))
  })

  return Array.from(map.values())
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map(b => {
      // De-dup contributing rows by id.
      const dedup = new Map<string, ContributingRow>()
      for (const c of b.contributing) {
        if (!dedup.has(c.id)) dedup.set(c.id, c)
      }
      const list = Array.from(dedup.values())

      // R7-MUST-5: PIN selected-origin contributors before truncation, same as
      // the upstream loadVerdictRows merge does. If a per-school origin id sits
      // at index 25+ in the list, plain `.slice(0, 24)` drops the matching
      // ContributingRow and findStrongestEvidence loses citation provenance.
      const pinnedIds = new Set<string>(
        b.selectedOrigin.filter((id): id is string => typeof id === 'string'),
      )
      const pinned: ContributingRow[] = []
      const rest:   ContributingRow[] = []
      for (const c of list) {
        if (pinnedIds.has(c.id)) pinned.push(c)
        else                     rest.push(c)
      }
      const capped = [...pinned, ...rest].slice(0, MAX_CONTRIBUTING_ROWS_PER_CLUSTER)
      const truncated = list.length > MAX_CONTRIBUTING_ROWS_PER_CLUSTER

      return {
        id:                          `cluster|${b.ids.join('|')}`,
        label:                       b.label,
        cells:                       b.cells,
        removable:                   false,
        contributing_rows:           capped,
        contributing_row_count:      b.contributingCount,
        truncated,
        selectedCellOriginIdBySchool: b.selectedOrigin,
      }
    })
}

// ── Cache lookups — drop lens filtering across ALL THREE sites ──────────

/**
 * R4-MUST-2: drop `.eq('lens_id', ...)` filtering across all three sites:
 *   - app/api/research-room/verdict/route.ts:74  (loadMatchingCachedVerdict)
 *   - lib/server/research-room/verdict-generator.ts:973  (current cache load)
 *   - lib/server/research-room/verdict-generator.ts:988  (stale fallback)
 *
 * Identity is now (session_id, child_id, input_hash). Lens_id may still be
 * written for legacy back-compat but is not part of the lookup contract.
 */
export async function loadCachedResearchVerdict(
  supabase: SupabaseClient,
  args: {
    sessionId: string
    childId:   string
    inputHash: string
  },
): Promise<ResearchVerdictRecord | null> {
  // Exact-hash match — lens-agnostic.
  const { data, error } = await supabase
    .from('research_verdicts')
    .select('id, input_hash, verdict_json, body_markdown, generated_at')
    .eq('session_id', args.sessionId)
    .eq('child_id', args.childId)
    .eq('input_hash', args.inputHash)
    .maybeSingle()

  if (error) throw new Error(`loadCachedResearchVerdict: ${error.message}`)

  if (data) {
    return {
      id:            data.id,
      input_hash:    data.input_hash,
      verdict_json:  data.verdict_json as ResearchVerdict,
      body_markdown: data.body_markdown,
      generated_at:  data.generated_at,
      cache_status:  'current',
    }
  }

  // Stale fallback — also lens-agnostic. Return the most-recent verdict for
  // this (session, child) regardless of input_hash.
  const { data: stale, error: staleError } = await supabase
    .from('research_verdicts')
    .select('id, input_hash, verdict_json, body_markdown, generated_at')
    .eq('session_id', args.sessionId)
    .eq('child_id', args.childId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (staleError) throw new Error(`loadCachedResearchVerdict fallback: ${staleError.message}`)
  if (!stale) return null
  return {
    id:            stale.id,
    input_hash:    stale.input_hash,
    verdict_json:  stale.verdict_json as ResearchVerdict,
    body_markdown: stale.body_markdown,
    generated_at:  stale.generated_at,
    cache_status:  'stale',
  }
}

/**
 * For the verdict route's pre-write check (formerly route.ts:74's
 * loadMatchingCachedVerdict). Lens-agnostic.
 */
export async function loadMatchingCachedVerdict(
  supabase:  SupabaseClient,
  sessionId: string,
  childId:   string,
  inputHash: string,
): Promise<ResearchVerdictRecord | null> {
  const { data, error } = await supabase
    .from('research_verdicts')
    .select('id, input_hash, verdict_json, body_markdown, generated_at')
    .eq('session_id', sessionId)
    .eq('child_id', childId)
    .eq('input_hash', inputHash)
    .maybeSingle()

  if (error) throw new Error(`verdict cache read failed: ${error.message}`)
  if (!data) return null
  return {
    id:            data.id,
    input_hash:    data.input_hash,
    verdict_json:  data.verdict_json as ResearchVerdict,
    body_markdown: data.body_markdown,
    generated_at:  data.generated_at,
  }
}
