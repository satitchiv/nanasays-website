import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NanaFullScreen } from '@/components/nana/NanaFullScreen'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return { title: `Research: ${name} — Nanasays` }
}

export default async function ResearchPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // Auth check
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect(`/login?next=/nana/research/${slug}`)

  // Subscription check
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'complete')
    .limit(1)
    .maybeSingle()

  if (!purchase) redirect(`/unlock?next=/nana/research/${slug}`)

  // Resolve school name
  const { data: profileRow } = await supabase
    .from('school_knowledge')
    .select('title')
    .eq('school_slug', slug)
    .eq('source_type', 'nanasays')
    .maybeSingle()

  const schoolName = profileRow?.title?.replace(' — NanaSays Profile Data', '')
    || slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

  // Load most recent session for this school (if any)
  const { data: sessions } = await supabase
    .from('research_sessions')
    .select('id, title, summary, created_at, last_active_at')
    .eq('user_id', user.id)
    .eq('school_slug', slug)
    .order('last_active_at', { ascending: false })
    .limit(5)

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
      slug={slug}
      schoolName={schoolName}
      initialSession={latestSession ?? null}
      initialMessages={initialMessages}
      allSessions={sessions ?? []}
    />
  )
}
