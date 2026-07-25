// VERDICT v3.1 — RECOMMENDER-DRIVEN PATH SELECTORS
//
// Three lenses on the same recommender candidate pool:
//   Path A = recommender #1 ("Best overall match")
//   Path B = strongest comparison-table academic signal, excluding A
//           ("Strongest academic")
//   Path C = lowest-fee within parent's budget, excluding A and B
//           ("Most affordable credible fit" / "Least over budget" /
//            "Lowest-fee credible fit" — depending on budget data)
//
// Hard-constraint fallback (gender single-sex / year-stage prep miss)
// preserved per path via the eligibleForPath callback. Production caller
// imports the real eligibleForPath from verdict-generator-v3-paths.ts;
// tests stub it.
//
// Behavioural matrix in path-selectors.test.mjs (21 tests).

import 'server-only'
import type {
  PathKey, PathStatus, BriefContext, SchoolFacts,
} from './verdict-generator-v3-types'

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

export type RecommenderRanking = Array<{
  slug:           string
  rank_position:  number
}>

export type FramingHint =
  | 'best_overall'
  // v3.2 (2026-05-26 — Codex Path-B-signal r1): Path B framing is now
  // signal-specific so the parent-facing copy matches which extracted
  // facts actually drove the pick. 'strongest_academic' kept as a
  // back-compat umbrella (cached overlays only); fresh generates emit
  // one of the three sub-variants below.
  | 'strongest_academic'              // legacy / cached-overlay back-compat
  | 'strongest_academic_a_level'      // A-level A*-A % drove the pick
  | 'strongest_academic_gcse'         // GCSE 9-7 % drove the pick
  | 'strongest_academic_aggregate'    // comparison-cell aggregate drove the pick
  | 'most_affordable'
  | 'least_over_budget'
  | 'lowest_fee'
  | 'next_best_fit_b'
  | 'next_best_fit_c'

export type SelectionSource =
  | 'recommender'
  | 'fallback_scored'
  | 'hard_constraint_fallback'
  | 'academic_signal'
  | 'fallback_recommender'
  | 'within_budget'
  | 'over_budget'
  | 'no_budget_set'
  | 'empty'

// ── Path B helper — tagged-priority academic signal ────────────────────
//
// v3.2 (2026-05-26 — Codex Path-B-signal r1): the previous helper read
// `categoryScores.academics` only, which aggregates GCSE + A-level + IB +
// scholarship + Oxbridge. Parent-readable "Strongest academic" should
// match the headline exam %. Sam smoke (2026-05-26): selector picked
// Rugby (60% A*-A) when Bromsgrove (61% A*-A) should have won; aggregate
// ranked Rugby higher because Rugby has more academic comparison cells.
//
// Tagged-priority sort: A-level wins ties against GCSE wins ties against
// aggregate. No magic-number scaling — debugging the selector with
// `console.log(sourceDebug)` immediately shows which signal drove each
// pick.
//
// IB caveat (Codex r1 extra): `ib_avg_40_plus_pct` is average points (out
// of 45), NOT a comparable percentage. Don't fold it into this signal
// unless/until it gets normalised + renamed.

export type AcademicSignalKind = 'a_level' | 'gcse' | 'aggregate'

export type AcademicSignal = {
  kind:     AcademicSignalKind
  priority: 3 | 2 | 1
  value:    number
}

