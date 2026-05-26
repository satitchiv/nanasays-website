// VERDICT GENERATOR v3 — NARRATIVE BUILDER (sketch)
//
// Six helpers (R2-Q5 narrative-quality) + a per-path narrative builder.
// Replaces buildSummary() / bestForChildLine() from v2.
//
// All prose is DETERMINISTIC (R1 Q5 + R2 Q5). No claude CLI in the request
// path. Templates use BriefContext to cross-reference the brief explicitly.

import type {
  PathKey, PathOverlay, PathEvidenceItem, PathCostItem,
  BriefContext, BriefAnchor, BriefTension, SchoolFacts,
  ComparisonRowWithProvenance,
} from './verdict-generator-v3-types'

// v3.1 (2026-05-26): narrative migrated from pathAModeForRubric (legacy
// topPriority-driven) to framingHint (recommender-driven). The lookup table
// for opener prose + evidence-category priority lives in -v3-paths.ts as
// FRAMING_TABLE; this module reads it via openerForPath() +
// evidenceCategoryPriorityFor().
//
// Deleted in this migration:
//   - pathADescriptorForMode, pathAOpenerForMode      → replaced by openerForPath
//   - FALLBACK_MATCHING_LABEL                          → anchor in FRAMING_TABLE is enough
//   - pathAEvidenceCategoriesForMode + PATH_ANCHOR_CATEGORIES_BC
//                                                      → replaced by evidenceCategoryPriorityFor
//   - otherPathName cross-references                   → framingHint-driven prose doesn't cross-reference
import {
  framingForPathV2, statusNoteForV2, openerForPath, evidenceCategoryPriorityFor,
} from './verdict-generator-v3-paths'
import type { FramingHint } from './path-selectors'
import { schoolMatchesRegion } from './verdict-generator-v3-brief'   // R7-MUST-1: shared region matcher

type DecisionCategory =
  | 'sport' | 'boarding' | 'pastoral' | 'academics' | 'fees'
  | 'location' | 'admissions' | 'school_stage' | 'scholarship'
  | 'community' | 'other'

type ScoredSchool = {
  slug:           string
  name:           string
  score:          number
  categoryScores: Partial<Record<DecisionCategory, number>>
  strengths:      Array<{ text: string; impact: number; category: DecisionCategory }>
  reservations:   Array<{ text: string; impact: number; category: DecisionCategory }>
  evidenceCells:  number
  totalCells:     number
  evidenceThin:   boolean
}

// ─── Helper 1: brief cross-reference templates ──────────────────────────

/** Builds a sentence prefixed with the parent's stated brief anchor. */
function crossRefBrief(anchor: BriefAnchor, schoolName: string, evidenceValue: string): string {
  switch (anchor.kind) {
    case 'sport':
      return `You said sport is the top priority. ${schoolName} ${evidenceValue}.`
    case 'academic':
      return `You said the 5-year picture is academic, university-track. ${schoolName} ${evidenceValue}.`
    case 'boarding':
      return `You said full boarding. ${schoolName} ${evidenceValue}.`
    case 'location':
      return `You said the location filter is ${formatRegion(anchor.source)}. ${schoolName} ${evidenceValue}.`
    case 'budget':
      return `You set a budget. ${schoolName} ${evidenceValue}.`
    case 'curriculum':
      return `You said curriculum is ${formatRegion(anchor.source)}. ${schoolName} ${evidenceValue}.`
    case 'pastoral':
      // Phase 2.5 (Codex Phase 1.5 r1 carry-forward, 2026-05-24): pastoral
      // added to BriefAnchor.kind union. Templated similarly to other
      // top-priority cases so the cross-ref sentence reads naturally.
      return `You said pastoral support is the top priority. ${schoolName} ${evidenceValue}.`
  }
}

// ─── Helper 2: parent's own words from goals_notes ──────────────────────

export function maybeQuoteGoalsNotes(briefContext: BriefContext, schoolName: string): string | null {
  if (!briefContext.goalsNotes) return null
  return `You said: "${briefContext.goalsNotes}" — ${schoolName}'s evidence below speaks directly to that picture.`
}

// ─── Helper 3: comparative rank helpers ─────────────────────────────────

type CategoryRank = 'strongest' | 'second' | 'middle' | 'weakest'

