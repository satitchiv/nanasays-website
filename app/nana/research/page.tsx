import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NanaFullScreen } from '@/components/nana/NanaFullScreen'
import { getUnlockedUser } from '@/lib/paid-status'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Research UK Schools — Nanasays',
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export default async function ResearchPage() {
  const { isPaid } = await getUnlockedUser()
  if (!isPaid) redirect('/unlock?next=/nana/research')

  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()

  // Load most recent sessions (not school-specific)
  const { data: sessions } = user ? await supabase
    .from('research_sessions')
    .select('id, title, summary, created_at, last_active_at')
    .eq('user_id', user.id)
    .order('last_active_at', { ascending: false })
    .limit(5) : { data: [] }

  let initialMessages: any[] = []
  const latestSession = sessions?.[0] ?? null

  if (latestSession) {
    const { data: msgs } = await supabase
      .from('research_session_messages')
      .select('id, question, parsed_answer, share_token, created_at')
      .eq('session_id', latestSession.id)
      .order('created_at', { ascending: true })
    initialMessages = msgs ?? []
  }

  return (
    <NanaFullScreen
      initialSession={latestSession ?? null}
      initialMessages={initialMessages}
      allSessions={sessions ?? []}
    />
  )
}
