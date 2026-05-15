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
  BuildModeFinalizeMixedSchema,
  type BuildModeExtractionHTTP,
  type BuildModeFinalizeProposal,
  type BuildModeFinalizeSchoolProposal,
  type BuildModeFinalizeMixed,
} from '@/lib/server/research-room/build-mode-schemas'
import { scoreForBuildMode, type ScoredCandidate } from '@/lib/research-room/score-for-build-mode'
import type { BriefProfile } from '@/lib/research-room/brief-predicates'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const MAX_SHORTLIST = 12   // Defensive cap; comparison_views typically ≤ 8.
const MIN_PROPOSALS = 3
const MAX_PROPOSALS = 5
// Slice 8 Build 6: school proposal bounds. Codex r-merge Q3 capped at
// 5 candidates surfaced as pills; the scorer returns more (up to 20)
// so the LLM has room to discriminate before picking 2-3.
const MAX_SCHOOL_PROPOSALS = 3
const SCORER_CANDIDATE_LIMIT = 20

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
  childName:      string
  childProfile:   Partial<BuildModeExtractionHTTP>
  shortlistSlugs: string[]
  candidates:     ScoredCandidate[]
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

  // Codex r1 Q2 NIT: when the scorer returns zero candidates (rare —
  // very narrow profile + small shortlist intersection) be explicit
  // that the LLM must NOT include any schoolProposals at all rather
  // than relying on it to infer "no candidates → empty array".
  const candidateBlock = args.candidates.length > 0
    ? args.candidates.map(c => `• ${c.slug}: ${c.rationale_seed}`).join('\n')
    : '(none — DO NOT include schoolProposals at all. Emit `schoolProposals: []` verbatim. Do not invent slugs.)'

  return [
    `You are Nana, helping a parent build a comparison table tailored to their child.`,
    ``,
    `The parent has just finished a Build Mode interview about ${args.childName}.`,
    `Your job: propose BOTH of the following in a single JSON response:`,
    `  1. ${MIN_PROPOSALS}-${MAX_PROPOSALS} comparison ROWS for the table — each row anchored on a SPECIFIC priority captured below.`,
    `  2. 0-${MAX_SCHOOL_PROPOSALS} new SCHOOL suggestions to add to the parent's shortlist — picked from the candidate list below if any fit, otherwise emit []. Only suggest schools the parent doesn't already have.`,
    ``,
    `CHILD PROFILE`,
    profileBlock,
    ``,
    `SHORTLIST SCHOOLS (use ONLY these exact slugs in row cell_data — never propose a row covering a school outside this list):`,
    args.shortlistSlugs.map(s => `• ${s}`).join('\n'),
    ``,
    `OFF-SHORTLIST CANDIDATE SCHOOLS (you may pick UP TO ${MAX_SCHOOL_PROPOSALS} from this list to suggest as new additions; never invent slugs outside this list):`,
    candidateBlock,
    ``,
    `RULES — rowProposals`,
    `1. Each row MUST anchor on one specific captured priority. If the parent said "football", propose "Football competitive level" — NOT generic "Sports". Use their actual words.`,
    `2. group_name MUST be exactly "child-specific" (verbatim) — no other groups.`,
    `3. weight: 0.0–1.0 reflecting how important this row is to the child. The single highest-priority topic gets ≥0.8. Otherwise 0.4–0.7.`,
    `4. rationale: one short sentence linking the row to a specific thing the parent said.`,
    `5. cell_data: emit ONE entry per shortlist slug above. Use { slug, value: null, source: null, note: null } — leave value population for follow-up turns. Don't invent data.`,
    ``,
    `RULES — schoolProposals`,
    `6. slug: MUST be EXACTLY one of the OFF-SHORTLIST CANDIDATE slugs above. Never invent.`,
    `7. rationale: one short sentence linking the school to the captured profile. Use ${args.childName}'s ACTUAL captured interests (sports, arts, goals) — NEVER substitute a different sport or interest than what the parent told us. If the candidate's rationale_seed says "strong football", the rationale must reference football, not rugby or another sport.`,
    `8. match_signals: 1–5 short chip labels (≤48 chars each) summarising why this school fits. Use the signals from the candidate's rationale_seed when you can.`,
    `9. Only propose schools where the rationale ties to a SPECIFIC captured priority. If no candidate fits the parent's priorities well, return schoolProposals: [].`,
    ``,
    `GENERAL`,
    `10. Do NOT mention schools outside the shortlist OR the candidate list. Do NOT summarise the table. Do NOT recommend a single school in prose.`,
    `11. Return JSON matching the response_format schema: { rowProposals: [...], schoolProposals: [...] }.`,
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

  // Slice 8 Build 6 — load parent + child-level onboarding fields the
  // scorer needs (budget, region, gender, year, SEN, etc.). Best-effort:
  // the scorer falls back to scoring with only Build-Mode signal if the
  // parent profile is missing.
  const { data: parentRow } = await svc
    .from('parent_profiles')
    .select('home_region, child_gender, child_year, boarding_pref, budget_range, curriculum_pref, top_priority, class_size_pref, sen_need, ethos_pref, lgbtq_pref, pastoral_pref')
    .eq('id', user.id)
    .maybeSingle<BriefProfile & { child_gender?: string | null; child_year?: string | null }>()
  const briefProfile: BriefProfile | null = parentRow ?? null
  const childGender = parentRow?.child_gender ?? null
  const childYear   = parentRow?.child_year   ?? null

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

  // ── Score off-shortlist candidates (Codex r-merge Q4 P1) ──────────
  // Run the Build Mode scorer against the FULL UK directory, excluding
  // the parent's current shortlist. Result feeds the LLM prompt as the
  // candidate allowlist for schoolProposals. Best-effort: if the scorer
  // fails, fall back to an empty list (LLM will return schoolProposals
  // = [] per the prompt's explicit handling).
  let candidates: ScoredCandidate[] = []
  // Codex r8 Medium #1 — surface scorer reason so a future fetch_failed
  // can't masquerade as "empty candidate set" again. Persisted into the
  // final message metadata (build_mode block) and streamed as a
  // persistence_warning when not 'ok' (Mission Control picks this up).
  let scorerReason: 'ok' | 'no_candidates' | 'fetch_failed' = 'no_candidates'
  try {
    const scored = await scoreForBuildMode(
      svc,
      {
        parent:       briefProfile,
        child:        childProfile,
        excludeSlugs: shortlistSlugs,
        childGender,
        childYear,
      },
      SCORER_CANDIDATE_LIMIT,
    )
    candidates    = scored.candidates
    scorerReason  = scored.reason
  } catch (e) {
    console.warn('[build-mode/finalize] scoreForBuildMode failed:', e)
    scorerReason = 'fetch_failed'
  }
  const candidateAllowlist = new Set(candidates.map(c => c.slug))

  // ── Abort plumbing ────────────────────────────────────────────────
  const ac = new AbortController()
  if (req.signal) {
    if (req.signal.aborted) ac.abort()
    else req.signal.addEventListener('abort', () => ac.abort(), { once: true })
  }

  // ── LLM call ──────────────────────────────────────────────────────
  // We reuse streamBuildModeTurn as the streaming primitive. The
  // extraction schema is the parallel-array shape
  // (rowProposals + schoolProposals) per Codex r-merge Q1 OK.
  const systemPrompt = buildFinalizeSystemPrompt({ childName, childProfile, shortlistSlugs, candidates })
  const messages: BuildModeMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: 'Please propose the rows and school suggestions now.' },
  ]

  let stream
  try {
    stream = streamBuildModeTurn({
      messages,
      extractionSchema: BuildModeFinalizeMixedSchema,
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
        // Codex r8 Medium #1 — surface scorer reason early so Mission
        // Control sees a fetch failure even if the rest of the stream
        // completes successfully (rows still get proposed; schools
        // silently can't).
        if (scorerReason === 'fetch_failed') {
          send({ type: 'persistence_warning', code: 'school_scorer_fetch_failed' })
        }

        let proseAccum = ''
        for await (const chunk of stream.prose) {
          proseAccum += chunk
          send({ type: 'token', text: chunk })
        }

        const extracted = await stream.extraction as BuildModeFinalizeMixed
        const rowProposalsExtracted    = extracted.rowProposals
        const schoolProposalsExtracted = extracted.schoolProposals

        // ── Row proposals — same handling as v1 finalize ─────────────
        // Codex r9 NIT — trim to MAX_PROPOSALS even though the schema
        // caps at 8 (prompt asks for 3-5; protect the UI from overshoot).
        const proposalsRaw = rowProposalsExtracted.length > MAX_PROPOSALS
          ? rowProposalsExtracted.slice(0, MAX_PROPOSALS)
          : rowProposalsExtracted
        if (proposalsRaw.length < MIN_PROPOSALS) {
          send({ type: 'error', error: `Finalize returned ${proposalsRaw.length} row proposals; expected ≥ ${MIN_PROPOSALS}` })
          return
        }

        const proposed_actions: Record<string, {
          kind:          'propose_add_row' | 'propose_add_school'
          row_name?:     string
          group_name?:   string
          weight?:       number
          cell_data?:    Record<string, { value: string | number | null; source?: string | null; note?: string }>
          slug?:         string
          display_name?: string
          rationale?:    string
          match_signals?: string[]
        }> = {}
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

        if (offListSlugs.length > 0) {
          send({ type: 'error', error: `Finalize emitted ${offListSlugs.length} off-shortlist slug(s); rejecting response.` })
          return
        }
        if (Object.keys(proposed_actions).length < MIN_PROPOSALS) {
          send({ type: 'error', error: `Finalize retained ${Object.keys(proposed_actions).length} row proposals after filtering; expected ≥ ${MIN_PROPOSALS}` })
          return
        }

        // ── School proposals — filter against candidate allowlist ─────
        // Codex r-merge Q8 NIT: filter bad slugs → log → retry once if
        // the original schoolProposals were non-empty and ALL got
        // filtered (signals LLM hallucination). Don't drop valid row
        // proposals because the school branch failed; persist rows
        // regardless.
        let safeSchoolProposals: BuildModeFinalizeSchoolProposal[] = schoolProposalsExtracted.filter(
          sp => candidateAllowlist.has(sp.slug),
        )
        const droppedSchoolSlugs = schoolProposalsExtracted
          .filter(sp => !candidateAllowlist.has(sp.slug))
          .map(sp => sp.slug)
        if (droppedSchoolSlugs.length > 0) {
          console.warn('[build-mode/finalize] dropped off-candidate school slugs:', droppedSchoolSlugs)
        }
        // Retry-once: only if the LLM tried to propose schools AND all
        // were dropped. Issues one extra streamBuildModeTurn call with
        // the same prompt + an explicit retry nudge. Cost: ~$0.003.
        // Codex r1 Q3 P2: also skip when the abort signal is already
        // tripped (parent navigated away) — no point burning tokens on
        // a response the client can't consume.
        let retryMetaPromise: Promise<{ usage: { input_tokens: number; output_tokens: number }; model: string; total_ms: number } | null> | null = null
        if (
          schoolProposalsExtracted.length > 0 &&
          safeSchoolProposals.length === 0 &&
          candidateAllowlist.size > 0 &&
          !ac.signal.aborted
        ) {
          try {
            const retryMessages: BuildModeMessage[] = [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: 'Your previous response used school slugs that were not in the candidate list. Re-emit schoolProposals using ONLY the slugs from the OFF-SHORTLIST CANDIDATE list above; row proposals can be repeated verbatim.' },
            ]
            const retryStream = streamBuildModeTurn({
              messages:         retryMessages,
              extractionSchema: BuildModeFinalizeMixedSchema,
              signal:           ac.signal,
            })
            // Codex r2 Q2 P2: attach the .catch BEFORE any awaits on the
            // retry's prose/extraction. If extraction throws below,
            // retryStream.meta also rejects (helper-level shape); without
            // an immediately-attached catch the rejection escapes the
            // try/catch and becomes an unhandled promise rejection.
            retryMetaPromise = retryStream.meta.catch(() => null)
            // Drain prose tokens without forwarding (parent already saw v1)
            for await (const _ of retryStream.prose) { /* discard */ }
            const retried = await retryStream.extraction as BuildModeFinalizeMixed
            safeSchoolProposals = retried.schoolProposals.filter(
              sp => candidateAllowlist.has(sp.slug),
            )
          } catch (e) {
            console.warn('[build-mode/finalize] school retry failed:', e)
          }
        }

        // Codex r1 Q9 P2: dedupe by slug before trimming. The LLM
        // sometimes emits the same slug twice (especially after the
        // retry nudge) which would otherwise produce two "Add
        // Sherborne" pills in the same bubble.
        {
          const seenSlugs = new Set<string>()
          safeSchoolProposals = safeSchoolProposals.filter(sp => {
            if (seenSlugs.has(sp.slug)) return false
            seenSlugs.add(sp.slug)
            return true
          })
        }
        // Trim and resolve display_name from schools table in one batch
        safeSchoolProposals = safeSchoolProposals.slice(0, MAX_SCHOOL_PROPOSALS)
        if (safeSchoolProposals.length > 0) {
          const slugs = safeSchoolProposals.map(sp => sp.slug)
          const { data: nameRows } = await svc
            .from('schools')
            .select('slug, name')
            .in('slug', slugs)
          const nameBySlug = new Map<string, string>(
            ((nameRows ?? []) as { slug: string; name: string }[]).map(r => [r.slug, r.name]),
          )
          for (const sp of safeSchoolProposals) {
            const display_name = nameBySlug.get(sp.slug) ?? sp.slug
            // Dedup match_signals defensively (LLM occasionally repeats)
            const match_signals = Array.from(new Set(sp.match_signals)).slice(0, 5)
            proposed_actions[shortId()] = {
              kind:          'propose_add_school',
              slug:          sp.slug,
              display_name,
              rationale:     sp.rationale,
              match_signals,
            }
          }
        }

        // Persist + log. Parallel with the turn route's pattern.
        const rowCount    = Object.values(proposed_actions).filter(a => a.kind === 'propose_add_row').length
        const schoolCount = Object.values(proposed_actions).filter(a => a.kind === 'propose_add_school').length
        const parsedAnswer = {
          format:           'prose_v1' as const,
          prose:            proseAccum,
          confidence:       'high'   as const,
          proposed_actions,
          build_mode: {
            finalize:              true,
            proposal_count:        Object.keys(proposed_actions).length,
            row_proposal_count:    rowCount,
            school_proposal_count: schoolCount,
            // Codex r8 Medium #1 — persist scorer outcome so Mission
            // Control can chart fetch_failed rate and so this exact
            // class of bug is forensically obvious next time.
            school_scorer_reason:  scorerReason,
            candidate_count:       candidates.length,
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
        // Codex r1 Q3 P2: roll the optional retry's meta into the same
        // log row so dashboards see the full per-finalize cost, not
        // just the primary call.
        Promise.all([
          stream.meta,
          retryMetaPromise ?? Promise.resolve(null),
        ]).then(([meta, retryMeta]) => {
          const tokensIn  = meta.usage.input_tokens  + (retryMeta?.usage.input_tokens  ?? 0)
          const tokensOut = meta.usage.output_tokens + (retryMeta?.usage.output_tokens ?? 0)
          const totalMs   = meta.total_ms + (retryMeta?.total_ms ?? 0)
          const cost = buildModeCostUSD({ input_tokens: tokensIn, output_tokens: tokensOut })
          return svc.from('nana_chat_logs').insert({
            school_slug:          null,
            question:             'Build my comparison table (finalize)',
            answer_preview:       proseAccum.slice(0, 500),
            tokens_in:            tokensIn,
            tokens_cache_write:   null,
            tokens_cache_read:    null,
            tokens_out:           tokensOut,
            cost_input_usd:       cost.cost_input,
            cost_cache_write_usd: null,
            cost_cache_read_usd:  null,
            cost_output_usd:      cost.cost_output,
            cost_total_usd:       cost.total_usd,
            cache_hit_pct:        null,
            chunk_count:          null,
            sensitive_count:      null,
            // Slice 8 Build 6: bumped from 'build-mode-finalize' so MC
            // dashboards can split v1 (rows only) from v2 (rows + schools)
            // cost-per-finalize trendlines. Codex r-merge Q9 OK.
            backend:              'build-mode-finalize-v2',
            model:                meta.model,
            confidence:           'high',
            claude_ms:            null,
            total_ms:             totalMs,
          })
        }).then(result => {
          if (result?.error) console.error('[build-mode/finalize] nana_chat_logs insert failed', result.error)
        }).catch(err => {
          console.error('[build-mode/finalize] meta/log error', err)
        })

        // Slice 8 Build 7: transition funnel_state to 'comparison' on
        // successful finalize. Gated on (a) the research_session_messages
        // INSERT succeeded — otherwise the proposals are stranded and we
        // shouldn't advance state lying to the parent — and (b) the
        // current state is 'interview' (idempotent — re-clicks of the
        // finalize CTA in the Build 6 row-dedup case won't revert).
        // Best-effort: a failure here does NOT fail the response.
        if (!insertError && insertedRow?.id && sess?.child_id) {
          const { error: funnelErr } = await svc
            .from('children')
            .update({
              funnel_state: 'comparison',
              updated_at:   new Date().toISOString(),
            })
            .eq('id', sess.child_id)
            .eq('funnel_state', 'interview')
          if (funnelErr) {
            console.warn('[build-mode/finalize] funnel_state transition failed:', funnelErr.message)
          }
        }

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
