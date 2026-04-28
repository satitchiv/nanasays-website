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
 *   final     — fired once with the parsed/validated answer + meta
 *   error     — fatal failure (Claude crash, parse error, etc.)
 *
 * Browser clients use EventSource or fetch+ReadableStream to consume.
 *
 * Request body: { "question": "..." }
 * URL param: [slug] — school slug, e.g. "reeds-school-uk"
 *
 * Note: this route uses Node's `child_process.spawn` (via the brain) to
 * invoke the Claude CLI. Required runtime: nodejs (default for API routes).
 * Will not work on edge runtime or serverless without Claude CLI installed.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { isUnlocked } from '@/lib/paid-status'
// @ts-ignore — brain is plain JS, types not generated
import { runOneQuestionStream } from '../../../../../scripts/lib/nana-brain.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'  // never cache — every question is unique
export const maxDuration = 180          // 3-minute upper bound matching brain's Claude timeout

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i
const MAX_QUESTION_CHARS = 2000

async function logChat(
  sb: ReturnType<typeof createClient>,
  schoolSlug: string,
  question: string,
  payload: any,
) {
  const cost = payload.cost ?? null
  const usage = payload.usage ?? null
  const retrieval = payload.retrieval ?? null
  const parsed = payload.parsed ?? null

  await sb.from('nana_chat_logs').insert({
    school_slug:          schoolSlug,
    question:             question.slice(0, 2000),
    answer_preview:       (payload.raw ?? '').slice(0, 500),
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
  // Paid-status gate — mirror the report page's isPaid check. Without this
  // anyone with the URL could POST and burn API tokens for free, even though
  // the UI is gated. Uses the nanasays_unlocked cookie (set by /unlock or
  // the Stripe webhook in Phase 2). The ?unlocked=true page-level dev
  // override is intentionally NOT honored here — server-side calls don't
  // carry it, and accepting it on the API would let anyone bypass with a
  // single query string.
  if (!(await isUnlocked())) {
    return jsonError(402, 'This feature requires Deep Research access.')
  }

  // Rate limit — same family as the existing /api/chat (20/10min)
  if (!checkRateLimit(req, 'chat')) {
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
  if (!question) {
    return jsonError(400, 'question is required')
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return jsonError(400, `question must be ≤ ${MAX_QUESTION_CHARS} characters`)
  }

  // Build the SSE stream. Each event from the brain becomes one SSE message.
  // We thread an AbortController through the brain so a client disconnect
  // (browser closed, panel closed, fetch aborted) actually halts Claude
  // generation instead of silently burning tokens to completion.
  const ac = new AbortController()
  // The Next/Node request signal fires on client disconnect.
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
          // Controller closed — client disconnected. Trigger our abort so
          // the brain stops too.
          ac.abort()
        }
      }

      // Telemetry captured as events flow through — logged after stream ends.
      let finalPayload: any = null

      try {
        for await (const event of runOneQuestionStream(supabase, slug, question, { signal: ac.signal })) {
          if (ac.signal.aborted) break
          if ((event as any)?.type === 'final') finalPayload = (event as any).payload
          send(event)
        }
      } catch (e: any) {
        if (!ac.signal.aborted) {
          send({ type: 'error', error: e?.message ?? String(e), code: 'unexpected' })
        }
      } finally {
        try { controller.close() } catch {}
      }

      // Fire-and-forget DB log — never blocks the response stream.
      if (finalPayload && !ac.signal.aborted) {
        logChat(supabase, slug, question, finalPayload).catch(() => {})
      }
    },
    cancel() {
      // Browser closed the stream — abort the brain so we stop billing.
      ac.abort()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type':       'text/event-stream; charset=utf-8',
      'Cache-Control':      'no-cache, no-transform',
      'Connection':         'keep-alive',
      'X-Accel-Buffering':  'no', // disable proxy buffering (nginx, etc.)
    },
  })
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
