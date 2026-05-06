import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  KNOWN_DAY_ONLY_NAMES,
  KNOWN_FULL_BOARDING_NAMES,
  assertUserId,
  normalizeSchoolName,
} from './school-name-overrides'
// Codex round-2 P1: validate cached interpretation against current notes
// before applying it. Otherwise a race-aborted refresh (or stale-clear
// failure) leaves last-cycle's interpretation paired with this-cycle's
// notes for one refresh.
import { notesHash, type NotesInput } from './interpret-child-notes'

// Auto-recommend shortlist after onboarding completes.
//
// Reads parent_profiles, picks 6 UK schools that match the parent's stated
// preferences, and inserts them into shortlisted_schools so the parent
// lands in /nana/research-room with a non-empty Comparison table.
//
// Hard filters (drop on fail): country, region bucket, gender compat,
// boarding type, age range, budget hard cap (1.3× ceiling), SEN if required.
// Soft signals (rank, don't drop): budget closeness, top_priority strength
// match, SEN match, confidence_score tiebreaker.
//
// Idempotent: if the user already has any shortlisted_schools rows, no-op
// (don't clobber manual saves).

const GBP_TO_USD = 1.27

// schools.region values are very granular (90+ UK locations + London
// neighborhoods). Bucket them into the 7 onboarding regions. 'England' is
// included in every UK bucket because some schools are coarsely tagged at
// country level — we'd rather over-include than drop them.
const REGION_BUCKETS: Record<string, string[]> = {
  'london': [
    'London', 'Greater London',
    'Hammersmith', 'Brook Green', 'South Kensington',
    'Royal Borough of Kensington and Chelsea',
    'Notting Hill, Royal Borough of Kensington and Chelsea',
    'Marylebone, Central London',
    'North West London, Camden',
    'Wimbledon', 'Wandsworth', 'Battersea',
    'Richmond', 'Barnes and Kew', 'Bromley', 'Kentish Town', 'E10',
  ],
  'south-east': [
    'Berkshire', 'West Berkshire', 'Buckinghamshire',
    'Hampshire', 'Hertfordshire',
    'Kent', 'Kent/Sussex borders', 'Dartford',
    'Surrey', 'East Sussex', 'West Sussex',
    'Oxfordshire', 'South Oxfordshire',
    'Bedfordshire', 'Middlesex', 'Essex', 'Isle of Wight',
  ],
  'south-west': [
    'Bristol', 'Cornwall', 'Devon', 'Dorset',
    'Gloucestershire', 'Somerset', 'North Somerset', 'Wiltshire',
  ],
  'midlands': [
    'Derbyshire', 'Herefordshire', 'Leicestershire', 'Lincolnshire',
    'Northamptonshire', 'Nottinghamshire', 'Rutland',
    'Shropshire', 'Staffordshire', 'South Staffordshire',
    'Warwickshire', 'West Midlands', 'Worcestershire',
  ],
  'north': [
    'Cheshire', 'Cumbria', 'County Durham', 'Greater Manchester',
    'Lancashire', 'Merseyside', 'Northumberland',
    'East Yorkshire', 'North Yorkshire', 'West Yorkshire', 'Yorkshire',
  ],
  'scotland-wales': [
    'Scotland', 'Wales', 'Northern Ireland',
    'Angus', 'Argyll and Bute', 'Clackmannanshire', 'East Lothian',
    'Fife', 'Moray', 'Perthshire', 'Stirling',
    'Carmarthenshire', 'Conwy', 'Denbighshire', 'Monmouthshire',
    'Powys', 'South Wales', 'Vale of Glamorgan',
    'Co Down', 'County Tyrone',
  ],
  'overseas': [],
}

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

// schools.gender_split values are case-inconsistent: 'boys', 'Boys',
// 'Boys only', 'co-ed', 'Co-educational', 'girls', 'Girls', 'Mixed'.
// Normalize on lowercase and match against these allowlists.
const BOY_COMPAT  = new Set(['boys', 'boys only', 'co-ed', 'co-educational', 'mixed'])
const GIRL_COMPAT = new Set(['girls', 'girls only', 'co-ed', 'co-educational', 'mixed'])