export function compareCategoryRank(
  school: ScoredSchool,
  category: DecisionCategory,
  allSchools: ScoredSchool[],
): CategoryRank {
  const sorted = [...allSchools]
    .map(s => ({ slug: s.slug, score: s.categoryScores[category] ?? 0 }))
    .sort((a, b) => b.score - a.score)
  const idx = sorted.findIndex(s => s.slug === school.slug)
  if (idx === -1)                  return 'middle'
  if (idx === 0)                   return 'strongest'
  if (idx === 1)                   return 'second'
  if (idx === sorted.length - 1)   return 'weakest'
  return 'middle'
}

export function formatCategoryComparison(
  school: ScoredSchool,
  category: DecisionCategory,
  allSchools: ScoredSchool[],
): string {
  const rank = compareCategoryRank(school, category, allSchools)
  switch (rank) {
    case 'strongest': return 'the strongest in your shortlist by a clear margin'
    case 'second':    return 'second-strongest in your shortlist'
    case 'middle':    return 'mid-pack in your shortlist'
    case 'weakest':   return 'the weakest in your shortlist on this dimension'
  }
}

// ─── Helper 4: brief-tension surfacing in prose ─────────────────────────

export function tensionSentencesForPath(
  tensions: BriefTension[], pathKey: PathKey,
): string[] {
  return tensions
    .filter(t => t.impacts_paths.includes(pathKey))
    .map(t => t.description)
}

// ─── Helper 5: anchor-to-evidence linkers ───────────────────────────────

const CATEGORY_TO_ROW_KEYWORDS: Record<DecisionCategory, RegExp> = {
  sport:        /(rugby|tennis|sport|socs|dmt|fixture|team|cricket|hockey|netball|swim|rowing|equestrian|football)/i,
  boarding:     /(boarding|boarder|house|houseparent|weekend|day pupils|full board)/i,
  pastoral:     /(pastoral|tutor|wellbeing|welfare|care|safeguard|isi|inspection|support)/i,
  academics:    /(gcse|a-level|a level|ib|academic|result|grade|oxbridge|university|curriculum|sixth form)/i,
  fees:         /(fee|cost|deposit|registration|application fee|extras|afford|budget)/i,
  location:     /(location|travel|distance|heathrow|airport|station|city|region|south west|south-west)/i,
  admissions:   /(admission|entry|deadline|assessment|exam|interview|application)/i,
  school_stage: /(school type|age range|prep|preparatory|primary|senior|co-ed|girls|boys)/i,
  scholarship:  /(scholarship|bursary|means-tested|means tested)/i,
  community:    /(pupil|community|size|international|day)/i,
  other:        /^$/,
}

