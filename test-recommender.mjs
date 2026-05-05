// Dry-run harness for the recommend-shortlist logic.
// Mirrors lib/recommend-shortlist.ts so we can plug in synthetic profiles
// without touching the user's real shortlist. No DB writes — just reads.
//
// Run: node --env-file=website/.env.local /tmp/test-recommender.mjs

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

// ─── Constants (copy from lib/recommend-shortlist.ts) ──────────────────────

const GBP_TO_USD = 1.27

const REGION_BUCKETS = {
  'london': ['London','Greater London','Hammersmith','Brook Green','South Kensington','Royal Borough of Kensington and Chelsea','Notting Hill, Royal Borough of Kensington and Chelsea','Marylebone, Central London','North West London, Camden','Wimbledon','Wandsworth','Battersea','Richmond','Barnes and Kew','Bromley','Kentish Town','E10'],
  'south-east': ['Berkshire','West Berkshire','Buckinghamshire','Hampshire','Hertfordshire','Kent','Kent/Sussex borders','Dartford','Surrey','East Sussex','West Sussex','Oxfordshire','South Oxfordshire','Bedfordshire','Middlesex','Essex','Isle of Wight'],
  'south-west': ['Bristol','Cornwall','Devon','Dorset','Gloucestershire','Somerset','North Somerset','Wiltshire'],
  'midlands': ['Derbyshire','Herefordshire','Leicestershire','Lincolnshire','Northamptonshire','Nottinghamshire','Rutland','Shropshire','Staffordshire','South Staffordshire','Warwickshire','West Midlands','Worcestershire'],
  'north': ['Cheshire','Cumbria','County Durham','Greater Manchester','Lancashire','Merseyside','Northumberland','East Yorkshire','North Yorkshire','West Yorkshire','Yorkshire'],
  'scotland-wales': ['Scotland','Wales','Northern Ireland','Angus','Argyll and Bute','Clackmannanshire','East Lothian','Fife','Moray','Perthshire','Stirling','Carmarthenshire','Conwy','Denbighshire','Monmouthshire','Powys','South Wales','Vale of Glamorgan','Co Down','County Tyrone'],
  'overseas': [],
}

const BUDGET_CEILING_USD = {
  'under-30k': Math.round(30000 * GBP_TO_USD),
  '30k-40k':   Math.round(40000 * GBP_TO_USD),
  '40k-50k':   Math.round(50000 * GBP_TO_USD),
  'over-50k':  null,
  'bursary':   null,
}

const YEAR_TO_ENTRY_AGE = {
  'year-7': 11, 'year-9': 13, 'year-10': 14, 'sixth-form': 16, 'not-sure': null,
}

const BOY_COMPAT  = new Set(['boys','boys only','co-ed','co-educational','mixed'])
const GIRL_COMPAT = new Set(['girls','girls only','co-ed','co-educational','mixed'])

const IB_VARIANTS = ['IB','IB Diploma','IB Diploma Programme','IB Middle Years Programme','IB Primary Years Programme']
const ALEVEL_VARIANTS = ['A-Level']

function normalizeSchoolName(name) {
  if (!name) return ''
  return name.toLowerCase()
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/\b(school|college)\b/g, '')
    .replace(/\s+/g, ' ').trim()
}

const KNOWN_FULL_BOARDING_NAMES = new Set([
  'eton','harrow','winchester','rugby','tonbridge','sherborne','sherborne girls',
  'marlborough','repton','uppingham','oundle','stowe','radley','wellington',
  'bradfield','bedales','cheltenham','cheltenham ladies','clifton','cranleigh',
  'lancing','roedean','wycombe abbey','st marys ascot','st marys calne',
  'benenden','downe house','queenswood','tudor hall','woldingham','headington',
  'malvern','malvern st james','bromsgrove','worth','stonyhurst','ampleforth',
  'sedbergh','pocklington','queen ethelburgas collegiate','rossall','oakham',
  'ellesmere','concord','gordonstoun','loretto','fettes','glenalmond',
  'merchiston castle','strathallan','millfield','shrewsbury','sevenoaks',
  'felsted','kings canterbury','kings ely','st edwards oxford','leys',
  'kent canterbury','kings taunton','taunton','monkton combe','mount kelly',
  'kingswood bath','wells cathedral','dauntseys','canford','bryanston',
  'eastbourne','ardingly','hurstpierpoint','caterham','shiplake','reeds',
  'reading blue coat','mill hill foundation','st leonards','st edmunds canterbury',
  'denstone','milton abbey','haileybury',
  'charterhouse','bishops stortford','hurtwood house',
  'queen annes','queen annes caversham',
])