// Curriculum overlaps. IB shows up in the data under 5 different labels;
// match any of them. A-Level is mostly a single label but rarely tagged
// because it's the UK default — so a lot of A-Level schools have
// curriculum=NULL or just []. We accept either explicit or empty/null.
const IB_VARIANTS = [
  'IB',
  'IB Diploma',
  'IB Diploma Programme',
  'IB Middle Years Programme',
  'IB Primary Years Programme',
]
const ALEVEL_VARIANTS = ['A-Level']

// Boarding/day classification + name normalization moved to
// lib/school-name-overrides.ts to share with research-comparison.ts.

// Sport quality scoring — competitive_tier is free-form prose (~120
// distinct values), so keyword scan it. Caps the prose component at 1.0.
function scoreCompetitiveTier(tier: string | null | undefined): number {
  if (!tier) return 0
  const lc = tier.toLowerCase()
  if (/national.elite|elite.national|national.champion|leading.uk|top 1\b|top 1%|one of the uk's leading/.test(lc)) return 1.0
  if (/national.strong|nationally.competitive|nationally.strong|national.level|nationally|leading independent|sector.leading|elite.tier/.test(lc)) return 0.7
  if (/regional.strong|strong regional|regional.national|national.regional|strong national|strong.competitive/.test(lc)) return 0.5
  if (/regional|county/.test(lc)) return 0.3
  if (/local|school.level|recreational|inter.house/.test(lc)) return 0.1
  return 0.3
}

// team_count_approx is stored as a JSON-string-inside-JSONB:
//   '{"boys": 200, "girls": 5, "mixed": 30}'
// — parse to a single total. Returns 0 on any failure.
function parseTeamTotal(raw: unknown): number {
  if (raw == null) return 0
  let obj: unknown = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { return 0 }
  }
  if (!obj || typeof obj !== 'object') return 0
  const o = obj as Record<string, unknown>
  const sum = (typeof o.boys  === 'number' ? o.boys  : 0)
            + (typeof o.girls === 'number' ? o.girls : 0)
            + (typeof o.mixed === 'number' ? o.mixed : 0)
  return Number.isFinite(sum) ? sum : 0
}

type Profile = {
  home_region:     string | null
  child_gender:    string | null
  child_year:      string | null
  boarding_pref:   string | null
  budget_range:    string | null
  curriculum_pref: string | null
  top_priority:    string | null
  class_size_pref: string | null
  sen_need:        string | null
  onboarding_complete: boolean | null
}

// Slice 4d preview: structured signals the refresh-recommendations endpoint
// extracts from the 4 free-text Brief-tab notes (Personality / Anchors /
// Academic / Goals) via OpenAI GPT-5.4 Mini. Lives under
// child_profile.notes_interpretation_v1. Read here, never written.
type NoteInterpretation = {
  academic_subjects:  string[]
  career_aim:         string | null
  community_pref:     'small' | 'medium' | 'large' | null
  boarding_readiness: 'ready' | 'unsure' | 'not_ready' | null
  sport_weight:       number
  arts_weight:        number
  academic_weight:    number
  signal_quality:     'rich' | 'thin' | 'noisy'
}

type SchoolCandidate = {
  slug:             string
  name:             string
  gender_split:     string | null
  boarding:         boolean | null
  fees_usd_min:     number | null
  sen_support:      boolean | null
  strengths:        string[] | null
  confidence_score: number | null
  age_min:          number | null
  age_max:          number | null
  region:           string | null
}

export type RecommendResult = {
  added:  string[]
  reason: 'inserted' | 'shortlist_not_empty' | 'no_profile' | 'incomplete' | 'no_matches' | 'insert_failed'
}

// Codex P2.1 split: pure compute step. Refresh-recommendations route uses
// this to compute the top 6 BEFORE touching shortlisted_schools, then
// upserts + deletes-stale instead of delete-first → recompute → insert.
// Eliminates the empty-shortlist window if the recommender or insert fails.
export type PickResult = {
  slugs:  string[]
  reason: 'ok' | 'no_profile' | 'incomplete' | 'no_matches'
}

