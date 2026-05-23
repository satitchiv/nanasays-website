// VERDICT GENERATOR v3 — PATH MATH (sketch)
//
// One scoring run + composite-category path selectors (R2-F4).
// Clamped normalization (R3-P2): clamp(categoryScore, 0, cap) / cap.
// Hard-constraint filtering before path-winner eligibility (R3-Q5).
// Composite=0 → needs_research, not winner (R4-MUST-4).
// Same-winner-across-paths grouping (R2-Q5, R4-MUST-5).

import type {
  PathKey, PathStatus, PathOverlay, BriefContext, SchoolFacts, HardConstraint,
} from './verdict-generator-v3-types'

// The existing ScoredSchool type from verdict-generator.ts:83. Re-declared for
// sketch clarity; will be imported in the integration file.
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

// ── Category caps (mirror of categoryCap() in verdict-generator.ts:390) ──
// Used for normalization; values come from the existing rubric-based cap function.

function cap(category: DecisionCategory, rubric: BriefContext['rubric']): number {
  if (category === 'sport')        return rubric.topPriority === 'sport' ? 11 : 6
  if (category === 'boarding')     return rubric.boardingPref?.includes('full') ? 9 : 6
  if (category === 'pastoral')     return rubric.senNeed && !rubric.senNeed.includes('no-concern') ? 8 : 6
  if (category === 'fees')         return rubric.budgetMaxAnnual ? 7 : 5
  if (category === 'location')     return rubric.homeRegion ? 5 : 4
  if (category === 'academics')    return 7
  if (category === 'admissions')   return rubric.childYear && rubric.childYear >= 8 ? 5 : 3
  if (category === 'scholarship')  return 5
  if (category === 'school_stage') return 9
  if (category === 'community')    return 4
  return 4
}

function sumOfCaps(rubric: BriefContext['rubric']): number {
  const cats: DecisionCategory[] = [
    'sport','boarding','pastoral','academics','fees','location',
    'admissions','school_stage','scholarship','community','other',
  ]
  return cats.reduce((acc, c) => acc + cap(c, rubric), 0)
}

// ── Clamped score-over-cap normalization (R3-P2) ────────────────────────

function norm(
  school: ScoredSchool,
  category: DecisionCategory,
  rubric: BriefContext['rubric'],
): number {
  const raw = school.categoryScores[category] ?? 0
  const c   = cap(category, rubric)
  const clamped = Math.max(0, Math.min(c, raw))     // R3 fix: clamp before divide
  return c > 0 ? clamped / c : 0
}

// ── Region-match bonus for locationComposite ────────────────────────────
//
// R5-MUST-6: use the SHARED schoolMatchesRegion() from -brief.ts so Path C
// composite math uses the same regional logic as the tension detectors.
// Previously this had its own substring matcher that failed on
// "south-west" vs "Somerset" — a Dorset school would not match the
// south-west filter.
//
// R5-MUST-6 also: neutral case returns 0 (NOT 0.5). Previously the neutral
// bonus added positive signal to locationComposite even when the parent had
// no location preference, undermining the composite=0 → needs_research rule.
// When there's no targeting filter, location category score speaks for itself
// — the bonus contributes nothing.

import { schoolMatchesRegion as schoolMatchesRegionShared } from './verdict-generator-v3-brief'

function regionMatchBonus(
  school: ScoredSchool,
  schoolFacts: SchoolFacts | undefined,
  rubric: BriefContext['rubric'],
): number {
  const filter = rubric.homeRegion
  // No targeting filter → no positive bonus. Location category score stands alone.
  if (!filter || filter === 'anywhere' || filter === 'overseas') return 0
  if (!schoolFacts?.region) return 0    // unknown school region → no positive bonus
  return schoolMatchesRegionShared(schoolFacts, filter) ? 1.0 : 0.0
}

// ── The three composites ────────────────────────────────────────────────

