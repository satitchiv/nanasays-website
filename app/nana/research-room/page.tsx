import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
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

  // Children + active child come online in slice 3. Pass an empty list for
  // now — ChildSelector hides itself when count <= 1.
  return <ResearchRoom childOptions={[]} initialActiveChildId={null} />
}
