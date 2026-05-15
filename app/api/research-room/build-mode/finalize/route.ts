// Slice 8 Build 3 session 4 — Build Mode finalize route.
//
// When the parent clicks the "Want me to build your comparison table now?"
// CTA (gated on usable_total ≥ 0.80 in the progress bar), the chat hook
// posts here instead of /api/nana-research. This route bypasses the
// regular Nana brain entirely — its job is single-shot: read the captured
// child_profile, ask the LLM for 3-5 row proposals anchored on the
// parent's stated priorities, persist them via the standard
// research_session_messages + proposed_actions shape so the existing
// "+ Add as row" buttons render in the chat bubble.
//
// Why a dedicated endpoint instead of routing through nana-brain:
//   1. The regular brain wasn't designed for "given this captured
//      profile, propose N rows" — it defaulted to summarising schools,
//      hallucinated schools outside the shortlist (e.g. "Rugby School"
//      when only Oakham/Bromsgrove/Malvern/Ellesmere were shortlisted),
//      and emitted at most one propose_add_row per turn.
//   2. CLAUDE.md hard-stop: no Anthropic SDK use without explicit
//      confirmation. The regular brain has an Anthropic fallback path;
//      this route uses streamBuildModeTurn (OpenAI only) so audit-by-
//      grep can verify isolation.
//
// SSE event shape matches the turn route + adds nothing new (so the
// existing useNanaChat switch handles all events out of the box):
//   session_ready → answer_format(prose) → token* → final
// The `final` event carries parsed.format='prose_v1' + the proposals
// keyed by short proposal_ids under parsed.proposed_actions.

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { checkRateLimit } from '@/lib/rateLimit'
import { supabaseService } from '@/lib/supabase-admin'
import { streamBuildModeTurn, type BuildModeMessage } from '@/lib/server/research-room/build-mode-llm'
import {
  BuildModeExtractionHTTPSchema,
  BuildModeFinalizeProposalsSchema,
  type BuildModeExtractionHTTP,
  type BuildModeFinalizeProposal,
} from '@/lib/server/research-room/build-mode-schemas'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const MAX_SHORTLIST = 12   // Defensive cap; comparison_views typically ≤ 8.
const MIN_PROPOSALS = 3
const MAX_PROPOSALS = 5

const RequestSchema = z.object({
  // The chat hook always posts a `question` field (placeholder for this
  // route — finalize doesn't consume it). Allow but ignore.
  sessionId:      z.string().uuid(),
  shortlistSlugs: z.array(z.string().min(1).max(120)).min(1).max(MAX_SHORTLIST).optional(),
}).passthrough()

// Same pricing constants as the turn route — duplicated to keep the
// no-nana-brain-import isolation invariant. A drift test on the turn
// route pins these values; if they shift in nana-brain.js without
// updating BOTH routes, dashboards will mis-cost spend.
const GPT_5_4_MINI_PRICING_PER_MTOK = {
  input:  0.75,
  output: 4.50,
} as const

function buildModeCostUSD(usage: { input_tokens: number; output_tokens: number }) {
  const inTok  = usage.input_tokens  ?? 0
  const outTok = usage.output_tokens ?? 0
  const cost_input  = (inTok  * GPT_5_4_MINI_PRICING_PER_MTOK.input)  / 1e6
  const cost_output = (outTok * GPT_5_4_MINI_PRICING_PER_MTOK.output) / 1e6
  return { cost_input, cost_output, total_usd: cost_input + cost_output }
}

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

