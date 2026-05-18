// Slice 8 Build 2 — match_reasons builder.
//
// When a parent adds a school to their shortlist, compute a small array of
// human-readable reasons that mirror the brief gates. These render under the
// comparison column header as "Added because: full boarding, strong rugby,
// …" so the parent can see why this school was suggested.
//
// Rules MUST stay in sync with `brief-predicates.ts` — if a brief seed row
// fires for a topic and the school has positive signal on that topic, the
// matching reason should fire here. Both modules import the same predicates
// so the rules can't drift silently.
//
// Pure function, no DB access. The caller (shortlist POST route) does the
// school lookups and hands the data in.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type BriefProfile,
  hasSenNeed,
  isFullOrWeeklyBoarding,
  isIbCurriculum,
  isSportPriority,
  regionMatches,
} from './brief-predicates.ts'

export type SchoolForReasons = {
  slug:        string
  name:        string | null
  region:      string | null
  boarding:    boolean | null
  sen_support: boolean | null
  // 2026-05-19 Bug 2 fix — read curriculum from the authoritative `schools`
  // column (the same one the parent-facing UI displays) instead of inferring
  // IB from `school_structured_data.exam_results.ib`. The exam_results.ib
  // field is over-populated by the extractor — every school has a non-null
  // object even when they don't offer IB Diploma (verified: Eton's
  // schools.curriculum is NULL but exam_results.ib is non-null).
  curriculum:  string[] | null
}

export type StructForReasons = {
  sports_profile: Record<string, unknown> | null
  exam_results:   Record<string, unknown> | null
}

type SportKey = 'rugby' | 'tennis' | 'cricket' | 'hockey' | 'football' | 'netball'

// Build 2 r2/r3 (Codex P2 #4 + r3 P3): canonical tier vocabulary from
// lib/server/dimensions.js:35. Match-reasons calls out a sport only when
// the tier is in this map AND ranks above all the school's other sports
// by `tier_strength`. Anything below `regional` (local, recreational,
// unknown) doesn't qualify as a strong-sport claim.
const TIER_STRENGTH: Record<string, number> = {
  'national-elite':  4,
  'national-strong': 3,
  'national':        2,
  'regional':        1,
}

function sportTier(struct: StructForReasons | null, sport: SportKey): string | null {
  const s = (struct?.sports_profile as Record<string, unknown> | null | undefined)?.[sport]
  if (!s || typeof s !== 'object') return null
  const tier = (s as Record<string, unknown>).competitive_tier
  return typeof tier === 'string' ? tier.toLowerCase() : null
}

// r3 P3 fix: was first-match in array order (rugby > tennis > ...), which
// could pick a regional rugby over a national-elite tennis. Now ranks
// across all sports by tier strength and returns the highest one.
function strongestSport(struct: StructForReasons | null): { sport: SportKey, tier: string } | null {
  const candidates: SportKey[] = ['rugby', 'tennis', 'cricket', 'hockey', 'football', 'netball']
  let best: { sport: SportKey, tier: string, strength: number } | null = null
  for (const sport of candidates) {
    const tier = sportTier(struct, sport)
    if (!tier) continue
    const strength = TIER_STRENGTH[tier]
    if (strength == null) continue  // weaker than regional → skip
    if (best == null || strength > best.strength) {
      best = { sport, tier, strength }
    }
  }
  if (best == null) return null
  return { sport: best.sport, tier: best.tier }
}

// 2026-05-19 Bug 2 fix — verify IB from the authoritative `schools.curriculum`
// column. The IB Diploma label appears in the data in five variants; match any.
// The exam_results.ib JSONB path is unreliable (over-populated by the
// extractor — Eton has non-null exam_results.ib but does not offer IB).
const IB_CURRICULUM_VARIANTS = new Set<string>([
  'IB',
  'IB Diploma',
  'IB Diploma Programme',
  'IB Middle Years Programme',
  'IB Primary Years Programme',
])

function schoolOffersIb(school: SchoolForReasons): boolean {
  const arr = school.curriculum
  if (!Array.isArray(arr)) return false
  return arr.some(v => typeof v === 'string' && IB_CURRICULUM_VARIANTS.has(v))
}

/**
 * Compute match reasons for one (profile, school) pair. Reasons are returned
 * in display order (most specific first). Caller can truncate / dedup as
 * needed; this fn returns whatever applies.
 */