export function sportComposite(
  s: ScoredSchool, rubric: BriefContext['rubric'],
): number {
  return 0.55 * norm(s, 'sport', rubric)
       + 0.20 * norm(s, 'scholarship', rubric)
       + 0.25 * norm(s, 'community', rubric)
}

// UX iteration Phase 1 (2026-05-23): Path A composite is adaptive to the
// parent's stated top_priority. Previously Path A was hardcoded to
// sportComposite, which surfaced "If sport is the priority — School X" as a
// hypothetical framing even for parents who never stated sport as a priority.
// Now Path A flexes:
//   - topPriority='sport' → sportComposite (unchanged from before)
//   - topPriority='academic' / 'academics' → academic-weighted composite
//   - topPriority='pastoral' → pastoral-weighted composite
//   - topPriority=null/empty/unknown value → balancedComposite (best overall fit)
// The framing string updates in lockstep via pathAFraming() below.
//
// Phase 2 (deferred): LLM-classified top-3 priorities → all 3 paths adaptive
// (A=#1, B=#2, C=#3) instead of just Path A.
export function pathAComposite(
  s: ScoredSchool, rubric: BriefContext['rubric'],
): number {
  const tp = rubric.topPriority?.toLowerCase().trim()
  if (!tp) {
    // No stated priority → "Best overall fit" semantics. balancedComposite
    // returns score / sumOfCaps, the same ranking the scorer's top would use.
    return balancedComposite(s, rubric)
  }
  if (tp === 'sport') {
    return sportComposite(s, rubric)
  }
  if (tp === 'academic' || tp === 'academics') {
    return 0.55 * norm(s, 'academics', rubric)
         + 0.20 * norm(s, 'scholarship', rubric)
         + 0.25 * norm(s, 'community', rubric)
  }
  if (tp === 'pastoral') {
    return 0.55 * norm(s, 'pastoral', rubric)
         + 0.25 * norm(s, 'community', rubric)
         + 0.20 * norm(s, 'scholarship', rubric)
  }
  // Unknown topPriority value → balanced fallback
  return balancedComposite(s, rubric)
}

export function balancedComposite(
  s: ScoredSchool, rubric: BriefContext['rubric'],
): number {
  const total = sumOfCaps(rubric)
  const clamped = Math.max(0, Math.min(total, s.score))
  return total > 0 ? clamped / total : 0
}

export function locationComposite(
  s: ScoredSchool, rubric: BriefContext['rubric'], schoolFacts: SchoolFacts | undefined,
): number {
  return 0.50 * norm(s, 'location', rubric)
       + 0.25 * norm(s, 'boarding', rubric)
       + 0.25 * regionMatchBonus(s, schoolFacts, rubric)
}

// ── Hard-constraint filtering (R3-Q5 + R4 fallback policy) ──────────────
//
// Schools with hard violations are removed from PATH-WINNER eligibility.
// Soft penalties stay in the composite math.
//
// Returns true if the school is eligible to win the given path.

export function eligibleForPath(
  pathKey: PathKey,
  school:  ScoredSchool,
  schoolFacts: SchoolFacts | undefined,
  briefContext: BriefContext,
): boolean {
  // Gender single-sex constraint
  const gender = briefContext.hardConstraints.find(c => c.kind === 'gender-single-sex')
  if (gender && schoolFacts?.gender_split) {
    if (gender.value === 'boy'  && /^girls?$/i.test(schoolFacts.gender_split)) return false
    if (gender.value === 'girl' && /^boys?$/i.test(schoolFacts.gender_split)) return false
  }

  // Year-stage hard miss — senior year on prep-stage school
  const yearStage = briefContext.hardConstraints.find(c => c.kind === 'year-stage')
  if (yearStage) {
    const year = Number(yearStage.value)
    const identity = `${school.name} ${school.slug}`.toLowerCase()
    if (year >= 9 && /(prep|preparatory|primary)/.test(identity)) return false
  }

  return true
}

