// Slice 8 Build 2 — shared brief predicates.
//
// Pure functions over the parent's child_profile brief. Used in two places:
//   1. seed-rows.ts BRIEF_SPECS → gate which brief-aware rows fire
//   2. match-reasons.ts → compute "Added because: ..." strings on shortlist add
//
// Keeping the rules in one module ensures the seeded rows and the "why we
// added this school" line stay consistent. If a brief gate fires here, the
// matching reason should fire on the shortlist too.
//
// No DB access. No side effects. No `server-only` import (called from both
// server components and the shortlist API route on the server side).

import { effectiveTopPriority, type IntentFocusCache } from './effective-top-priority.ts'

export type BriefProfile = {
  home_region?:     string | null
  child_gender?:    string | null
  child_year?:      string | null
  boarding_pref?:   string | null
  budget_range?:    string | null
  curriculum_pref?: string | null
  top_priority?:    string | null
  class_size_pref?: string | null
  sen_need?:        string | null
  ethos_pref?:      string | null
  lgbtq_pref?:      string | null
  pastoral_pref?:   string | null
  onboarding_complete?: boolean | null
  // Sport-gate fix (2026-05-24): the 5 prose fields the classifier reads.
  // Surfaced here so callers that cast child_profile → BriefProfile get them
  // for free. effectiveTopPriority uses them to hash-check cache freshness.
  academic_notes?:    string | null
  goals_notes?:       string | null
  personality_notes?: string | null
  child_wants?:       string | null
  anchors_notes?:     string | null
  // Cached parent_drill_focus from the LLM classifier (set by finalize +
  // refresh-recommendations routes). When fresh (hash + version match),
  // the cached drill_focus wins over wizard top_priority per the scorer
  // precedent at score-for-build-mode.ts:891.
  intent_focus_cache?: IntentFocusCache | null
}

export function isSportPriority(p: BriefProfile | null): boolean {
  return effectiveTopPriority(p) === 'sport'
}

export function isArtsPriority(p: BriefProfile | null): boolean {
  return effectiveTopPriority(p) === 'arts'
}

export function isPastoralPriority(p: BriefProfile | null): boolean {
  return effectiveTopPriority(p) === 'pastoral'
}

export function isAcademicPriority(p: BriefProfile | null): boolean {
  return effectiveTopPriority(p) === 'academic'
}

export function isFullOrWeeklyBoarding(p: BriefProfile | null): boolean {
  return p?.boarding_pref === 'full' || p?.boarding_pref === 'weekly'
}

export function isIbCurriculum(p: BriefProfile | null): boolean {
  return p?.curriculum_pref === 'ib'
}

export function hasSenNeed(p: BriefProfile | null): boolean {
  return p?.sen_need === 'yes-priority'
}

// lgbtq_pref enum (onboarding-fields.ts:197 + research-context-pack.ts:303):
// 'important' enables the inclusive_culture scorer; 'no-preference' normalizes
// to null in the parent ctx. Build 2 r1 fix: previous code used the wrong
// enum values (must_have / nice_to_have) and never fired in production.
export function caresAboutInclusiveCulture(p: BriefProfile | null): boolean {
  return p?.lgbtq_pref === 'important'
}

export function caresAboutPastoralDepth(p: BriefProfile | null): boolean {
  return p?.pastoral_pref === 'high_priority' || isPastoralPriority(p) || hasSenNeed(p)
}

// Build 2 r2 (Codex P2 #5): region buckets moved to lib/uk-regions.ts so
// the recommender and the brief predicates share one canonical map.
// Previously this file had its own alias set that was drifting from
// recommend-shortlist.ts (e.g. 'North Somerset' was south-west in the
// recommender but missed here). regionMatches() now delegates to the
// shared regionInBucket() helper.

export { regionInBucket as regionMatches } from '../uk-regions.ts'