const KNOWN_DAY_ONLY_NAMES = new Set([
  'westminster','st pauls','st pauls girls','dulwich','highgate','alleyns',
  'kings wimbledon','haberdashers boys','city of london','whitgift',
  'jeannine manuel','dwight london',
])

function scoreCompetitiveTier(tier) {
  if (!tier) return 0
  const lc = tier.toLowerCase()
  if (/national.elite|elite.national|national.champion|leading.uk|top 1\b|top 1%|one of the uk's leading/.test(lc)) return 1.0
  if (/national.strong|nationally.competitive|nationally.strong|national.level|nationally|leading independent|sector.leading|elite.tier/.test(lc)) return 0.7
  if (/regional.strong|strong regional|regional.national|national.regional|strong national|strong.competitive/.test(lc)) return 0.5
  if (/regional|county/.test(lc)) return 0.3
  if (/local|school.level|recreational|inter.house/.test(lc)) return 0.1
  return 0.3
}

function parseTeamTotal(raw) {
  if (raw == null) return 0
  let obj = raw
  if (typeof raw === 'string') { try { obj = JSON.parse(raw) } catch { return 0 } }
  if (!obj || typeof obj !== 'object') return 0
  const sum = (typeof obj.boys === 'number' ? obj.boys : 0)
            + (typeof obj.girls === 'number' ? obj.girls : 0)
            + (typeof obj.mixed === 'number' ? obj.mixed : 0)
  return Number.isFinite(sum) ? sum : 0
}

async function loadUkEvidenceSlugs() {
  const all = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('schools_status').select('school_slug')
      .eq('is_uk_evidence', true).eq('has_substantial_chunks', true)
      .range(offset, offset + PAGE - 1)
    if (error || !data || data.length === 0) break
    all.push(...data.map(r => r.school_slug))
    if (data.length < PAGE) break
  }
  return all
}