// ── Path selector ──────────────────────────────────────────────────────

export type PathSelectionResult = {
  winners:       Record<PathKey, ScoredSchool | null>
  composites:    Record<PathKey, Map<string, number>>    // slug → composite for that path
  pathStatus:    Record<PathKey, PathStatus>
  fallbackSlug:  Record<PathKey, string | null>          // best broader school if no eligible
}

export function selectPathWinners(
  scoredSchools: ScoredSchool[],
  schoolFactsBySlug: Map<string, SchoolFacts>,
  briefContext: BriefContext,
  eligibleOnly: ScoredSchool[],    // schools with ≥50% coverage; passed by caller
): PathSelectionResult {
  const composites: PathSelectionResult['composites'] = {
    A: new Map(), B: new Map(), C: new Map(),
  }
  const rubric = briefContext.rubric

  // Compute composites for ALL eligible schools.
  // UX iteration Phase 1 (2026-05-23): Path A now uses pathAComposite which
  // adapts to rubric.topPriority (sport / academic / pastoral / balanced).
  for (const school of eligibleOnly) {
    const facts = schoolFactsBySlug.get(school.slug)
    composites.A.set(school.slug, pathAComposite(school, rubric))
    composites.B.set(school.slug, balancedComposite(school, rubric))
    composites.C.set(school.slug, locationComposite(school, rubric, facts))
  }

  const winners:     PathSelectionResult['winners']      = { A: null, B: null, C: null }
  const pathStatus:  PathSelectionResult['pathStatus']   = { A: 'winner', B: 'winner', C: 'winner' }
  const fallbackSlug: PathSelectionResult['fallbackSlug'] = { A: null, B: null, C: null }

  // R7-SHOULD-2: Path C fully neutralised when home_region is 'anywhere' or
  // 'overseas' — the parent didn't express a region preference, so there's
  // no honest "location-led winner" to declare. Mark it needs_research with
  // a clear explanation. (Path A / B still compute normally.)
  const homeRegion = rubric.homeRegion
  const pathCNeutralised = !homeRegion || homeRegion === 'anywhere' || homeRegion === 'overseas'

  for (const p of ['A', 'B', 'C'] as PathKey[]) {
    if (p === 'C' && pathCNeutralised) {
      // No region target → no Path C winner. Show the top eligible school as
      // a soft suggestion (so the UI has a school to render) but flag the
      // path as needs_research with honest copy.
      const sortedC = [...eligibleOnly].sort(
        (a, b) => (composites.C.get(b.slug) ?? 0) - (composites.C.get(a.slug) ?? 0),
      )
      winners.C    = sortedC[0] ?? null
      pathStatus.C = 'needs_research'
      continue
    }

    const compositeMap = composites[p]
    // Build eligibility-filtered list for this specific path's hard constraints.
    const candidates = eligibleOnly
      .filter(s => eligibleForPath(p, s, schoolFactsBySlug.get(s.slug), briefContext))
      .sort((a, b) => (compositeMap.get(b.slug) ?? 0) - (compositeMap.get(a.slug) ?? 0))

    if (candidates.length === 0) {
      // Hard-filter eliminated everyone for this path — R4-MUST-5 fallback.
      pathStatus[p] = 'fallback'
      // Pick the best broader eligible school (without the path's hard filter).
      const broader = [...eligibleOnly].sort(
        (a, b) => (compositeMap.get(b.slug) ?? 0) - (compositeMap.get(a.slug) ?? 0),
      )[0] ?? null
      fallbackSlug[p] = broader?.slug ?? null
      winners[p] = broader
      continue
    }

    const top = candidates[0]
    const topComposite = compositeMap.get(top.slug) ?? 0

    if (topComposite === 0) {
      // R4-MUST-4: every candidate's composite is zero → no positive signal.
      pathStatus[p] = 'needs_research'
      winners[p] = top                 // still point at the highest-ranked, but mark as needs_research
    } else {
      pathStatus[p] = 'winner'
      winners[p] = top
    }
  }

  return { winners, composites, pathStatus, fallbackSlug }
}