function positiveNumber(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function academicSignal(s: ScoredSchool, facts: SchoolFacts | undefined): AcademicSignal | null {
  const aLevel = positiveNumber(facts?.a_level_a_star_a_pct)
  if (aLevel != null) return { kind: 'a_level', priority: 3, value: aLevel }

  const gcse = positiveNumber(facts?.gcse_9_7_pct)
  if (gcse != null) return { kind: 'gcse', priority: 2, value: gcse }

  const aggregate = positiveNumber(s.categoryScores.academics)
  if (aggregate != null) return { kind: 'aggregate', priority: 1, value: aggregate }

  return null
}

// ── Path C / fee-cost helper ───────────────────────────────────────────
// v3 still prefers fee_max; per-year-stage picking deferred (Codex r1 Q15).
function annualFee(f: SchoolFacts | undefined): number | null {
  if (!f) return null
  if (typeof f.fee_max === 'number' && f.fee_max > 0) return f.fee_max
  if (typeof f.fee_min === 'number' && f.fee_min > 0) return f.fee_min
  return null
}

type EligibilityFn = (
  pathKey: PathKey,
  school: ScoredSchool,
  schoolFacts: SchoolFacts | undefined,
  briefContext: BriefContext,
) => boolean

// ── Path A ─────────────────────────────────────────────────────────────

export function pickPathA_recommenderFirst(
  eligibleOnly:        ScoredSchool[],
  schoolFactsBySlug:   Map<string, SchoolFacts>,
  briefContext:        BriefContext,
  recommenderRanking:  RecommenderRanking,
  eligibleForPath:     EligibilityFn,
): { winner: ScoredSchool | null; source: SelectionSource; skippedRanks: string[] } {
  const candidates = eligibleOnly.filter(s =>
    eligibleForPath('A', s, schoolFactsBySlug.get(s.slug), briefContext))

  if (candidates.length === 0) {
    if (eligibleOnly.length === 0) {
      return { winner: null, source: 'empty', skippedRanks: [] }
    }
    const bySlugBroader = new Map(eligibleOnly.map(s => [s.slug, s]))
    const orderedBroader = [...recommenderRanking].sort(
      (a, b) => a.rank_position - b.rank_position || a.slug.localeCompare(b.slug),
    )
    for (const entry of orderedBroader) {
      const hit = bySlugBroader.get(entry.slug)
      if (hit) return { winner: hit, source: 'hard_constraint_fallback', skippedRanks: [] }
    }
    return { winner: eligibleOnly[0], source: 'hard_constraint_fallback', skippedRanks: [] }
  }

  const bySlug = new Map(candidates.map(s => [s.slug, s]))
  const skippedRanks: string[] = []

  if (recommenderRanking.length > 0) {
    const ordered = [...recommenderRanking].sort(
      (a, b) => a.rank_position - b.rank_position || a.slug.localeCompare(b.slug),
    )
    for (const entry of ordered) {
      const hit = bySlug.get(entry.slug)
      if (hit) return { winner: hit, source: 'recommender', skippedRanks }
      skippedRanks.push(`${entry.slug}@${entry.rank_position}`)
    }
  }

  return { winner: candidates[0], source: 'fallback_scored', skippedRanks }
}

// ── Path B ─────────────────────────────────────────────────────────────

export function pickPathB_strongestAcademic(
  eligibleOnly:        ScoredSchool[],
  schoolFactsBySlug:   Map<string, SchoolFacts>,
  briefContext:        BriefContext,
  recommenderRanking:  RecommenderRanking,
  excludeSlugs:        Set<string>,
  eligibleForPath:     EligibilityFn,
): { winner: ScoredSchool | null; source: SelectionSource; framingHint: FramingHint } {
  const candidates = eligibleOnly
    .filter(s => !excludeSlugs.has(s.slug))
    .filter(s => eligibleForPath('B', s, schoolFactsBySlug.get(s.slug), briefContext))

  if (candidates.length === 0) {
    const broader = eligibleOnly.filter(s => !excludeSlugs.has(s.slug))
    if (broader.length === 0) {
      return { winner: null, source: 'empty', framingHint: 'strongest_academic_aggregate' }
    }
    const bestBroader = pickAcademicBest(broader, schoolFactsBySlug)
    return {
      winner:      bestBroader?.school ?? broader[0],
      source:      'hard_constraint_fallback',
      framingHint: framingHintForAcademicSignal(bestBroader?.signal.kind),
    }
  }

  const best = pickAcademicBest(candidates, schoolFactsBySlug)
  if (best) {
    return {
      winner:      best.school,
      source:      'academic_signal',
      framingHint: framingHintForAcademicSignal(best.signal.kind),
    }
  }

  const fallback = pickRecommenderWalk(candidates, recommenderRanking)
  return {
    winner:       fallback ?? candidates[0],
    source:       'fallback_recommender',
    framingHint:  'next_best_fit_b',
  }
}

// v3.2: returns the winning school + the AcademicSignal that beat all
// others. Sort priority: signal.priority desc (a_level beats gcse beats
// aggregate), then signal.value desc, then s.score desc, then slug asc.
function pickAcademicBest(
  candidates:   ScoredSchool[],
  factsBySlug:  Map<string, SchoolFacts>,
): { school: ScoredSchool; signal: AcademicSignal } | null {
  const withAcademics = candidates
    .map(s => ({ s, signal: academicSignal(s, factsBySlug.get(s.slug)) }))
    .filter((x): x is { s: ScoredSchool; signal: AcademicSignal } => x.signal !== null)
    .sort((a, b) => {
      if (b.signal.priority !== a.signal.priority) return b.signal.priority - a.signal.priority
      if (b.signal.value    !== a.signal.value)    return b.signal.value    - a.signal.value
      if (b.s.score          !== a.s.score)          return b.s.score          - a.s.score
      return a.s.slug.localeCompare(b.s.slug)
    })
  const top = withAcademics[0]
  return top ? { school: top.s, signal: top.signal } : null
}

function framingHintForAcademicSignal(kind: AcademicSignalKind | undefined): FramingHint {
  // Default to aggregate variant when caller had no winning signal —
  // matches the empty-broader-pool case where the renderer should still
  // emit Path B's umbrella copy without claiming a specific exam metric.
  if (kind === 'a_level')   return 'strongest_academic_a_level'
  if (kind === 'gcse')      return 'strongest_academic_gcse'
  return 'strongest_academic_aggregate'
}

function pickRecommenderWalk(
  candidates: ScoredSchool[],
  ranking: RecommenderRanking,
): ScoredSchool | null {
  const bySlug = new Map(candidates.map(s => [s.slug, s]))
  const ordered = [...ranking].sort(
    (a, b) => a.rank_position - b.rank_position || a.slug.localeCompare(b.slug),
  )
  for (const entry of ordered) {
    const hit = bySlug.get(entry.slug)
    if (hit) return hit
  }
  return null
}

// ── Path C ─────────────────────────────────────────────────────────────
//
// v3 fix (Codex r2 P2.b): extract budget-aware framing into
// pickBudgetAwareCheapest() so BOTH the happy path AND the
// hard-constraint fallback branch use it. Previously fallback
// ignored budget and emitted bare 'most_affordable' framing.

type PathCPick = {
  winner:          ScoredSchool
  source:          SelectionSource
  framingHint:    FramingHint
  budgetCapLabel?: string
  overshootDetail?: string
}

function pickBudgetAwareCheapest(
  candidates:        ScoredSchool[],
  schoolFactsBySlug: Map<string, SchoolFacts>,
  briefContext:      BriefContext,
  recommenderRanking: RecommenderRanking,
  hardConstraintFallback: boolean,
): PathCPick | null {
  if (candidates.length === 0) return null

  const cap = briefContext.rubric.budgetMaxAnnual
  const capActive = typeof cap === 'number' && cap > 0
  const capLabel  = capActive ? `£${(cap / 1000).toFixed(0)}k` : undefined

  const withFees = candidates
    .map(s => ({ s, fee: annualFee(schoolFactsBySlug.get(s.slug)) }))
    .filter((x): x is { s: ScoredSchool; fee: number } => x.fee !== null)
    .sort((a, b) => a.fee - b.fee || a.s.slug.localeCompare(b.s.slug))

  if (withFees.length === 0) {
    // No fee data → recommender walk fallback.
    const fallback = pickRecommenderWalk(candidates, recommenderRanking)
    if (!fallback) return null
    return {
      winner:      fallback,
      source:      hardConstraintFallback ? 'hard_constraint_fallback' : 'fallback_recommender',
      framingHint: 'next_best_fit_c',
    }
  }

  if (capActive) {
    const withinBudget = withFees.filter(x => x.fee <= cap!)
    if (withinBudget.length > 0) {
      return {
        winner:         withinBudget[0].s,
        source:         hardConstraintFallback ? 'hard_constraint_fallback' : 'within_budget',
        framingHint:    'most_affordable',
        budgetCapLabel: capLabel,
      }
    }
    const cheapest = withFees[0]
    const overshootK = Math.max(1, Math.ceil((cheapest.fee - cap!) / 1000))
    return {
      winner:           cheapest.s,
      source:           hardConstraintFallback ? 'hard_constraint_fallback' : 'over_budget',
      framingHint:      'least_over_budget',
      budgetCapLabel:   capLabel,
      overshootDetail:  `Lowest-fee school in your shortlist is £${(cheapest.fee / 1000).toFixed(0)}k — £${overshootK}k above your ${capLabel} cap. Every other candidate is more.`,
    }
  }

  // No budget set — "Lowest-fee credible fit".
  return {
    winner:      withFees[0].s,
    source:      hardConstraintFallback ? 'hard_constraint_fallback' : 'no_budget_set',
    framingHint: 'lowest_fee',
  }
}

export function pickPathC_bestValue(
  eligibleOnly:        ScoredSchool[],
  schoolFactsBySlug:   Map<string, SchoolFacts>,
  briefContext:        BriefContext,
  recommenderRanking:  RecommenderRanking,
  excludeSlugs:        Set<string>,
  eligibleForPath:     EligibilityFn,
): { winner: ScoredSchool | null; source: SelectionSource; framingHint: FramingHint; overshootDetail?: string; budgetCapLabel?: string } {
  const candidates = eligibleOnly
    .filter(s => !excludeSlugs.has(s.slug))
    .filter(s => eligibleForPath('C', s, schoolFactsBySlug.get(s.slug), briefContext))

  // Happy path.
  const happy = pickBudgetAwareCheapest(candidates, schoolFactsBySlug, briefContext, recommenderRanking, false)
  if (happy) return happy

  // Hard-constraint fallback — same budget-aware logic, just over broader pool.
  const broader = eligibleOnly.filter(s => !excludeSlugs.has(s.slug))
  const fallback = pickBudgetAwareCheapest(broader, schoolFactsBySlug, briefContext, recommenderRanking, true)
  if (fallback) return fallback

  return { winner: null, source: 'empty', framingHint: 'most_affordable' }
}

// (no longer used; kept for back-compat with v2 tests if any imports remain)
function pickCheapest(
  candidates: ScoredSchool[],
  schoolFactsBySlug: Map<string, SchoolFacts>,
): ScoredSchool | null {
  const withFees = candidates
    .map(s => ({ s, fee: annualFee(schoolFactsBySlug.get(s.slug)) }))
    .filter((x): x is { s: ScoredSchool; fee: number } => x.fee !== null)
    .sort((a, b) => a.fee - b.fee || a.s.slug.localeCompare(b.s.slug))
  return withFees[0]?.s ?? null
}

// ── selectPathWinners ──────────────────────────────────────────────────
// v3 rename: dropped _v1 suffix (Codex r2 NIT — old export deleted).

export type PathSelectionResult = {
  winners:        Record<PathKey, ScoredSchool | null>
  pathStatus:     Record<PathKey, PathStatus>
  framingHints:   Record<PathKey, FramingHint>
  costNotes:      Record<PathKey, string | null>
  budgetCapLabel: string | null
  considerationNotes: Partial<Record<PathKey, string[]>>
  sourceDebug:    Record<PathKey, SelectionSource>
  skippedRanksDebug: string[]
  // v3 (Codex r2 P3): eligible count so statusNoteFor can tailor copy
  // when 0 / 1 / 2 schools meet coverage threshold.
  eligibleCount:  number
  // v3.3 (2026-05-26 — Sam/Jack browser smoke): each path's `sharedWith`
  // lists OTHER PathKeys whose winner is the same school. Empty when the
  // path's winner is unique. Reader uses this for "Same school as Path A"
  // badges on duplicate cards. Replaces the v3.0 strict-exclusion rule —
  // when one school honestly wins multiple lenses (e.g. Reed's cheapest
  // AND best-overall for Jack-test), we now surface that truth instead
  // of forcing a worse-but-distinct pick for the later paths.
  sharedWith:     Record<PathKey, PathKey[]>
}

export function selectPathWinners(
  eligibleOnly:        ScoredSchool[],
  schoolFactsBySlug:   Map<string, SchoolFacts>,
  briefContext:        BriefContext,
  recommenderRanking:  RecommenderRanking,
  eligibleForPath:     EligibilityFn,
): PathSelectionResult {
  const winners:        PathSelectionResult['winners']        = { A: null, B: null, C: null }
  const pathStatus:     PathSelectionResult['pathStatus']     = { A: 'winner', B: 'winner', C: 'winner' }
  const framingHints:   PathSelectionResult['framingHints']   = { A: 'best_overall', B: 'strongest_academic', C: 'most_affordable' }
  const costNotes:      PathSelectionResult['costNotes']      = { A: null, B: null, C: null }
  const considerationNotes: PathSelectionResult['considerationNotes'] = {}
  const sourceDebug:    PathSelectionResult['sourceDebug']    = { A: 'empty', B: 'empty', C: 'empty' }

  // ── Path A ──
  const a = pickPathA_recommenderFirst(
    eligibleOnly, schoolFactsBySlug, briefContext, recommenderRanking, eligibleForPath,
  )
  winners.A     = a.winner
  sourceDebug.A = a.source
  if (!a.winner) {
    pathStatus.A = 'needs_research'
  } else if (a.source === 'hard_constraint_fallback') {
    pathStatus.A = 'fallback'
  } else if (a.source === 'fallback_scored') {
    considerationNotes.A = [
      `We're using a provisional ranking — press Refresh recommendations on the Comparison tab for the latest fit.`,
    ]
  }

  // ── Path B ──
  // v3.3 (2026-05-26): empty excludeSlugs. Path B picks the actual
  // strongest-academic school even if it duplicates Path A. The
  // sharedWith bookkeeping below records the overlap for the UI badge.
  const b = pickPathB_strongestAcademic(
    eligibleOnly, schoolFactsBySlug, briefContext, recommenderRanking, new Set<string>(), eligibleForPath,
  )
  winners.B      = b.winner
  framingHints.B = b.framingHint
  sourceDebug.B  = b.source
  if (!b.winner) {
    pathStatus.B = 'needs_research'
  } else if (b.source === 'hard_constraint_fallback') {
    pathStatus.B = 'fallback'
  }

  // ── Path C ──
  // v3.3 (2026-05-26): empty excludeSlugs (same reasoning as Path B).
  const c = pickPathC_bestValue(
    eligibleOnly, schoolFactsBySlug, briefContext, recommenderRanking, new Set<string>(), eligibleForPath,
  )
  winners.C      = c.winner
  framingHints.C = c.framingHint
  sourceDebug.C  = c.source
  if (c.overshootDetail) costNotes.C = c.overshootDetail
  if (!c.winner) {
    pathStatus.C = 'needs_research'
  } else if (c.source === 'hard_constraint_fallback') {
    pathStatus.C = 'fallback'
  }

  const budgetCapLabel = c.budgetCapLabel ?? null

  // ── v3 fee-cost emission for ALL over-budget winners ───────────────
  // Codex r2 P2.a: previously only Path C emitted costNotes; over-budget
  // Path A/B winners lost the explicit fee tradeoff when the narrative
  // builder's fee-cost generator was stripped at integration time.
  // Now every selected winner gets its fee-cost note if over budget.
  // Path C with source='over_budget' or 'hard_constraint_fallback' already
  // has its `overshootDetail` set above; the loop skips it via the
  // !costNotes[pk] guard so we don't overwrite the richer Path C copy.
  const cap = briefContext.rubric.budgetMaxAnnual
  if (typeof cap === 'number' && cap > 0) {
    for (const pk of ['A', 'B', 'C'] as PathKey[]) {
      const winner = winners[pk]
      if (!winner) continue
      const fee = annualFee(schoolFactsBySlug.get(winner.slug))
      if (fee == null || fee <= cap) continue
      if (costNotes[pk]) continue   // Path C may have already set the richer over_budget copy
      const over = Math.max(1, Math.ceil((fee - cap) / 1000))
      costNotes[pk] = `Upper fee band £${(fee / 1000).toFixed(0)}k — £${over}k above your ${budgetCapLabel ?? `£${(cap / 1000).toFixed(0)}k`} cap.`
    }
  }

  // v3.3 (2026-05-26): compute sharedWith for each path — list of OTHER
  // paths whose winner is the same school. Reader uses this for "Also
  // wins Path X" badges so the same school doesn't render with a
  // contradictory copy across cards.
  const sharedWith: PathSelectionResult['sharedWith'] = { A: [], B: [], C: [] }
  for (const pk of ['A', 'B', 'C'] as PathKey[]) {
    const winner = winners[pk]
    if (!winner) continue
    for (const other of ['A', 'B', 'C'] as PathKey[]) {
      if (other === pk) continue
      const otherWinner = winners[other]
      if (otherWinner?.slug === winner.slug) sharedWith[pk].push(other)
    }
  }

  return {
    winners, pathStatus, framingHints, costNotes, budgetCapLabel,
    considerationNotes, sourceDebug,
    skippedRanksDebug: a.skippedRanks,
    eligibleCount: eligibleOnly.length,
    sharedWith,
  }
}

// ── Default-path selection ─────────────────────────────────────────────

export function selectDefaultPath(
  selection: PathSelectionResult,
): PathKey | null {
  if (selection.winners.A) return 'A'
  if (selection.winners.B) return 'B'
  if (selection.winners.C) return 'C'
  return null
}
