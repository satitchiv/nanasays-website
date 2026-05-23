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

import { PATH_FRAMING, framingForPath, statusNoteFor, pathAModeForRubric, type PathSelectionResult } from './verdict-generator-v3-paths'
import { schoolMatchesRegion } from './verdict-generator-v3-brief'   // R7-MUST-1: shared region matcher

// UX iteration Phase 1.5 (2026-05-23): Path A narrative adaptation.
//
// All Path A prose flexes with `rubric.topPriority` via pathAModeForRubric().
// Replaces hardcoded "sport-led Path A" copy that Codex r1 + r2 flagged at 8
// sites (lines 205/290/297/299/312/331/344/399-401 of the pre-fix file). The
// fix-mechanism is the same everywhere: read the mode once, branch copy on
// mode.compositeKind or mode.anchor.

// Phrase used INLINE when one path references another's framing — e.g. Path B
// opener saying "Path A leads by leaning hard on X". Returns the short noun
// phrase, not the full "If X is the priority" framing.
function pathADescriptorForMode(mode: ReturnType<typeof pathAModeForRubric>): string {
  switch (mode.compositeKind) {
    case 'sport':    return 'sport'
    case 'academic': return 'academic results'
    case 'pastoral': return 'pastoral care'
    case 'balanced':
      // 'balanced' compositeKind covers arts / all-round / null. Choose the
      // phrasing that makes "Path A leads by leaning hard on ___" read right
      // — none of these say "lean hard on", so use a generic phrasing instead.
      if (mode.anchor === 'arts')      return 'arts coverage'
      if (mode.anchor === 'all-round') return 'all-round fit'
      return 'overall fit'
  }
}

// Path-A opener prose per mode. Real-winner case only (not fallback /
// needs_research, which are handled separately further down).
//
// Codex Phase 1.5 r1 P1 #2: original openers invented "other anchors in your
// brief (X, Y)" with hardcoded second-anchor names. Academic mode said "sport,
// boarding preference" even when the parent never stated sport — fabricated
// data. Replaced with softer "Other parts of your brief are covered below"
// which is honest regardless of which anchors the parent actually stated.
function pathAOpenerForMode(mode: ReturnType<typeof pathAModeForRubric>, schoolName: string): string {
  switch (mode.compositeKind) {
    case 'sport':
      return `${schoolName} leads Path A because your brief named sport as the top priority and ${schoolName} has the strongest sport signal among the schools we can compare fairly. Other parts of your brief are covered below; the trade-offs are named in the costs.`
    case 'academic':
      return `${schoolName} leads Path A because your brief named academic results as the top priority and ${schoolName} has the strongest academic signal among the schools we can compare fairly. Other parts of your brief are covered below; the trade-offs are named in the costs.`
    case 'pastoral':
      return `${schoolName} leads Path A because your brief named pastoral care as the top priority and ${schoolName} has the strongest pastoral signal among the schools we can compare fairly. Other parts of your brief are covered below; the trade-offs are named in the costs.`
    case 'balanced':
      if (mode.anchor === 'arts') {
        return `${schoolName} leads Path A as the best fit for an arts-led brief. There's no separate arts category in the comparison evidence today, so this is the highest-scoring school on the balanced rubric — read it as a sensible default while arts coverage catches up.`
      }
      if (mode.anchor === 'all-round') {
        return `${schoolName} leads Path A because your brief asks for a genuine all-rounder and ${schoolName} scores well across academics, sport, pastoral, and community at the same time — closer to your stated balance than any single-anchor pick.`
      }
      // anchor === 'overall' / unknown — null priority case
      return `${schoolName} leads Path A as the best overall fit: highest-scoring school across all dimensions of your brief, with no single anchor weighted up. Use this as a default reading until you set a top priority on the Child brief page.`
  }
}

