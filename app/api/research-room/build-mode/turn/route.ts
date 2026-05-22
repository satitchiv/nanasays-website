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
import {
  runInterviewTurn,
  pickFocus,
  hasTerminalQuestion,
  buildFollowUpQuestion,
  type BuildModeMessage,
} from '@/lib/server/research-room/build-mode-interview'
import {
  BuildModeExtractionHTTPSchema,
  BuildModeProgressSchema,
  emptyProgress,
  type BuildModeExtractionHTTP,
  type BuildModeProgress,
} from '@/lib/server/research-room/build-mode-schemas'
import { buildUkYearHint } from '@/lib/server/research-room/uk-school-year'

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
  // rr-8-build3-sibling-gender-year (2026-05-21): sibling-basics opener
  // captures these on child_profile so the read-preference flip below
  // sees them on subsequent turns. Stays in sync with FIELD_DEFS in
  // build-mode-schemas.ts (which has the matching zod enums).
  'child_gender',
  'child_year',
  // wizard-inheritance-2026-05-22: 4 family-constant fields a sibling
  // inherits from parent_profiles. The turn-time LLM extracts the new
  // value when the parent contradicts an inherited setting in chat
  // prose; the merge layer queues a pending_confirmation; on the
  // parent's next-turn confirmation the value is written here. Without
  // these in the allowlist, the LLM extraction would round-trip to a
  // PendingConfirmation but never persist a corrected wizard value to
  // child_profile.
  'boarding_pref',
  'home_region',
  'budget_range',
  'curriculum_pref',
] as const

