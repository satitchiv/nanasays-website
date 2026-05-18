import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { REGION_BUCKETS, type HomeRegion } from '../uk-regions.ts'
import {
  KNOWN_DAY_ONLY_NAMES,
  KNOWN_FULL_BOARDING_NAMES,
  normalizeSchoolName,
} from '../school-name-overrides.ts'
import { DIMENSIONS } from '../server/dimensions.js'
import { loadDimFactsBundles } from '../server/tools.js'
import type { BriefProfile } from './brief-predicates.ts'
import type { BuildModeExtractionHTTP } from '../server/research-room/build-mode-schemas.ts'

// Slice 8 Build 6 — Build Mode school recommender.
//
// Sits between `pickTopSchoolSlugs` (onboarding 5-question recommender) and
// the finalize LLM call. The onboarding scorer only knows the 5 dropdown
// answers in `parent_profiles`; it cannot see the rich Build Mode interview
// output (sport arrays, arts arrays, goal_orientation, anchors_notes,
// child_wants, nonnegotiables). Codex r-merge Q4 P1 flagged that reusing
// the onboarding scorer would silently ignore everything the interview
// captured — defeating the whole "ask parents about their child" loop.
//
// This module fuses BOTH inputs and returns a richer ranked list:
//   * Onboarding fields (`BriefProfile`) — budget, region, gender, age,
//     SEN, curriculum, top_priority, class_size_pref, pastoral_pref,
//     lgbtq_pref, ethos_pref.
//   * Build Mode fields (`BuildModeExtractionHTTP`) — interests_sports,
//     interests_arts, goal_orientation, anchors_notes, child_wants,
//     nonnegotiables, personality_notes, academic_notes, goals_notes.
//
// Hard filters drop a school. Soft signals rank it.
//
// Hard: country=UK + schools_status quality gate + excludeSlugs +
// budget hard cap (1.3× ceiling, NULL fees pass) + age range (NULL passes)
// + gender compat + boarding compat via name overrides.
//
// Soft: region bucket match, budget closeness, per-sport DIMENSIONS scorer,
// academic_strength (when goal_orientation = 'university_track'), pastoral
// + inclusive (when build-mode prose mentions pastoral / wellbeing /
// diversity), class size, arts strengths tag match.
//
// Returns up to `limit` candidates with `signals: string[]` chips and a
// short `rationale_seed` line for the downstream LLM prompt. The LLM picks
// the final 2-3 schools to surface as `propose_add_school` proposals.

// ── Public types ─────────────────────────────────────────────────────

export type BuildModeScorerInput = {
  parent:        BriefProfile | null
  child:         BuildModeExtractionHTTP | null
  excludeSlugs:  string[]
  childGender?:  string | null
  childYear?:    string | null
}

export type ScoredCandidate = {
  slug:           string
  name:           string
  total_score:    number
  signals:        string[]
  rationale_seed: string
}

export type BuildModeScorerResult = {
  candidates: ScoredCandidate[]
  reason:     'ok' | 'no_candidates' | 'fetch_failed'
}

// ── Constants ────────────────────────────────────────────────────────

const GBP_TO_USD = 1.27

const BUDGET_CEILING_USD: Record<string, number | null> = {
  'under-30k': Math.round(30000 * GBP_TO_USD),
  '30k-40k':   Math.round(40000 * GBP_TO_USD),
  '40k-50k':   Math.round(50000 * GBP_TO_USD),
  'over-50k':  null,
  'bursary':   null,
}

const YEAR_TO_ENTRY_AGE: Record<string, number | null> = {
  'year-7':     11,
  'year-9':     13,
  'year-10':    14,
  'sixth-form': 16,
  'not-sure':   null,
}

const BOY_COMPAT  = new Set(['boys', 'boys only', 'co-ed', 'co-educational', 'mixed'])
const GIRL_COMPAT = new Set(['girls', 'girls only', 'co-ed', 'co-educational', 'mixed'])

