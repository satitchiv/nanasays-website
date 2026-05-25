// Sport-gate fix (2026-05-24) — central helper that resolves the "effective
// top priority" from the parent's wizard dropdown + the LLM classifier's
// drill_focus. Codex design audit chose Option B+ (central helper + cache):
//   - drill_focus wins when present and !== 'none' (Yoko slice Codex r1 Q7
//     precedent in score-for-build-mode.ts:891).
//   - When drill_focus is 'none' or absent, fall back to trimmed wizard.
//   - Strict mirror of the scorer rule. NO permissive OR.
//
// Caching strategy (Codex r1 P0 lifecycle stability fix):
//   - The classifier runs ONCE per finalize/refresh call, but seeded
//     comparison_rows get RECONCILED on every page-load (app/nana/research-room/
//     page.tsx:219) + every write-action add_school (write-action/route.ts:584).
//   - Without persistence, ephemeral intent-only seeding would be undone by
//     later reconcile passes (which only see wizard fields via child_profile).
//   - Fix: cache parent_drill_focus on `children.child_profile.intent_focus_cache`
//     with a source_hash over the 5 prose fields + a version stamp.
//
// Hardening history (Codex r2 + r3 + r5):
//   - safeString(v) coerces non-strings to '' (children.child_profile is
//     arbitrary JSON via app/api/children/[id]/route.ts:44).
//   - JSON.stringify(parts) hash encoding avoids delimiter ambiguity.
//   - VERSION enforcement: cache used only when version matches expected.
//   - cacheNeedsRefresh skips DB writes when value+hash+version unchanged
//     (preserves computed_at → verdict input_hash stays stable).

import { createHash } from 'node:crypto'

// Small structural intent type — DO NOT import the full BuildModeIntent from
// server (keeps brief-predicates.ts free of server-only deps so it stays
// importable from both server + client/test contexts).
export type IntentLike = {
  parent_drill_focus?: 'academic' | 'sport' | 'pastoral' | 'arts' | 'all-round' | 'none' | null | undefined
  // Phase 2.8 — concrete sport from the LLM classifier prose parse.
  sport_focus?:        'tennis' | 'rugby' | 'cricket' | 'football' | 'hockey' | 'none' | null | undefined
}

// Cache shape: persisted to children.child_profile.intent_focus_cache.
// Phase 2.8 — `sport_focus` added alongside `value`. Old caches without
// sport_focus become stale after the version bump and fall back to
// wizard via the version-mismatch check below.
export type IntentFocusCache = {
  value:       string                       // the classifier's parent_drill_focus value
  sport_focus: string                       // tennis|rugby|cricket|football|hockey|none
  source_hash: string                       // sha256 over the 5 prose fields
  version:     string                       // expected to match CLASSIFICATION_VERSION
  computed_at: string                       // ISO timestamp
}

// Default expected version — mirrors classify-build-mode-intent.ts's
// CLASSIFICATION_VERSION. Hardcoded here (vs imported from server) so this
// module stays free of 'server-only' deps. Keep these two strings in
// lockstep when bumping the classifier prompt/schema.
export const DEFAULT_EXPECTED_VERSION = 'phase-2-8-sport-focus-v1'

// Phase 2.8 — sport_focus enum (mirrors classify-build-mode-intent.ts
// BuildModeIntentLlmSchema). Lives here so brief-predicates and consumers
// can use it without server-only imports.
export const SPORT_FOCUS_WHITELIST: ReadonlySet<string> = new Set([
  'tennis', 'rugby', 'cricket', 'football', 'hockey',
])

// Profile shape used by the helper. BriefProfile in brief-predicates.ts
// extends this. EVERY string-shaped field typed `unknown` to reflect that
// children.child_profile is arbitrary JSON. Coerced via safeString at use.
export type EffectiveTopPriorityProfile = {
  top_priority?:       unknown
  // The 5 prose fields the classifier reads (classify-build-mode-intent.ts:200).
  academic_notes?:     unknown
  goals_notes?:        unknown
  personality_notes?:  unknown
  child_wants?:        unknown
  anchors_notes?:      unknown
  // Cached classifier output. Optional because children predating this slice
  // have no cache; their effective priority falls back to wizard.
  intent_focus_cache?: IntentFocusCache | null
}

