/**
 * /api/nana-research
 *
 * SSE endpoint for Research Mode — school-agnostic, searches all 140 UK schools.
 *
 * Routing:
 *   0 schools mentioned in question → runAgenticQuestionStream (Claude picks tools)
 *   1 school mentioned              → runOneQuestionStream (single-school deep dive)
 *   2–4 schools mentioned           → runMultiSchoolQuestionStream (side-by-side comparison)
 *
 * Event types:
 *   session_ready    — fired once with sessionId
 *   retrieval        — fired after vector search with schools found
 *   agent_status     — agentic mode: progress copy ("Writing the answer…")
 *   tool_call        — agentic mode: progress event for each tool invocation
 *   token            — each streamed token from Claude (single/multi/agentic final-answer turns)
 *   stream_reset     — agentic mode: clear partial token buffer before retry
 *   final            — complete parsed answer + share_token
 *   summary_generating — brief pause marker while summary runs
 *   summary_update   — new decision brief after DB write
 *   error            — fatal failure
 */

import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rateLimit'
import { isPaidModeOn } from '@/lib/paid-mode'
// @ts-ignore
import {
  runOneQuestionStream,
  runMultiSchoolQuestionStream,
  runAgenticQuestionStream,
  runIntentProseStream,
  detectMentionedSlugs,
  runSummaryUpdate,
} from '@/lib/server/nana-brain.js'
// @ts-ignore
import { routeIntent } from '@/lib/server/intent-router.js'
// @ts-ignore
import { expandFamousShortNames } from '@/lib/server/famous-names.js'

export const runtime   = 'nodejs'
export const dynamic   = 'force-dynamic'
export const maxDuration = 240

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const MAX_Q = 2000