// 2026-05-19 Bug 1 fix — curriculum filter parity with Picker #1
// (lib/recommend-shortlist.ts:73-80). When the parent says IB, drop
// schools whose curriculum array doesn't include any IB variant. When
// they say A-Level, keep A-Level-tagged schools AND NULL-curriculum
// schools (most UK independents teach A-Level by default but don't
// always tag it). Before this fix, Picker #2 returned Eton (curriculum
// NULL = no IB) for IB-preferring parents.
const IB_VARIANTS = [
  'IB',
  'IB Diploma',
  'IB Diploma Programme',
  'IB Middle Years Programme',
  'IB Primary Years Programme',
]
const ALEVEL_VARIANTS = ['A-Level']

// Per-sport DIMENSIONS keys. The Build Mode interview captures free-text
// `interests_sports[].sport` (e.g. "football", "rugby", "tennis"); we map
// to the corresponding DIMENSIONS scorer if one exists. Synonyms map onto
// canonical scorer keys (e.g. "soccer" → football, "rugby union" → rugby).
const SPORT_SCORER_BY_LABEL: Record<string, 'football_strength' | 'cricket_strength' | 'hockey_strength' | 'tennis_strength' | 'rugby_standing'> = {
  football:       'football_strength',
  soccer:         'football_strength',
  rugby:          'rugby_standing',
  'rugby union':  'rugby_standing',
  'rugby league': 'rugby_standing',
  cricket:        'cricket_strength',
  hockey:         'hockey_strength',
  'field hockey': 'hockey_strength',
  tennis:         'tennis_strength',
}

const SPORT_TIER_LABELS: Record<string, string> = {
  'national-elite':  'elite',
  'national-strong': 'strong national',
  national:          'national',
  regional:          'regional',
}

// Keyword heuristics applied to Build Mode prose fields to infer pastoral /
// inclusive interest when the onboarding dropdown didn't capture it.
const PASTORAL_HINT_RE   = /\b(pastoral|wellbeing|well-being|anxiety|anxious|homesick|mental health|counsell|safeguard|nurtur)\b/i
const INCLUSIVE_HINT_RE  = /\b(inclusiv|diversity|lgbtq|lgbt\b|gay\b|queer|trans\b|gender|belonging|minorit)\b/i
const FULL_BOARDING_HINT_RE = /\b(full board|full-board|weekly board|boarding school)\b/i
const SMALL_CLASS_HINT_RE   = /\b(small class|small school|small community|smaller class|low pupil)\b/i

// ── DB types ─────────────────────────────────────────────────────────

type SchoolRow = {
  slug:             string
  name:             string
  gender_split:     string | null
  fees_usd_min:     number | null
  sen_support:      boolean | null
  strengths:        string[] | null
  confidence_score: number | null
  age_min:          number | null
  age_max:          number | null
  region:           string | null
}

type StructRow = {
  school_slug:             string
  sports_profile:          Record<string, unknown> | null
  exam_results:            Record<string, unknown> | null
  university_destinations: Record<string, unknown> | null
  student_community:       Record<string, unknown> | null
  isi_deep_facts:          Record<string, unknown> | null
}

// ── UK evidence slugs (paginated; mirrors recommend-shortlist private helper) ──

async function loadUkEvidenceSlugs(supabase: SupabaseClient): Promise<{ slugs: string[]; error: boolean }> {
  // Codex r8 Low/Medium #3 — distinguish a real fetch error from an
  // empty result. Before: both returned []. After: the caller can map
  // an error to `reason: 'fetch_failed'` instead of silently degrading
  // to `no_candidates` (which the prompt turns into "schoolProposals:
  // [] verbatim", masking the failure).
  const all: string[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('schools_status')
      .select('school_slug')
      .eq('is_uk_evidence', true)
      .eq('has_substantial_chunks', true)
      .range(offset, offset + PAGE - 1)
    if (error) return { slugs: all, error: true }
    if (!data || data.length === 0) break
    all.push(...data.map((r: { school_slug: string }) => r.school_slug))
    if (data.length < PAGE) break
  }
  return { slugs: all, error: false }
}

