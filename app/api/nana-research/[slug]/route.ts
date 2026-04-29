/**
 * /api/nana-research/[slug]
 *
 * SSE endpoint for Research Mode — the full-screen, multi-turn Nana experience.
 * Wraps runOneQuestionStream from nana-brain.js and adds session persistence +
 * a summary_update event after each answer.
 *
 * Event types (superset of nana-parent-chatbot):
 *   session_ready — fired once up front with the sessionId (created or resumed)
 *   retrieval     — fired once after vector search completes
 *   token         — each chunk of Claude's stdout
 *   final         — complete parsed/validated answer + share_token
 *   summary_update — fired after DB write with the new decision brief
 *   error         — fatal failure
 *
 * Request body: { question, sessionId?, devilsAdvocate? }
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rateLimit'
// @ts-ignore — brain is plain JS
import {
  runOneQuestionStream,
  runMultiSchoolQuestionStream,
  detectComparisonSlugs,
  runSummaryUpdate,
} from '../../../../../scripts/lib/nana-brain.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i
const MAX_Q = 2000

function buildParentContext(profile: Record<string, string | boolean | null>): string | null {
  const parts: string[] = []
  if (profile.child_year)    parts.push(`child entering ${profile.child_year}`)
  if (profile.boarding_pref) parts.push(`prefers ${profile.boarding_pref} boarding`)
  if (profile.budget_range)  parts.push(`budget ${profile.budget_range}/yr`)
  if (profile.top_priority)  parts.push(`top priority: ${profile.top_priority}`)
  if (profile.home_region)   parts.push(`based in ${profile.home_region}`)
  return parts.length ? `Parent context: ${parts.join(', ')}.` : null
}

/** Resolve display name for a school slug */
async function resolveSchoolName(slug: string): Promise<string> {
  const { data } = await supabase
    .from('school_knowledge')
    .select('title')
    .eq('school_slug', slug)
    .eq('source_type', 'nanasays')
    .maybeSingle()
  return data?.title?.replace(' — NanaSays Profile Data', '') || slug
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // ── Auth ──
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) return jsonError(401, 'Login required.')

  // One query: subscription check + preferences together
  const { data: profile } = await supabase
    .from('parent_profiles')
    .select('subscription_status, child_year, boarding_pref, budget_range, top_priority, home_region')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.subscription_status !== 'active') return jsonError(402, 'Deep Research access required.')

  if (!checkRateLimit(req, 'chat')) return jsonError(429, 'Too many requests.')

  const slug = params.slug?.toLowerCase()
  if (!slug || !SLUG_RE.test(slug)) return jsonError(400, 'Invalid school slug')

  let body: any
  try { body = await req.json() } catch { return jsonError(400, 'Invalid JSON') }

  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) return jsonError(400, 'question is required')
  if (question.length > MAX_Q) return jsonError(400, `question must be ≤ ${MAX_Q} chars`)

  const incomingSessionId: string | null = typeof body?.sessionId === 'string' ? body.sessionId : null
  const devilsAdvocate = body?.devilsAdvocate === true

  const parentContext = profile ? buildParentContext(profile) : null

  const shareToken = crypto.randomUUID()

  // ── Session setup ──
  let sessionId: string
  let isNew = false

  if (incomingSessionId) {
    // Verify session belongs to this user + slug
    const { data: sess } = await supabase
      .from('research_sessions')
      .select('id')
      .eq('id', incomingSessionId)
      .eq('user_id', user.id)
      .eq('school_slug', slug)
      .maybeSingle()

    if (sess) {
      sessionId = sess.id
    } else {
      // Stale or wrong slug — create fresh
      isNew = true
      const title = question.slice(0, 80)
      const { data: newSess, error } = await supabase
        .from('research_sessions')
        .insert({ user_id: user.id, school_slug: slug, title })
        .select('id')
        .single()
      if (error || !newSess) return jsonError(500, 'Could not create session')
      sessionId = newSess.id
    }
  } else {
    isNew = true
    const title = question.slice(0, 80)
    const { data: newSess, error } = await supabase
      .from('research_sessions')
      .insert({ user_id: user.id, school_slug: slug, title })
      .select('id')
      .single()
    if (error || !newSess) return jsonError(500, 'Could not create session')
    sessionId = newSess.id
  }

  // Detect if question mentions multiple schools → multi-school comparison mode
  const comparisonSlugs: string[] | null = await detectComparisonSlugs(supabase, slug, question)

  const ac = new AbortController()
  if (req.signal) {
    if (req.signal.aborted) ac.abort()
    else req.signal.addEventListener('abort', () => ac.abort(), { once: true })
  }

  const streamOpts = { signal: ac.signal, devilsAdvocate, parentContext }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          ac.abort()
        }
      }

      // Immediately tell the client which session is active
      send({ type: 'session_ready', sessionId, isNew, isMultiSchool: !!comparisonSlugs })

      let finalPayload: any = null

      try {
        const generator = comparisonSlugs
          ? runMultiSchoolQuestionStream(supabase, comparisonSlugs, question, streamOpts)
          : runOneQuestionStream(supabase, slug, question, streamOpts)

        for await (const event of generator) {
          if (ac.signal.aborted) break

          if ((event as any)?.type === 'final') {
            finalPayload = (event as any).payload
            send({ ...event as object, shareToken })
          } else {
            send(event)
          }
        }
      } catch (e: any) {
        if (!ac.signal.aborted) {
          send({ type: 'error', error: e?.message ?? String(e), code: 'unexpected' })
        }
      }

      // ── Post-stream: save message + generate summary ──
      if (finalPayload && !ac.signal.aborted) {
        const parsed = finalPayload.parsed ?? null

        // Tell the client the summary is generating — keeps DecisionPanel alive
        send({ type: 'summary_generating', payload: { sessionId } })

        // Save message
        const { error: insertErr } = await supabase.from('research_session_messages').insert({
          session_id:    sessionId,
          question:      question.slice(0, 2000),
          parsed_answer: parsed ?? null,
          share_token:   shareToken,
        })
        if (insertErr) console.error('[research] message insert failed:', insertErr.message)

        // Update last_active_at
        const { error: touchErr } = await supabase
          .from('research_sessions')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', sessionId)
        if (touchErr) console.error('[research] session touch failed:', touchErr.message)

        // Fetch all session messages for summary synthesis
        const { data: allMessages } = await supabase
          .from('research_session_messages')
          .select('question, parsed_answer')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })

        if (allMessages && allMessages.length > 0) {
          const schoolName = await resolveSchoolName(slug)
          const messagesForSummary = allMessages.map(m => ({
            question:       m.question,
            short_answer:   (m.parsed_answer as any)?.sections?.short_answer ?? '',
            confirmed_facts: (m.parsed_answer as any)?.sections?.confirmed_facts ?? '',
          }))

          const summary = await runSummaryUpdate(schoolName, messagesForSummary)

          if (summary) {
            // Persist summary to session
            const { error: summaryErr } = await supabase
              .from('research_sessions')
              .update({ summary })
              .eq('id', sessionId)
            if (summaryErr) console.error('[research] summary persist failed:', summaryErr.message)

            if (!ac.signal.aborted) {
              send({ type: 'summary_update', payload: { sessionId, summary } })
            }
          }
        }
      }

      try { controller.close() } catch {}
    },
    cancel() { ac.abort() },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