// Codex Phase 1.5 r1 P2 #2: friendly noun-phrase for the fallback opener's
// "...-matching candidates" line. Raw anchor values like 'overall' or
// 'all-round' read awkwardly with the "-matching" suffix; this map keeps
// each variant natural. Mirrors anchorNoun() in v3-paths.ts but adjective-form.
const FALLBACK_MATCHING_LABEL: Record<string, string> = {
  sport:       'sport-matching',
  academic:    'academics-matching',
  pastoral:    'pastoral-matching',
  arts:        'arts-matching',
  'all-round': 'all-round',
  overall:     'best-fit',
  location:    'location-matching',
  balance:     'balanced',
}

// Path-A anchor list for evidence walking. Was a static array entry in
// PATH_ANCHOR_CATEGORIES; now a function that returns the priority-order list
// for Path A based on the mode.
//
// Codex Phase 1.5 r1 P2 #1: academic ordering should mirror the
// academic composite (academics + scholarship + community), so academic-led
// Path A doesn't cite sport second when sport isn't even in the math.
// Updated: sport pushed to last in academic mode and pastoral mode.
function pathAEvidenceCategoriesForMode(mode: ReturnType<typeof pathAModeForRubric>): DecisionCategory[] {
  switch (mode.compositeKind) {
    case 'sport':    return ['sport', 'scholarship', 'community', 'boarding', 'academics']
    case 'academic': return ['academics', 'scholarship', 'community', 'boarding', 'sport']
    case 'pastoral': return ['pastoral', 'community', 'scholarship', 'boarding', 'academics', 'sport']
    case 'balanced': return ['academics', 'sport', 'boarding', 'pastoral', 'community']
  }
}

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

  // Academic cost — for Path A or C (where academics aren't the dominant signal).
  // UX iteration Phase 1.5 (2026-05-23): when Path A IS academic-led, academics
  // ARE the dominant signal — skip the cost.
  const pathAMode = pathAModeForRubric(briefContext.rubric)
  const academicsAreDominantOnA = pathKey === 'A' && pathAMode.compositeKind === 'academic'
  if ((pathKey === 'A' || pathKey === 'C')
      && !academicsAreDominantOnA
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
}

