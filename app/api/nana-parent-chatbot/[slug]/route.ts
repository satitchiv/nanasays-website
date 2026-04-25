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

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  // Rate limit — same family as the existing /api/chat (20/10min)
  if (!checkRateLimit(req, 'chat')) {
    return jsonError(429, 'Too many requests. Please slow down.')
  }

  const { slug } = params
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
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Controller closed — client disconnected. Brain generator will
          // continue running in the background until Claude exits, but we
          // can't push more events.
        }
      }

      try {
        for await (const event of runOneQuestionStream(supabase, slug, question, {})) {
          send(event)
        }
      } catch (e: any) {
        send({ type: 'error', error: e?.message ?? String(e), code: 'unexpected' })
      } finally {
        try { controller.close() } catch {}
      }
    },
    cancel() {
      // Browser closed the stream — nothing we can do mid-Claude-call;
      // the spawn child process keeps running until Claude finishes.
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
