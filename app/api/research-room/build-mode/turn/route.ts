// Slice 8 Build 3 session 2 — Build Mode turn route.
//
// Dedicated SSE endpoint for the Nana Build Mode interview, deliberately
// SEPARATE from /api/nana-research/route.ts. Why:
//   1. /api/nana-research imports nana-brain.js whose fallback can hit
//      the Anthropic SDK. CLAUDE.md hard-stop bans autonomous Anthropic
//      use; Codex r1 finding 12 + r4 #10 flagged this as a session-2
//      trap. A separate route guarantees no transitive Anthropic
//      import via static analysis.
//   2. The route's intent-router + lens-resolution logic doesn't apply
//      to the interview flow; cleaner to skip it than gate around it.
//
// This route does NOT persist the merged profile / progress yet. That
// lands in session 3 when the v5 migration applies. For now, the
// merged state ships in the `build_mode_progress` SSE event so the
// caller (useNanaChat) can hold it in memory.
//
// SSE event shape mirrors /api/nana-research so useNanaChat needs only
// an additive switch case for `build_mode_progress`. Existing event
// types (`session_ready`, `answer_format`, `token`, `final`, `error`)
// behave identically.

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { supabaseService } from '@/lib/supabase-admin'
import { runInterviewTurn, type BuildModeMessage } from '@/lib/server/research-room/build-mode-interview'
import {
  BuildModeProgressSchema,
  emptyProgress,
  type BuildModeExtractionHTTP,
  type BuildModeProgress,
} from '@/lib/server/research-room/build-mode-schemas'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const MAX_Q          = 2000
const HISTORY_LIMIT  = 12   // 6 Q/A pairs max — keeps prompt cache friendly

// Non-strict because useNanaChat sends extra fields (devilsAdvocate,
// deepMode, lensView, activeTab, shortlistSlugs, …) that the regular
// /api/nana-research route consumes. Build Mode ignores them.
const RequestSchema = z.object({
  question:  z.string().min(1).max(MAX_Q),
  sessionId: z.string().uuid(),
})

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

async function isAllowedOrigin(): Promise<boolean> {
  const h      = await headers()
  const origin = h.get('origin')
  if (!origin) return true
  const host   = h.get('host')
  if (!host)   return false
  try { return new URL(origin).host === host } catch { return false }
}

function jsonError(status: number, code: string) {
  return NextResponse.json({ ok: false, code }, { status })
}

// Pull only the writable fields out of the raw `children.child_profile`
// JSONB so the interview engine sees what's known about the child but
// nothing else (defence-in-depth — the JSONB may carry unrelated keys
// from earlier slices).
function extractWritableProfile(profile: Record<string, unknown>): Partial<BuildModeExtractionHTTP> {
  const out: Partial<BuildModeExtractionHTTP> = {}
  if (typeof profile.personality_notes === 'string') out.personality_notes = profile.personality_notes
  if (typeof profile.anchors_notes     === 'string') out.anchors_notes     = profile.anchors_notes
  if (typeof profile.academic_notes    === 'string') out.academic_notes    = profile.academic_notes
  if (typeof profile.goals_notes       === 'string') out.goals_notes       = profile.goals_notes
  if (typeof profile.child_wants       === 'string') out.child_wants       = profile.child_wants
  if (Array.isArray(profile.nonnegotiables)) {
    const arr = profile.nonnegotiables.filter((s): s is string => typeof s === 'string')
    if (arr.length > 0) out.nonnegotiables = arr
  }
  const go = profile.goal_orientation
  if (go === 'university_track' || go === 'discovery' || go === 'sport_career') {
    out.goal_orientation = go
  }
  if (Array.isArray(profile.interests_sports)) {
    const arr = profile.interests_sports.filter(
      (e: unknown): e is { sport: string; level: string } =>
        !!e && typeof e === 'object' &&
        typeof (e as Record<string, unknown>).sport === 'string' &&
        typeof (e as Record<string, unknown>).level === 'string',
    )
    if (arr.length > 0) out.interests_sports = arr
  }
  if (Array.isArray(profile.interests_arts)) {
    const arr = profile.interests_arts.filter(
      (e: unknown): e is { art: string; level: string } =>
        !!e && typeof e === 'object' &&
        typeof (e as Record<string, unknown>).art   === 'string' &&
        typeof (e as Record<string, unknown>).level === 'string',
    )
    if (arr.length > 0) out.interests_arts = arr
  }
  return out
}

