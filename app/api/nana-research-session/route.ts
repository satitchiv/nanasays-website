/**
 * /api/nana-research-session
 *
 * GET  ?slug=<slug>             — list all sessions for this user + school
 * GET  ?sessionId=<uuid>        — full session with its messages
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  if (!checkRateLimit(req, 'nana-session')) {
    return json({ ok: false, error: 'Too many requests. Please slow down.' }, 429)
  }

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return json({ ok: false, error: 'Login required.' }, 401)

  const { searchParams } = new URL(req.url)
  const slug      = searchParams.get('slug')
  const sessionId = searchParams.get('sessionId')

  if (sessionId) {
    // Return full session + messages
    const { data: session, error } = await supabase
      .from('research_sessions')
      .select('id, school_slug, title, summary, created_at, last_active_at')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error || !session) return json({ ok: false, error: 'Session not found.' }, 404)

    const { data: messages } = await supabase
      .from('research_session_messages')
      .select('id, question, parsed_answer, share_token, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    return json({ ok: true, session, messages: messages ?? [] })
  }

  if (slug) {
    // List sessions for this school, most recent first
    const { data: sessions, error } = await supabase
      .from('research_sessions')
      .select('id, title, summary, created_at, last_active_at')
      .eq('user_id', user.id)
      .eq('school_slug', slug)
      .order('last_active_at', { ascending: false })
      .limit(10)

    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, sessions: sessions ?? [] })
  }

  return json({ ok: false, error: 'slug or sessionId required.' }, 400)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
