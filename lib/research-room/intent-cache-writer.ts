// Sport-gate fix (2026-05-24) — DRY helper for writing the intent_focus_cache
// that both finalize and refresh-recommendations need after classifying.
//
// Lifecycle context: classifyBuildModeIntent runs in finalize/route.ts:461
// and refresh-recommendations/route.ts:247. Both routes need to persist the
// resulting parent_drill_focus on `children.child_profile.intent_focus_cache`
// so downstream seeders (page-load + write-action) read the same effective
// priority without re-running the classifier.
//
// Race window (KNOWN LIMITATION, Phase 2.7 follow-up):
//   - Helper re-fetches latest child_profile right before .update() to avoid
//     clobbering concurrent JSON changes (e.g. children_set_notes_interpretation
//     RPC in the refresh route).
//   - A child-profile PATCH (app/api/children/[id]/route.ts:44) landing in the
//     ~5-20ms window between our re-fetch and our .update() would still get
//     clobbered. Best-effort cache; worst case is one wasted re-classify on
//     next finalize. Full fix needs a Postgres atomic JSONB merge RPC —
//     filed as Phase 2.7 in TASKS.md.

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildIntentFocusCache,
  cacheNeedsRefresh,
  type EffectiveTopPriorityProfile,
  type IntentFocusCache,
  type IntentLike,
} from './effective-top-priority'

export type WriteResult = {
  /** Freshly-merged profile (or caller's snapshot when cacheable=false or
   *  re-fetch failed). Caller threads into downstream code in the same
   *  request that reads child_profile (e.g. loadMatchReasonsBatch). */
  updatedProfile: Record<string, unknown>
  /** Resolved cache (null when cacheable=false). */
  focusCache:     IntentFocusCache | null
  /** True iff we issued a DB update call (regardless of success). */
  attempted:      boolean
  /** True iff the DB update returned with no error. */
  wrote:          boolean
}

export async function writeIntentFocusCacheIfChanged(args: {
  svc:             SupabaseClient
  childId:         string
  /** Caller's snapshot of child_profile (must match what classifyBuildModeIntent saw). */
  rawChildProfile: Record<string, unknown>
  drillFocus:      IntentLike['parent_drill_focus']
  /** Phase 2.8 — concrete sport from classifier prose parse. */
  sportFocus:      IntentLike['sport_focus']
  version:         string
  /** Codex r5 P1: pass false when intent came from FALLBACK_INTENT
   *  (transient classifier failure). Skips persistence to avoid poisoning
   *  a valid prior 'sport' cache with 'none' from a network blip. */
  cacheable:       boolean
}): Promise<WriteResult> {
  const newCache = buildIntentFocusCache({
    drillFocus: args.drillFocus,
    sportFocus: args.sportFocus,
    profile:    args.rawChildProfile as EffectiveTopPriorityProfile,
    version:    args.version,
  })

  // Classifier fallback path — don't persist 'none' that might be wrong.
  if (!args.cacheable) {
    return {
      updatedProfile: args.rawChildProfile,
      focusCache:     null,
      attempted:      false,
      wrote:          false,
    }
  }

  // Re-fetch the latest child_profile right before merging (narrows the
  // read/modify/write race window).
  let latestProfile: Record<string, unknown> | null = null
  try {
    const { data: latest, error: readErr } = await args.svc
      .from('children')
      .select('child_profile')
      .eq('id', args.childId)
      .maybeSingle()
    if (!readErr && latest?.child_profile && typeof latest.child_profile === 'object') {
      latestProfile = latest.child_profile as Record<string, unknown>
    }
  } catch (e) {
    console.warn('[intent-focus-cache] latest-read failed:', e instanceof Error ? e.message : String(e))
  }

  // Codex r5 P2: when re-fetch fails, SKIP the write rather than overwriting
  // with caller's stale snapshot. Return in-memory profile for same-request
  // use; next finalize re-attempts with a fresh base.
  if (!latestProfile) {
    return {
      updatedProfile: { ...args.rawChildProfile, intent_focus_cache: newCache },
      focusCache:     newCache,
      attempted:      false,
      wrote:          false,
    }
  }

  const existingCache = (latestProfile.intent_focus_cache ?? null) as IntentFocusCache | null
  if (!cacheNeedsRefresh(existingCache, newCache)) {
    return {
      updatedProfile: latestProfile,
      focusCache:     existingCache as IntentFocusCache,
      attempted:      false,
      wrote:          false,
    }
  }

  const updatedProfile = { ...latestProfile, intent_focus_cache: newCache }

  let wroteSuccessfully = false
  try {
    const { error: writeErr } = await args.svc
      .from('children')
      .update({
        child_profile: updatedProfile,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', args.childId)
    if (writeErr) {
      console.warn('[intent-focus-cache] write failed (proceeding):', writeErr.message)
    } else {
      wroteSuccessfully = true
    }
  } catch (e) {
    console.warn('[intent-focus-cache] write threw (proceeding):', e instanceof Error ? e.message : String(e))
  }

  return {
    updatedProfile,
    focusCache: newCache,
    attempted:  true,
    wrote:      wroteSuccessfully,
  }
}