// ── Same-winner-across-paths detection (R2-Q5 + R4-MUST-5) ──────────────
//
// Returns the structure for verdict_json.same_winner_across_paths when two or
// three REAL WINNER paths point at the same school. Fallback paths sharing a
// school with a real winner are NOT collapsed — they get separate badges.

export function detectSameWinnerAcrossPaths(
  selection: PathSelectionResult,
): { winner_slug: string; paths: PathKey[] } | undefined {
  const grouped: Record<string, PathKey[]> = {}
  for (const p of ['A', 'B', 'C'] as PathKey[]) {
    if (selection.pathStatus[p] !== 'winner') continue     // only count real wins
    const w = selection.winners[p]
    if (!w) continue
    grouped[w.slug] = grouped[w.slug] ?? []
    grouped[w.slug].push(p)
  }
  for (const [slug, paths] of Object.entries(grouped)) {
    if (paths.length >= 2) return { winner_slug: slug, paths }
  }
  return undefined
}

// ── Default path selection (R4 Q1) ──────────────────────────────────────
//
// Pre-select the path on UI first paint whose WINNING school has the highest
// composite (against the brief's full rubric, which the composites already
// encode). Tie-breaker: alphabetical A → B → C.

// Codex r1 P1 #3 hardening (2026-05-22): return type widened to PathKey | null.
// The previous PathKey return defaulted to 'A' when every path was skipped (all
// needs_research or null winners), producing a default_path that pointed at no
// real winner. The caller now also guards against this case via `noUsablePath`,
// but returning null here is defense-in-depth for any future caller.
export function selectDefaultPath(selection: PathSelectionResult): PathKey | null {
  let best: PathKey | null = null
  let bestScore = -Infinity
  for (const p of ['A', 'B', 'C'] as PathKey[]) {
    if (selection.pathStatus[p] === 'needs_research') continue   // don't auto-select a no-positive-signal path
    const winner = selection.winners[p]
    if (!winner) continue
    const composite = selection.composites[p].get(winner.slug) ?? 0
    if (composite > bestScore) {
      best = p
      bestScore = composite
    }
  }
  return best
}

// ── PathOverlay assembly entry-point ───────────────────────────────────
//
// Called by the main integration. Uses the narrative builder (-narrative.ts)
// to produce the prose; this file just produces the structure.
//
// The full PathOverlay object includes:
//   - framing / framingLong (hardcoded per path key)
//   - winner_slug / path_status
//   - status_note (when not 'winner')
//   - reasoning[]/evidence[]/costs[]/considerations[] from the narrative builder
//
// Status-note copy:
//   path_status='fallback'       → "No proven [anchor] winner yet — best broader fit shown."
//   path_status='needs_research' → "Comparison evidence too thin to declare a winner here."
//   path_status='winner'         → undefined (no status_note needed)

export const PATH_FRAMING: Record<PathKey, { framing: string; framingLong: string; anchor: string }> = {
  A: {
    framing:     'If sport is the priority',
    framingLong: '…the brief says sport is top priority',
    anchor:      'sport',
  },
  B: {
    framing:     'If you want both, equal weight',
    framingLong: '…the balance the brief actually describes',
    anchor:      'balance',
  },
  C: {
    framing:     'If your location filter is firm',
    framingLong: '…location outranks the other anchors',
    anchor:      'location',
  },
}

// R10-SHOULD-1: when Path C is neutralised by anywhere/overseas, the static
// framing strings above ("If your location filter is firm" / "location
// outranks the other anchors") are misleading. Callers building a PathOverlay
// should use this override for the framing/framingLong fields whenever
// home_region is `anywhere`/`overseas`.
export const PATH_C_NEUTRALISED_FRAMING = {
  framing:     'Path C — neutralised',
  framingLong: '…no UK region target was specified in your brief',
} as const