export async function POST(req: NextRequest) {
  if (!isResearchRoomEnabled()) return jsonError(404, 'feature_disabled')
  if (!(await isAllowedOrigin())) return jsonError(403, 'forbidden_origin')

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError(401, 'unauthorized')

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) return jsonError(402, 'payment_required')

  let body: z.infer<typeof RequestSchema>
  try {
    body = RequestSchema.parse(await req.json())
  } catch {
    return jsonError(400, 'invalid_request')
  }

  const svc = supabaseService()

  // ── Load session (must belong to user, must be bound to a child) ───
  const { data: sess } = await svc
    .from('research_sessions')
    .select('id, user_id, child_id, build_mode_progress')
    .eq('id', body.sessionId)
    .maybeSingle<{ id: string; user_id: string; child_id: string; build_mode_progress: unknown }>()
  if (!sess)                       return jsonError(404, 'session_not_found')
  if (sess.user_id !== user.id)    return jsonError(403, 'forbidden')
  if (!sess.child_id)              return jsonError(409, 'session_missing_child')

  // ── Load child profile + brief ─────────────────────────────────────
  const [childRes, parentRes] = await Promise.all([
    svc.from('children')
      .select('user_id, name, child_profile')
      .eq('id', sess.child_id)
      .maybeSingle<{ user_id: string; name: string | null; child_profile: Record<string, unknown> | null }>(),
    svc.from('parent_profiles')
      .select('child_year, child_gender, boarding_pref, budget_range, top_priority, home_region')
      .eq('id', user.id)
      .maybeSingle<Record<string, unknown>>(),
  ])
  if (!childRes.data)                       return jsonError(404, 'child_not_found')
  if (childRes.data.user_id !== user.id)    return jsonError(403, 'forbidden')

  const childName    = childRes.data.name ?? 'your child'
  const priorProfile = extractWritableProfile(childRes.data.child_profile ?? {})
  const brief        = parentRes.data ?? {}

  // ── Parse progress with the new shape; fall back to empty on shape
  // mismatch (e.g. v4 numeric targets sitting in the column from a dev
  // session before the v5 migration applies). The interview just
  // starts the parent from a fresh progress state in that case.
  const parsedProgress = BuildModeProgressSchema.safeParse(sess.build_mode_progress)
  const progress: BuildModeProgress = parsedProgress.success
    ? parsedProgress.data
    : emptyProgress('minimal')

  // ── Reconstruct conversation history from research_session_messages ─
  // The interview engine treats each turn as user/assistant. parsed_answer
  // is JSONB. For build-mode turns we'll persist `{prose: <text>}` in
  // session 3; until then, non-build messages mostly carry the regular
  // chat parsed shape which we'd flatten poorly. So for session 2 we
  // intentionally pass only the freshest USER question — the LLM does not
  // see prior turns yet. Session 3 wires the real history once
  // build_mode persistence lands.
  const history: BuildModeMessage[] = [{ role: 'user', content: body.question }]

  // ── Abort plumbing — client disconnect cancels the LLM stream ──────
  const ac = new AbortController()
  if (req.signal) {
    if (req.signal.aborted) ac.abort()
    else req.signal.addEventListener('abort', () => ac.abort(), { once: true })
  }

  let turn
  try {
    turn = runInterviewTurn({
      childName,
      childBrief:    brief,
      priorProfile,
      priorProgress: progress,
      history,
      signal:        ac.signal,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Build Mode init failed'
    return jsonError(500, message)
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: unknown) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) }
        catch { /* stream already gone */ }
      }
      try {
        send({ type: 'session_ready',  sessionId: body.sessionId })
        send({ type: 'answer_format',  format:    'prose' })

        let proseAccum = ''
        for await (const chunk of turn.proseStream) {
          proseAccum += chunk
          send({ type: 'token', text: chunk })
        }

        const merge = await turn.mergeResult
        send({
          type:        'build_mode_progress',
          focus:       turn.focus,
          progress:    merge.nextProgress,
          nextProfile: merge.nextProfile,
          diff:        merge.diff,
        })

        send({
          type:       'final',
          shareToken: crypto.randomUUID(),
          payload: {
            parsed:     null,
            raw:        proseAccum,
            parseError: undefined,
          },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Build Mode turn failed'
        console.error('[build-mode/turn] stream error', err)
        send({ type: 'error', error: message })
      } finally {
        closed = true
        controller.close()
      }
    },
    cancel() {
      ac.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