// R5-MUST-9: real implementation. Takes a schoolIdx (the column index in
// row.cells) and scans rows whose label matches the anchor's category
// keyword regex. Returns the highest-scoring cell match for that school.
export function findStrongestEvidence(
  school: ScoredSchool,
  anchorCategory: DecisionCategory,
  rows: ComparisonRowWithProvenance[],
  schoolIdx: number,
): { row: ComparisonRowWithProvenance; cellValue: string; cellOriginId?: string } | null {
  const keywordRx = CATEGORY_TO_ROW_KEYWORDS[anchorCategory]
  let best: { row: ComparisonRowWithProvenance; cellValue: string; cellOriginId?: string; score: number } | null = null

  for (const row of rows) {
    if (!keywordRx.test(row.label)) continue
    const cell = (row.cells as any)[schoolIdx]
    if (!cell || cell.kind === 'empty') continue
    const cellValue = textOf(cell)
    if (!cellValue) continue

    // Score this cell: prefer cells with URLs (sourced evidence), then with sub-text, then long primary.
    let score = 1
    if (cell.kind === 'value') {
      if (cell.sub && /https?:\/\//.test(cell.sub)) score += 4
      if (cell.sub) score += 1
      if (cell.primary && cell.primary.length > 40) score += 1
    } else if (cell.kind === 'lights') {
      score += 2
    }

    if (!best || score > best.score) {
      const cellOriginId = (row as any).selectedCellOriginIdBySchool?.[schoolIdx] as (string | undefined)
      best = { row, cellValue, cellOriginId, score }
    }
  }
  return best ? { row: best.row, cellValue: best.cellValue, cellOriginId: best.cellOriginId } : null
}

/** Returns the row whose evidence MOST contradicts the anchor (negative signal). */
export function findContradictingEvidence(
  school: ScoredSchool,
  anchorCategory: DecisionCategory,
): { signal: string; impact: number } | null {
  const contradictors = school.reservations
    .filter(r => r.category === anchorCategory)
    .sort((a, b) => a.impact - b.impact)
  return contradictors[0] ? { signal: contradictors[0].text, impact: contradictors[0].impact } : null
}

// ─── Helper 6: brief-vs-school comparison generators for honest costs ───

export function generateHonestCosts(
  briefContext: BriefContext,
  schoolFacts:  SchoolFacts | undefined,
  pathKey:      PathKey,
): PathCostItem[] {
  const costs: PathCostItem[] = []
  const rubric = briefContext.rubric

  // Region cost — R7-MUST-1: use the shared schoolMatchesRegion wrapper
  // (which delegates to regionInBucket). Previously this called a hand-rolled
  // schoolFactsRegionMatches() that reintroduced the exact regression
  // r6 was trying to kill (missed 'North Somerset', Scotland/Wales aliases).
  if (rubric.homeRegion && rubric.homeRegion !== 'anywhere' && rubric.homeRegion !== 'overseas') {
    const match = schoolFacts
      ? schoolMatchesRegion(schoolFacts, rubric.homeRegion)
      : false
    if (!match) {
      costs.push({
        label:  'Location',
        detail: `${schoolFacts?.region ?? 'Region unknown'} — outside your ${formatRegion(rubric.homeRegion)} filter.`,
      })
    }
  }

  // Budget cost — only when cap exists AND school exceeds it.
  if (rubric.budgetMaxAnnual != null && schoolFacts?.fee_max && schoolFacts.fee_max > rubric.budgetMaxAnnual) {
    const overByK = Math.round((schoolFacts.fee_max - rubric.budgetMaxAnnual) / 1000)
    costs.push({
      label:  'Fees',
      detail: `Upper fee band £${Math.round(schoolFacts.fee_max / 1000)}k — £${overByK}k above your £${Math.round(rubric.budgetMaxAnnual / 1000)}k cap.`,
    })
  }

  // v3.1 (2026-05-26): academic-base cost now fires for Path C (value lens)
  // and Path A (best-overall lens) when academics are sub-50%. Path B is
  // always "Strongest academic" so academics ARE the dominant signal — skip.
  if ((pathKey === 'A' || pathKey === 'C')
      && schoolFacts?.a_level_a_star_a_pct != null
      && schoolFacts.a_level_a_star_a_pct < 50) {
    costs.push({
      label:  'Academic base',
      detail: `A-level A*-A sits at ${schoolFacts.a_level_a_star_a_pct}% — below the strongest in your shortlist.`,
    })
  }

  return costs
}

// R7-MUST-1: hand-rolled schoolFactsRegionMatches REMOVED. Use the shared
// schoolMatchesRegion (wraps regionInBucket from @/lib/uk-regions) imported
// at the top of this file.

function formatRegion(raw: string): string {
  return raw.replace(/[-_]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Per-path narrative builder (entry point) ───────────────────────────
//
// Produces reasoning[], evidence[], costs[], considerations[] for one path.
// Called once per path from the main integration.

type BuildPathInput = {
  pathKey:       PathKey
  winner:        ScoredSchool
  winnerFacts:   SchoolFacts | undefined
  pathStatus:    PathOverlay['path_status']
  briefContext:  BriefContext
  allEligibleSchools: ScoredSchool[]
  rowsWithProvenance: ComparisonRowWithProvenance[]
  schoolIdx:     number                          // index into row.cells for this school
  // v3.1 (2026-05-26): framingHint drives Path A/B/C semantics + framing copy
  // + opener template + evidence-category priority. Caller is
  // verdict-generator.ts:overlayFor which reads it from pathSelection.framingHints.
  framingHint:   FramingHint
  // v3.1 (2026-05-26): budgetCapLabel interpolated into framingLong + opener
  // for Path C variants ("...within your £50k cap"). null when no budget set.
  budgetCapLabel: string | null
  // v3.1 (Codex r2 P3): tailor needs_research / fallback status_note copy to
  // the number of schools that cleared the 50% coverage threshold.
  eligibleCount: number
  // v3.3 (2026-05-26 — Sam smoke): list of other paths whose winner is the
  // same school as this one. When non-empty, opener prepends a clarifying
  // line so the reader knows the duplicate isn't a bug.
  sharedWith:    PathKey[]
}

export function buildPathOverlay(input: BuildPathInput): PathOverlay {
  const { pathKey, winner, winnerFacts, pathStatus, briefContext, framingHint, budgetCapLabel, eligibleCount } = input
  // v3.1 (2026-05-26): framing + status_note driven by framingHint, not the
  // legacy topPriority-driven framingForPath. The user-facing copy matches
  // exactly what selectPathWinners returned, so headers/body can never drift.
  const framing = framingForPathV2(pathKey, framingHint, budgetCapLabel)

  return {
    framing:        framing.framing,
    framingLong:    framing.framingLong,
    framingHint,
    winner_slug:    winner.slug,
    path_status:    pathStatus,
    status_note:    statusNoteForV2(pathStatus, pathKey, framingHint, eligibleCount),
    reasoning:      buildReasoningParagraphs(input),
    evidence:       buildEvidenceList(input),
    costs:          generateHonestCosts(briefContext, winnerFacts, pathKey),
    considerations: buildConsiderations(input),
  }
}

// ── Reasoning paragraphs — 3-4 per path ────────────────────────────────

function buildReasoningParagraphs(input: BuildPathInput): string[] {
  const { pathKey, winner, winnerFacts, briefContext, allEligibleSchools } = input
  const paragraphs: string[] = []

  // Para 1: framing-led opener. References brief anchors.
  paragraphs.push(buildOpeningParagraph(input))

  // Para 2: school's specific evidence on the path's anchor.
  paragraphs.push(buildEvidenceParagraph(input))

  // Para 3: balance / honest counterpoint to costs.
  paragraphs.push(buildBalanceParagraph())

  // Optional Para 4: tension quote when goals_notes is present.
  const quote = maybeQuoteGoalsNotes(briefContext, winner.name)
  if (quote) paragraphs.push(quote)

  return paragraphs
}

// v3.1 (2026-05-26): status-aware opener driven by framingHint, not legacy
// topPriority modes. Real winner → openerForPath() lookup table (one sentence
// per framingHint). Fallback → generic hard-constraint copy. Needs_research →
// per-pathKey copy from statusNoteForV2 (already on path_status).
function buildOpeningParagraph({ pathKey, winner, pathStatus, framingHint, budgetCapLabel, sharedWith }: BuildPathInput): string {
  if (pathStatus === 'winner') {
    const base = openerForPath(framingHint, winner.name, budgetCapLabel)
    // v3.3 (2026-05-26): when this path's winner is the SAME school as
    // another path's winner, prepend a clarifying line. Without it the
    // reader sees the same school card twice with different copy and
    // suspects a bug. With it, the duplicate reads as "honest overlap".
    if (sharedWith.length > 0) {
      const others = sharedWith.map(p => `Path ${p}`).join(' and ')
      return `${winner.name} also wins ${others} for this brief — the lenses converge here. ${base}`
    }
    return base
  }

  if (pathStatus === 'fallback') {
    return `${winner.name} is shown as a FALLBACK for Path ${pathKey}. No school in your shortlist passes the brief's hard constraints (gender single-sex or year-stage match) for this reading; ${winner.name} is the closest broader fit. See "schools we couldn't compare yet" below — candidates matching this lens may be there and need more research.`
  }

  // needs_research — generic "evidence too thin" copy. The richer per-path
  // status_note copy comes from statusNoteForV2 (already on the overlay).
  return `Path ${pathKey} doesn't have enough positive evidence in the comparison table to declare a winner yet. ${winner.name} is the highest-ranked candidate, but the lens's signal is too thin to call. Add more comparison rows and re-run the verdict.`
}

// v3.1 (2026-05-26): evidence paragraph switches on framingHint, not legacy
// pathAMode. Each lens emits the most-relevant sentence first (academic %
// for academic lens, fee figure for value lens, recommender position for
// "best overall" — same Reed's-style sentence) plus optional school facts.
function buildEvidenceParagraph({ winner, winnerFacts, allEligibleSchools, framingHint, budgetCapLabel }: BuildPathInput): string {
  const facts = winnerFacts
  const parts: string[] = []

  // Lens-relevant lead sentence.
  switch (framingHint) {
    // v3.1 + v3.2: academic lens variants. Each cites the metric that
    // actually drove the pick so headers and body never contradict.
    case 'strongest_academic':              // legacy back-compat (cached overlays)
    case 'strongest_academic_a_level':
    case 'best_overall':
      if (facts?.a_level_a_star_a_pct != null) {
        parts.push(`Academically, **${facts.a_level_a_star_a_pct}% A-level A*-A** — ${formatCategoryComparison(winner, 'academics', allEligibleSchools)}.`)
      }
      break
    case 'strongest_academic_gcse':
      if (facts?.gcse_9_7_pct != null) {
        parts.push(`Academically, **${facts.gcse_9_7_pct}% GCSE 9-7** — the highest published GCSE rate in your shortlist (A-level rates not yet extracted for all candidates).`)
      } else if (facts?.a_level_a_star_a_pct != null) {
        // Defensive: signal said GCSE drove the pick but A-level is also
        // present for the winner — narrate honestly.
        parts.push(`Academically, **${facts.a_level_a_star_a_pct}% A-level A*-A**.`)
      }
      break
    case 'strongest_academic_aggregate':
      // Neither A-level nor GCSE was extracted for the winner; aggregate
      // comparison-cell signal won. Don't claim a specific exam %.
      parts.push(`${winner.name} has the strongest aggregate academic signal in the comparison evidence — extracted exam rates aren't yet on file for this candidate, so the headline number isn't shown here.`)
      break
    case 'most_affordable':
    case 'least_over_budget':
    case 'lowest_fee':
      // Value lens — lead with the fee figure relative to budget.
      if (facts?.fee_max != null) {
        const feeK = (facts.fee_max / 1000).toFixed(0)
        if (budgetCapLabel) {
          parts.push(`On fees, **£${feeK}k upper-band annual** — ${framingHint === 'least_over_budget' ? 'the smallest overshoot relative to your ' + budgetCapLabel + ' cap' : 'within your ' + budgetCapLabel + ' cap'}.`)
        } else {
          parts.push(`On fees, **£${feeK}k upper-band annual** — lowest in the shortlist for the data we have.`)
        }
      }
      break
    case 'next_best_fit_b':
    case 'next_best_fit_c':
      // Recommender-walk fallback — academic data missing for this shortlist,
      // so let the recommender position speak for itself.
      parts.push(`${winner.name} is the recommender's next-best fit for the brief — no single-lens evidence pushed it forward; it scored well across multiple dimensions.`)
      break
  }

  if (facts?.boarder_pct != null) {
    parts.push(`${facts.boarder_pct}% of pupils are boarders.`)
  }
  return parts.length > 0
    ? parts.join(' ')
    : `${winner.name} has been chosen for this path by the recommender; see the evidence rows below for the cells that drove the ranking.`
}

// v3.1 (2026-05-26): location-led Path C branch REMOVED — Path C is now
// value-led (most_affordable / least_over_budget / lowest_fee), so the old
// "location wins" copy is gone. The fee-cap line was already removed earlier.
// Generic single-line balance copy stays as a universal closer.
function buildBalanceParagraph(): string {
  return `The honest balance: every lens involves trade-offs — see the costs block below for what this one specifically asks you to compromise.`
}

// ── Evidence list ─────────────────────────────────────────────────────

// R6-MUST-7: evidence MUST be path-relevant. v1/v2 just grabbed the first 5
// non-empty rows regardless of path, which broke the "this is your sport
// path" promise (Path A could cite fees evidence before sport evidence).
//
// v3 walks the path's anchor categories IN PRIORITY ORDER and picks the
// strongest matching row per anchor via findStrongestEvidence(). This is
// the function that was implemented in v2 but never called.

// v3.1 (2026-05-26): evidence-category priority flexes per framingHint
// (recommender-driven lens), not per legacy Path A/B/C composite mode. The
// table lives in -v3-paths.ts FRAMING_TABLE.evidenceCategoryPriority so
// copy/categories stay co-located.
function buildEvidenceList(input: BuildPathInput): PathEvidenceItem[] {
  const { winner, rowsWithProvenance, schoolIdx, framingHint } = input
  const out: PathEvidenceItem[] = []
  const usedRowLabels = new Set<string>()

  const categories: DecisionCategory[] = evidenceCategoryPriorityFor(framingHint) as DecisionCategory[]

  // Walk path-relevant categories first. findStrongestEvidence picks the
  // highest-scoring (URL-bearing, sub-text-rich, long-primary) cell for this
  // school in that category.
  for (const category of categories) {
    if (out.length >= 5) break
    const hit = findStrongestEvidence(winner, category, rowsWithProvenance, schoolIdx)
    if (!hit) continue
    if (usedRowLabels.has(hit.row.label)) continue

    const cell = (hit.row.cells as any)[schoolIdx]
    const originIdForThisSchool =
      hit.cellOriginId
      ?? ((hit.row as any).selectedCellOriginIdBySchool?.[schoolIdx] as (string | undefined))

    const primaryProvenance = (originIdForThisSchool
      ? hit.row.contributing_rows.find(cr => cr.id === originIdForThisSchool)
      : undefined)
      ?? hit.row.contributing_rows[0]
      ?? null

    out.push({
      row:             hit.row.label,
      value:           hit.cellValue,
      source_url:      extractUrl(cell),
      source_label:    extractSourceLabel(cell) ?? 'school-extracted data',
      cited_lens_id:   primaryProvenance?.source_lens_id ?? null,
      cited_lens_kind: primaryProvenance?.lens_kind ?? undefined,
    })
    usedRowLabels.add(hit.row.label)
  }

  // Backfill: if path-relevant categories produced fewer than 3 items, fall
  // back to any non-empty cell so the panel isn't almost-empty. This is a
  // last resort, not the primary source.
  if (out.length < 3) {
    for (const row of rowsWithProvenance) {
      if (out.length >= 5) break
      if (usedRowLabels.has(row.label)) continue
      const cell = (row.cells as any)[schoolIdx]
      const cellText = textOf(cell)
      if (!cellText) continue

      const originIdForThisSchool = (row as any).selectedCellOriginIdBySchool?.[schoolIdx] as (string | undefined)
      const primaryProvenance = (originIdForThisSchool
        ? row.contributing_rows.find(cr => cr.id === originIdForThisSchool)
        : undefined)
        ?? row.contributing_rows[0]
        ?? null

      out.push({
        row:             row.label,
        value:           cellText,
        source_url:      extractUrl(cell),
        source_label:    extractSourceLabel(cell) ?? 'school-extracted data',
        cited_lens_id:   primaryProvenance?.source_lens_id ?? null,
        cited_lens_kind: primaryProvenance?.lens_kind ?? undefined,
      })
      usedRowLabels.add(row.label)
    }
  }

  return out
}

function textOf(cell: any): string {
  if (!cell || cell.kind === 'empty') return ''
  if (cell.kind === 'value') return [cell.primary, cell.sub].filter(Boolean).join(' · ')
  if (cell.kind === 'lights') return (cell.lights ?? []).map((l: any) => `${l.label}: ${l.tone}`).join('; ')
  return ''
}

function extractUrl(cell: any): string | undefined {
  if (cell?.sub && typeof cell.sub === 'string') {
    const m = cell.sub.match(/https?:\/\/\S+/)
    if (m) return m[0]
  }
  return undefined
}

function extractSourceLabel(cell: any): string | undefined {
  const url = extractUrl(cell)
  if (!url) return undefined
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '')} · ${u.pathname.slice(1).slice(0, 32)}`
  } catch {
    return undefined
  }
}

// ── Considerations (things to think about) ────────────────────────────

function buildConsiderations(input: BuildPathInput): string[] {
  const { briefContext, pathKey, winner } = input
  const out: string[] = []

  // Surface tensions that impact this path.
  for (const sentence of tensionSentencesForPath(briefContext.tensions, pathKey)) {
    out.push(sentence)
  }

  // R10-SHOULD-2: guard the location-filter consideration the same way
  // costs / tensions / Path C copy do — `anywhere` and `overseas` are
  // non-targeting choices, so there's no filter to confirm hardness of.
  const hr = briefContext.rubric.homeRegion
  if (hr && hr !== 'anywhere' && hr !== 'overseas') {
    out.push(`Confirm whether the ${hr.replace(/[-_]+/g, ' ')} location filter is a hard requirement or a soft preference — this changes which path wins.`)
  }
  out.push(`Visit ${winner.name} before committing — the comparison can show structure but not feel.`)
  return out.slice(0, 4)
}