// Pulls a short text preview from either schema:
//   structured_v1: parsed.sections.short_answer
//   prose_v1:      parsed.prose (first paragraph or first ~200 chars)
// Used for conversation memory + decision-brief summary; without this both
// would be empty for prose answers and Nana would lose context across turns.
function answerPreview(parsed: any, max = 200): string {
  if (!parsed) return ''
  if (parsed.format === 'prose_v1' && typeof parsed.prose === 'string') {
    const firstChunk = parsed.prose.split(/\n\n/)[0] ?? parsed.prose
    return firstChunk.slice(0, max)
  }
  return parsed.sections?.short_answer ?? ''
}

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
  if (!isPaidModeOn()) {
    return NextResponse.json({ error: 'Research mode is not available.' }, { status: 410 })
  }

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
  const deepMode       = body?.deepMode === true
  const shareToken     = crypto.randomUUID()

  // F2: context sent by client
  const activeTab: string | null        = typeof body?.activeTab === 'string' ? body.activeTab : null
  const activeSchoolSlug: string | null = typeof body?.activeSchoolSlug === 'string' ? body.activeSchoolSlug : null
  const shortlistSlugs: string[]        = Array.isArray(body?.shortlistSlugs)
    ? body.shortlistSlugs.filter((s: unknown) => typeof s === 'string').slice(0, 10)
    : []

  // Deep mode = agentic loop scoped to the parent's shortlist. Capped at 4.
  // Decision is made BEFORE the mode-based routing so a vague-sounding question
  // ("which has better pastoral care?") doesn't leak into global mode just
  // because it has no school names. Codex P1.
  const lockedShortlistSlugs = shortlistSlugs.slice(0, 4)
  const useShortlistAgentic  = deepMode && lockedShortlistSlugs.length >= 2

  // ── Session setup ──
  // Slice 3e: research_sessions.child_id is now NOT NULL. New rows must
  // be scoped to the user's currently-active child.
  //
  // Codex 3e P2 #2 fix: mirror the Research Room page's fallback —
  // validate persisted active_child_id against the user's active children;
  // if it's null/stale, fall back to the first active child. The page
  // does this server-side at /nana/research-room/page.tsx; the API now
  // matches so users with active children but null/stale active_child_id
  // don't render the page successfully but 400 on submit.
  const [profileRes, childrenRes] = await Promise.all([
    supabase
      .from('parent_profiles')
      .select('active_child_id')
      .eq('id', user.id)
      .maybeSingle<{ active_child_id: string | null }>(),
    supabase
      .from('children')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: true }),
  ])
  const persistedActiveChildId = profileRes.data?.active_child_id ?? null
  const activeChildIds = (childrenRes.data ?? []).map((c: { id: string }) => c.id)
  const stillActive = persistedActiveChildId && activeChildIds.includes(persistedActiveChildId)
  const activeChildId: string | null =
    stillActive ? persistedActiveChildId : (activeChildIds[0] ?? null)

  let sessionId: string
  if (incomingSessionId) {
    // Codex 3e P2 #1 fix: validate the incoming session's child_id matches
    // the resolved active child. Otherwise a client could submit a session
    // from child A while the user's active child is B and we'd leak
    // messages across children. If mismatch, fall through to the
    // create-new path (treat as "user wanted a fresh conversation for
    // this child").
    const { data: sess } = await supabase
      .from('research_sessions')
      .select('id, child_id')
      .eq('id', incomingSessionId)
      .eq('user_id', user.id)
      .maybeSingle<{ id: string; child_id: string | null }>()

    if (sess && sess.child_id === activeChildId) {
      sessionId = sess.id
    } else {
      if (!activeChildId) {
        return jsonError(400, 'Add or select a child before starting a research session.')
      }
      const { data: newSess, error } = await supabase
        .from('research_sessions')
        .insert({ user_id: user.id, title: question.slice(0, 80), child_id: activeChildId })
        .select('id').single()
      if (error || !newSess) return jsonError(500, 'Could not create session')
      sessionId = newSess.id
    }
  } else {
    if (!activeChildId) {
      return jsonError(400, 'Add or select a child before starting a research session.')
    }
    const { data: newSess, error } = await supabase
      .from('research_sessions')
      .insert({ user_id: user.id, title: question.slice(0, 80), child_id: activeChildId })
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
        const a = answerPreview(m.parsed_answer, 120)
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

  // detectMentionedSlugs requires 2+ distinctive words ≥5 chars (avoids
  // false positives like "worth"/"reading"). For unambiguous famous
  // one-word names we accept the bare form via expandFamousShortNames,
  // which always merges with the existing list (not just on empty) so
  // questions like "Compare Wycombe Abbey and Eton" surface both schools.
  // See scripts/lib/famous-names.js + scripts/eval/eval-slug-detection.js.
  mentionedSlugs = expandFamousShortNames(question, mentionedSlugs)

  // ── Intent router (Phase B) ────────────────────────────────────────────
  // Codex P2 #4: call routeIntent with RAW mentionedSlugs, BEFORE the
  // shortlist-expansion mutation below.
  //
  // Codex P2 #5: gate `activeSchoolSlug` with the same conditions the legacy
  // verdict-tab fallback uses (`activeTab === 'verdict'` AND no mentions AND
  // not a global / compare query). Without this gate, "Which schools offer
  // IB?" while sitting on Eton's verdict tab would route to a fact_lookup
  // for Eton instead of falling through to global discovery.
  const routerActiveSchoolSlug =
    activeTab === 'verdict' &&
    activeSchoolSlug &&
    mentionedSlugs.length === 0 &&
    !compareKw.test(question) &&
    !globalKw.test(question)
      ? activeSchoolSlug
      : null

  // Gate: NEXT_PUBLIC_NANA_PROSE_MODE === 'on' (default OFF — flip per
  // deployment to enable prose answers). Skip intent router entirely when
  // user explicitly enabled deep mode (agentic loop is the contract there).
  const proseFlag = process.env.NEXT_PUBLIC_NANA_PROSE_MODE === 'on'
  const intentMatch = (proseFlag && !useShortlistAgentic)
    ? routeIntent(question, {
        mentionedSlugs:   [...mentionedSlugs],
        activeSchoolSlug: routerActiveSchoolSlug,
        shortlistSlugs:   shortlistSlugs,
      })
    : null
  // Telemetry: which path did we take?
  console.log('[nana-research] %s%s "%s"',
    intentMatch ? `prose:${(intentMatch as any).intent}` : (useShortlistAgentic ? 'shortlist_deep' : `legacy:${mentionedSlugs.length === 0 ? 'global' : mentionedSlugs.length === 1 ? 'single' : 'multi'}`),
    mentionedSlugs.length ? ` slugs=${JSON.stringify(mentionedSlugs)}` : '',
    question.slice(0, 50))

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

  // verbosity='chat' tells the agentic brain to emit the trimmed schema (4
  // sections, optional ones may be omitted) instead of the full report schema.
  // Saves 500-1500 output tokens per answer = the biggest perceived-speed win.
  //
  // shortlistSlugs is forwarded so prose-runner can use it as the proposed_actions
  // slug allowlist (slice 5-FU1). prose-runner sanitizes against ^[a-z0-9-]{1,80}$
  // before the slugs reach the prompt, so the route's typeof-string filter is
  // sufficient defence-in-depth at this layer.
  const streamOpts = { signal: ac.signal, devilsAdvocate, parentContext, verbosity: 'chat' as const, shortlistSlugs }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) }
        catch { ac.abort() }
      }

      send({
        type: 'session_ready',
        sessionId,
        isNew:           !incomingSessionId,
        mode:            useShortlistAgentic ? 'shortlist_deep' : (intentMatch ? `prose:${(intentMatch as any).intent}` : mode),
        agenticLocked:   useShortlistAgentic,
        restrictToSlugs: useShortlistAgentic ? lockedShortlistSlugs : null,
      })

      let finalPayload: any = null

      try {
        // Dispatch precedence:
        //   1. shortlist deep mode (explicit user toggle) → agentic loop
        //   2. intent router match (flag-gated) → prose runner
        //   3. mode-based fallback → existing single / multi / agentic paths
        const generator = useShortlistAgentic
          ? runAgenticQuestionStream(supabase, question, {
              ...streamOpts,
              restrictToSlugs: lockedShortlistSlugs,
            })
          : intentMatch
          ? runIntentProseStream(supabase, question, intentMatch, streamOpts)
          : mode === 'global' ? runAgenticQuestionStream(supabase, question, streamOpts)
          : mode === 'single' ? runOneQuestionStream(supabase, mentionedSlugs[0], question, streamOpts)
          : runMultiSchoolQuestionStream(supabase, mentionedSlugs, question, streamOpts)

        for await (const event of generator) {
          if (ac.signal.aborted) break
          if ((event as any)?.type === 'final') {
            // Slice-5 round-4 fix (Codex F2): defer the 'final' event
            // send until after the message is persisted so we can include
            // the real DB id. Without this the client appended a fake
            // crypto.randomUUID() id, and any subsequent + Add as row
            // click would post that id to confirm_add_row → "message not
            // found" because no row matches.
            finalPayload = (event as any).payload
          } else {
            send(event)
          }
        }
      } catch (e: any) {
        if (!ac.signal.aborted) send({ type: 'error', error: e?.message ?? String(e), code: 'unexpected' })
      }

      // ── Post-stream: save message + emit final + generate summary ──
      if (finalPayload && !ac.signal.aborted) {
        const parsed = finalPayload.parsed ?? null

        const { data: insertedRow, error: insertError } = await supabase
          .from('research_session_messages')
          .insert({
            session_id:    sessionId,
            question:      question.slice(0, 2000),
            parsed_answer: parsed ?? null,
            share_token:   shareToken,
          })
          .select('id')
          .single()
        if (insertError) console.error('[research] message insert failed:', insertError.message)
        const insertedMessageId: string | null = insertedRow?.id ?? null

        // NOW emit the final event with the persisted message id. The
        // client uses this id when calling confirm_add_row.
        const uiIntent = computeUiIntent(mode, mentionedSlugs, parsed)
        send({ type: 'final', payload: finalPayload, shareToken, uiIntent, messageId: insertedMessageId })

        send({ type: 'summary_generating', payload: { sessionId } })

        // Log to Mission Control dashboard
        // finalPayload has backend/usage/cost/model directly — there is no .telemetry wrapper
        const usage    = finalPayload?.usage  ?? null
        const costData = finalPayload?.cost   ?? null
        // Codex P2/P3 #7: prose answers targeting one school should populate
        // school_slug from parsed.schoolsMentioned so dashboard school filters
        // pick them up. Falls through to legacy mode='single' otherwise.
        const proseSlugs: string[] =
          parsed?.format === 'prose_v1' && Array.isArray(parsed.schoolsMentioned)
            ? parsed.schoolsMentioned.filter((s: unknown): s is string => typeof s === 'string')
            : []
        supabase.from('nana_chat_logs').insert({
          school_slug:          proseSlugs.length === 1
                                  ? proseSlugs[0]
                                  : (mode === 'single' ? mentionedSlugs[0] : null),
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
            short_answer:    answerPreview(m.parsed_answer, 200),
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
  // Phase B — prose answers carry the deterministic uiIntentHint set by the
  // intent router; honour it directly (more reliable than guessing from
  // parsed.recommended_schools, which prose schemas don't have).
  if (parsed?.format === 'prose_v1') {
    const hint = parsed.uiIntentHint
    const mentioned: string[] = Array.isArray(parsed.schoolsMentioned) ? parsed.schoolsMentioned : []
    if (hint === 'verdict' && mentioned[0]) return { action: 'show_verdict', schoolSlug: mentioned[0] }
    if (hint === 'compare' && mentioned.length > 1) return { action: 'show_compare', schoolSlugs: mentioned.slice(0, 4) }
    if (hint === 'compare' && mentioned.length > 0) return { action: 'show_candidates', candidates: mentioned.map(slug => ({ slug })) }
    return { action: 'none' }
  }
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