// ── Build a synthetic parent ctx for dimension scorers ──────────────
//
// dimensions.js scorers expect `ctx?.parent?.pastoral_pref` and
// `ctx?.parent?.lgbtq_pref` to know whether the parent CARES about a
// dimension. They short-circuit to 0 when these are null. For Build Mode,
// the onboarding dropdowns may not have captured pastoral / lgbtq pref, but
// the interview prose may have. Apply keyword heuristics to upgrade `null`
// → 'high_priority' / 'important' only when there's clear evidence.

function buildScorerCtx(
  parent: BriefProfile | null,
  child:  BuildModeExtractionHTTP | null,
): { parent: { pastoral_pref: string | null; lgbtq_pref: string | null } } {
  let pastoral = parent?.pastoral_pref ?? null
  let lgbtq    = parent?.lgbtq_pref    ?? null
  const proseFields: (string | null | undefined)[] = [
    child?.anchors_notes,
    child?.personality_notes,
    child?.goals_notes,
    child?.child_wants,
    ...(child?.nonnegotiables ?? []),
  ]
  const blob = proseFields.filter(Boolean).join(' \n ')
  if (!pastoral && PASTORAL_HINT_RE.test(blob)) pastoral = 'high_priority'
  if (!lgbtq    && INCLUSIVE_HINT_RE.test(blob)) lgbtq    = 'important'
  return { parent: { pastoral_pref: pastoral, lgbtq_pref: lgbtq } }
}

// ── Normalisers ─────────────────────────────────────────────────────

function normalizeSportLabel(raw: string | null | undefined): keyof typeof SPORT_SCORER_BY_LABEL | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase()
  return (key in SPORT_SCORER_BY_LABEL) ? (key as keyof typeof SPORT_SCORER_BY_LABEL) : null
}

function readSportTier(struct: StructRow | null, sport: string): string | null {
  const sp = struct?.sports_profile as Record<string, unknown> | null | undefined
  if (!sp) return null
  // 'rugby' bucket; for other sports the field name matches the sport
  const bucket = sp[sport] as Record<string, unknown> | undefined
  if (!bucket || typeof bucket !== 'object') return null
  const tier = bucket.competitive_tier
  return typeof tier === 'string' ? tier.toLowerCase() : null
}

// Pretty-print a sport tier into a short signal chip. Returns null when the
// tier isn't strong enough to advertise (we don't surface "school-level" or
// "local" as a positive signal).
function tierToChipFragment(tier: string | null): string | null {
  if (!tier) return null
  return SPORT_TIER_LABELS[tier] ?? null
}

// ── Pure ranker (exported for tests) ────────────────────────────────
//
// Takes already-loaded school + structured-data rows and returns the
// ranked, signal-annotated candidate list. No DB access — the main
// `scoreForBuildMode` wrapper handles SQL filters and calls this.

