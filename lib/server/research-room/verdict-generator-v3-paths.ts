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

// ── Hard-constraint filtering ───────────────────────────────────────────
// v3.1 (2026-05-26): only this and the v3.1 framing block at the bottom
// survive. All composite scorers + the old selectPathWinners + framing
// helpers + same_winner detector deleted — recommender-driven selection
// lives in path-selectors.ts.

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

// ════════════════════════════════════════════════════════════════════════
// v3.1 (2026-05-26) — recommender-driven framing
// ════════════════════════════════════════════════════════════════════════
//
// FRAMING_TABLE is the single source of truth for path copy + evidence-
// category priority + opener template, keyed by `framingHint` from
// path-selectors.ts. The legacy composite scorers + topPriority-driven
// pathAModeForRubric + PATH_FRAMING + framingForPath + ANCHOR_NOUN +
// detectSameWinnerAcrossPaths + old selectPathWinners / selectDefaultPath
// were deleted in the v3.1 cleanup commit. Only eligibleForPath survives
// from the pre-v3.1 file — same gender/year-stage rules apply, used by
// the new selectors in path-selectors.ts.

import type { FramingHint } from './path-selectors'

export type FramingEntry = {
  framing:                  string
  framingLong:              (capLabel: string | null) => string
  anchor:                   string
  evidenceCategoryPriority: DecisionCategory[]
  opener:                   (schoolName: string, capLabel: string | null) => string
}

export const FRAMING_TABLE: Record<FramingHint, FramingEntry> = {
  best_overall: {
    framing:                  'Best overall match',
    framingLong:              () => '…the highest-fit school in your shortlist per our latest recommendations',
    anchor:                   'overall',
    evidenceCategoryPriority: ['academics', 'sport', 'pastoral', 'boarding', 'community'],
    opener:                   (school) => `${school} leads Path A because the recommender currently ranks it #1 against the child's brief.`,
  },
  // Legacy umbrella — kept for back-compat with cached verdict_json from
  // v3.1-pre-Sam-fix records. Fresh generates emit one of the three
  // signal-specific variants below (a_level / gcse / aggregate).
  strongest_academic: {
    framing:                  'Strongest academic',
    framingLong:              () => '…the school in your shortlist with the strongest academic evidence',
    anchor:                   'academic',
    evidenceCategoryPriority: ['academics', 'scholarship', 'community', 'boarding'],
    opener:                   (school) => `${school} leads Path B because it has the strongest academic evidence among the shortlist.`,
  },
  // v3.2 (2026-05-26 — Codex Path-B-signal r1): signal-specific Path B
  // copy. selectPathWinners picks the variant by which AcademicSignalKind
  // won (a_level > gcse > aggregate). Parent reads honest copy that
  // matches the metric that actually drove the pick.
  strongest_academic_a_level: {
    framing:                  'Strongest academic',
    framingLong:              () => '…the school in your shortlist with the highest published A-level A*-A rate',
    anchor:                   'academic',
    evidenceCategoryPriority: ['academics', 'scholarship', 'community', 'boarding'],
    opener:                   (school) => `${school} leads Path B because it has the highest published A-level A*-A rate among the shortlist.`,
  },
  strongest_academic_gcse: {
    framing:                  'Strongest academic',
    framingLong:              () => '…the school in your shortlist with the highest published GCSE 9-7 rate (A-level results not yet extracted across the shortlist)',
    anchor:                   'academic',
    evidenceCategoryPriority: ['academics', 'scholarship', 'community', 'boarding'],
    opener:                   (school) => `${school} leads Path B because it has the highest published GCSE 9-7 rate among the shortlist (A-level results not yet extracted).`,
  },
  strongest_academic_aggregate: {
    framing:                  'Strongest academic',
    framingLong:              () => '…the school in your shortlist with the strongest academic evidence in the comparison table (extracted exam rates not yet available for all candidates)',
    anchor:                   'academic',
    evidenceCategoryPriority: ['academics', 'scholarship', 'community', 'boarding'],
    opener:                   (school) => `${school} leads Path B because it has the strongest aggregate academic signal in the comparison evidence (extracted exam rates aren't available for every candidate yet).`,
  },
  next_best_fit_b: {
    framing:                  'Next-best fit',
    framingLong:              () => "…academic results aren't in the comparison evidence yet; this is the recommender's next-best fit",
    anchor:                   'next-best',
    evidenceCategoryPriority: ['academics', 'sport', 'pastoral', 'boarding', 'community'],
    opener:                   (school) => `${school} leads Path B as the next-best fit on the recommender's ranking — academic results aren't in the comparison yet.`,
  },
  most_affordable: {
    framing:                  'Most affordable credible fit',
    framingLong:              (cap) => `…the lowest-fee school in your shortlist that's still within your ${cap ?? 'stated'} cap`,
    anchor:                   'value',
    evidenceCategoryPriority: ['fees', 'academics', 'boarding', 'community'],
    opener:                   (school, cap) => `${school} leads Path C because it's the lowest-fee shortlist option within your ${cap ?? 'stated'} budget.`,
  },
  least_over_budget: {
    framing:                  'Least over budget',
    framingLong:              (cap) => `…every school in your shortlist exceeds your ${cap ?? 'stated'} cap; this is the smallest overshoot`,
    anchor:                   'value-overshoot',
    evidenceCategoryPriority: ['fees', 'academics', 'boarding', 'community'],
    opener:                   (school, cap) => `${school} leads Path C as the smallest overshoot — every shortlist option exceeds your ${cap ?? 'stated'} cap.`,
  },
  lowest_fee: {
    framing:                  'Lowest-fee credible fit',
    framingLong:              () => '…the lowest-fee school in your shortlist. Set a budget in the brief for a more targeted reading.',
    anchor:                   'value',
    evidenceCategoryPriority: ['fees', 'academics', 'boarding', 'community'],
    opener:                   (school) => `${school} leads Path C as the lowest-fee shortlist option (no budget was set in the brief).`,
  },
  next_best_fit_c: {
    framing:                  'Next-best fit',
    framingLong:              () => "…fee data isn't in the comparison evidence for this shortlist; this is the recommender's next-best fit",
    anchor:                   'next-best',
    evidenceCategoryPriority: ['fees', 'academics', 'boarding', 'community'],
    opener:                   (school) => `${school} leads Path C as the next-best fit on the recommender's ranking — fee data isn't in the comparison yet.`,
  },
}

