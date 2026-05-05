import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { supabaseService } from '@/lib/supabase-admin'
import { loadComparisonData } from '@/lib/research-comparison'
import { loadActiveChildren } from '@/lib/children'
import ResearchRoom from '@/components/nana/ResearchRoom'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Research Room — Nanasays',
  robots: { index: false, follow: false },
}

export default async function ResearchRoomPage() {
  if (!isResearchRoomEnabled()) {
    notFound()
  }

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) {
    redirect('/unlock?next=/nana/research-room')
  }

  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await authClient.auth.getUser()

  // Real comparison data: shortlisted_schools × schools × structured × ISI.
  // Service-role client because school_structured_data + schools_status
  // are RLS-locked from anon. ComparisonView falls back to its empty
  // state when schools.length === 0 (e.g. parent skipped onboarding).
  let comparisonData
  let children: Awaited<ReturnType<typeof loadActiveChildren>> = []
  if (user) {
    try {
      comparisonData = await loadComparisonData(supabaseService(), user.id)
    } catch (e) {
      console.error('[research-room loadComparisonData]', e)
    }
    try {
      children = await loadActiveChildren(supabaseService(), user.id)
    } catch (e) {
      console.error('[research-room loadActiveChildren]', e)
    }
  }

  // Slice 3.1: pass real children to the dropdown + Brief tab.
  // Active-child persistence to research_sessions lands in 3.2; for now
  // the active id is just the first child (or null when there are none).
  const childSummaries = children.map(c => ({
    id: c.id,
    name: c.name,
    date_of_birth: c.date_of_birth,
    is_archived: c.is_archived,
  }))
  const initialActiveChildId = children[0]?.id ?? null

  return (
    <ResearchRoom
      childOptions={childSummaries.map(c => ({ id: c.id, name: c.name }))}
      childSummaries={childSummaries}
      initialActiveChildId={initialActiveChildId}
      comparisonData={comparisonData}
    />
  )
}