async function computeMatches(profile) {
  const ukSlugs = await loadUkEvidenceSlugs()
  if (ukSlugs.length === 0) return []

  let q = supabase.from('schools')
    .select('slug, name, gender_split, fees_usd_min, sen_support, strengths, confidence_score, age_min, age_max, region')
    .in('slug', ukSlugs)
    .eq('country', 'United Kingdom')

  if (profile.curriculum_pref === 'ib') {
    q = q.overlaps('curriculum', IB_VARIANTS)
  } else if (profile.curriculum_pref === 'a-level') {
    q = q.or(`curriculum.ov.{${ALEVEL_VARIANTS.join(',')}},curriculum.is.null`)
  }

  // Drop obvious data errors: fees under $5k are extraction bugs.
  q = q.or('fees_usd_min.is.null,fees_usd_min.gte.5000')

  const ceiling = BUDGET_CEILING_USD[profile.budget_range ?? '']
  if (ceiling != null) {
    q = q.or(`fees_usd_min.is.null,fees_usd_min.lte.${Math.round(ceiling * 1.3)}`)
  }

  const entryAge = YEAR_TO_ENTRY_AGE[profile.child_year ?? '']
  if (entryAge != null) {
    q = q.or(`age_min.is.null,age_min.lte.${entryAge}`)
         .or(`age_max.is.null,age_max.gte.${entryAge}`)
  }

  if (profile.sen_need === 'yes-priority') {
    q = q.or('sen_support.is.null,sen_support.eq.true')
  }

  q = q.order('confidence_score', { ascending: false }).limit(80)

  const { data: candidates, error } = await q
  if (error) throw error
  if (!candidates?.length) return []

  // Gender filter
  let filtered = candidates
  const genderAllow = profile.child_gender === 'boy' ? BOY_COMPAT : profile.child_gender === 'girl' ? GIRL_COMPAT : null
  if (genderAllow) {
    filtered = filtered.filter(s => {
      const g = (s.gender_split ?? '').trim().toLowerCase()
      return !g || genderAllow.has(g)
    })
  }

  // Boarding workaround — name-based, not slug-based
  if (['full','weekly','flexi'].includes(profile.boarding_pref)) {
    filtered = filtered.filter(s => !KNOWN_DAY_ONLY_NAMES.has(normalizeSchoolName(s.name)))
  } else if (profile.boarding_pref === 'day') {
    filtered = filtered.filter(s => !KNOWN_FULL_BOARDING_NAMES.has(normalizeSchoolName(s.name)))
  }

  if (filtered.length === 0) return []

  // Pull structured data
  const slugs = filtered.map(s => s.slug)
  const { data: structRows } = await supabase
    .from('school_structured_data')
    .select('school_slug, sports_profile, student_community')
    .in('school_slug', slugs)
  const structMap = new Map((structRows ?? []).map(r => [r.school_slug, r]))

  // Scoring
  const regionBucket = new Set(REGION_BUCKETS[profile.home_region ?? ''] ?? [])
  regionBucket.add('England')

  const scored = filtered.map(s => {
    let score = (s.confidence_score ?? 0) / 100

    if (profile.home_region && profile.home_region !== 'overseas') {
      if (s.region == null) {} // neutral
      else if (regionBucket.has(s.region)) score += 0.6
      else score -= 1.0
    }

    if (ceiling != null && s.fees_usd_min != null) {
      const ratio = s.fees_usd_min / ceiling
      if (ratio <= 1.0) score += 0.5
      else if (ratio <= 1.2) score += 0.2
    }

    const struct = structMap.get(s.slug)
    const strengthsLc = (s.strengths ?? []).map(x => x.toLowerCase())

    if (profile.top_priority === 'sport') {
      const sp = struct?.sports_profile
      let sportQ = 0
      if (sp) {
        sportQ += scoreCompetitiveTier(sp.competitive_tier)
        const teams = parseTeamTotal(sp.team_count_approx)
        if (teams >= 100) sportQ += 0.3
        else if (teams >= 50) sportQ += 0.2
        else if (teams >= 20) sportQ += 0.1
        const sigSports = Array.isArray(sp.signature_sports) ? sp.signature_sports.length : 0
        if (sigSports >= 5) sportQ += 0.2
        else if (sigSports >= 3) sportQ += 0.1
      }
      if (sportQ === 0 && strengthsLc.includes('sport')) sportQ = 0.3
      score += Math.min(sportQ, 1.5)
    }
    if (profile.top_priority === 'arts' &&
        (strengthsLc.includes('performing arts') || strengthsLc.includes('visual and creative arts') || strengthsLc.includes('music'))) {
      score += 0.3
    }
    if (profile.top_priority === 'all-round' && (s.strengths?.length ?? 0) >= 3) {
      score += 0.2
    }

    if (profile.class_size_pref === 'very-important' || profile.class_size_pref === 'nice-to-have') {
      const totalPupils = struct?.student_community?.total_pupils
      if (typeof totalPupils === 'number') {
        const w = profile.class_size_pref === 'very-important' ? 1 : 0.5
        if (totalPupils <= 400) score += 0.8 * w
        else if (totalPupils <= 800) score += 0.4 * w
        else if (totalPupils <= 1200) score += 0.0
        else score -= 0.5 * w
      }
    }

    if (profile.sen_need === 'yes-priority' && s.sen_support === true) score += 0.4

    return { school: s, score, struct }
  })

  scored.sort((a,b) => b.score - a.score)
  if (scored.length < 3) return [] // hard-fail under 3 matches
  return scored.slice(0, 6)
}

