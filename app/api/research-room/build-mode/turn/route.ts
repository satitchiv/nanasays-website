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
import { checkRateLimit } from '@/lib/rateLimit'
import { supabaseService } from '@/lib/supabase-admin'
import { runInterviewTurn, type BuildModeMessage } from '@/lib/server/research-room/build-mode-interview'
import {
  BuildModeExtractionHTTPSchema,
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

// Slice 8 Build 3 session 4 — DETAILED vs MINIMAL detection. Brief
// Decision 6: parents who open with a paragraph dump get DETAILED mode
// (longer interview with more drill-downs); short answerers get MINIMAL.
// We only fire detection on the FIRST build-mode turn — once mode is set
// on a session it propagates through the merge layer (`mode: prior.mode`).
const DETAILED_WORD_THRESHOLD = 100

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

// Slice 8 Build 3 session 4 — pricing for Build Mode log writes. Mirrored
// from PRICING_PER_MTOK['gpt-5-4-mini'] in lib/server/nana-brain.js. We
// duplicate the constants here rather than importing from nana-brain so
// the route's "no nana-brain.js import" source-grep test (Codex r1 #12)
// stays satisfied. A test below pins the values; if pricing drifts in
// nana-brain.js without updating this file, dashboards would mis-cost
// Build Mode spend, so the assertion is load-bearing.
const GPT_5_4_MINI_PRICING_PER_MTOK = {
  input:        0.75,
  cache_create: 0,
  cache_read:   0.075,
  output:       4.50,
} as const

function buildModeCostUSD(usage: { input_tokens: number; output_tokens: number }) {
  const p = GPT_5_4_MINI_PRICING_PER_MTOK
  const inTok  = usage.input_tokens  ?? 0
  const outTok = usage.output_tokens ?? 0
  const cost_input  = (inTok  * p.input)  / 1e6
  const cost_output = (outTok * p.output) / 1e6
  return {
    cost_input,
    cost_output,
    total_usd: cost_input + cost_output,
  }
}

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
// JSONB and run them through the HTTP schema so caps + types are
// enforced (Codex r5 P1.2 — defence-in-depth against a poisoned
// child_profile that could inject very large strings/arrays into the
// prompt context).
//
// Two-step:
//   1. Key allowlist (drops every key not on FIELD_KEYS).
//   2. Schema parse (rejects oversize strings, oversize arrays, wrong
//      types, bad enum values).
// Failure on either step yields an empty profile — the interview just
// starts the parent at zero state.
const WRITABLE_PROFILE_KEYS = [
  'personality_notes',
  'anchors_notes',
  'academic_notes',
  'goals_notes',
  'child_wants',
  'nonnegotiables',
  'goal_orientation',
  'interests_sports',
  'interests_arts',
] as const

function extractWritableProfile(profile: Record<string, unknown>): Partial<BuildModeExtractionHTTP> {
  const filtered: Record<string, unknown> = {}
  for (const k of WRITABLE_PROFILE_KEYS) {
    if (k in profile && profile[k] != null) filtered[k] = profile[k]
  }
  const parsed = BuildModeExtractionHTTPSchema.safeParse(filtered)
  return parsed.success ? parsed.data : {}
}

export async function POST(req: NextRequest) {
  if (!isResearchRoomEnabled()) return jsonError(404, 'feature_disabled')
  if (!(await isAllowedOrigin())) return jsonError(403, 'forbidden_origin')

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError(401, 'unauthorized')

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) return jsonError(402, 'payment_required')

  // Codex r5 P1.1: reuse the 'chat' bucket (20 req / 10 min / IP) so
  // Build Mode shares quota with regular Nana chat. Same per-IP scope.
  if (!checkRateLimit(req, 'chat')) return jsonError(429, 'rate_limited')

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
  let progress: BuildModeProgress = parsedProgress.success
    ? parsedProgress.data
    : emptyProgress('minimal')

  // ── Reconstruct conversation history from research_session_messages ──
  // Session 3: load the last HISTORY_LIMIT/2 build-mode Q/A pairs and
  // flatten into BuildModeMessage[]. We filter on
  // `parsed_answer.kind === 'build_mode'` so the LLM doesn't see
  // unrelated regular-chat history mixed in (the same session id can
  // carry both, e.g. parent toggled in/out).
  const { data: recentMsgs } = await svc
    .from('research_session_messages')
    .select('question, parsed_answer, created_at')
    .eq('session_id', body.sessionId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  // Build-mode messages carry a `build_mode` marker key on parsed_answer
  // so we can filter them out of regular-chat replays. The assistant
  // turn's prose lives under `sections.short_answer` so the existing
  // chat bubble renders it without special-casing (see page.tsx:474 —
  // `parsed_answer` is mapped directly to ParsedAnswer for rendering).
  const recentBuildModeMsgs = (recentMsgs ?? [])
    .filter(m => {
      if (!m || typeof m !== 'object') return false
      const pa = (m as { parsed_answer?: unknown }).parsed_answer
      return !!pa && typeof pa === 'object' && (pa as Record<string, unknown>).build_mode != null
    })
    .reverse()   // oldest → newest for prompt order

  // Slice 8 Build 3 session 4 — DETAILED detection on turn 1 only. If
  // there's no prior build-mode history AND progress is fresh (no usable
  // signal captured yet) AND the parent typed a paragraph (>=100 words),
  // upgrade to DETAILED so the interview drills down rather than racing
  // through short questions. Mode then propagates via the merge layer.
  if (
    progress.mode === 'minimal' &&
    progress.usable_total === 0 &&
    recentBuildModeMsgs.length === 0 &&
    countWords(body.question) >= DETAILED_WORD_THRESHOLD
  ) {
    progress = { ...progress, mode: 'detailed' }
  }

  const history: BuildModeMessage[] = []
  for (const m of recentBuildModeMsgs) {
    if (typeof m.question === 'string' && m.question.length > 0) {
      history.push({ role: 'user', content: m.question })
    }
    const pa = m.parsed_answer as {
      sections?: { short_answer?: unknown }
      build_mode?: unknown
    } | null
    const prose = pa?.sections?.short_answer
    if (typeof prose === 'string' && prose.length > 0) {
      history.push({ role: 'assistant', content: prose })
    }
  }
  history.push({ role: 'user', content: body.question })

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

        // ── Persist this turn (session 3) ────────────────────────────
        //
        // Two writes:
        //   (a) Apply the merged profile + progress via the v5 RPC.
        //   (b) Insert a research_session_messages row carrying the
        //       prose + the merge summary so the next turn can
        //       reconstruct history.
        //
        // Failures here are LOGGED but don't tear down the stream —
        // the prose was already delivered to the parent. Next turn
        // simply starts cold for this turn's signal, which is a
        // graceful degradation rather than a crash.

        // Build the RPC-shaped progress payload. The migration's
        // weight-enforce check requires exactly the canonical TARGET_WEIGHTS,
        // so we always reconstruct the targets map from the merge result
        // and emit every key (the schema-empty case writes a zeroed
        // progress, which is the same shape).
        const rpcTargets: Record<string, { state: string; weight: number }> = {}
        for (const key of Object.keys(merge.nextProgress.targets)) {
          const t = merge.nextProgress.targets[key as keyof typeof merge.nextProgress.targets]
          if (t) rpcTargets[key] = { state: t.state, weight: t.weight }
        }

        const { error: rpcError } = await svc.rpc('build_mode_apply_extraction', {
          p_user_id:       user.id,
          p_child_id:      sess.child_id,
          p_session_id:    body.sessionId,
          p_fields:        merge.nextProfile,
          p_targets_state: rpcTargets,
          p_pending:       merge.nextProgress.pending_confirmations,
          p_mode:          merge.nextProgress.mode,
        })
        if (rpcError) {
          console.error('[build-mode/turn] RPC apply failed', rpcError)
          send({ type: 'persistence_warning', code: 'apply_failed' })
        }

        // Insert the chat message. The parsed_answer is shaped to be
        // BOTH render-compatible with the existing chat bubble AND
        // identifiable as a build-mode turn:
        //   • `sections.short_answer` carries the prose so page.tsx's
        //     direct-map to ParsedAnswer renders it on refresh.
        //   • `confidence: 'high'` satisfies the renderer's expected
        //     shape (Build Mode prose is parent-supplied, not LLM-
        //     synthesised facts, so confidence is intrinsic).
        //   • `build_mode` marker key with focus + diff/progress
        //     metadata is read by history reconstruction (above) and
        //     ignored by the regular renderer.
        const shareToken = crypto.randomUUID()
        const { data: insertedRow, error: insertError } = await svc
          .from('research_session_messages')
          .insert({
            session_id:    body.sessionId,
            question:      body.question.slice(0, 2000),
            parsed_answer: {
              sections:    { short_answer: proseAccum },
              confidence:  'high',
              build_mode: {
                focus:                turn.focus,
                total:                merge.nextProgress.total,
                usable_total:         merge.nextProgress.usable_total,
                refused_targets:      merge.diff.refused,
                set_field_count:      merge.diff.set.length,
                appended_field_count: merge.diff.appended.length,
                contradicted_fields:  merge.diff.contradicted.map(c => String(c.field)),
              },
            },
            share_token:   shareToken,
          })
          .select('id')
          .single<{ id: string }>()
        if (insertError) {
          console.error('[build-mode/turn] message insert failed', insertError)
          send({ type: 'persistence_warning', code: 'insert_failed' })
        }
        const messageId = insertedRow?.id ?? null

        // Slice 8 Build 3 session 4 — log to nana_chat_logs so Build Mode
        // turns surface in Mission Control's 💬 Nana Chats + 💰 Costs
        // tabs alongside regular Nana chat spend. Without this insert,
        // every Build Mode turn was invisible to the dashboard even
        // though the prose + extraction + RPC writes were happening.
        //
        // Fire-and-forget: log failure mustn't tear down the stream.
        // turn.meta is only populated by the production stream helper;
        // test mocks satisfy BuildModeStreamResult via duck-typing and
        // may omit it (the runInterviewTurn return type marks it optional).
        if (turn.meta) {
          turn.meta.then(meta => {
            const cost = buildModeCostUSD(meta.usage)
            return svc.from('nana_chat_logs').insert({
              school_slug:          null,
              question:             body.question.slice(0, 2000),
              answer_preview:       proseAccum.slice(0, 500),
              tokens_in:            meta.usage.input_tokens,
              tokens_cache_write:   null,
              tokens_cache_read:    null,
              tokens_out:           meta.usage.output_tokens,
              cost_input_usd:       cost.cost_input,
              cost_cache_write_usd: null,
              cost_cache_read_usd:  null,
              cost_output_usd:      cost.cost_output,
              cost_total_usd:       cost.total_usd,
              cache_hit_pct:        null,
              chunk_count:          null,
              sensitive_count:      null,
              backend:              'build-mode',
              model:                meta.model,
              confidence:           'high',
              claude_ms:            null,
              total_ms:             meta.total_ms,
            })
          }).then(result => {
            if (result?.error) console.error('[build-mode/turn] nana_chat_logs insert failed', result.error)
          }).catch(err => {
            console.error('[build-mode/turn] meta/log error', err)
          })
        }

        // Final event: surface the SAME render-compatible parsed shape
        // we wrote to DB so the live bubble renders identically to a
        // post-refresh load. Without this, live messages render via
        // useNanaChat's `rawText` fallback path which not every bubble
        // surface honours.
        send({
          type:       'final',
          shareToken: insertError ? null : shareToken,
          messageId,
          payload: {
            parsed: {
              sections:    { short_answer: proseAccum },
              confidence:  'high',
              build_mode: {
                focus:                turn.focus,
                total:                merge.nextProgress.total,
                usable_total:         merge.nextProgress.usable_total,
                refused_targets:      merge.diff.refused,
                set_field_count:      merge.diff.set.length,
                appended_field_count: merge.diff.appended.length,
                contradicted_fields:  merge.diff.contradicted.map(c => String(c.field)),
              },
            },
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