// UX iteration Phase 1 (2026-05-23): signature widened from (pathKey, homeRegion)
// to (pathKey, rubric) so Path A's framing can adapt to the parent's
// topPriority. Path C's homeRegion-neutralisation behaviour preserved unchanged;
// Path B unchanged. Backward-compat shim: callers passing JUST a homeRegion
// string (old signature) won't compile, surfacing the migration explicitly.
export function framingForPath(
  pathKey: PathKey,
  rubric: BriefContext['rubric'],
): { framing: string; framingLong: string; anchor: string } {
  // Path A adapts to rubric.topPriority. Best-overall-fit fallback when null.
  if (pathKey === 'A') {
    const tp = rubric.topPriority?.toLowerCase().trim()
    if (!tp) {
      return {
        framing:     'Best overall fit',
        framingLong: '…highest-scoring school across all dimensions of your brief',
        anchor:      'overall',
      }
    }
    const labelLower = tp.replace(/-/g, ' ')
    return {
      framing:     `If ${labelLower} is the priority`,
      framingLong: `…the brief says ${labelLower} is top priority`,
      anchor:      tp,
    }
  }

  const base = PATH_FRAMING[pathKey]
  if (pathKey === 'C' && (!rubric.homeRegion || rubric.homeRegion === 'anywhere' || rubric.homeRegion === 'overseas')) {
    return { ...base, ...PATH_C_NEUTRALISED_FRAMING }
  }
  return base
}

// R6-SHOULD-FIX-2: fallback copy now references the ACTUAL hard constraints
// in effect (gender single-sex + year-stage prep miss) — not invented
// "hard sport/location/balance criteria". The only paths that can fall
// through hard filters in V1 are Paths whose winner-candidates all fail
// gender or year-stage; no anchor is "hard" in V1.
// R9-MUST-2: statusNoteFor needs the briefContext to know whether Path C is
// neutralised by anywhere/overseas (in which case the cause isn't "evidence
// too thin", it's "no UK region was specified"). Takes an optional homeRegion
// arg — callers that don't pass it get the legacy generic copy.
// UX iteration Phase 1 (2026-05-23): signature widened to take rubric so the
// anchor used in copy can be dynamic (Path A's anchor flexes with
// rubric.topPriority — e.g. 'academic'-led winner instead of always 'sport'-led).
// Path C's neutralisation copy still keys off rubric.homeRegion. Path B unchanged.
export function statusNoteFor(
  pathStatus: PathStatus,
  pathKey:    PathKey,
  rubric?:    BriefContext['rubric'] | null,
): string | undefined {
  if (pathStatus === 'winner') return undefined

  // Anchor comes from framingForPath when we have rubric (dynamic Path A), else
  // falls back to PATH_FRAMING's static anchor (legacy callers).
  const anchor = rubric
    ? framingForPath(pathKey, rubric).anchor
    : PATH_FRAMING[pathKey].anchor

  if (pathStatus === 'fallback') {
    return `No eligible ${anchor}-led winner passes the brief's hard constraints (gender single-sex or year-stage match). The closest broader fit is shown as a fallback; below-threshold schools that match this anchor are listed under "couldn't compare yet."`
  }

  // R9-MUST-2: needs_research with Path C + no UK region target = neutralised,
  // not evidence-thin.
  const homeRegion = rubric?.homeRegion
  if (
    pathKey === 'C' &&
    (!homeRegion || homeRegion === 'anywhere' || homeRegion === 'overseas')
  ) {
    return `Path C is neutralised because your brief didn't specify a UK region (you chose "${homeRegion === 'overseas' ? 'overseas' : 'anywhere in the UK'}"). There's no region target to compare against — Path A and Path B remain the meaningful readings.`
  }

  return `Comparison evidence is too thin to declare a clear ${anchor}-led winner here. The top candidate is shown but verdict confidence is low — fill in more comparison rows and re-run.`
}