const TESTS = [
  {
    name: '1. London girl · sixth-form · day · over-50k · A-Level · academic',
    profile: { home_region:'london', child_gender:'girl', child_year:'sixth-form', boarding_pref:'day', budget_range:'over-50k', curriculum_pref:'a-level', top_priority:'academic', class_size_pref:'no-preference', sen_need:'no-concern' },
    expect: 'London day-only academic powerhouses (Westminster, Highgate, Alleyn\'s, etc.) — boarding schools should be dropped',
  },
  {
    name: '2. South-east boy · year-9 · full · 40-50k · A-Level · sport',
    profile: { home_region:'south-east', child_gender:'boy', child_year:'year-9', boarding_pref:'full', budget_range:'40k-50k', curriculum_pref:'a-level', top_priority:'sport', class_size_pref:'no-preference', sen_need:'no-concern' },
    expect: 'SE boarding schools with sport — Wellington over budget should be excluded; expect Lancing/Eastbourne/Cranleigh-tier',
  },
  {
    name: '3. Midlands girl · year-7 · weekly · 30-40k · either · pastoral · class-size-very-important · SEN-yes',
    profile: { home_region:'midlands', child_gender:'girl', child_year:'year-7', boarding_pref:'weekly', budget_range:'30k-40k', curriculum_pref:'either', top_priority:'pastoral', class_size_pref:'very-important', sen_need:'yes-priority' },
    expect: 'Smaller Midlands schools, sen_support=true preferred',
  },
  {
    name: '4. South-west boy · year-9 · full · bursary · either · all-round',
    profile: { home_region:'south-west', child_gender:'boy', child_year:'year-9', boarding_pref:'full', budget_range:'bursary', curriculum_pref:'either', top_priority:'all-round', class_size_pref:'no-preference', sen_need:'no-concern' },
    expect: 'SW boarding schools at any price (bursary), all-rounders preferred',
  },
  {
    name: '5. SE girl · sixth-form · day · 40-50k · IB · arts',
    profile: { home_region:'south-east', child_gender:'girl', child_year:'sixth-form', boarding_pref:'day', budget_range:'40k-50k', curriculum_pref:'ib', top_priority:'arts', class_size_pref:'nice-to-have', sen_need:'no-concern' },
    expect: 'SE day schools with arts strength + IB',
  },
  {
    name: '6. SE boy · year-9 · full · UNDER-30k (tight) · either · academic',
    profile: { home_region:'south-east', child_gender:'boy', child_year:'year-9', boarding_pref:'full', budget_range:'under-30k', curriculum_pref:'either', top_priority:'academic', class_size_pref:'no-preference', sen_need:'no-concern' },
    expect: 'Cheap SE boarding schools (cap $49.5k). Eton/Wellington dropped (way over). Likely thin list.',
  },
  {
    name: '7. London boy · YEAR-7 · day · 40-50k · A-Level · academic',
    profile: { home_region:'london', child_gender:'boy', child_year:'year-7', boarding_pref:'day', budget_range:'40k-50k', curriculum_pref:'a-level', top_priority:'academic', class_size_pref:'no-preference', sen_need:'no-concern' },
    expect: 'London day boys-or-coed schools accepting year 7 (age 11). Westminster/St Pauls missing again likely (broken data).',
  },
  {
    name: '8. North · EITHER gender · OPEN boarding · NO-PREF curriculum · pastoral',
    profile: { home_region:'north', child_gender:'either', child_year:'year-9', boarding_pref:'open', budget_range:'30k-40k', curriculum_pref:'no-preference', top_priority:'pastoral', class_size_pref:'nice-to-have', sen_need:'no-concern' },
    expect: 'North England schools, no gender/boarding/curriculum filters. Mixed list.',
  },
  {
    name: '9. OVERSEAS · girl · sixth-form · full · over-50k · IB · arts',
    profile: { home_region:'overseas', child_gender:'girl', child_year:'sixth-form', boarding_pref:'full', budget_range:'over-50k', curriculum_pref:'ib', top_priority:'arts', class_size_pref:'no-preference', sen_need:'no-concern' },
    expect: 'No region penalty (overseas). Top IB sixth-form boarding schools regardless of region.',
  },
  {
    name: '10. ADVERSARIAL · scotland-wales girl · year-7 · day · under-30k · IB · arts · small class · SEN',
    profile: { home_region:'scotland-wales', child_gender:'girl', child_year:'year-7', boarding_pref:'day', budget_range:'under-30k', curriculum_pref:'ib', top_priority:'arts', class_size_pref:'very-important', sen_need:'yes-priority' },
    expect: 'Heavy constraints; expect few or zero matches. Tests graceful empty handling.',
  },
]

console.log('Dry-run recommender harness — no DB writes\n' + '='.repeat(60))
for (const t of TESTS) {
  console.log(`\n${t.name}`)
  console.log(`  Expect: ${t.expect}`)
  const matches = await computeMatches(t.profile)
  if (matches.length === 0) {
    console.log('  → 0 matches')
    continue
  }
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const s = m.school
    const tier = m.struct?.sports_profile?.competitive_tier?.slice(0, 60) ?? '—'
    const pupils = m.struct?.student_community?.total_pupils ?? '—'
    console.log(`  ${i+1}. ${s.name.padEnd(32)} ${(s.region ?? '—').padEnd(20)} ${('$' + (s.fees_usd_min ?? '?')).padEnd(8)} score=${m.score.toFixed(2)}  pupils=${pupils}`)
  }
}
console.log('\n' + '='.repeat(60))