export function rankCandidates(
  schools: SchoolRow[],
  structBySlug: Map<string, StructRow>,
  input: BuildModeScorerInput,
  limit: number,
): ScoredCandidate[] {
  const { parent, child, childGender } = input

  // ── JS-level hard filters: gender + boarding via name overrides ──
  let filtered = schools
  const genderAllow =
    childGender === 'boy'  ? BOY_COMPAT  :
    childGender === 'girl' ? GIRL_COMPAT :
    null
  if (genderAllow) {
    filtered = filtered.filter(s => {
      const g = (s.gender_split ?? '').trim().toLowerCase()
      return !g || genderAllow.has(g)
    })
  }

  if (
    parent?.boarding_pref === 'full' ||
    parent?.boarding_pref === 'weekly' ||
    parent?.boarding_pref === 'flexi'
  ) {
    filtered = filtered.filter(s => !KNOWN_DAY_ONLY_NAMES.has(normalizeSchoolName(s.name)))
  } else if (parent?.boarding_pref === 'day') {
    filtered = filtered.filter(s => !KNOWN_FULL_BOARDING_NAMES.has(normalizeSchoolName(s.name)))
  }

  if (filtered.length === 0) return []

  // ── Score ──
  const ctx = buildScorerCtx(parent, child)
  const homeRegion = (parent?.home_region ?? '').toLowerCase().trim() as HomeRegion
  const regionBucket = new Set(REGION_BUCKETS[homeRegion] ?? [])
  regionBucket.add('England')
  const budgetCeiling = BUDGET_CEILING_USD[parent?.budget_range ?? '']

  const sportsInterest = (child?.interests_sports ?? [])
    .map(s => ({ raw: s.sport, key: normalizeSportLabel(s.sport), level: s.level }))
    .filter((s): s is { raw: string; key: keyof typeof SPORT_SCORER_BY_LABEL; level: string } => s.key !== null)
  const artsInterest = child?.interests_arts ?? []
  const wantsAcademic = child?.goal_orientation === 'university_track'
  const wantsSportFocus = child?.goal_orientation === 'sport_career'

  // Pastoral + inclusive — derived from ctx (possibly upgraded by prose hints)
  const wantsPastoral  = ctx.parent.pastoral_pref === 'high_priority'
  const wantsInclusive = ctx.parent.lgbtq_pref    === 'important'

  // Anchors / personality / child_wants free-text additions to the scorer
  const proseBlob = [
    child?.anchors_notes,
    child?.personality_notes,
    child?.child_wants,
    ...(child?.nonnegotiables ?? []),
  ].filter(Boolean).join(' \n ')
  const wantsFullBoardingProse = FULL_BOARDING_HINT_RE.test(proseBlob)
  const wantsSmallProse        = SMALL_CLASS_HINT_RE.test(proseBlob)

  type ScoredSchool = {
    school:  SchoolRow
    struct:  StructRow | null
    score:   number
    signals: string[]
    facts:   string[]   // concrete data points for rationale_seed (max ~3)
  }

  const scored: ScoredSchool[] = filtered.map(s => {
    const struct = structBySlug.get(s.slug) ?? null
    const signals: string[] = []
    const facts:   string[] = []
    let score = (s.confidence_score ?? 0) / 100  // 0..1 base

    // ── Region ──────────────────────────────────────────────────────
    // Wrong-bucket penalty bumped to -2.0 (parity with recommend-shortlist.ts
    // 2026-05-18). The prior -1.0 was being overpowered by confidence_score=100
    // / 100 = 1.0 base + sport boosts, letting Wellington-Berkshire win
    // south-west queries. Build Mode finalize is the recommender that
    // matters once Commit C lands, so this needs to be at least as tight.
    // 2026-05-19 — also skip the region scoring when the parent picked
    // 'anywhere' (added to the dropdown to let parents say "no preference"
    // instead of inheriting an inherited home_region from parent_profiles).
    if (parent?.home_region && parent.home_region !== 'overseas' && parent.home_region !== 'anywhere') {
      if (s.region == null) {
        // neutral
      } else if (regionBucket.has(s.region)) {
        score += 0.6
        signals.push(`${s.region.toLowerCase()} region`)
      } else {
        score -= 2.0
      }
    }

    // ── Budget closeness ────────────────────────────────────────────
    if (budgetCeiling != null && s.fees_usd_min != null) {
      const ratio = s.fees_usd_min / budgetCeiling
      if (ratio <= 1.0)      { score += 0.5; signals.push('in budget') }
      else if (ratio <= 1.2)  score += 0.2
    }

    // ── Per-sport interest ──────────────────────────────────────────
    for (const sp of sportsInterest) {
      const scorerKey = SPORT_SCORER_BY_LABEL[sp.key]
      const dim = (DIMENSIONS as Record<string, { rank: (row: unknown, ctx: unknown) => number } | undefined>)[scorerKey]
      const rawScore = dim ? dim.rank(struct, ctx) : 0
      if (rawScore > 0) {
        // Normalise: rugby/football/cricket/hockey scorers return 0-60ish, tennis similar.
        // Bring into the 0-2.5 range so a single strong sport can compete with region.
        const norm = Math.min(rawScore / 20, 2.5)
        score += norm
        const sportName = sp.key === 'rugby union' || sp.key === 'rugby league' ? 'rugby' : sp.key
        const lookupSport = sportName === 'rugby' ? 'rugby' : sportName
        const tier = readSportTier(struct, lookupSport)
        const tierFrag = tierToChipFragment(tier)
        if (tierFrag) {
          signals.push(`strong ${sportName} (${tierFrag})`)
        } else if (norm >= 1.0) {
          signals.push(`strong ${sportName}`)
        }
      }
    }
    if (wantsSportFocus && sportsInterest.length === 0) {
      // Build Mode said sport_career but we couldn't map any specific sport.
      // Fall back to the broad 'sport' strengths tag.
      const strengthsLc = (s.strengths ?? []).map(x => x.toLowerCase())
      if (strengthsLc.includes('sport')) {
        score += 0.5
        signals.push('sport-focused')
      }
    }

    // ── Arts interest ───────────────────────────────────────────────
    if (artsInterest.length > 0) {
      const strengthsLc = (s.strengths ?? []).map(x => x.toLowerCase())
      let bumped = false
      for (const a of artsInterest) {
        const art = (a.art ?? '').toLowerCase()
        if (
          (art.includes('music')  && strengthsLc.includes('music')) ||
          (art.includes('drama')  && strengthsLc.includes('performing arts')) ||
          (art.includes('dance')  && strengthsLc.includes('performing arts')) ||
          (art.includes('art')    && strengthsLc.includes('visual and creative arts'))
        ) {
          if (!bumped) score += 0.5
          bumped = true
          signals.push(`strong ${art}`)
        }
      }
    }

    // ── Academic (goal_orientation = university_track) ──────────────
    if (wantsAcademic) {
      const dim = (DIMENSIONS as Record<string, { rank: (row: unknown, ctx: unknown) => number } | undefined>).academic_strength
      const rawScore = dim ? dim.rank(struct, ctx) : 0
      if (rawScore > 0) {
        const norm = Math.min(rawScore / 25, 2.0)
        score += norm
        // Top-line academic fact for rationale_seed.
        const ex = struct?.exam_results as Record<string, Record<string, number> | undefined> | undefined
        const ud = struct?.university_destinations as Record<string, number | undefined> | undefined
        const oxbridge = (ud?.oxford_count ?? 0) + (ud?.cambridge_count ?? 0)
        if (ex?.a_level?.pct_a_star != null) {
          facts.push(`${Math.round(ex.a_level.pct_a_star)}% A*`)
          signals.push('academic-strong')
        } else if (ex?.gcse?.pct_9 != null) {
          facts.push(`${Math.round(ex.gcse.pct_9)}% Grade 9`)
          signals.push('academic-strong')
        } else if (oxbridge > 0) {
          facts.push(`${oxbridge} Oxbridge`)
          signals.push('academic-strong')
        } else if (norm >= 1.0) {
          signals.push('academic-strong')
        }
      }
    }

    // ── Pastoral ────────────────────────────────────────────────────
    if (wantsPastoral) {
      const dim = (DIMENSIONS as Record<string, { rank: (row: unknown, ctx: unknown) => number } | undefined>).pastoral_care
      const rawScore = dim ? dim.rank(struct, ctx) : 0
      if (rawScore > 0) {
        const norm = Math.min(rawScore / 10, 1.5)
        score += norm
        if (norm >= 0.8) signals.push('pastoral-strong')
      }
    }

    // ── Inclusive culture ───────────────────────────────────────────
    if (wantsInclusive) {
      const dim = (DIMENSIONS as Record<string, { rank: (row: unknown, ctx: unknown) => number } | undefined>).inclusive_culture
      const rawScore = dim ? dim.rank(struct, ctx) : 0
      if (rawScore > 0) {
        const norm = Math.min(rawScore / 8, 1.0)
        score += norm
        if (norm >= 0.6) signals.push('inclusive culture')
      }
    }

    // ── Class size (onboarding pref OR prose hint) ──────────────────
    const wantsSmall =
      parent?.class_size_pref === 'very-important' ||
      parent?.class_size_pref === 'nice-to-have'   ||
      wantsSmallProse
    if (wantsSmall) {
      const totalPupils = (struct?.student_community as { total_pupils?: number } | undefined)?.total_pupils
      if (typeof totalPupils === 'number') {
        const weight = parent?.class_size_pref === 'very-important' ? 1 : 0.5
        if (totalPupils <= 400) {
          score += 0.8 * weight
          signals.push(`small (~${totalPupils} pupils)`)
        } else if (totalPupils <= 800) {
          score += 0.4 * weight
        } else if (totalPupils > 1200) {
          score -= 0.3 * weight
        }
      }
    }

    // ── Full-boarding prose hint ────────────────────────────────────
    if (wantsFullBoardingProse) {
      // Cheap signal: name override sets capture boarding type. Already
      // filtered above for `boarding_pref`, but the prose may be the only
      // place full-boarding intent was mentioned. Reward known full-
      // boarding schools.
      if (KNOWN_FULL_BOARDING_NAMES.has(normalizeSchoolName(s.name))) {
        score += 0.3
        signals.push('full boarding')
      }
    }

    // ── SEN positive ────────────────────────────────────────────────
    if (parent?.sen_need === 'yes-priority' && s.sen_support === true) {
      score += 0.4
      signals.push('SEN-aware')
    }

    return { school: s, struct, score, signals, facts }
  })

  // 6. Sort + slice
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, Math.max(limit, 0))

  // 7. Build outputs
  const out: ScoredCandidate[] = top.map(t => {
    const dedupedSignals = Array.from(new Set(t.signals)).slice(0, 5)
    const factStr = t.facts.length > 0 ? ` (${t.facts.slice(0, 2).join(', ')})` : ''
    const rationale_seed = dedupedSignals.length > 0
      ? `${t.school.name} — ${dedupedSignals.join(', ')}${factStr}.`
      : `${t.school.name}${factStr}.`
    return {
      slug:           t.school.slug,
      name:           t.school.name,
      total_score:    t.score,
      signals:        dedupedSignals,
      rationale_seed,
    }
  })

  // Drop candidates with no positive signal at all — they only scored on
  // the base confidence_score, not on anything the parent actually said.
  // Better empty than a generic "famous UK school" pile.
  const filteredOut = out.filter(c => c.signals.length > 0)
  return filteredOut
}

