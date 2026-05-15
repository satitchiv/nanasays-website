/**
 * /api/nana-parent-chatbot/[slug]
 *
 * Streaming SSE endpoint for the parent-facing chatbot inside the deep school
 * report. Wraps `runOneQuestionStream` from scripts/lib/nana-brain.js — the
 * same brain the CLI / gold tests use, so behavior stays identical between
 * local debug and production.
 *
 * Protocol: Server-Sent Events. Each event is one JSON-encoded line of
 *   data: {"type":"...","payload":...}
 *
 * Event types:
 *   retrieval — fired once after vector search completes (~1-2s)
 *   token     — fired for each chunk of Claude's stdout as it streams
 *   final     — fired once with the parsed/validated answer + meta + share_token
 *   error     — fatal failure (Claude crash, parse error, etc.)
 *
 * Browser clients use EventSource or fetch+ReadableStream to consume.
 *
 * Request body: { "question": "...", "devilsAdvocate"?: boolean }
 * URL param: [slug] — school slug, e.g. "reeds-school-uk"
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimit } from '@/lib/rateLimit'
import { isPaidModeOn } from '@/lib/paid-mode'
// @ts-ignore — brain is plain JS, types not generated
import { runOneQuestionStream } from '@/lib/server/nana-brain.js'
// @ts-ignore — clarifier-check is plain JS
import { needsClarification, buildClarifierFinalPayload } from '@/lib/server/clarifier-check.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

// Service-role client for DB writes (logs, subscription checks, profile reads)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i
const MAX_QUESTION_CHARS = 2000

/** Build a short plain-English context string from the parent profile. */
function buildParentContext(profile: Record<string, string | boolean | null>): string | null {
  const parts: string[] = []
  if (profile.child_year)    parts.push(`child entering ${profile.child_year}`)
  if (profile.boarding_pref) parts.push(`prefers ${profile.boarding_pref} boarding`)
  if (profile.budget_range)  parts.push(`budget ${profile.budget_range}/yr`)
  if (profile.top_priority)  parts.push(`top priority: ${profile.top_priority}`)
  if (profile.home_region)   parts.push(`based in ${profile.home_region}`)
  return parts.length ? `Parent context: ${parts.join(', ')}.` : null
}

