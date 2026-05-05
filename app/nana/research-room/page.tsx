import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { supabaseService } from '@/lib/supabase-admin'
import { loadComparisonData } from '@/lib/research-comparison'
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
  if (user) {
    try {
      comparisonData = await loadComparisonData(supabaseService(), user.id)
    } catch (e) {
      console.error('[research-room loadComparisonData]', e)
    }
  }

  // Children + active child come online in slice 3. Pass an empty list for
  // now — ChildSelector hides itself when count <= 1.
  return (
    <ResearchRoom
      childOptions={[]}
      initialActiveChildId={null}
      comparisonData={comparisonData}
    />
  )
}
