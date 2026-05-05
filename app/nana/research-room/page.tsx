import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { supabaseService } from '@/lib/supabase-admin'
import { loadComparisonData } from '@/lib/research-comparison'
import { loadActiveChildren } from '@/lib/children'
import { ONBOARDING_FIELDS } from '@/lib/onboarding-fields'
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

  // Slice 3.2: read active_child_id from parent_profiles (persisted),
  // load active children, and scope the comparison data fetch to the
  // active child. NULL active_child_id falls back to parent-wide rows
  // (legacy behavior — pre-multi-child shortlist data).
  let comparisonData
  let children: Awaited<ReturnType<typeof loadActiveChildren>> = []
  let activeChildId: string | null = null
  let familyPreferences: Record<string, string | null> | undefined

  if (user) {
    try {
      children = await loadActiveChildren(supabaseService(), user.id)
    } catch (e) {
      console.error('[research-room loadActiveChildren]', e)
    }

    // Read parent_profiles for active_child_id (persisted) AND for the
    // family-preferences card on the Brief tab. Stale active_child_id
    // (archived/deleted child) falls back to the first active child.
    const profileFields = ['active_child_id', ...ONBOARDING_FIELDS.map(f => f.field)]
    const { data: profile } = await supabaseService()
      .from('parent_profiles')
      .select(profileFields.join(', '))
      .eq('id', user.id)
      .maybeSingle<Record<string, string | null>>()

    const persisted = (profile?.active_child_id as string | null) ?? null
    const stillActive = persisted && children.some(c => c.id === persisted)
    activeChildId = stillActive ? persisted : (children[0]?.id ?? null)

    if (profile) {
      familyPreferences = {}
      for (const f of ONBOARDING_FIELDS) {
        const v = profile[f.field]
        familyPreferences[f.field] = (typeof v === 'string' && v) ? v : null
      }
    }

    try {
      comparisonData = await loadComparisonData(supabaseService(), user.id, activeChildId)
    } catch (e) {
      console.error('[research-room loadComparisonData]', e)
    }
  }

  const childSummaries = children.map(c => ({
    id: c.id,
    name: c.name,
    date_of_birth: c.date_of_birth,
    is_archived: c.is_archived,
  }))

  return (
    <ResearchRoom
      childOptions={childSummaries.map(c => ({ id: c.id, name: c.name }))}
      childSummaries={childSummaries}
      familyPreferences={familyPreferences}
      initialActiveChildId={activeChildId}
      comparisonData={comparisonData}
    />
  )
}