async function logChat(
  schoolSlug: string,
  question: string,
  payload: any,
  shareToken: string,
  userId: string | null,
) {
  const cost = payload.cost ?? null
  const usage = payload.usage ?? null
  const retrieval = payload.retrieval ?? null
  const parsed = payload.parsed ?? null

  await supabase.from('nana_chat_logs').insert({
    school_slug:          schoolSlug,
    question:             question.slice(0, 2000),
    answer_preview:       (payload.raw ?? '').slice(0, 500),
    parsed_answer:        parsed ?? null,
    share_token:          shareToken,
    user_id:              userId ?? null,
    tokens_in:            usage?.input_tokens               ?? null,
    tokens_cache_write:   usage?.cache_creation_input_tokens ?? null,
    tokens_cache_read:    usage?.cache_read_input_tokens    ?? null,
    tokens_out:           usage?.output_tokens              ?? null,
    cost_input_usd:       cost?.cost_input                  ?? null,
    cost_cache_write_usd: cost?.cost_cache_create           ?? null,
    cost_cache_read_usd:  cost?.cost_cache_read             ?? null,
    cost_output_usd:      cost?.cost_output                 ?? null,
    cost_total_usd:       cost?.total_usd                   ?? null,
    cache_hit_pct:        cost?.cache_hit_pct               ?? null,
    chunk_count:          retrieval?.chunks?.length          ?? null,
    sensitive_count:      retrieval?.sensitive?.length       ?? null,
    backend:              payload.backend                   ?? null,
    model:                payload.model                     ?? null,
    confidence:           parsed?.confidence                ?? null,
    claude_ms:            payload.claudeMs                  ?? null,
    total_ms:             payload.totalMs                   ?? null,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  if (!isPaidModeOn()) {
    return NextResponse.json({ error: 'Chat is not available.' }, { status: 410 })
  }

  // Resolve user_id. In dev-only smoke-harness mode the bypass header replaces
  // the cookie auth step; in every other case we validate the Supabase session.
  // All three guards below must hold for the bypass to activate:
  //   1) NODE_ENV === 'development'
  //   2) NANA_DEV_BYPASS_TOKEN env var is set (non-empty)
  //   3) request 'x-nana-dev-token' header matches the env token exactly
  // In production (NODE_ENV !== 'development') or with the env vars unset, this
  // branch is unreachable — the cookie-auth path runs exactly as before.
  let userId: string | null = null
  let isDevBypass = false

  const devBypassToken = process.env.NANA_DEV_BYPASS_TOKEN
  const devBypassUserId = process.env.NANA_DEV_BYPASS_USER_ID
  if (
    process.env.NODE_ENV === 'development' &&
    devBypassToken &&
    devBypassUserId &&
    req.headers.get('x-nana-dev-token') === devBypassToken
  ) {
    userId = devBypassUserId
    isDevBypass = true
  } else {
    const cookieStore = await cookies()
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )
    const { data: { user } } = await authClient.auth.getUser()
    userId = user?.id ?? null
  }

  if (!userId) {
    return jsonError(401, 'Login required.')
  }

  // Subscription gate — check parent_profiles.subscription_status
  const { data: subCheck } = await supabase
    .from('parent_profiles')
    .select('subscription_status')
    .eq('id', userId)
    .maybeSingle()

  if (subCheck?.subscription_status !== 'active') {
    return jsonError(402, 'This feature requires Deep Research access.')
  }

  // Rate limit — skipped for dev-harness bypass calls so batch smoke runs
  // aren't capped at 20/10min by the chat:unknown key (Codex finding #3).
  if (!isDevBypass && !checkRateLimit(req, 'chat')) {
    return jsonError(429, 'Too many requests. Please slow down.')
  }

  const slug = params.slug?.toLowerCase()
  if (!slug || !SLUG_RE.test(slug)) {
    return jsonError(400, 'Invalid school slug')
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body')
  }

  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) return jsonError(400, 'question is required')
  if (question.length > MAX_QUESTION_CHARS) {
    return jsonError(400, `question must be ≤ ${MAX_QUESTION_CHARS} characters`)
  }

  // ── P0.2: junk-input clarifier (short-circuit BEFORE retrieval) ──
  // Same module + behaviour as /api/nana-research. NanaPanel bypasses the
  // intent router entirely and calls runOneQuestionStream directly —
  // without this guard, a parent typing "asdfghjkl" still gets a
  // confidently-fabricated school-fit answer. Both stages fail OPEN.
  // Skipped for the dev-bypass header path so the parent-battery harness
  // can submit deliberate edge-case prompts.
  if (!isDevBypass) {
    const clarifier = await needsClarification(question, {
      hasUsableHistory: false, // NanaPanel is single-turn per page-load
      signal: req.signal || null,
    })
    if (clarifier.needsClarification) {
      const payload = buildClarifierFinalPayload(clarifier.message)
      const encoder = new TextEncoder()
      const stream  = new ReadableStream({
        start(controller) {
          const send = (event: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          }
          // shareToken intentionally omitted (matches client `string | undefined` type)
          send({
            type: 'final',
            payload,
            clarifier: { reason: clarifier.reason, stage: clarifier.stage },
          })
          controller.close()
        },
      })
      console.log('[nana-parent-chatbot/%s] clarifier-short-circuit reason=%s stage=%s "%s"',
        slug, clarifier.reason, clarifier.stage, question.slice(0, 50))
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
  }

  const devilsAdvocate = body?.devilsAdvocate === true

  // Fetch parent profile for personalisation context
  const { data: profile } = await supabase
    .from('parent_profiles')
    .select('child_year, boarding_pref, budget_range, top_priority, home_region')
    .eq('id', userId)
    .maybeSingle()

  const parentContext = profile ? buildParentContext(profile) : null

  // Generate share_token before stream starts so it can be included in the
  // final SSE event — client shows share button without a second round-trip.
  const shareToken = crypto.randomUUID()

  const ac = new AbortController()
  if (req.signal) {
    if (req.signal.aborted) ac.abort()
    else req.signal.addEventListener('abort', () => ac.abort(), { once: true })
  }

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

      let finalPayload: any = null

      try {
        for await (const event of runOneQuestionStream(supabase, slug, question, {
          signal: ac.signal,
          devilsAdvocate,
          parentContext,
          // P1 eval integrity (Codex 2026-05-15): when the dev-bypass header
          // is honoured, force decoding temperature to 0 so the grader's
          // baseline is reproducible. Real users never trigger this branch
          // (NODE_ENV !== 'development' OR missing env vars OR no header),
          // so production sampling is unchanged.
          ...(isDevBypass ? { temperature: 0 } : {}),
        })) {
          if (ac.signal.aborted) break

          // Intercept the final event to inject share_token before forwarding
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
      } finally {
        try { controller.close() } catch {}
      }

      // Fire-and-forget DB log — never blocks the response stream. Skipped
      // for dev-harness bypass calls so smoke-test rows don't pollute the
      // user's real nana_chat_logs history (Codex finding #4).
      if (finalPayload && !ac.signal.aborted && !isDevBypass) {
        logChat(slug, question, finalPayload, shareToken, userId).catch(() => {})
      }
    },
    cancel() {
      ac.abort()
    },
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