const ANCHOR_NOUN_V2: Record<string, string> = {
  overall:           'best-fit winner',
  academic:          'academic-led winner',
  value:             'value-led winner',
  'value-overshoot': 'value-led winner',
  'next-best':       'next-best fit',
}

export function framingForPathV2(
  _pathKey:       PathKey,
  framingHint:    FramingHint,
  budgetCapLabel: string | null,
): { framing: string; framingLong: string; anchor: string } {
  const e = FRAMING_TABLE[framingHint]
  return { framing: e.framing, framingLong: e.framingLong(budgetCapLabel), anchor: e.anchor }
}

export function evidenceCategoryPriorityFor(framingHint: FramingHint): DecisionCategory[] {
  return FRAMING_TABLE[framingHint].evidenceCategoryPriority
}

export function openerForPath(
  framingHint:    FramingHint,
  schoolName:     string,
  budgetCapLabel: string | null,
): string {
  return FRAMING_TABLE[framingHint].opener(schoolName, budgetCapLabel)
}

export function statusNoteForV2(
  pathStatus:    PathStatus,
  pathKey:       PathKey,
  framingHint:   FramingHint,
  eligibleCount: number,
): string | undefined {
  if (pathStatus === 'winner') return undefined
  if (pathStatus === 'fallback') {
    const noun = ANCHOR_NOUN_V2[FRAMING_TABLE[framingHint].anchor] ?? 'winner'
    return `No eligible ${noun} passes the brief's hard constraints (gender single-sex or year-stage match). The closest broader fit is shown as a fallback; below-threshold schools that match this anchor are listed under "couldn't compare yet."`
  }
  // needs_research — copy tailors to eligible count
  if (eligibleCount === 0) {
    return `No school in your shortlist meets the 50% comparison-coverage threshold yet. Fill in more comparison rows on at least one school and re-run.`
  }
  if (pathKey === 'A') {
    return `We don't have a top recommendation yet for this child's brief. Add at least one school with ≥50% comparison coverage and re-run.`
  }
  if (pathKey === 'B') {
    return eligibleCount === 1
      ? `Only one school in your shortlist meets coverage threshold — add another for a Path B reading.`
      : `Couldn't pick a Path B school distinct from Path A — add another shortlist school and re-run.`
  }
  // Path C
  return eligibleCount <= 2
    ? `Only ${eligibleCount} school${eligibleCount === 1 ? '' : 's'} in your shortlist meet${eligibleCount === 1 ? 's' : ''} coverage threshold — add another for a Path C reading.`
    : `Path C couldn't pick a third school distinct from Path A and Path B — add another shortlist school and re-run.`
}