// Defensive string coercion. Matches the same handling in
// classify-build-mode-intent.ts (`typeof v === 'string' ? v : null`) and
// the finalize route's strOrNull. Legacy/malformed data won't crash.
function safeString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

// Deterministic hash — JSON.stringify(parts) encoding so internal newlines
// or quotes can't blur field boundaries. parts.join('\n') was ambiguous.
export function hashProseSnapshot(p: EffectiveTopPriorityProfile | null): string {
  if (!p) return ''
  const parts = [
    safeString(p.academic_notes),
    safeString(p.goals_notes),
    safeString(p.personality_notes),
    safeString(p.child_wants),
    safeString(p.anchors_notes),
  ]
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

export function buildIntentFocusCache(args: {
  drillFocus:  IntentLike['parent_drill_focus']
  sportFocus:  IntentLike['sport_focus']
  profile:     EffectiveTopPriorityProfile
  version:     string
}): IntentFocusCache {
  return {
    value:       args.drillFocus ?? 'none',
    sport_focus: args.sportFocus ?? 'none',
    source_hash: hashProseSnapshot(args.profile),
    version:     args.version,
    computed_at: new Date().toISOString(),
  }
}

// Skip the DB write when existing cache already matches value + hash +
// version. Preserves `computed_at` across identical re-runs — keeps the
// verdict's input_hash stable. safeString on both sides handles malformed
// existing cache (legacy/manually-edited JSON).
export function cacheNeedsRefresh(
  existing:   IntentFocusCache | null | undefined,
  candidate:  IntentFocusCache,
): boolean {
  if (!existing) return true
  return (
    safeString(existing.value)       !== safeString(candidate.value)       ||
    safeString(existing.sport_focus) !== safeString(candidate.sport_focus) ||
    safeString(existing.source_hash) !== safeString(candidate.source_hash) ||
    safeString(existing.version)     !== safeString(candidate.version)
  )
}

// Returns the effective top priority. Cache is honoured ONLY when source_hash
// matches CURRENT prose AND version matches expected AND value is non-'none'.
// Otherwise falls back to wizard top_priority.
//
// Returns lowercase string, or '' when no priority is set anywhere.
export function effectiveTopPriority(
  profile: EffectiveTopPriorityProfile | null,
  expectedVersion: string = DEFAULT_EXPECTED_VERSION,
): string {
  if (!profile) return ''

  const cache = profile.intent_focus_cache
  if (cache && safeString(cache.version) === expectedVersion) {
    const currentHash = hashProseSnapshot(profile)
    if (safeString(cache.source_hash) === currentHash) {
      const cachedDrill = safeString(cache.value).toLowerCase()
      if (cachedDrill && cachedDrill !== 'none') {
        return cachedDrill
      }
    }
  }

  return safeString(profile.top_priority).toLowerCase()
}

// Phase 2.8 — returns the cached sport_focus when present + valid (hash
// matches current prose + version matches expected + value is in the
// sport whitelist). Otherwise returns ''.
//
// Whitelist (Codex r3 P1): cache.sport_focus is arbitrary JSON; a
// malformed value like 'unknown' / 'hockey ' / 123 must NOT slip into
// the recommender's sport-specific branch. We trim + lowercase + check
// SPORT_FOCUS_WHITELIST before returning.
//
// Wizard has no sport field — so this is cache-only (no fallback to a
// wizard equivalent of top_priority). Returns '' when there's no valid
// cached sport, leaving callers to use their existing non-sport logic.
export function effectiveSportFocus(
  profile: EffectiveTopPriorityProfile | null,
  expectedVersion: string = DEFAULT_EXPECTED_VERSION,
): string {
  if (!profile) return ''
  const cache = profile.intent_focus_cache
  if (!cache) return ''
  if (safeString(cache.version) !== expectedVersion) return ''
  const currentHash = hashProseSnapshot(profile)
  if (safeString(cache.source_hash) !== currentHash) return ''
  const sport = safeString(cache.sport_focus).toLowerCase()
  if (!sport || sport === 'none') return ''
  if (!SPORT_FOCUS_WHITELIST.has(sport)) return ''
  return sport
}
