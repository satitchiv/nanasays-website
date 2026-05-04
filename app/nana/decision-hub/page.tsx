import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { DecisionHub } from '@/components/nana/DecisionHub'
import { getUnlockedUser } from '@/lib/paid-status'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Decision Hub — Nanasays',
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export default async function DecisionHubPage() {
  const { isPaid } = await getUnlockedUser()
  if (!isPaid) redirect('/unlock?next=/nana/decision-hub')

  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()

  // ── Parent profile ──────────────────────────────────────────────────────
  let profile: {
    child_year?: string | null
    boarding_pref?: string | null
    budget_range?: string | null
    top_priority?: string | null
    home_region?: string | null
    onboarding_complete?: boolean
  } | null = null

  if (user) {
    const { data: profileData } = await supabase
      .from('parent_profiles')
      .select('child_year, boarding_pref, budget_range, top_priority, home_region, onboarding_complete')
      .eq('user_id', user.id)
      .maybeSingle()
    profile = profileData ?? null
  }

  // ── Shortlist with school names ─────────────────────────────────────────
  let shortlist: Array<{
    school_slug: string
    school_name: string
    fees_min: number | null
    fees_max: number | null
  }> = []

  if (user) {
    const { data: shortlistData } = await supabase
      .from('shortlisted_schools')
      .select('school_slug, added_at')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })
      .limit(10)

    if (shortlistData && shortlistData.length > 0) {
      const slugs = shortlistData.map((r: { school_slug: string }) => r.school_slug)
      const { data: schoolsData } = await supabase
        .from('schools')
        .select('slug, name, fees_min, fees_max')
        .in('slug', slugs)

      if (schoolsData) {
        shortlist = shortlistData.map((r: { school_slug: string }) => {
          const s = schoolsData.find((sc: { slug: string }) => sc.slug === r.school_slug)
          return {
            school_slug: r.school_slug,
            school_name: s?.name ?? r.school_slug,
            fees_min: s?.fees_min ?? null,
            fees_max: s?.fees_max ?? null,
          }
        })
      }
    }
  }

  // ── Structured data for all shortlisted schools ─────────────────────────
  let structuredData: Array<{
    school_slug: string
    exam_results: Record<string, unknown> | null
    fees_by_grade: Record<string, unknown> | null
    fees_min: number | null
    fees_max: number | null
    fees_currency: string | null
    sports_profile: Record<string, unknown> | null
    report_verdict: Record<string, unknown> | null
    university_destinations: Record<string, unknown> | null
  }> = []

  if (shortlist.length > 0) {
    const slugs = shortlist.map(s => s.school_slug)
    const { data: ssd } = await supabase
      .from('school_structured_data')
      .select('school_slug, exam_results, fees_by_grade, fees_min, fees_max, fees_currency, sports_profile, report_verdict, university_destinations')
      .in('school_slug', slugs)
    structuredData = (ssd ?? []) as typeof structuredData
  }

  // ── Latest research session + messages ──────────────────────────────────
  let initialSession: {
    id: string
    title: string | null
    summary: unknown | null
    created_at: string
    last_active_at: string
  } | null = null
  let initialMessages: any[] = []

  if (user) {
    const { data: sessions } = await supabase
      .from('research_sessions')
      .select('id, title, summary, created_at, last_active_at')
      .eq('user_id', user.id)
      .order('last_active_at', { ascending: false })
      .limit(1)

    initialSession = sessions?.[0] ?? null

    if (initialSession) {
      const { data: msgs } = await supabase
        .from('research_session_messages')
        .select('id, question, parsed_answer, share_token, created_at')
        .eq('session_id', initialSession.id)
        .order('created_at', { ascending: true })
      initialMessages = msgs ?? []
    }
  }

  return (
    <DecisionHub
      profile={profile}
      shortlist={shortlist}
      structuredData={structuredData}
      initialSession={initialSession as any}
      initialMessages={initialMessages}
    />
  )
}