// Codex round-2 P1: ensure the cached interpretation is paired with the
// CURRENT 4 notes. Returns null if hash mismatches (treat as no
// interpretation; recommender falls back to dropdown profile only).
type ChildProfileRow = Partial<Profile> & {
  personality_notes?:        string | null
  anchors_notes?:            string | null
  academic_notes?:           string | null
  goals_notes?:              string | null
  notes_interpretation_v1?:  (NoteInterpretation & { notes_hash?: string }) | null
}
function loadValidInterpretation(profile: ChildProfileRow): NoteInterpretation | null {
  const cached = profile.notes_interpretation_v1
  if (!cached || typeof cached !== 'object') return null
  if (cached.signal_quality === 'noisy') return null
  if (typeof cached.notes_hash !== 'string') return null
  const currentNotes: NotesInput = {
    personality_notes: profile.personality_notes ?? null,
    anchors_notes:     profile.anchors_notes     ?? null,
    academic_notes:    profile.academic_notes    ?? null,
    goals_notes:       profile.goals_notes       ?? null,
  }
  if (cached.notes_hash !== notesHash(currentNotes)) return null
  return cached
}

async function loadUkEvidenceSlugs(supabase: SupabaseClient): Promise<string[]> {
  // schools_status has > 1000 rows and the default supabase row cap is
  // 1000. Paginate explicitly so we don't silently lose schools beyond
  // the first page (mirrors lib/server/tools.js loadUkSlugSet).
  const all: string[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('schools_status')
      .select('school_slug')
      .eq('is_uk_evidence', true)
      .eq('has_substantial_chunks', true)
      .range(offset, offset + PAGE - 1)
    if (error || !data || data.length === 0) break
    all.push(...data.map((r: { school_slug: string }) => r.school_slug))
    if (data.length < PAGE) break
  }
  return all
}

