import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Public read-only school search API
// GET /api/v1/schools?country=uk&type=boarding&curriculum=ib&max_fee_usd=60000&limit=20
// No auth required. Used by AI tools and third-party developers.

const CURRICULUM_MAP: Record<string, string> = {
  'ib': 'IB',
  'a-level': 'A-Level',
  'ap': 'AP',
  'igcse': 'IGCSE',
  'cambridge': 'Cambridge',
}

const COUNTRY_SLUG_MAP: Record<string, string> = {
  'uk': 'United Kingdom',
  'united-kingdom': 'United Kingdom',
  'thailand': 'Thailand',
  'singapore': 'Singapore',
  'hong-kong': 'Hong Kong',
  'china': 'China',
  'japan': 'Japan',
  'switzerland': 'Switzerland',
  'malaysia': 'Malaysia',
  'taiwan': 'Taiwan',
  'south-korea': 'South Korea',
  'indonesia': 'Indonesia',
  'vietnam': 'Vietnam',
  'philippines': 'Philippines',
  'myanmar': 'Myanmar',
  'cambodia': 'Cambodia',
  'italy': 'Italy',
  'germany': 'Germany',
  'austria': 'Austria',
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const countryParam = searchParams.get('country')?.toLowerCase().trim()
  const typeParam = searchParams.get('type')?.toLowerCase().trim()
  const curriculumParam = searchParams.get('curriculum')?.toLowerCase().trim()
  const maxFeeParam = searchParams.get('max_fee_usd')
  const minFeeParam = searchParams.get('min_fee_usd')
  const boardingParam = searchParams.get('boarding')
  const scholarshipParam = searchParams.get('scholarship')
  const limitParam = parseInt(searchParams.get('limit') ?? '20', 10)
  const offsetParam = parseInt(searchParams.get('offset') ?? '0', 10)

  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 20 : limitParam), 100)
  const offset = Math.max(0, isNaN(offsetParam) ? 0 : offsetParam)

  let query = supabase
    .from('schools')
    .select(
      'id,slug,name,country,city,school_type,curriculum,fees_usd_min,fees_usd_max,fees_original,boarding,scholarship_available,age_min,age_max,hero_image,university_placement_rate,ib_pass_rate,review_score,official_website',
      { count: 'exact' }
    )
    .eq('is_international', true)
    .order('confidence_score', { ascending: false })
    .range(offset, offset + limit - 1)

  // Country filter (accept slug or full name)
  if (countryParam) {
    const countryName = COUNTRY_SLUG_MAP[countryParam] ?? countryParam
    query = query.ilike('country', countryName)
  }

  // School type filter
  if (typeParam) {
    query = query.ilike('school_type', `%${typeParam}%`)
  }

  // Curriculum filter
  if (curriculumParam) {
    const dbCurriculum = CURRICULUM_MAP[curriculumParam] ?? curriculumParam
    query = query.contains('curriculum', [dbCurriculum])
  }

  // Fee filters
  if (maxFeeParam) {
    const maxFee = parseInt(maxFeeParam, 10)
    if (!isNaN(maxFee)) query = query.lte('fees_usd_min', maxFee)
  }
  if (minFeeParam) {
    const minFee = parseInt(minFeeParam, 10)
    if (!isNaN(minFee)) query = query.gte('fees_usd_min', minFee)
  }

  // Boarding filter
  if (boardingParam === 'true') query = query.eq('boarding', true)
  if (boardingParam === 'false') query = query.eq('boarding', false)

  // Scholarship filter
  if (scholarshipParam === 'true') query = query.eq('scholarship_available', true)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json(
    {
      meta: {
        total: count ?? 0,
        limit,
        offset,
        source: 'nanasays.com',
        docs: 'https://nanasays.com/api/v1/schools — free, read-only, no auth required',
      },
      schools: data ?? [],
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  )
}
