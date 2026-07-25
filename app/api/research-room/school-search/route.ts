import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { supabaseService } from '@/lib/supabase-admin'
import { partitionComparisonReadySchools } from '@/lib/research-room/school-comparison-readiness'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SLUG_RX = /^[a-z0-9-]{1,80}$/
const SCHOOL_QUERY_CHUNK_SIZE = 100

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

function richness(row: {
  sports_profile: unknown
  fees_min: number | null
  facilities: unknown[] | null
  university_destinations: unknown
  exam_results: unknown
}): number {
  let score = 0
  if (row.sports_profile != null) score += 1
  if (row.fees_min != null) score += 1
  if (Array.isArray(row.facilities) && row.facilities.length > 0) score += 1
  if (row.university_destinations != null) score += 1
  if (row.exam_results != null) score += 1
  return score
}

function literalIlikeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}

export async function GET(req: NextRequest) {
  if (!isResearchRoomEnabled()) {
    return NextResponse.json({ ok: false, code: 'feature_disabled' }, { status: 404 })
  }

  const query = req.nextUrl.searchParams.get('q')?.trim().replace(/\s+/g, ' ') ?? ''
  if (query.length < 2 || query.length > 60) {
    return NextResponse.json({ ok: false, code: 'invalid_query' }, { status: 400 })
  }
  const exclude = req.nextUrl.searchParams
    .getAll('exclude')
    .filter(slug => SLUG_RX.test(slug))
    .slice(0, 30)

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })
  }
  const { isPaid } = await getUnlockedUser()
  if (!isPaid) {
    return NextResponse.json({ ok: false, code: 'payment_required' }, { status: 402 })
  }

  const service = supabaseService()
  const namePattern = literalIlikeContains(query)
  let directoryCountQuery = service
    .from('schools')
    .select('slug', { count: 'exact', head: true })
    .ilike('name', namePattern)
    .eq('country', 'United Kingdom')
  if (exclude.length > 0) {
    directoryCountQuery = directoryCountQuery.not('slug', 'in', `(${exclude.join(',')})`)
  }

  // The comparison-ready catalogue is small enough to fetch in full. Search
  // every curated slug rather than truncating the broad directory before the
  // readiness filter; otherwise a large duplicate-name group can hide the
  // one record that actually has comparison data.
  const [
    { data: structuredRows, error: structuredError },
    { count: matchingDirectoryCount, error: directoryCountError },
  ] = await Promise.all([
    service
      .from('school_structured_data')
      .select('school_slug, sports_profile, fees_min, facilities, university_destinations, exam_results'),
    directoryCountQuery,
  ])
  if (structuredError || directoryCountError) {
    console.error(
      '[research-room/school-search] catalogue lookup failed',
      structuredError?.message ?? directoryCountError?.message,
    )
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }

  const scoreBySlug = new Map(
    (structuredRows ?? []).map(row => [row.school_slug, richness(row)]),
  )
  const readySlugs = Array.from(scoreBySlug.keys())
    .filter(slug => !exclude.includes(slug))
  if (readySlugs.length === 0) {
    return NextResponse.json({
      ok: true,
      schools: [],
      unready_count: matchingDirectoryCount ?? 0,
    })
  }

  const chunks: string[][] = []
  for (let index = 0; index < readySlugs.length; index += SCHOOL_QUERY_CHUNK_SIZE) {
    chunks.push(readySlugs.slice(index, index + SCHOOL_QUERY_CHUNK_SIZE))
  }
  const candidateResults = await Promise.all(chunks.map(slugs =>
    service
      .from('schools')
      .select('slug, name, region, country')
      .in('slug', slugs)
      .ilike('name', namePattern)
      .eq('country', 'United Kingdom'),
  ))
  const schoolError = candidateResults.find(result => result.error)?.error
  if (schoolError) {
    console.error('[research-room/school-search] school lookup failed', schoolError.message)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }
  const candidates = candidateResults
    .flatMap(result => result.data ?? [])
    .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug))
  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      schools: [],
      unready_count: matchingDirectoryCount ?? 0,
    })
  }

  const partition = partitionComparisonReadySchools(
    candidates,
    new Set(scoreBySlug.keys()),
  )
  return NextResponse.json({
    ok: true,
    schools: partition.ready.map(school => ({
      ...school,
      richness: scoreBySlug.get(school.slug) ?? 0,
    })),
    unready_count: Math.max(
      0,
      (matchingDirectoryCount ?? candidates.length) - partition.ready.length,
    ),
  })
}
