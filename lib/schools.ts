import { supabase } from './supabase'
import type { School, SchoolSummary, SchoolListItem } from './types'

export async function getSchoolBySlug(slug: string): Promise<School | null> {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !data) return null
  return data as School
}

export async function getSchoolsByCountry(country: string, limit = 12): Promise<SchoolSummary[]> {
  const { data, error } = await supabase
    .from('schools')
    .select('id,slug,name,country,city,region,school_type,curriculum,fees_usd_min,fees_usd_max,boarding,university_placement_rate,hero_image,review_score,verified_at')
    .eq('country', country)
    .eq('is_international', true)
    .order('confidence_score', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as SchoolSummary[]
}

export async function getSimilarSchools(school: School): Promise<SchoolSummary[]> {
  const SELECT = 'id,slug,name,country,city,region,school_type,curriculum,fees_usd_min,fees_usd_max,boarding,university_placement_rate,hero_image,review_score,verified_at'

  // Tier 1: same country + same city
  if (school.city) {
    const { data } = await supabase
      .from('schools')
      .select(SELECT)
      .eq('country', school.country ?? '')
      .eq('city', school.city)
      .eq('is_international', true)
      .neq('id', school.id)
      .order('confidence_score', { ascending: false })
      .limit(3)
    if (data && data.length >= 2) return data as SchoolSummary[]
  }

  // Tier 2: same country + same first curriculum
  const firstCurriculum = school.curriculum?.[0]
  if (firstCurriculum) {
    const { data } = await supabase
      .from('schools')
      .select(SELECT)
      .eq('country', school.country ?? '')
      .contains('curriculum', [firstCurriculum])
      .eq('is_international', true)
      .neq('id', school.id)
      .order('confidence_score', { ascending: false })
      .limit(3)
    if (data && data.length >= 2) return data as SchoolSummary[]
  }

  // Tier 3: same country, random 3 — never return empty
  if (school.country) {
    const { data } = await supabase
      .from('schools')
      .select(SELECT)
      .eq('country', school.country)
      .eq('is_international', true)
      .neq('id', school.id)
      .not('hero_image', 'is', null)
      .order('confidence_score', { ascending: false })
      .limit(3)
    if (data && data.length > 0) return data as SchoolSummary[]
  }

  return []
}

export async function searchSchools(query: string, limit = 8): Promise<SchoolSummary[]> {
  const { data, error } = await supabase
    .from('schools')
    .select('id,slug,name,country,city,region,school_type,curriculum,fees_usd_min,fees_usd_max,boarding,university_placement_rate,hero_image,review_score,verified_at')
    .ilike('name', `%${query}%`)
    .eq('is_international', true)
    .order('confidence_score', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as SchoolSummary[]
}

export async function getFeaturedSchools(limit = 6): Promise<SchoolSummary[]> {
  const { data, error } = await supabase
    .from('schools')
    .select('id,slug,name,country,city,region,school_type,curriculum,fees_usd_min,fees_usd_max,boarding,university_placement_rate,hero_image,review_score,verified_at')
    .not('hero_image', 'is', null)
    .eq('is_international', true)
    .order('confidence_score', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as SchoolSummary[]
}

export async function getCountrySchoolCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('get_country_school_counts')
  if (error || !data) return {}
  return Object.fromEntries(data.map((row: { country: string; count: number }) => [row.country, Number(row.count)]))
}

export async function getTotalSchoolCount(): Promise<number> {
  const { count, error } = await supabase
    .from('schools')
    .select('*', { count: 'exact', head: true })
    .eq('is_international', true)
  if (error) return 0
  return count ?? 0
}

export async function getSchoolsForCountryPage(country: string, limit = 1000): Promise<SchoolListItem[]> {
  const { data, error } = await supabase
    .from('schools')
    .select('id,slug,name,country,city,school_type,curriculum,fees_usd_min,fees_usd_max,fees_original,fees_currency,age_min,age_max,boarding,hero_image,thai_students,unique_selling_points,strengths,scholarship_available,nationalities_count,international_student_percent,confidence_score,latitude,longitude,sen_support,eal_support,is_partner,partner_tier')
    .eq('country', country)
    .eq('is_international', true)
    .order('is_partner', { ascending: false, nullsFirst: false })
    .order('confidence_score', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as SchoolListItem[]
}

// Filter helpers for SEO category pages

export const FILTER_TYPES = ['boarding', 'day', 'mixed'] as const
export const FILTER_CURRICULA = ['ib', 'a-level', 'ap', 'igcse', 'cambridge'] as const
export type FilterType = typeof FILTER_TYPES[number]
export type FilterCurriculum = typeof FILTER_CURRICULA[number]

const CURRICULUM_MAP: Record<string, string> = {
  'ib': 'IB',
  'a-level': 'A-Level',
  'ap': 'AP',
  'igcse': 'IGCSE',
  'cambridge': 'Cambridge',
}

const TYPE_MAP: Record<string, string> = {
  'boarding': 'Boarding',
  'day': 'Day',
  'mixed': 'Mixed',
}

export function filterSlugToLabel(filter: string): string {
  return CURRICULUM_MAP[filter] ?? TYPE_MAP[filter] ?? filter
}

export function isTypeFilter(filter: string): boolean {
  return FILTER_TYPES.includes(filter as FilterType)
}

export function isCurriculumFilter(filter: string): boolean {
  return FILTER_CURRICULA.includes(filter as FilterCurriculum)
}

export async function getSchoolsByFilter(params: {
  country?: string
  type?: string
  curriculum?: string
}, limit = 200): Promise<SchoolListItem[]> {
  let query = supabase
    .from('schools')
    .select('id,slug,name,country,city,school_type,curriculum,fees_usd_min,fees_usd_max,fees_original,fees_currency,age_min,age_max,boarding,hero_image,thai_students,unique_selling_points,strengths,scholarship_available,nationalities_count,international_student_percent,confidence_score')
    .eq('is_international', true)
    .order('confidence_score', { ascending: false })
    .limit(limit)

  if (params.country) {
    query = query.eq('country', params.country)
  }
  if (params.type) {
    const dbType = TYPE_MAP[params.type.toLowerCase()] ?? params.type
    query = query.ilike('school_type', `%${dbType}%`)
  }
  if (params.curriculum) {
    const dbCurriculum = CURRICULUM_MAP[params.curriculum.toLowerCase()] ?? params.curriculum
    query = query.contains('curriculum', [dbCurriculum])
  }

  const { data, error } = await query
  if (error || !data) return []
  return data as SchoolListItem[]
}

export async function getFilterCombinations(): Promise<{ country: string; filter: string }[]> {
  const allData: { country: string | null; school_type: string | null; curriculum: string[] | null }[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('schools')
      .select('country,school_type,curriculum')
      .eq('is_international', true)
      .range(from, from + 999)
    if (error || !data || data.length === 0) break
    allData.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  const data = allData

  const countMap: Record<string, number> = {}

  for (const row of data) {
    if (!row.country) continue
    const countrySlug = row.country.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '')

    // Count by school type
    if (row.school_type) {
      const typeSlug = row.school_type.toLowerCase().trim()
      const key = `${countrySlug}|${typeSlug}`
      countMap[key] = (countMap[key] || 0) + 1
    }

    // Count by curriculum
    if (Array.isArray(row.curriculum)) {
      for (const c of row.curriculum) {
        const currSlug = c.toLowerCase().replace(/ /g, '-')
        if (FILTER_CURRICULA.includes(currSlug as FilterCurriculum)) {
          const key = `${countrySlug}|${currSlug}`
          countMap[key] = (countMap[key] || 0) + 1
        }
      }
    }
  }

  // Only return combos with ≥5 schools
  return Object.entries(countMap)
    .filter(([, count]) => count >= 5)
    .map(([key]) => {
      const [country, filter] = key.split('|')
      return { country, filter }
    })
}

export async function getSchoolPairBySlug(slugA: string, slugB: string): Promise<[School, School] | null> {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .in('slug', [slugA, slugB])

  if (error || !data || data.length < 2) return null
  const a = data.find(s => s.slug === slugA)
  const b = data.find(s => s.slug === slugB)
  if (!a || !b) return null
  return [a as School, b as School]
}

export async function getSchoolPairs(limit = 500): Promise<{ slugA: string; slugB: string }[]> {
  // Fetch schools with enough data for a useful comparison
  const { data, error } = await supabase
    .from('schools')
    .select('slug,country,curriculum,fees_usd_min,confidence_score')
    .eq('is_international', true)
    .not('curriculum', 'is', null)
    .not('fees_usd_min', 'is', null)
    .order('confidence_score', { ascending: false })
    .limit(300)

  if (error || !data) return []

  const pairs: { slugA: string; slugB: string }[] = []

  for (let i = 0; i < data.length && pairs.length < limit; i++) {
    const a = data[i]
    for (let j = i + 1; j < data.length && pairs.length < limit; j++) {
      const b = data[j]
      if (a.country !== b.country) continue
      const aFee = a.fees_usd_min ?? 0
      const bFee = b.fees_usd_min ?? 0
      const feeRatio = aFee > 0 && bFee > 0 ? Math.max(aFee, bFee) / Math.min(aFee, bFee) : 99
      if (feeRatio > 1.5) continue
      pairs.push({ slugA: a.slug, slugB: b.slug })
    }
  }

  return pairs
}

export function formatFees(school: Pick<School, 'fees_usd_min' | 'fees_usd_max' | 'fees_original' | 'fees_currency' | 'fees_local_min' | 'fees_local_max' | 'fees_local_currency'>): string {
  if (school.fees_local_min && school.fees_local_currency) {
    const currency = school.fees_local_currency
    const min = school.fees_local_min.toLocaleString()
    if (school.fees_local_max && school.fees_local_max !== school.fees_local_min) {
      return `${currency} ${min} – ${school.fees_local_max.toLocaleString()}`
    }
    return `From ${currency} ${min}`
  }
  if (school.fees_original) {
    return school.fees_original.replace(/([A-Z]{3})(\d)/, '$1 $2')
  }
  if (school.fees_usd_min && school.fees_usd_max) {
    return `$${school.fees_usd_min.toLocaleString()} – $${school.fees_usd_max.toLocaleString()}`
  }
  if (school.fees_usd_min) return `From $${school.fees_usd_min.toLocaleString()}`
  return 'Contact school'
}

export function formatAges(school: Pick<School, 'age_min' | 'age_max'>): string {
  if (school.age_min != null && school.age_max != null) {
    return `Ages ${school.age_min}–${school.age_max}`
  }
  return ''
}
