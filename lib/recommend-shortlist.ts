import type { SupabaseClient } from '@supabase/supabase-js'

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

export async function recommendShortlist(
  supabase: SupabaseClient,
  userId: string,
): Promise<RecommendResult> {
  // 1. Load profile
  const { data: profile } = await supabase
    .from('parent_profiles')
    .select('home_region, child_gender, child_year, boarding_pref, budget_range, curriculum_pref, top_priority, class_size_pref, sen_need, onboarding_complete')
    .eq('id', userId)
    .maybeSingle<Profile>()

  if (!profile) return { added: [], reason: 'no_profile' }
  if (!profile.onboarding_complete) return { added: [], reason: 'incomplete' }

  // 2. Bail if shortlist already has rows
  const { data: existing } = await supabase
    .from('shortlisted_schools')
    .select('school_slug')
    .eq('user_id', userId)
    .limit(1)

  if (existing && existing.length > 0) {
    return { added: [], reason: 'shortlist_not_empty' }
  }

  // 3. Pull the canonical "substantial UK evidence" slug set from
  //    schools_status (same filter /schools uses). Without this, broken
  //    data leaks through — e.g. Nord Anglia mis-tags appearing under
  //    region='England' with non-UK slugs.
  const ukSlugs = await loadUkEvidenceSlugs(supabase)
  if (ukSlugs.length === 0) return { added: [], reason: 'no_matches' }

  // 4. Build candidate query — hard filters in SQL
  let q = supabase
    .from('schools')
    .select('slug, name, gender_split, boarding, fees_usd_min, sen_support, strengths, confidence_score, age_min, age_max, region')
    .in('slug', ukSlugs)
    .eq('country', 'United Kingdom')
    .eq('is_international', true)
    .gte('confidence_score', 60)

  // Region: moved to JS scoring (not a hard SQL filter). Many famous
  // schools have region=NULL (Westminster, St Paul's, Dulwich) and would
  // be dropped by an .in() filter. We score region match instead.
  //
  // Boarding: SKIPPED in v1 — schools.boarding is broken in the source
  // data (Eton, Harrow, Wycombe Abbey all incorrectly marked as
  // boarding=false; profile_boarding_type is NULL for 83/140 schools).
  // Once cleaned, add back as soft filter.

  // Budget hard cap (drop schools more than 30% over the ceiling)
  const ceiling = BUDGET_CEILING_USD[profile.budget_range ?? '']
  if (ceiling != null) {
    q = q.lte('fees_usd_min', Math.round(ceiling * 1.3))
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
    return { added: [], reason: 'no_matches' }
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

  if (filtered.length === 0) {
    return { added: [], reason: 'no_matches' }
  }

  // 6. Score soft signals
  const regionBucket = new Set(REGION_BUCKETS[profile.home_region ?? ''] ?? [])
  // 'England' is treated as a regional fallback — schools tagged at the
  // country level only, not penalized for being outside any bucket.
  regionBucket.add('England')

  const scored = filtered.map(s => {
    let score = (s.confidence_score ?? 0) / 100  // 0..1 base

    // Region match: in bucket → +0.6 (strong preference but not a hard
    // filter, because region is NULL for many famous schools).
    // NULL region → 0 (neutral). Other bucket → -0.5 (push down).
    if (profile.home_region && profile.home_region !== 'overseas') {
      if (s.region == null) {
        // neutral
      } else if (regionBucket.has(s.region)) {
        score += 0.6
      } else {
        score -= 0.5
      }
    }

    // Budget closeness
    if (ceiling != null && s.fees_usd_min != null) {
      const ratio = s.fees_usd_min / ceiling
      if (ratio <= 1.0) score += 0.5
      else if (ratio <= 1.2) score += 0.2
    }

    // Top priority match against the strengths array
    const strengthsLc = (s.strengths ?? []).map(x => x.toLowerCase())
    if (profile.top_priority === 'sport' && strengthsLc.includes('sport')) {
      score += 0.3
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

    // SEN positive match (filter already dropped explicit-no)
    if (profile.sen_need === 'yes-priority' && s.sen_support === true) {
      score += 0.4
    }

    return { school: s, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const top = scored.slice(0, 6).map(x => x.school)

  // 7. Insert
  const rows = top.map(s => ({ user_id: userId, school_slug: s.slug }))
  const { error: insertError } = await supabase
    .from('shortlisted_schools')
    .insert(rows)

  if (insertError) {
    console.error('[recommendShortlist] insert failed:', insertError.message)
    return { added: [], reason: 'insert_failed' }
  }

  return { added: top.map(s => s.slug), reason: 'inserted' }
}