// Build a short, opinionated random id that satisfies the existing
// proposal_id regex (^[a-zA-Z0-9_-]{1,40}$) used by the confirm_add_row
// validator. crypto.randomUUID() works but produces 36-char ids; an 8-
// char alphanumeric is plenty for keying inside a single message.
function shortId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function buildFinalizeSystemPrompt(args: {
  childName:    string
  childProfile: Partial<BuildModeExtractionHTTP>
  shortlistSlugs: string[]
}): string {
  const profileLines: string[] = []
  const p = args.childProfile
  if (p.goal_orientation)  profileLines.push(`• Goal orientation: ${p.goal_orientation}`)
  if (p.goals_notes)       profileLines.push(`• Goals: ${p.goals_notes}`)
  if (p.interests_sports?.length) {
    profileLines.push(`• Sports: ${p.interests_sports.map(s => `${s.sport} (${s.level})`).join(', ')}`)
  }
  if (p.interests_arts?.length) {
    profileLines.push(`• Arts: ${p.interests_arts.map(a => `${a.art} (${a.level})`).join(', ')}`)
  }
  if (p.anchors_notes)     profileLines.push(`• Anchors / pastoral: ${p.anchors_notes}`)
  if (p.academic_notes)    profileLines.push(`• Academic profile: ${p.academic_notes}`)
  if (p.personality_notes) profileLines.push(`• Personality: ${p.personality_notes}`)
  if (p.child_wants)       profileLines.push(`• What ${args.childName} wants: ${p.child_wants}`)
  if (p.nonnegotiables?.length) {
    profileLines.push(`• Must-haves: ${p.nonnegotiables.join(' · ')}`)
  }
  const profileBlock = profileLines.length > 0
    ? profileLines.join('\n')
    : '(no profile captured — parent skipped most questions)'

  return [
    `You are Nana, helping a parent build a comparison table tailored to their child.`,
    ``,
    `The parent has just finished a Build Mode interview about ${args.childName}.`,
    `Your job: propose ${MIN_PROPOSALS}-${MAX_PROPOSALS} comparison ROWS for the table — each row anchored on a SPECIFIC priority captured below.`,
    ``,
    `CHILD PROFILE`,
    profileBlock,
    ``,
    `SHORTLIST SCHOOLS (use ONLY these exact slugs in cell_data — never propose a school outside this list):`,
    args.shortlistSlugs.map(s => `• ${s}`).join('\n'),
    ``,
    `RULES`,
    `1. Each row MUST anchor on one specific captured priority. If the parent said "football", propose "Football competitive level" — NOT generic "Sports". Use their actual words.`,
    `2. group_name MUST be exactly "child-specific" (verbatim) — no other groups.`,
    `3. weight: 0.0–1.0 reflecting how important this row is to the child. The single highest-priority topic gets ≥0.8. Otherwise 0.4–0.7.`,
    `4. rationale: one short sentence linking the row to a specific thing the parent said (e.g. "You said Sasha plays football at county level — schools vary widely on competitive football.").`,
    `5. cell_data: emit ONE entry per shortlist slug above. Use { slug, value: null, source: null, note: null } — leave value population for follow-up turns. Don't invent data.`,
    `6. prose: one or two sentences introducing the rows — warm, concrete, references the captured priorities by name. NOT a school-by-school summary.`,
    `7. Do NOT mention schools outside the shortlist. Do NOT summarise the table. Do NOT recommend a single school. Only propose rows.`,
    ``,
    `Return JSON matching the response_format schema: {prose, proposals: [...]}.`,
  ].join('\n')
}

