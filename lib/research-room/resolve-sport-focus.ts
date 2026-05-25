// Phase 2.8 (2026-05-25) — central sport-focus resolver. Used by
// score-for-build-mode.ts (Refresh/finalize codepath — fresh `intent`
// always present) and recommend-shortlist.ts (pickTopSchoolSlugs — no
// intent, falls back to cache via `profile`) so the two scorers can't
// drift. Precedence is fixed and explicit:
//
//   1. Explicit `child.interests_sports[]` (parent's structured pick wins)
//   2. Fresh `intent.sport_focus` from classifier (Refresh/finalize path)
//   3. Cached `effectiveSportFocus(profile)` (cache-only callers)
//   4. null (caller falls back to generic sport breadth scoring)
//
// When sources 1 + 2 disagree (e.g. structured says rugby, prose says
// tennis) → 1 wins. Telemetry log surfaces the conflict for visibility.

import type { BuildModeIntent } from '@/lib/server/research-room/classify-build-mode-intent'
import {
  SPORT_FOCUS_WHITELIST,
  effectiveSportFocus,
  type EffectiveTopPriorityProfile,
} from './effective-top-priority.ts'

export type SportKey = 'tennis' | 'rugby' | 'cricket' | 'football' | 'hockey'

// Mirror of score-for-build-mode.ts SPORT_SCORER_BY_LABEL keys (synonyms).
const SPORT_LABEL_TO_KEY: Record<string, SportKey> = {
  football:       'football',
  soccer:         'football',
  rugby:          'rugby',
  'rugby union':  'rugby',
  'rugby league': 'rugby',
  cricket:        'cricket',
  hockey:         'hockey',
  'field hockey': 'hockey',
  tennis:         'tennis',
}

export type ResolveSportFocusArgs = {
  /** Structured sport interests from children.interests_sports. Parent's
   *  explicit pick — wins over LLM prose inference when present. */
  interestsSports?: Array<{ sport?: string | null; level?: string | null }> | null
  /** Fresh intent from classifyBuildModeIntent. Pass when available
   *  (Refresh + finalize routes). Cache-only callers (pickTopSchoolSlugs)
   *  pass null here and fall back to `profile`. */
  intent?: Pick<BuildModeIntent, 'sport_focus'> | null
  /** Profile carrying intent_focus_cache (cache-only lookups). Only
   *  consulted when intent is absent or its sport_focus is invalid. */
  profile?: EffectiveTopPriorityProfile | null
}

export type ResolveSportFocusResult = {
  /** Effective sport, or null if no signal anywhere. */
  sport:  SportKey | null
  /** Where the signal came from. Used by telemetry/log line. */
  source: 'interests_sports' | 'intent' | 'cache' | 'none'
  /** True if interests_sports and intent/cache disagreed (logged). */
  conflict: boolean
}

export function resolveSportFocus(args: ResolveSportFocusArgs): ResolveSportFocusResult {
  const interests = (args.interestsSports ?? [])
    .map(s => SPORT_LABEL_TO_KEY[(s?.sport ?? '').toLowerCase().trim()])
    .filter((k): k is SportKey => !!k)
  const interestPick = interests[0] ?? null   // primary structured sport

  // Fresh intent first; fall back to cache via effectiveSportFocus.
  let llmPick: SportKey | null = null
  const intentValue = args.intent?.sport_focus
  if (typeof intentValue === 'string' && SPORT_FOCUS_WHITELIST.has(intentValue)) {
    llmPick = intentValue as SportKey
  } else if (args.profile) {
    const cached = effectiveSportFocus(args.profile)
    if (cached && SPORT_FOCUS_WHITELIST.has(cached)) {
      llmPick = cached as SportKey
    }
  }

  if (interestPick) {
    const conflict = !!llmPick && llmPick !== interestPick
    return { sport: interestPick, source: 'interests_sports', conflict }
  }
  if (llmPick) {
    const source: ResolveSportFocusResult['source'] =
      args.intent?.sport_focus === llmPick ? 'intent' : 'cache'
    return { sport: llmPick, source, conflict: false }
  }
  return { sport: null, source: 'none', conflict: false }
}