// Compute-only: return the top 6 slugs without writing to shortlisted_schools.
// Callers decide whether to insert (recommendShortlist), replace
// (refresh-recommendations route), or just inspect (testing).
export async function pickTopSchoolSlugs(
  supabase: SupabaseClient,
  userId: string,
  childId: string | null = null,
): Promise<PickResult> {
  assertUserId(userId, 'pickTopSchoolSlugs')

  // 1. Load profile.
  // - With childId: read children.child_profile directly. All 9 fields
  //   live there now (slice 3.3 model — no family-level split).
  // - Without childId: read parent_profiles (legacy / no children yet,
  //   or pre-onboarding).
  let profile: Profile | null = null
  let interpretation: NoteInterpretation | null = null
  if (childId) {
    const { data: child } = await supabase
      .from('children')
      .select('child_profile')
      .eq('id', childId)
      .eq('user_id', userId)
      .maybeSingle<{ child_profile: ChildProfileRow }>()
    if (child?.child_profile) {
      profile = { ...child.child_profile, onboarding_complete: true } as Profile
      // Codex round-2 P1: hash-validate before trusting the cached
      // interpretation. Mismatch → treat as no interpretation.
      interpretation = loadValidInterpretation(child.child_profile)
    }
  } else {
    const { data: pp } = await supabase
      .from('parent_profiles')
      .select('home_region, child_gender, child_year, boarding_pref, budget_range, curriculum_pref, top_priority, class_size_pref, sen_need, onboarding_complete')
      .eq('id', userId)
      .maybeSingle<Profile>()
    profile = pp
  }

  if (!profile) return { slugs: [], reason: 'no_profile' }
  if (!profile.onboarding_complete) return { slugs: [], reason: 'incomplete' }

  // (Idempotency check — was here. Moved to recommendShortlist wrapper so
  // pickTopSchoolSlugs is a pure compute that callers can use to drive
  // either insert-if-empty OR replace-atomically semantics.)

  // 3. Pull the canonical "substantial UK evidence" slug set from
  //    schools_status (same filter /schools uses). Without this, broken
  //    data leaks through — e.g. Nord Anglia mis-tags appearing under
  //    region='England' with non-UK slugs.
  const ukSlugs = await loadUkEvidenceSlugs(supabase)
  if (ukSlugs.length === 0) return { slugs: [], reason: 'no_matches' }

  // 4. Build candidate query — hard filters in SQL
  // confidence_score >= 60 was removed — Westminster + St Paul's have
  // confidence_score=0 in the data despite being substantial-evidence
  // UK schools. The schools_status filter (is_uk_evidence +
  // has_substantial_chunks) is already a meaningful quality bar; the
  // additional confidence threshold was double-filtering and dropping
  // famous schools whose extraction never finished. confidence_score
  // still acts as a tiebreaker via the JS scoring base.
  // is_international filter dropped: Westminster + several famous schools
  // have is_international=NULL despite being substantial UK independents.
  // The schools_status filter (is_uk_evidence) is already a stricter
  // quality gate, so this was double-filtering and hiding famous schools.
  let q = supabase
    .from('schools')
    .select('slug, name, gender_split, boarding, fees_usd_min, sen_support, strengths, confidence_score, age_min, age_max, region')
    .in('slug', ukSlugs)
    .eq('country', 'United Kingdom')

  // Region: moved to JS scoring (not a hard SQL filter). Many famous
  // schools have region=NULL (Westminster, St Paul's, Dulwich) and would
  // be dropped by an .in() filter. We score region match instead.
  //
  // Boarding: SKIPPED in v1 — schools.boarding is broken in the source
  // data (Eton, Harrow, Wycombe Abbey all incorrectly marked as
  // boarding=false; profile_boarding_type is NULL for 83/140 schools).
  // Once cleaned, add back as soft filter.

  // Curriculum filter — IB has 5 label variants in the data, A-Level has
  // 1. Use array overlap; skip filter for 'either' / 'no-preference' /
  // null. Schools with curriculum=NULL/[] still pass for IB? No — we
  // require explicit IB tag. For A-Level we accept NULL too because most
  // UK independents teach A-Level by default but don't tag it.
  if (profile.curriculum_pref === 'ib') {
    q = q.overlaps('curriculum', IB_VARIANTS)
  } else if (profile.curriculum_pref === 'a-level') {
    q = q.or(`curriculum.ov.{${ALEVEL_VARIANTS.join(',')}},curriculum.is.null`)
  }

  // Drop obvious data errors: positive fees under $5,000 are extraction
  // bugs (ACS Cobham at $419, etc.). NULL is fine — means unknown, not
  // wrong. No UK independent realistically charges < $5k/yr full fees.
  q = q.or('fees_usd_min.is.null,fees_usd_min.gte.5000')

  // Budget hard cap (drop schools more than 30% over the ceiling).
  // Accept NULL fees as wildcard — Rugby School and other famous
  // schools have fees_usd_min=NULL but real fees are within budget.
  const ceiling = BUDGET_CEILING_USD[profile.budget_range ?? '']
  if (ceiling != null) {
    q = q.or(`fees_usd_min.is.null,fees_usd_min.lte.${Math.round(ceiling * 1.3)}`)
  }

  // Age range — entry age must fit between age_min and age_max, but
  // NULL means "unknown" not "wrong" — many UK-evidence schools have
  // age_min/max unset. Accept NULL as wildcard.
  const entryAge = YEAR_TO_ENTRY_AGE[profile.child_year ?? '']
  if (entryAge != null) {
    q = q
      .or(`age_min.is.null,age_min.lte.${entryAge}`)
      .or(`age_max.is.null,age_max.gte.${entryAge}`)
  }

  // SEN: if family needs strong support, drop schools that explicitly say
  // sen_support=false. Keep NULL (unknown) — most schools haven't been tagged.
  if (profile.sen_need === 'yes-priority') {
    q = q.or('sen_support.is.null,sen_support.eq.true')
  }

  q = q.order('confidence_score', { ascending: false }).limit(80)

  const { data: candidates, error } = await q
  if (error || !candidates || candidates.length === 0) {
    return { slugs: [], reason: 'no_matches' }
  }

  // 5. Gender filter in JS (case-normalize)
  const genderAllow =
    profile.child_gender === 'boy'  ? BOY_COMPAT  :
    profile.child_gender === 'girl' ? GIRL_COMPAT :
    null

  let filtered = candidates as SchoolCandidate[]
  if (genderAllow) {
    filtered = filtered.filter(s => {
      const g = (s.gender_split ?? '').trim().toLowerCase()
      // NULL gender → keep (unknown, don't penalize)
      return !g || genderAllow.has(g)
    })
  }

  // 5b. Boarding workaround filter — match by normalized name (slug
  // duplicates would leak through a slug-keyed lookup, so we collapse on
  // the human name and match against canonical sets above).
  if (
    profile.boarding_pref === 'full' ||
    profile.boarding_pref === 'weekly' ||
    profile.boarding_pref === 'flexi'
  ) {
    filtered = filtered.filter(s => !KNOWN_DAY_ONLY_NAMES.has(normalizeSchoolName(s.name)))
  } else if (profile.boarding_pref === 'day') {
    filtered = filtered.filter(s => !KNOWN_FULL_BOARDING_NAMES.has(normalizeSchoolName(s.name)))
  }

  if (filtered.length === 0) {
    return { slugs: [], reason: 'no_matches' }
  }

  // 5c. Pull structured data for the surviving candidates (for class size +
  // sport quality scoring). Single batch query; map by slug for lookups.
  const slugs = filtered.map(s => s.slug)
  const { data: structRows } = await supabase
    .from('school_structured_data')
    .select('school_slug, sports_profile, student_community')
    .in('school_slug', slugs)
  const structMap = new Map<string, { sports_profile: any; student_community: any }>()
  for (const row of (structRows ?? [])) {
    structMap.set(row.school_slug, {
      sports_profile: row.sports_profile,
      student_community: row.student_community,
    })
  }

  // 6. Score soft signals
  const regionBucket = new Set(REGION_BUCKETS[profile.home_region ?? ''] ?? [])
  // 'England' is treated as a regional fallback — schools tagged at the
  // country level only, not penalized for being outside any bucket.
  regionBucket.add('England')

  const scored = filtered.map(s => {
    let score = (s.confidence_score ?? 0) / 100  // 0..1 base

    // Region match: in bucket → +0.6, NULL → 0 (neutral, common for
    // famous schools), wrong bucket → -1.0 (was -0.5; bumped after dry-
    // run #7 surfaced Plymouth + Warwick in a London query — high
    // confidence_score was overcoming the soft region penalty).
    if (profile.home_region && profile.home_region !== 'overseas') {
      if (s.region == null) {
        // neutral
      } else if (regionBucket.has(s.region)) {
        score += 0.6
      } else {
        score -= 1.0
      }
    }

    // Budget closeness
    if (ceiling != null && s.fees_usd_min != null) {
      const ratio = s.fees_usd_min / ceiling
      if (ratio <= 1.0) score += 0.5
      else if (ratio <= 1.2) score += 0.2
    }

    // Sport quality (top_priority=sport) — combine prose-keyword tier
    // score, team count, and signature-sport breadth from sports_profile
    // JSONB. Fall back to strengths-tag match when the school has no
    // structured sport data (~20% of UK-evidence schools).
    const struct = structMap.get(s.slug)
    const strengthsLc = (s.strengths ?? []).map(x => x.toLowerCase())
    if (profile.top_priority === 'sport') {
      const sp = struct?.sports_profile as Record<string, unknown> | undefined
      let sportQ = 0
      if (sp) {
        sportQ += scoreCompetitiveTier(sp.competitive_tier as string | null)  // 0..1
        const teams = parseTeamTotal(sp.team_count_approx)
        if (teams >= 100)      sportQ += 0.3
        else if (teams >= 50)  sportQ += 0.2
        else if (teams >= 20)  sportQ += 0.1
        const sigSports = Array.isArray(sp.signature_sports) ? sp.signature_sports.length : 0
        if (sigSports >= 5)      sportQ += 0.2
        else if (sigSports >= 3) sportQ += 0.1
      }
      // Tag fallback when JSONB has nothing useful
      if (sportQ === 0 && strengthsLc.includes('sport')) sportQ = 0.3
      score += Math.min(sportQ, 1.5)
    }
    if (
      profile.top_priority === 'arts' &&
      (strengthsLc.includes('performing arts') ||
       strengthsLc.includes('visual and creative arts') ||
       strengthsLc.includes('music'))
    ) {
      score += 0.3
    }
    if (profile.top_priority === 'all-round' && (s.strengths?.length ?? 0) >= 3) {
      score += 0.2
    }

    // Class size preference — student_community.total_pupils is the
    // cleanest signal. Bumped weights from 0.4/-0.2 to 0.8/-0.5 for
    // "very-important" so this signal can actually re-rank against the
    // region match (+0.6). Dry-run #3 caught a 1800-pupil school
    // outranking a 256-pupil one with these set lower.
    if (profile.class_size_pref === 'very-important' || profile.class_size_pref === 'nice-to-have') {
      const totalPupils = struct?.student_community?.total_pupils as number | null | undefined
      if (typeof totalPupils === 'number') {
        const weight = profile.class_size_pref === 'very-important' ? 1 : 0.5
        if (totalPupils <= 400)       score += 0.8 * weight
        else if (totalPupils <= 800)  score += 0.4 * weight
        else if (totalPupils <= 1200) score += 0.0
        else                          score -= 0.5 * weight
      }
    }

    // SEN positive match (filter already dropped explicit-no)
    if (profile.sen_need === 'yes-priority' && s.sen_support === true) {
      score += 0.4
    }

    // Slice 4d preview: free-text notes interpretation (career_aim,
    // community_pref, sport/arts/academic weights). Codex P2.2: accumulate
    // the per-signal contributions into `interpretationDelta`, then clamp
    // the aggregate before adding to score. Individual additions are small
    // (≤0.4) but they used to be able to stack to >1.0 in conflict cases —
    // the clamp keeps interpretation a re-ranker, not a profile override.
    // Skipped entirely when interpretation is null or signal_quality
    // was 'noisy' (filtered at load time).
    if (interpretation) {
      const interp = interpretation
      const totalPupils = struct?.student_community?.total_pupils as number | null | undefined
      let interpretationDelta = 0

      // Career aim → boost matching strength tags. UK independent strengths
      // tags are coarse ('sport', 'academic', 'performing arts', 'visual
      // and creative arts', 'music', 'STEM') so we can only do approximate
      // matches.
      if (interp.career_aim === 'medicine' || interp.career_aim === 'research' || interp.career_aim === 'engineering' || interp.career_aim === 'tech') {
        if (strengthsLc.includes('academic') || strengthsLc.includes('stem')) interpretationDelta += 0.35
      }
      if (interp.career_aim === 'law' || interp.career_aim === 'finance') {
        if (strengthsLc.includes('academic')) interpretationDelta += 0.3
      }
      if (interp.career_aim === 'arts' && (
        strengthsLc.includes('performing arts') ||
        strengthsLc.includes('visual and creative arts') ||
        strengthsLc.includes('music')
      )) {
        interpretationDelta += 0.4
      }
      if (interp.career_aim === 'sport' && strengthsLc.includes('sport')) {
        interpretationDelta += 0.3
      }

      // Sport / arts / academic weights — additive on top of existing
      // top_priority logic so notes can amplify or introduce a signal the
      // parent didn't pick from the dropdown.
      if (interp.sport_weight >= 0.4 && strengthsLc.includes('sport')) {
        interpretationDelta += 0.3 * interp.sport_weight
      }
      if (interp.arts_weight >= 0.4 && (
        strengthsLc.includes('performing arts') ||
        strengthsLc.includes('visual and creative arts') ||
        strengthsLc.includes('music')
      )) {
        interpretationDelta += 0.3 * interp.arts_weight
      }
      if (interp.academic_weight >= 0.4 && strengthsLc.includes('academic')) {
        interpretationDelta += 0.3 * interp.academic_weight
      }

      // Community preference — overlay on the existing class_size_pref
      // signal. Bumped weights stay small (max 0.4) since they're a soft
      // re-ranker on top of the structured class_size_pref logic.
      if (interp.community_pref && typeof totalPupils === 'number') {
        if (interp.community_pref === 'small' && totalPupils <= 500) interpretationDelta += 0.4
        else if (interp.community_pref === 'small' && totalPupils > 1000) interpretationDelta -= 0.3
        else if (interp.community_pref === 'large' && totalPupils >= 800) interpretationDelta += 0.3
        else if (interp.community_pref === 'large' && totalPupils < 400) interpretationDelta -= 0.2
      }

      // Academic subjects — light additive boost when the school's
      // strengths array name-matches a subject the notes mentioned. Capped
      // at 0.3 total so a long subject list can't dominate.
      if (interp.academic_subjects.length > 0) {
        let subjectBonus = 0
        for (const subj of interp.academic_subjects) {
          if (strengthsLc.some(tag => tag.includes(subj))) subjectBonus += 0.1
        }
        interpretationDelta += Math.min(subjectBonus, 0.3)
      }

      // Codex P2.2: clamp aggregate to ±0.8 / -0.4. Asymmetric on purpose
      // — interpretation can boost a school more than it can drop one,
      // since dropdown-mismatched candidates were already filtered out.
      score += Math.max(-0.4, Math.min(0.8, interpretationDelta))
    }

    return { school: s, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // Hard-fail under 3 strong matches — better empty state than 1-2 weak
  // suggestions. UI's empty-state then prompts the parent to broaden.
  if (scored.length < 3) {
    return { slugs: [], reason: 'no_matches' }
  }

  return { slugs: scored.slice(0, 6).map(x => x.school.slug), reason: 'ok' }
}

// Insert-if-empty semantics. Used by /api/children POST and /api/profile
// (legacy callers that want "create the initial shortlist if missing"
// behaviour). The refresh-recommendations route uses the lower-level
// pickTopSchoolSlugs + its own upsert/delete-stale instead.
export async function recommendShortlist(
  supabase: SupabaseClient,
  userId: string,
  childId: string | null = null,
): Promise<RecommendResult> {
  assertUserId(userId, 'recommendShortlist')

  // Idempotency: bail if THIS scope's shortlist already has rows.
  let existingQuery = supabase
    .from('shortlisted_schools')
    .select('school_slug')
    .eq('user_id', userId)
    .limit(1)
  existingQuery = childId
    ? existingQuery.eq('child_id', childId)
    : existingQuery.is('child_id', null)
  const { data: existing } = await existingQuery
  if (existing && existing.length > 0) {
    return { added: [], reason: 'shortlist_not_empty' }
  }

  const pick = await pickTopSchoolSlugs(supabase, userId, childId)
  if (pick.slugs.length === 0) {
    // Map PickResult.reason → RecommendResult.reason. 'ok' would only
    // appear with empty slugs in a pickTopSchoolSlugs bug, treat as
    // no_matches defensively.
    const mapped =
      pick.reason === 'no_profile'  ? 'no_profile'  :
      pick.reason === 'incomplete'  ? 'incomplete'  :
      'no_matches'
    return { added: [], reason: mapped }
  }

  // Upsert with ignoreDuplicates — the (user_id, child_id, school_slug)
  // UNIQUE NULLS NOT DISTINCT constraint backstops any race window.
  const rows = pick.slugs.map(slug => ({
    user_id: userId,
    school_slug: slug,
    child_id: childId,
  }))
  const { error: insertError } = await supabase
    .from('shortlisted_schools')
    .upsert(rows, { onConflict: 'user_id,child_id,school_slug', ignoreDuplicates: true })

  if (insertError) {
    console.error('[recommendShortlist] upsert failed:', insertError.message)
    return { added: [], reason: 'insert_failed' }
  }
  return { added: pick.slugs, reason: 'inserted' }
}
