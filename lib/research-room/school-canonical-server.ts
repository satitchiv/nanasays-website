import 'server-only'
import { supabaseService } from '@/lib/supabase-admin'
import {
  type Hit,
  MIN_RICHNESS_GAP_FOR_SWAP,
  loadRichness,
  normName,
  pickPrimary,
} from './school-canonical'

// Canonicalize a single slug. Used by the shortlist POST route as
// belt-and-braces against programmatic / legacy callers that don't
// go through the new search-schools route. Codex r2 P3: write-action's
// confirm_add_school path does NOT route through here — followup tracked
// in TASKS.md.
//
// Returns { canonical, swapped, reason } where:
//   • canonical = the slug that should be persisted
//   • swapped   = true iff canonical !== submitted slug
//   • reason    = short explanation when swapped
//
// Swap only fires when there is a clear richer twin (gap >= MIN).
// If the submitted slug doesn't exist, returns it unchanged so the
// downstream RPC can produce its normal "school not found" error.

export async function canonicalizeSlug(
  slug: string,
): Promise<{ canonical: string; swapped: boolean; reason?: string }> {
  const svc = supabaseService()

  const { data: self, error: selfErr } = await svc
    .from('schools')
    .select('slug, name, region, country')
    .eq('slug', slug)
    .maybeSingle()
  if (selfErr) {
    console.warn('[school-canonical] self lookup failed:', selfErr.message)
    return { canonical: slug, swapped: false }
  }
  if (!self) return { canonical: slug, swapped: false }

  // Look for siblings sharing the normalised name in a compatible
  // country (Codex r1 P1 #3 / Q7: treat null country as "unknown" so
  // a rich twin missing country metadata still matches its UK sibling).
  // Postgres can't run normName, so fetch by raw ilike and fold in JS.
  // Codex r1 P2 #6: raise .limit(20) → 80 and add deterministic order
  // so large name groups don't clip the richer sibling.
  const { data: siblings, error: sibErr } = await svc
    .from('schools')
    .select('slug, name, region, country')
    .ilike('name', self.name)
    .order('slug', { ascending: true })
    .limit(80)
  if (sibErr) {
    console.warn('[school-canonical] sibling lookup failed:', sibErr.message)
    return { canonical: slug, swapped: false }
  }

  const selfKey = normName(self.name)
  const SELF_C = self.country ?? null
  const selfIsUkOrNull = SELF_C === 'United Kingdom' || SELF_C == null
  function countryCompatible(c: string | null): boolean {
    const C = c ?? null
    if (C === SELF_C) return true
    // For UK-or-null self, allow the other side to also be UK-or-null.
    // For non-UK self, require exact match (don't cross borders).
    if (selfIsUkOrNull && (C === 'United Kingdom' || C == null)) return true
    return false
  }
  const candidates = (siblings ?? []).filter(s =>
    normName(s.name) === selfKey && countryCompatible(s.country),
  ) as Hit[]
  if (candidates.length <= 1) return { canonical: slug, swapped: false }

  const richness = await loadRichness(svc, candidates.map(c => c.slug))
  const primary = pickPrimary(candidates, richness)
  if (primary.slug === slug) return { canonical: slug, swapped: false }

  const submittedScore = richness.get(slug) ?? 0
  const primaryScore   = richness.get(primary.slug) ?? 0
  if (primaryScore - submittedScore < MIN_RICHNESS_GAP_FOR_SWAP) {
    return { canonical: slug, swapped: false }
  }

  return {
    canonical: primary.slug,
    swapped:   true,
    reason:    `richer twin (${primaryScore} vs ${submittedScore})`,
  }
}