// ── Main scorer (DB-backed wrapper) ─────────────────────────────────

export async function scoreForBuildMode(
  supabase: SupabaseClient,
  input:    BuildModeScorerInput,
  limit:    number = 20,
): Promise<BuildModeScorerResult> {
  const { parent, excludeSlugs, childYear } = input
  const exclude = new Set(excludeSlugs)

  // 1. UK evidence slug allowlist
  const ukResult = await loadUkEvidenceSlugs(supabase)
  if (ukResult.error) return { candidates: [], reason: 'fetch_failed' }
  if (ukResult.slugs.length === 0) return { candidates: [], reason: 'no_candidates' }
  const candidateSlugs = ukResult.slugs.filter(s => !exclude.has(s))
  if (candidateSlugs.length === 0) return { candidates: [], reason: 'no_candidates' }

  // 2. Candidate query — hard filters in SQL where possible
  let q = supabase
    .from('schools')
    .select('slug, name, gender_split, fees_usd_min, sen_support, strengths, confidence_score, age_min, age_max, region')
    .in('slug', candidateSlugs)
    .eq('country', 'United Kingdom')

  q = q.or('fees_usd_min.is.null,fees_usd_min.gte.5000') // drop extraction-bug zero fees

  // 2026-05-19 Bug 1 fix — curriculum filter parity with Picker #1.
  // Without this, an IB-preferring parent could get A-Level-only schools
  // (Eton has curriculum=NULL → no IB, but used to slip through here).
  if (parent?.curriculum_pref === 'ib') {
    q = q.overlaps('curriculum', IB_VARIANTS)
  } else if (parent?.curriculum_pref === 'a-level') {
    q = q.or(`curriculum.ov.{${ALEVEL_VARIANTS.join(',')}},curriculum.is.null`)
  }

  // Min-confidence floor (parity with recommend-shortlist.ts 2026-05-18).
  // The conf=0 cohort in schools_status is dominated by state primary
  // schools (Gladstone Primary, City of London Freemen's etc.) and a
  // `reeds-school-uk` duplicate — none of which belong in a Build Mode
  // proposal. NULL confidence is preserved (unknown, don't punish).
  q = q.or('confidence_score.is.null,confidence_score.gte.10')

  const budgetCeiling = BUDGET_CEILING_USD[parent?.budget_range ?? '']
  if (budgetCeiling != null) {
    q = q.or(`fees_usd_min.is.null,fees_usd_min.lte.${Math.round(budgetCeiling * 1.3)}`)
  }

  const entryAge = YEAR_TO_ENTRY_AGE[childYear ?? '']
  if (entryAge != null) {
    q = q
      .or(`age_min.is.null,age_min.lte.${entryAge}`)
      .or(`age_max.is.null,age_max.gte.${entryAge}`)
  }

  if (parent?.sen_need === 'yes-priority') {
    q = q.or('sen_support.is.null,sen_support.eq.true')
  }

  // Pull more than `limit` so soft scoring has room to discriminate; cap
  // at 120 to keep the structured-data fetch and the in-JS scoring loop
  // bounded.
  q = q.order('confidence_score', { ascending: false }).limit(120)
  const { data: rawCandidates, error: candidateErr } = await q
  if (candidateErr) return { candidates: [], reason: 'fetch_failed' }
  if (!rawCandidates || rawCandidates.length === 0) {
    return { candidates: [], reason: 'no_candidates' }
  }

  // 3. Structured-data fetch for soft scoring
  const slugs = (rawCandidates as SchoolRow[]).map(s => s.slug)
  const { data: structRows, error: structErr } = await supabase
    .from('school_structured_data')
    .select('school_slug, sports_profile, exam_results, university_destinations, student_community')
    .in('school_slug', slugs)
  if (structErr) return { candidates: [], reason: 'fetch_failed' }

  // Slice 8 Build 6 hotfix (2026-05-15) — `isi_deep_facts` is NOT a
  // column on `school_structured_data`; it's a bundle assembled from
  // `school_facts` rows of dimension='isi_deep'. The original Build 6
  // landing selected it as if it were a column, which made Postgres
  // reject the query → fetch_failed → 0 candidates → LLM emits empty
  // schoolProposals → no school pills in finalize CTA.
  //
  // Production reads ISI deep via `loadDimFactsBundles` (lib/server/
  // tools.js). Reuse it here so pastoral_care + inclusive_culture +
  // diversity_culture dimension scorers can fire when the parent has
  // pastoral_pref='high_priority' or lgbtq_pref='important'.
  const factsBundles = await loadDimFactsBundles(supabase, slugs)
  const structBySlug = new Map<string, StructRow>(
    (structRows ?? []).map((r: Omit<StructRow, 'isi_deep_facts'>) => [
      r.school_slug,
      {
        ...r,
        isi_deep_facts: (factsBundles.get(r.school_slug)?.isi_deep_facts as Record<string, unknown> | undefined) ?? null,
      },
    ]),
  )

  // 4. Pure ranker
  const candidates = rankCandidates(rawCandidates as SchoolRow[], structBySlug, input, limit)
  if (candidates.length === 0) return { candidates: [], reason: 'no_candidates' }
  return { candidates, reason: 'ok' }
}