export function buildMatchReasons(
  profile: BriefProfile | null,
  school:  SchoolForReasons,
  struct:  StructForReasons | null,
): string[] {
  const out: string[] = []
  if (!profile) return out

  // Region match — concrete and easy to verify.
  if (profile.home_region && regionMatches(profile.home_region, school.region)) {
    const r = (school.region ?? profile.home_region)!.replace(/[-_]/g, ' ')
    out.push(`${r} region`)
  }

  // Boarding intent.
  if (isFullOrWeeklyBoarding(profile) && school.boarding === true) {
    out.push('boarding school')
  }

  // Top priority: sport — flag the strongest sport this school is known
  // for. r3 P2 fix: dropped the 'your sport priority' fallback when no
  // strong sport tier is found. That string was profile-only with no
  // school evidence, same class as the pastoral/inclusive reasons we
  // dropped in r2.
  if (isSportPriority(profile)) {
    const strongest = strongestSport(struct)
    if (strongest) out.push(`strong ${strongest.sport}`)
  }

  // Curriculum: IB. 2026-05-19 — argument shape changed to read from the
  // school's authoritative `curriculum` column (see schoolOffersIb above).
  if (isIbCurriculum(profile) && schoolOffersIb(school)) {
    out.push('offers IB diploma')
  }

  // Build 2 r2 (Codex P2 #3): pastoral / inclusive culture reasons require
  // school evidence we don't yet pull into struct, so they're disabled
  // here. They'd previously fire from profile preferences alone, which is
  // misleading — a parent who cared about pastoral would see "pastoral
  // focus" listed against EVERY school regardless of fit. Re-introduce
  // when school_facts.pastoral_care_score and inclusive_culture_score are
  // wired into loadMatchReasonsBatch.
  //
  // SEN-aware survives but now requires schools.sen_support === true.
  // This still isn't a per-school quality signal (it's a boolean flag),
  // but it does filter out schools that explicitly don't offer SEN.
  if (hasSenNeed(profile) && school.sen_support === true) {
    out.push('SEN-aware')
  }

  return out
}

/**
 * Shape stored on `shortlisted_schools.match_reasons`. Wrapping the array in
 * an object leaves room to add a `computed_at` / `rules_version` field
 * without a column-level migration.
 */
export type MatchReasonsRecord = {
  reasons:      string[]
  computed_at:  string  // ISO timestamp
  rules_version: 1
}

export function packMatchReasons(reasons: string[]): MatchReasonsRecord {
  return {
    reasons,
    computed_at:   new Date().toISOString(),
    rules_version: 1,
  }
}

/**
 * Batch loader: given a brief profile + list of slugs, run two read queries
 * (schools + school_structured_data), then compute match_reasons for each
 * slug. Returns a Map keyed by slug; slugs with zero reasons are omitted.
 *
 * Shared by recommend-shortlist.ts (initial onboarding), refresh-recommendations,
 * and the in-room add route. Best-effort: returns empty Map on any read
 * error so callers can proceed without reasons.
 */
export async function loadMatchReasonsBatch(
  supabase: SupabaseClient,
  profile:  BriefProfile,
  slugs:    string[],
): Promise<Map<string, MatchReasonsRecord>> {
  const out = new Map<string, MatchReasonsRecord>()
  if (slugs.length === 0) return out

  const [schoolsRes, structRes] = await Promise.all([
    supabase.from('schools')
      .select('slug, name, region, boarding, sen_support, curriculum')
      .in('slug', slugs),
    supabase.from('school_structured_data')
      .select('school_slug, sports_profile, exam_results')
      .in('school_slug', slugs),
  ])
  if (schoolsRes.error || structRes.error) return out

  const schoolBySlug = new Map<string, SchoolForReasons>(
    (schoolsRes.data ?? []).map((s: SchoolForReasons) => [s.slug, s]),
  )
  type StructRow = StructForReasons & { school_slug: string }
  const structBySlug = new Map<string, StructForReasons>(
    (structRes.data ?? []).map((s: StructRow) => [
      s.school_slug,
      { sports_profile: s.sports_profile, exam_results: s.exam_results },
    ]),
  )

  for (const slug of slugs) {
    const school = schoolBySlug.get(slug)
    if (!school) continue
    const reasons = buildMatchReasons(profile, school, structBySlug.get(slug) ?? null)
    if (reasons.length > 0) out.set(slug, packMatchReasons(reasons))
  }
  return out
}