function extractWritableProfile(profile: Record<string, unknown>): Partial<BuildModeExtractionHTTP> {
  const filtered: Record<string, unknown> = {}
  for (const k of WRITABLE_PROFILE_KEYS) {
    if (k in profile && profile[k] != null) filtered[k] = profile[k]
  }
  const parsed = BuildModeExtractionHTTPSchema.safeParse(filtered)
  if (parsed.success) return parsed.data
  // Codex r1 Q11 + r2 NIT.1 — legacy-data hardening with logging.
  // Without this fallback, ONE bad enum value (e.g. a hand-edited
  // child_gender='male' from before the 'boy/girl/either' enum was
  // canonical) would empty the entire priorProfile because zod's
  // strict parse is all-or-nothing. Codex r2 NIT.1: log issue PATHS
  // (not values, to avoid dumping the whole child_profile) so Mission
  // Control can see drift.
  //
  // wizard-inheritance impl r3: drop ALL top-level keys the strict
  // parse flagged. The earlier shape (`delete fallback.child_gender;
  // delete fallback.child_year`) was exhaustive for rr-8 but went
  // stale the moment FIELD_DEFS grew — a legacy bad enum on
  // boarding_pref / home_region / budget_range / curriculum_pref
  // would have failed BOTH parses and dropped all notes/basics too.
  // Reading issue.path[0] is future-proof: any new field added to
  // FIELD_DEFS is automatically covered without enumerating.
  console.warn('[build-mode/turn] extractWritableProfile schema-drift fallback', {
    issuePaths: parsed.error.issues.map(i => i.path.join('.')),
  })
  const fallback: Record<string, unknown> = { ...filtered }
  for (const issue of parsed.error.issues) {
    const topKey = issue.path[0]
    if (typeof topKey === 'string') delete fallback[topKey]
  }
  const fallbackParsed = BuildModeExtractionHTTPSchema.safeParse(fallback)
  if (!fallbackParsed.success) {
    console.warn('[build-mode/turn] extractWritableProfile fallback ALSO failed', {
      issuePaths: fallbackParsed.error.issues.map(i => i.path.join('.')),
    })
    return {}
  }
  return fallbackParsed.data
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
      // chat-quality (2026-05-21) — date_of_birth added to SELECT so
      // the sibling_basics opener can suggest a UK Year derived from
      // the birthday rather than asking blind. parent_profiles SELECT
      // ALSO carries curriculum_pref for the sibling-aware "Already
      // reused from the family profile" rendering in build-mode-prompt.
      .select('user_id, name, child_profile, date_of_birth')
      .eq('id', sess.child_id)
      .maybeSingle<{ user_id: string; name: string | null; child_profile: Record<string, unknown> | null; date_of_birth: string | null }>(),
    svc.from('parent_profiles')
      .select('child_year, child_gender, boarding_pref, budget_range, top_priority, home_region, curriculum_pref')
      .eq('id', user.id)
      .maybeSingle<Record<string, unknown>>(),
  ])
  if (!childRes.data)                       return jsonError(404, 'child_not_found')
  if (childRes.data.user_id !== user.id)    return jsonError(403, 'forbidden')

  const childName    = childRes.data.name ?? 'your child'
  const childProfileRaw = childRes.data.child_profile ?? {}
  const priorProfile = extractWritableProfile(childProfileRaw)

  // rr-8-build3-sibling-gender-year (2026-05-21): construct the brief
  // with child_gender + child_year sourced from THIS child's profile
  // ONLY. The earlier draft fell back to parent_profiles when the
  // child row had no value, but Codex r1 P1.1 caught that the fallback
  // re-introduced the exact bug we're fixing: for a sibling who hasn't
  // filled basics yet, the fallback feeds the FIRST child's gender/year
  // back into renderPriorFacts(), so the prompt context says
  // "Brief: Year group: <first child> · Gender: <first child>" while
  // sibling_basics asks "Is this for a son or a daughter?" — confusing
  // for the model AND wrong context if it weights brief over questions.
  // First children's child_profile already mirrors parent_profiles
  // (the wizard copies all 14 fields on first-child create), so the
  // null-only path covers them. The sibling_basics opener (pickFocus
  // gate) is the canonical way to fill blanks; the parent_profiles
  // fallback was a safety net that wasn't actually safe.
  // wizard-inheritance-2026-05-22 (Codex design review Q5): two distinct
  // read patterns for child_profile vs parent_profiles fallback:
  //   - pickChildOnly: child_profile value or null. Used for child_gender
  //     / child_year per Codex r1 P1.1 — falling back to parent_profiles
  //     re-introduces the sibling-basics bug (sibling inherits the FIRST
  //     child's gender/year).
  //   - pickInherited: child_profile value, else parent_profiles fallback.
  //     Used for the 4 family-constant wizard fields (boarding/region/
  //     budget/curriculum) so corrections written to child_profile by
  //     Build Mode flow through to the scorer, while siblings without
  //     corrections still inherit the family wizard answer.
  const pickChildOnly = (child: unknown): string | null =>
    (typeof child === 'string' && child) ? child : null
  const pickInherited = (child: unknown, parent: unknown): string | null => {
    if (typeof child  === 'string' && child)  return child
    if (typeof parent === 'string' && parent) return parent
    return null
  }
  const parentRow = (parentRes.data ?? {}) as Record<string, unknown>
  const brief = {
    ...parentRow,
    child_gender:    pickChildOnly(childProfileRaw.child_gender),
    child_year:      pickChildOnly(childProfileRaw.child_year),
    boarding_pref:   pickInherited(childProfileRaw.boarding_pref,   parentRow.boarding_pref),
    home_region:     pickInherited(childProfileRaw.home_region,     parentRow.home_region),
    budget_range:    pickInherited(childProfileRaw.budget_range,    parentRow.budget_range),
    curriculum_pref: pickInherited(childProfileRaw.curriculum_pref, parentRow.curriculum_pref),
  }

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
  // Codex r6 P1 — finalize messages also carry `build_mode` (with
  // `finalize: true`); excluding them keeps the interview LLM from
  // seeing its own table-proposal turn as another Q/A pair on the
  // next interview turn.
  const recentBuildModeMsgs = (recentMsgs ?? [])
    .filter(m => {
      if (!m || typeof m !== 'object') return false
      const pa = (m as { parsed_answer?: unknown }).parsed_answer
      if (!pa || typeof pa !== 'object') return false
      const bm = (pa as Record<string, unknown>).build_mode
      if (bm == null || typeof bm !== 'object') return false
      return (bm as Record<string, unknown>).finalize !== true
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

  // chat-quality (2026-05-21) — derive a UK Year hint from the child's
  // date_of_birth so the sibling_basics opener can SUGGEST a year
  // ("From the birthday, I have ${name} as Year 9 now") instead of
  // asking blind. Null when DOB is missing or falls outside the
  // UK school year band; the prompt branch then asks plainly.
  const siblingYearHint = buildUkYearHint(childRes.data.date_of_birth ?? null)

  // Codex r7 P2.1 — true sibling = the user has more than one child
  // on their account (active OR archived; either way another child
  // existed at some point, so "earlier child" wording is accurate).
  // Used to gate the sibling-specific copy in the basics prompt
  // branch — pickFocus's sibling_basics gate also fires for legacy
  // first children with blank basics, and we don't want to falsely
  // claim "earlier child" in that case. Best-effort: a count-query
  // failure defaults isSibling to false (cosmetic loss for true
  // siblings, no false claim either way).
  let isSibling = false
  {
    const { count, error: countErr } = await svc
      .from('children')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
    if (countErr) {
      console.warn('[build-mode/turn] sibling-count probe failed', countErr.message)
    } else {
      isSibling = (count ?? 0) > 1
    }
  }

  let turn
  try {
    turn = runInterviewTurn({
      childName,
      childBrief:    brief,
      priorProfile,
      priorProgress: progress,
      history,
      siblingYearHint,
      isSibling,
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

        // ── Follow-up question safety net (Codex r7 Option D) ────────
        // Browser smoke 2026-05-15 showed gpt-5.4-mini omits the closing
        // question on ~50% of turns. The orchestrator has both pieces
        // the LLM lacks: the actual prose it emitted AND the post-merge
        // next focus. Append a deterministic question when the LLM
        // forgot. Skip when next focus is `free` (all targets done) or
        // `confirm_contradiction` (different conversational path).
        // rr-8-build3-sibling-gender-year (2026-05-21): pass a union of
        // priorProfile + this turn's delta so pickFocus sees the freshly-
        // captured child_gender/year and stops returning 'sibling_basics'
        // once both fields are present. merge.nextProfile contains ONLY
        // the fields that changed THIS turn (the RPC's `||` operator
        // merges into existing child_profile in DB), so the next-focus
        // calculation needs the union here.
        const mergedProfileForFocus = { ...priorProfile, ...merge.nextProfile }
        const nextFocus = pickFocus(merge.nextProgress, mergedProfileForFocus)
        const llmAskedQuestion = hasTerminalQuestion(proseAccum)
        let followUpSource: 'llm' | 'orchestrator' = 'llm'
        // Codex r1 P1.2: sibling_basics MUST get the follow-up appendix
        // when the LLM omits a terminal question. Earlier draft skipped
        // sibling_basics here, but the LLM is known to drop closing
        // questions on ~50% of turns; that would ship a sibling-opener
        // turn that recites prior facts and stops, with no prompt for
        // the parent to respond to. buildFollowUpQuestion has a
        // dedicated SIBLING_BASICS_FOLLOW_UP that asks both basics
        // with deflection escape hatches ("either" / "not sure").
        if (
          !llmAskedQuestion &&
          nextFocus !== 'free' &&
          nextFocus !== 'confirm_contradiction'
        ) {
          // Codex r2 P2.1 — pass mergedProfileForFocus so the
          // sibling_basics appendix only re-asks the missing field.
          // Other focuses ignore mergedProfile via the function's
          // optional param (back-compat).
          const question = buildFollowUpQuestion({ childName, focus: nextFocus, mergedProfile: mergedProfileForFocus })
          const appendix = (proseAccum.trim() ? '\n\n' : '') + question
          proseAccum += appendix
          send({ type: 'token', text: appendix })
          followUpSource = 'orchestrator'
        }

        send({
          type:        'build_mode_progress',
          focus:       turn.focus,
          progress:    merge.nextProgress,
          nextProfile: merge.nextProfile,
          diff:        merge.diff,
        })

        // Slice 8 Build 7 Phase C — wrap-up gate.
        // We emit a `build_mode_wrap_up` SSE event when the interview
        // orchestrator has saturated all 7 targets (nextFocus === 'free').
        // The client (ResearchRoomChat) renders an in-thread CTA bubble in
        // response, giving the parent a deterministic "Build my table now"
        // affordance that fires AFTER the natural wrap-up turn (vs. the
        // progress bar's reactive ≥80% CTA, which can show mid-stream).
        //
        // Note: emission is moved BELOW the RPC apply block (defined later
        // in this stream) so it can be gated on `!rpcError`. If profile
        // persistence failed, the CTA would finalize from STALE data —
        // suppress until the next successful turn. The actual emit lives
        // right after the `if (rpcError) { ... }` block; this comment is
        // here to document the placement choice at the natural reading
        // point.

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

        // Slice 8 Build 7 Phase C — wrap-up emission.
        // See comment above the build_mode_progress send() block for the
        // rationale: gate on !rpcError so the CTA doesn't fire against
        // stale profile data.
        if (!rpcError && nextFocus === 'free') {
          send({ type: 'build_mode_wrap_up' })
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
                focus:                  turn.focus,
                total:                  merge.nextProgress.total,
                usable_total:           merge.nextProgress.usable_total,
                refused_targets:        merge.diff.refused,
                set_field_count:        merge.diff.set.length,
                appended_field_count:   merge.diff.appended.length,
                contradicted_fields:    merge.diff.contradicted.map(c => String(c.field)),
                // Codex r7 — measure LLM compliance with the
                // "always ask a question" prompt rule. orchestrator =
                // we patched, llm = the LLM did it itself. Tracking
                // both lets us see if a prompt tweak moves the rate.
                follow_up_source:       followUpSource,
                next_focus_after_merge: nextFocus,
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
                focus:                  turn.focus,
                total:                  merge.nextProgress.total,
                usable_total:           merge.nextProgress.usable_total,
                refused_targets:        merge.diff.refused,
                set_field_count:        merge.diff.set.length,
                appended_field_count:   merge.diff.appended.length,
                contradicted_fields:    merge.diff.contradicted.map(c => String(c.field)),
                // Codex r7 — measure LLM compliance with the
                // "always ask a question" prompt rule. orchestrator =
                // we patched, llm = the LLM did it itself. Tracking
                // both lets us see if a prompt tweak moves the rate.
                follow_up_source:       followUpSource,
                next_focus_after_merge: nextFocus,
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
