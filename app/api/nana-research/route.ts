/**
 * /api/nana-research
 *
 * SSE endpoint for Research Mode — school-agnostic, searches all 140 UK schools.
 *
 * Routing:
 *   0 schools mentioned in question → runGlobalQuestionStream (all-schools vector search)
 *   1 school mentioned              → runOneQuestionStream (single-school deep dive)
 *   2–4 schools mentioned           → runMultiSchoolQuestionStream (side-by-side comparison)
 *
 * Event types:
 *   session_ready    — fired once with sessionId
 *   retrieval        — fired after vector search with schools found
 *   token            — each streamed token from Claude
 *   final            — complete parsed answer + share_token
 *   summary_generating — brief pause marker while summary runs
 *   summary_update   — new decision brief after DB write
 *   error            — fatal failure
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rateLimit'
// @ts-ignore
import {
  runOneQuestionStream,
  runMultiSchoolQuestionStream,
  runGlobalQuestionStream,
  detectMentionedSlugs,
  runSummaryUpdate,
} from '../../../../scripts/lib/nana-brain.js'

export const runtime   = 'nodejs'
export const dynamic   = 'force-dynamic'
export const maxDuration = 240

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

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

export async function POST(req: NextRequest) {
  // ── Auth ──
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return jsonError(401, 'Login required.')

  const { data: profile } = await supabase
    .from('parent_profiles')
    .select('subscription_status, child_year, boarding_pref, budget_range, top_priority, home_region')
    .eq('id', user.id)
    .maybeSingle()

  const devUnlock = process.env.NEXT_PUBLIC_DEV_UNLOCK === 'true'
  if (!devUnlock && profile?.subscription_status !== 'active') return jsonError(402, 'Deep Research access required.')
  if (!checkRateLimit(req, 'chat')) return jsonError(429, 'Too many requests.')

  let body: any
  try { body = await req.json() } catch { return jsonError(400, 'Invalid JSON') }

  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) return jsonError(400, 'question is required')
  if (question.length > MAX_Q) return jsonError(400, `question must be ≤ ${MAX_Q} chars`)

  const incomingSessionId: string | null = typeof body?.sessionId === 'string' ? body.sessionId : null
  const devilsAdvocate = body?.devilsAdvocate === true
  const shareToken     = crypto.randomUUID()

  // F2: context sent by client
  const activeTab: string | null        = typeof body?.activeTab === 'string' ? body.activeTab : null
  const activeSchoolSlug: string | null = typeof body?.activeSchoolSlug === 'string' ? body.activeSchoolSlug : null
  const shortlistSlugs: string[]        = Array.isArray(body?.shortlistSlugs)
    ? body.shortlistSlugs.filter((s: unknown) => typeof s === 'string').slice(0, 10)
    : []

  // ── Session setup ──
  let sessionId: string
  if (incomingSessionId) {
    const { data: sess } = await supabase
      .from('research_sessions')
      .select('id')
      .eq('id', incomingSessionId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (sess) {
      sessionId = sess.id
    } else {
      const { data: newSess, error } = await supabase
        .from('research_sessions')
        .insert({ user_id: user.id, title: question.slice(0, 80) })
        .select('id').single()
      if (error || !newSess) return jsonError(500, 'Could not create session')
      sessionId = newSess.id
    }
  } else {
    const { data: newSess, error } = await supabase
      .from('research_sessions')
      .insert({ user_id: user.id, title: question.slice(0, 80) })
      .select('id').single()
    if (error || !newSess) return jsonError(500, 'Could not create session')
    sessionId = newSess.id
  }

  // F4: conversation memory — last 3 Q&A pairs (~300 tokens, in user message so cache stays warm)
  let historyContext: string | null = null
  {
    const { data: recentMsgs } = await supabase
      .from('research_session_messages')
      .select('question, parsed_answer')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(3)

    if (recentMsgs?.length) {
      const pairs = recentMsgs.reverse().map(m => {
        const a = (m.parsed_answer as any)?.sections?.short_answer ?? ''
        return `Q: ${(m.question as string).slice(0, 100)} / A: ${a.slice(0, 120)}${a.length > 120 ? '…' : ''}`
      }).join('\n')
      historyContext = `Recent conversation:\n${pairs}`
    }
  }

  const rawParentContext = profile ? buildParentContext(profile) : null
  const parentContext = [rawParentContext, historyContext].filter(Boolean).join('\n') || null

  // F3: context-aware routing
  // F3: compareKw uses word boundaries + broader intent terms
  const compareKw = /\b(compare|comparison|shortlist|my schools|my options|vs|versus|between|which (one|school|of these))\b/i
  // globalKw: never seed single-school for "which/best" discovery questions
  const globalKw = /\b(which|best|recommend|suggest|find|options|schools|better)\b/i

  // ── Route to correct brain function ──
  let mentionedSlugs: string[] = await detectMentionedSlugs(supabase, question)

  // "Compare my shortlist" with no explicit school names → use shortlist directly
  if (compareKw.test(question) && shortlistSlugs.length >= 2 && mentionedSlugs.length === 0) {
    mentionedSlugs = shortlistSlugs
  }

  // "Any red flags?" on Verdict tab with no school named → answer about active school
  // Only for clearly local questions — exclude global/comparison intents
  if (
    activeTab === 'verdict' &&
    activeSchoolSlug &&
    mentionedSlugs.length === 0 &&
    !compareKw.test(question) &&
    !globalKw.test(question)
  ) {
    mentionedSlugs = [activeSchoolSlug]
  }

  const mode = mentionedSlugs.length === 0 ? 'global'
    : mentionedSlugs.length === 1          ? 'single'
    : 'multi'

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
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) }
        catch { ac.abort() }
      }

      send({ type: 'session_ready', sessionId, isNew: !incomingSessionId, mode })

      let finalPayload: any = null

      try {
        const generator =
          mode === 'global' ? runGlobalQuestionStream(supabase, question, streamOpts)
          : mode === 'single' ? runOneQuestionStream(supabase, mentionedSlugs[0], question, streamOpts)
          : runMultiSchoolQuestionStream(supabase, mentionedSlugs, question, streamOpts)

        for await (const event of generator) {
          if (ac.signal.aborted) break
          if ((event as any)?.type === 'final') {
            finalPayload = (event as any).payload
            const uiIntent = computeUiIntent(mode, mentionedSlugs, finalPayload?.parsed)
            send({ ...event as object, shareToken, uiIntent })
          } else {
            send(event)
          }
        }
      } catch (e: any) {
        if (!ac.signal.aborted) send({ type: 'error', error: e?.message ?? String(e), code: 'unexpected' })
      }

      // ── Post-stream: save message + generate summary ──
      if (finalPayload && !ac.signal.aborted) {
        const parsed = finalPayload.parsed ?? null

        send({ type: 'summary_generating', payload: { sessionId } })

        await supabase.from('research_session_messages').insert({
          session_id:    sessionId,
          question:      question.slice(0, 2000),
          parsed_answer: parsed ?? null,
          share_token:   shareToken,
        })

        // Log to Mission Control dashboard
        // finalPayload has backend/usage/cost/model directly — there is no .telemetry wrapper
        const usage    = finalPayload?.usage  ?? null
        const costData = finalPayload?.cost   ?? null
        supabase.from('nana_chat_logs').insert({
          school_slug:          mode === 'single' ? mentionedSlugs[0] : null,
          question:             question.slice(0, 2000),
          answer_preview:       (finalPayload?.raw ?? '').slice(0, 500),
          tokens_in:            usage?.input_tokens                 ?? null,
          tokens_cache_write:   usage?.cache_creation_input_tokens  ?? null,
          tokens_cache_read:    usage?.cache_read_input_tokens      ?? null,
          tokens_out:           usage?.output_tokens                ?? null,
          cost_input_usd:       costData?.cost_input                ?? null,
          cost_cache_write_usd: costData?.cost_cache_create         ?? null,
          cost_cache_read_usd:  costData?.cost_cache_read           ?? null,
          cost_output_usd:      costData?.cost_output               ?? null,
          cost_total_usd:       costData?.total_usd                 ?? null,
          cache_hit_pct:        costData?.cache_hit_pct             ?? null,
          chunk_count:          finalPayload?.retrieval?.chunks?.length ?? null,
          sensitive_count:      finalPayload?.retrieval?.sensitive?.length ?? null,
          backend:              finalPayload?.backend               ?? 'unknown',
          model:                finalPayload?.model                 ?? null,
          confidence:           parsed?.confidence                  ?? null,
          claude_ms:            finalPayload?.claudeMs              ?? null,
          total_ms:             finalPayload?.totalMs               ?? null,
        }).then(({ error }) => {
          if (error) console.error('[research] chat_log insert failed:', error.message)
        })

        supabase.from('research_sessions')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', sessionId)
          .then(({ error }) => { if (error) console.error('[research] session touch failed:', error.message) })

        // Generate decision brief summary
        const { data: allMessages } = await supabase
          .from('research_session_messages')
          .select('question, parsed_answer')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })

        if (allMessages && allMessages.length > 0) {
          const messagesForSummary = allMessages.map(m => ({
            question:        m.question,
            short_answer:    (m.parsed_answer as any)?.sections?.short_answer ?? '',
            confirmed_facts: (m.parsed_answer as any)?.sections?.confirmed_facts ?? '',
          }))

          const summary = await runSummaryUpdate('UK Independent Schools', messagesForSummary)

          if (summary) {
            await supabase.from('research_sessions').update({ summary }).eq('id', sessionId)
            if (!ac.signal.aborted) send({ type: 'summary_update', payload: { sessionId, summary } })
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

function computeUiIntent(mode: string, slugs: string[], parsed: any): Record<string, unknown> {
  if (mode === 'single') return { action: 'show_verdict', schoolSlug: slugs[0] }
  if (mode === 'multi')  return { action: 'show_compare', schoolSlugs: slugs }
  const recs = parsed?.recommended_schools
  if (Array.isArray(recs) && recs.length > 0) return { action: 'show_candidates', candidates: recs }
  return { action: 'none' }
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