export function buildPathOverlay(input: BuildPathInput): PathOverlay {
  const { pathKey, winner, winnerFacts, pathStatus, briefContext } = input
  // R10-SHOULD-1: framing comes from framingForPath(), which returns the
  // neutralised override for Path C when home_region is anywhere/overseas.
  // UX iteration Phase 1 (2026-05-23): framingForPath signature widened to
  // take the full rubric so Path A can adapt to rubric.topPriority.
  const framing = framingForPath(pathKey, briefContext.rubric)

  return {
    framing:        framing.framing,
    framingLong:    framing.framingLong,
    winner_slug:    winner.slug,
    path_status:    pathStatus,
    status_note:    statusNoteFor(pathStatus, pathKey, briefContext.rubric),
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
  paragraphs.push(buildBalanceParagraph(input))

  // Optional Para 4: tension quote when goals_notes is present.
  const quote = maybeQuoteGoalsNotes(briefContext, winner.name)
  if (quote) paragraphs.push(quote)

  return paragraphs
}

// R5-MUST-7: status-aware opener. Fallback and needs_research paths must NOT
// say "wins Path X" — they're not real wins. Use status-specific framings.
function buildOpeningParagraph({ pathKey, winner, pathStatus, briefContext }: BuildPathInput): string {
  // UX iteration Phase 1.5 (2026-05-23): read Path A mode once at the top so
  // every Path A reference in this function flexes with rubric.topPriority.
  const pathAMode = pathAModeForRubric(briefContext.rubric)
  const pathADescriptor = pathADescriptorForMode(pathAMode)

  // Real winner — confident framing.
  if (pathStatus === 'winner') {
    switch (pathKey) {
      case 'A':
        return pathAOpenerForMode(pathAMode, winner.name)
      case 'B': {
        // R9-MUST-2 + Codex Phase 1.5 r1 P1 #3: Path B opener references Path
        // C "leads by leaning hard on location" (wrong when Path C is
        // neutralised) and Path A "leads by leaning hard on sport" (wrong when
        // Path A's anchor isn't sport, AND structurally wrong when Path A is
        // balanced-mode — arts/all-round/overall don't "lean hard" on anything,
        // they use balanced math too). Branches:
        //   - Path C neutralised:       use a Path-C-neutralised sentence
        //   - Path A balanced-mode:     describe both A and B as balanced reads
        //                               with different default behaviours
        //   - Path A single-anchor:     use "leans hard on X" with pathADescriptor
        const homeRegion = briefContext.rubric.homeRegion
        const pathCNeutralised = !homeRegion || homeRegion === 'anywhere' || homeRegion === 'overseas'
        const pathAIsBalanced  = pathAMode.compositeKind === 'balanced'

        if (pathAIsBalanced) {
          // Both Path A and Path B use balanced math; differentiate by intent.
          const aLabel = pathAMode.anchor === 'arts'     ? 'best fit for an arts-led brief'
                       : pathAMode.anchor === 'all-round' ? 'best all-round fit'
                       :                                    'best overall fit'
          if (pathCNeutralised) {
            return `${winner.name} leads Path B because it scores well across academics, sport, and boarding at the same time — closest to the balance the brief actually describes. Path A surfaces the ${aLabel} from the same balanced rubric, framed by your stated brief intent; Path C is neutralised because no UK region was specified, so the meaningful comparison is between Path A's framing and Path B's broader balance.`
          }
          return `${winner.name} leads Path B because it scores well across academics, sport, and boarding at the same time — closest to the balance the brief actually describes. Path A surfaces the ${aLabel} from the same balanced rubric (framed by your stated brief intent), while ${otherPathName('C', briefContext.rubric)} leads by leaning hard on location — Path B sits between the two and compromises least on what you wrote (except for one thing, named in the costs).`
        }

        // Single-anchor Path A (sport / academic / pastoral) — original shape.
        if (pathCNeutralised) {
          return `${winner.name} leads Path B because it scores well across academics, sport, and boarding at the same time — closest to the balance the brief actually describes. Path A leads by leaning hard on ${pathADescriptor}; Path C is neutralised because no UK region was specified in your brief, so this is effectively a choice between Path A and Path B.`
        }
        return `${winner.name} leads Path B because it scores well across academics, sport, and boarding at the same time — closest to the balance the brief actually describes. Where ${otherPathName('A', briefContext.rubric)} leads by leaning hard on ${pathADescriptor} and ${otherPathName('C', briefContext.rubric)} leads by leaning hard on location, this is the path that compromises least on what you wrote — except for one thing (named in the costs).`
      }
      case 'C':
        return `${winner.name} leads Path C because location is the strongest signal on the comparison evidence — closest to your stated region filter. If location is a firm requirement rather than a soft preference, this is the path to consider first, with the costs honestly named below.`
    }
  }

  // Fallback — hard-filter eliminated everyone; we show a broader best as guide.
  // R7-MUST-2: V1 hard constraints are gender single-sex match + year-stage
  // (prep school for senior years). NO "hard sport/location/balance criteria"
  // exists today — soft penalties are all that gate path C / sport / balance.
  // Copy now reflects the actual V1 reality.
  // Phase 1.5: anchor for Path A flexes with mode.
  // Codex Phase 1.5 r1 P2 #2: raw `${anchor}-matching candidates` reads
  // awkwardly for 'overall' / 'all-round' / 'arts'. Use a friendly noun-phrase
  // map (same shape as anchorNoun() but adjective-form for "...-matching").
  if (pathStatus === 'fallback') {
    const anchor = pathKey === 'A' ? pathAMode.anchor : PATH_FRAMING[pathKey].anchor
    const matchingLabel = FALLBACK_MATCHING_LABEL[anchor] ?? `${anchor}-matching`
    return `${winner.name} is shown as a FALLBACK for Path ${pathKey}. No school in your shortlist passes the brief's hard constraints (gender single-sex or year-stage match) for this reading; ${winner.name} is the closest broader fit. See "schools we couldn't compare yet" below — ${matchingLabel} candidates may be there and need more research.`
  }

  // Needs research, with a neutralised-specific branch for Path C when the
  // brief has no region filter (R8-MUST-1).
  if (pathKey === 'C') {
    const homeRegion = briefContext.rubric.homeRegion
    const isNeutralised = !homeRegion || homeRegion === 'anywhere' || homeRegion === 'overseas'
    if (isNeutralised) {
      return `Path C is neutralised because your brief didn't specify a UK region — you chose ${homeRegion === 'overseas' ? '"overseas"' : '"anywhere in the UK"'} for location, so there's no region target to compare against. The top-eligible school is shown for context only, not as a location-led winner. Path A and Path B remain meaningful; set a specific region in the brief if you want a real Path C reading.`
    }
  }
  // Needs research — composite is zero or evidence is too thin to declare a winner.
  // No "wins" framing; honest "we can't say yet" copy.
  return `Path ${pathKey} doesn't have enough positive evidence in the comparison table to declare a winner yet. ${winner.name} is the highest-ranked candidate, but the path's composite signal is too thin to call. Add more comparison rows on the schools that match this anchor and re-run the verdict.`
}

// UX iteration Phase 1.5 (2026-05-23): now takes rubric so Path A's framing
// flexes with topPriority instead of always reading the static "if sport is
// the priority" entry from PATH_FRAMING.
function otherPathName(p: PathKey, rubric: BuildPathInput['briefContext']['rubric']): string {
  return framingForPath(p, rubric).framing.toLowerCase()
}

function buildEvidenceParagraph({ winner, winnerFacts, briefContext, allEligibleSchools, pathKey }: BuildPathInput): string {
  const facts = winnerFacts
  const parts: string[] = []
  // UX iteration Phase 1.5 (2026-05-23): read Path A mode so the "top priority"
  // claim flexes with rubric.topPriority. Previously this hardcoded "the
  // brief's top priority" sport claim regardless of the actual priority.
  const pathAMode = pathAModeForRubric(briefContext.rubric)

  if (pathKey === 'A' || pathKey === 'B') {
    if (facts?.a_level_a_star_a_pct != null) {
      const rank = compareCategoryRank(winner, 'academics', allEligibleSchools)
      parts.push(`Academically, **${facts.a_level_a_star_a_pct}% A-level A\\*-A** — ${formatCategoryComparison(winner, 'academics', allEligibleSchools)}.`)
    }
  }
  // Sport claim — Path A: only when mode is sport. Path B: always, but the
  // tail flexes — only attribute to "the brief's top priority" when topPriority
  // is genuinely sport. For other topPriority values, the sport sentence
  // becomes a useful balanced-reading signal instead of a stale top-priority
  // claim. Codex Phase 1.5 r1 P1 #1 fix.
  if (pathKey === 'A' && pathAMode.compositeKind === 'sport') {
    if (compareCategoryRank(winner, 'sport', allEligibleSchools) === 'strongest') {
      parts.push(`On sport, ${winner.name} reads as the strongest in the shortlist — a genuine fit for the brief's top priority.`)
    }
  }
  if (pathKey === 'B') {
    if (compareCategoryRank(winner, 'sport', allEligibleSchools) === 'strongest') {
      const tail = pathAMode.compositeKind === 'sport'
        ? "a genuine fit for the brief's top priority"
        : "a useful sport signal within the balanced reading"
      parts.push(`On sport, ${winner.name} reads as the strongest in the shortlist — ${tail}.`)
    }
  }
  // Phase 1.5 — analogous claims for academic/pastoral-led Path A so the
  // evidence paragraph reinforces the actual top priority, not always sport.
  if (pathKey === 'A' && pathAMode.compositeKind === 'academic') {
    if (compareCategoryRank(winner, 'academics', allEligibleSchools) === 'strongest') {
      parts.push(`On academics, ${winner.name} reads as the strongest in the shortlist — a genuine fit for the brief's top priority.`)
    }
  }
  if (pathKey === 'A' && pathAMode.compositeKind === 'pastoral') {
    if (compareCategoryRank(winner, 'pastoral', allEligibleSchools) === 'strongest') {
      parts.push(`On pastoral care, ${winner.name} reads as the strongest in the shortlist — a genuine fit for the brief's top priority.`)
    }
  }
  if (pathKey === 'C' && facts?.region) {
    // R8-MUST-1: only emit the "inside/outside your filter" sentence when a
    // real UK-region filter is set. If home_region is anywhere/overseas, the
    // claim "outside your stated filter" is nonsense.
    const homeRegion = briefContext.rubric.homeRegion
    const isNeutralised = !homeRegion || homeRegion === 'anywhere' || homeRegion === 'overseas'
    if (!isNeutralised) {
      parts.push(`Location: ${facts.region} — ${schoolMatchesRegion(facts, homeRegion) ? 'inside' : 'outside'} your stated filter.`)
    } else {
      parts.push(`Location: ${facts.region}.`)
    }
  }
  if (facts?.boarder_pct != null) {
    parts.push(`${facts.boarder_pct}% of pupils are boarders.`)
  }
  return parts.length > 0
    ? parts.join(' ')
    : `${winner.name} has been chosen for this path on the composite scoring of the brief.`
}

function buildBalanceParagraph({ winner, winnerFacts, briefContext, pathKey }: BuildPathInput): string {
  // Honest counterpoint — acknowledge what this path doesn't get the parent.
  const cap = briefContext.rubric.budgetMaxAnnual
  if (winnerFacts?.fee_max && cap && winnerFacts.fee_max > cap) {
    const over = Math.round((winnerFacts.fee_max - cap) / 1000)
    return `The honest balance: upper fee band is £${over}k above your stated cap. The school stays in scope if bursary support is on the table; otherwise verify the realistic fee band for Year ${briefContext.rubric.childYear ?? 'entry'} entry.`
  }
  if (pathKey === 'C') {
    // R8-MUST-1: don't say "location wins" when Path C is neutralised by
    // anywhere/overseas. Use neutral copy in that case.
    const homeRegion = briefContext.rubric.homeRegion
    const isNeutralised = !homeRegion || homeRegion === 'anywhere' || homeRegion === 'overseas'
    if (isNeutralised) {
      return `The honest balance: no UK region was specified, so location is not a deciding factor for this verdict. Path A and Path B are the meaningful readings; Path C is shown for shape consistency only.`
    }
    return `The honest balance: location wins, but the broader scoring of ${winner.name} (academics, sport) may sit lower than other shortlist schools. Verify the in-region school count and consider whether the location filter is firm.`
  }
  return `The honest balance: every path involves trade-offs — see the costs block below for what this one specifically asks you to compromise.`
}

// ── Evidence list ─────────────────────────────────────────────────────

// R6-MUST-7: evidence MUST be path-relevant. v1/v2 just grabbed the first 5
// non-empty rows regardless of path, which broke the "this is your sport
// path" promise (Path A could cite fees evidence before sport evidence).
//
// v3 walks the path's anchor categories IN PRIORITY ORDER and picks the
// strongest matching row per anchor via findStrongestEvidence(). This is
// the function that was implemented in v2 but never called.

// Path B and Path C anchor lists are static; Path A's list flexes with mode
// via pathAEvidenceCategoriesForMode() defined at the top of this file.
// UX iteration Phase 1.5 (2026-05-23): Path A was previously hardcoded to
// the sport-led category order — meant Academic-led Path A still cited sport
// evidence first.
const PATH_ANCHOR_CATEGORIES_BC: Record<'B' | 'C', DecisionCategory[]> = {
  // Balanced path: spread across all major categories, brief-rubric-led
  B: ['academics', 'sport', 'boarding', 'pastoral', 'fees'],
  // Location-led path: location/boarding first, then pastoral/academics
  C: ['location', 'boarding', 'pastoral', 'academics'],
}

function buildEvidenceList(input: BuildPathInput): PathEvidenceItem[] {
  const { winner, rowsWithProvenance, schoolIdx, pathKey, briefContext } = input
  const out: PathEvidenceItem[] = []
  const usedRowLabels = new Set<string>()

  // Pick the right anchor category list: Path A flexes with mode, B/C are static.
  const categories: DecisionCategory[] = pathKey === 'A'
    ? pathAEvidenceCategoriesForMode(pathAModeForRubric(briefContext.rubric))
    : PATH_ANCHOR_CATEGORIES_BC[pathKey]

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