export async function POST(req: NextRequest) {
  if (!isResearchRoomEnabled()) return jsonError(404, 'feature_disabled')
  if (!(await isAllowedOrigin())) return jsonError(403, 'forbidden_origin')

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError(401, 'unauthorized')

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) return jsonError(402, 'payment_required')

  // Reuse the chat rate limit bucket — finalize counts as a chat turn.
  if (!checkRateLimit(req, 'chat')) return jsonError(429, 'rate_limited')

  let body: z.infer<typeof RequestSchema>
  try {
    body = RequestSchema.parse(await req.json())
  } catch {
    return jsonError(400, 'invalid_request')
  }

  const svc = supabaseService()

  // ── Load session ──────────────────────────────────────────────────
  const { data: sess } = await svc
    .from('research_sessions')
    .select('id, user_id, child_id')
    .eq('id', body.sessionId)
    .maybeSingle<{ id: string; user_id: string; child_id: string }>()
  if (!sess)                    return jsonError(404, 'session_not_found')
  if (sess.user_id !== user.id) return jsonError(403, 'forbidden')
  if (!sess.child_id)           return jsonError(409, 'session_missing_child')

  // ── Load child profile + shortlist from comparison_rows ───────────
  // The shortlist passed in the request body wins (matches the parent's
  // current view); fall back to active comparison_views if absent.
  const { data: child } = await svc
    .from('children')
    .select('user_id, name, child_profile')
    .eq('id', sess.child_id)
    .maybeSingle<{ user_id: string; name: string | null; child_profile: Record<string, unknown> | null }>()
  if (!child)                       return jsonError(404, 'child_not_found')
  if (child.user_id !== user.id)    return jsonError(403, 'forbidden')

  const childName    = child.name ?? 'your child'
  const childProfile = extractWritableProfile(child.child_profile ?? {})

  let shortlistSlugs: string[] = Array.isArray(body.shortlistSlugs) ? body.shortlistSlugs : []
  if (shortlistSlugs.length === 0) {
    // Best-effort fallback — read the schools currently shortlisted in
    // this session via comparison_views. Failure here yields an empty
    // shortlist, which the LLM prompt explicitly handles with a no-op.
    const { data: views } = await svc
      .from('comparison_views')
      .select('school_slug')
      .eq('session_id', body.sessionId)
      .is('undone_at', null)
      .limit(MAX_SHORTLIST)
    if (Array.isArray(views)) {
      shortlistSlugs = views.map(v => (v as { school_slug: string }).school_slug).filter(Boolean)
    }
  }
  if (shortlistSlugs.length === 0) return jsonError(409, 'empty_shortlist')

  // ── Abort plumbing ────────────────────────────────────────────────
  const ac = new AbortController()
  if (req.signal) {
    if (req.signal.aborted) ac.abort()
    else req.signal.addEventListener('abort', () => ac.abort(), { once: true })
  }

  // ── LLM call ──────────────────────────────────────────────────────
  // We reuse streamBuildModeTurn as the streaming primitive. Its top
  // schema is { prose, extraction: <schema> } — passing the proposals
  // array as `extraction` gives us the same prose-streaming behaviour
  // for free; the route renames `extraction → proposals` semantically.
  const systemPrompt = buildFinalizeSystemPrompt({ childName, childProfile, shortlistSlugs })
  const messages: BuildModeMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: 'Please propose the rows now.' },
  ]

  let stream
  try {
    stream = streamBuildModeTurn({
      messages,
      extractionSchema: BuildModeFinalizeProposalsSchema,
      signal:           ac.signal,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Build Mode finalize init failed'
    return jsonError(500, message)
  }

  const encoder = new TextEncoder()
  const httpStream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: unknown) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) }
        catch { /* stream already gone */ }
      }
      try {
        send({ type: 'session_ready', sessionId: body.sessionId })
        send({ type: 'answer_format', format: 'prose' })

        let proseAccum = ''
        for await (const chunk of stream.prose) {
          proseAccum += chunk
          send({ type: 'token', text: chunk })
        }

        const proposalsExtracted = await stream.extraction as BuildModeFinalizeProposal[]
        // Codex r9 NIT — enforce the MAX bound that until now lived only
        // in the prompt. The Zod schema caps the array at 8, but the
        // prompt asks for 3-5; if the LLM overshoots into 6-8 we'd have
        // persisted 6-8 propose_add_row pills, more than the parent can
        // realistically scan. Trim down to MAX_PROPOSALS rather than
        // erroring out — the LLM gave us valid extra signal; we just
        // don't want to overwhelm the UI.
        const proposalsRaw = proposalsExtracted.length > MAX_PROPOSALS
          ? proposalsExtracted.slice(0, MAX_PROPOSALS)
          : proposalsExtracted
        // Codex guardrail: enforce the MIN bound the LLM may have ignored
        // (the schema only caps at MAX). Under-count surfaces as a soft
        // error so the parent isn't left with an empty proposals bubble.
        if (proposalsRaw.length < MIN_PROPOSALS) {
          send({ type: 'error', error: `Finalize returned ${proposalsRaw.length} proposals; expected ≥ ${MIN_PROPOSALS}` })
          return
        }

        // Convert the cell_data array shape (LLM-friendly) into the
        // Record<slug, {...}> shape that ProposedAddRow + the existing
        // confirm_add_row validator expect.
        const proposed_actions: Record<string, {
          kind:       'propose_add_row'
          row_name:   string
          group_name: string
          weight?:    number
          cell_data:  Record<string, { value: string | number | null; source?: string | null; note?: string }>
        }> = {}
        // Codex r6 P1 — track off-list cell_data slugs. The defence-in-
        // depth filter below silently drops them, but a hallucinated slug
        // is evidence the response can't be trusted; reject the whole
        // response rather than persist a degraded subset.
        const offListSlugs: string[] = []
        for (const p of proposalsRaw) {
          const cell_data: Record<string, { value: string | number | null; source?: string | null; note?: string }> = {}
          for (const item of p.cell_data) {
            if (!shortlistSlugs.includes(item.slug)) {
              offListSlugs.push(item.slug)
              continue
            }
            cell_data[item.slug] = {
              value:  item.value,
              source: item.source,
              note:   item.note ?? undefined,
            }
          }
          if (Object.keys(cell_data).length === 0) continue
          proposed_actions[shortId()] = {
            kind:       'propose_add_row',
            row_name:   p.row_name,
            group_name: p.group_name,
            ...(p.weight != null ? { weight: p.weight } : {}),
            cell_data,
          }
        }

        // Codex r6 P1 — reject hallucinated off-list slugs entirely.
        if (offListSlugs.length > 0) {
          send({ type: 'error', error: `Finalize emitted ${offListSlugs.length} off-shortlist slug(s); rejecting response.` })
          return
        }
        // Codex r6 P1 — post-filter proposal count guard. The pre-filter
        // check above catches under-count from the LLM directly; this
        // covers the case where all of a proposal's cell_data was off-
        // list and got dropped, silently reducing the persisted count.
        if (Object.keys(proposed_actions).length < MIN_PROPOSALS) {
          send({ type: 'error', error: `Finalize retained ${Object.keys(proposed_actions).length} proposals after filtering; expected ≥ ${MIN_PROPOSALS}` })
          return
        }

        // Persist + log. Parallel with the turn route's pattern.
        const parsedAnswer = {
          format:           'prose_v1' as const,
          prose:            proseAccum,
          confidence:       'high'   as const,
          proposed_actions,
          // Marker so history reconstruction in the turn route ignores
          // this synthetic finalize message (it's not an interview Q/A).
          build_mode: {
            finalize:       true,
            proposal_count: Object.keys(proposed_actions).length,
          },
        }
        const shareToken = crypto.randomUUID()
        const { data: insertedRow, error: insertError } = await svc
          .from('research_session_messages')
          .insert({
            session_id:    body.sessionId,
            question:      'Build my comparison table now',
            parsed_answer: parsedAnswer,
            share_token:   shareToken,
          })
          .select('id')
          .single<{ id: string }>()
        if (insertError) {
          console.error('[build-mode/finalize] message insert failed', insertError)
          send({ type: 'persistence_warning', code: 'insert_failed' })
        }
        const messageId = insertedRow?.id ?? null

        // Log spend (fire-and-forget; mirror turn route).
        stream.meta.then(meta => {
          const cost = buildModeCostUSD(meta.usage)
          return svc.from('nana_chat_logs').insert({
            school_slug:          null,
            question:             'Build my comparison table (finalize)',
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
            backend:              'build-mode-finalize',
            model:                meta.model,
            confidence:           'high',
            claude_ms:            null,
            total_ms:             meta.total_ms,
          })
        }).then(result => {
          if (result?.error) console.error('[build-mode/finalize] nana_chat_logs insert failed', result.error)
        }).catch(err => {
          console.error('[build-mode/finalize] meta/log error', err)
        })

        send({
          type:       'final',
          shareToken: insertError ? null : shareToken,
          messageId,
          payload: {
            parsed:     parsedAnswer,
            raw:        proseAccum,
            parseError: undefined,
          },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Build Mode finalize failed'
        console.error('[build-mode/finalize] stream error', err)
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

  return new Response(httpStream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
