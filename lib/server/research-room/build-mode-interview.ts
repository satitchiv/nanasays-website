// Slice 8 Build 3 — Build Mode interview engine (orchestration).
//
// One server-side function: `runInterviewTurn`. Given the chat history,
// the child brief, and the current merged state, it:
//   1. picks the deterministic focus target for this turn,
//   2. builds the system prompt with prior facts injected,
//   3. calls the streaming LLM helper (dependency-injected for tests),
//   4. returns the prose AsyncIterable for the UI plus a Promise that
//      resolves to a fully merged result the route can write.
//
// Codex r2 R9 hybrid drill-down: orchestration decides WHICH target to
// advance; the LLM phrases the question. The orchestrator never writes
// to the DB itself — it just composes inputs.

import 'server-only'
import type { ZodTypeAny } from 'zod'
import { streamBuildModeTurn, type BuildModeMessage, type BuildModeStreamResult } from './build-mode-llm.ts'
import {
  BuildModeTurnPayloadSchema,
  type BuildModeProgress,
  type BuildModeTurnPayload,
  type BuildModeExtractionHTTP,
  type TargetKey,
  type ProgressState,
  TARGET_KEYS,
  TARGET_WEIGHTS,
  ProgressStateMultipliers,
} from './build-mode-schemas.ts'
import { buildSystemPrompt } from './build-mode-prompt.ts'
import { mergeBuildModeTurn, type MergeResult } from './build-mode-merge.ts'
import type { UkYearHint } from './uk-school-year.ts'

// Generic stream-fn signature so the production `streamBuildModeTurn`
// and the test mock both satisfy it.
export type StreamFnOpts<TSchema extends ZodTypeAny> = {
  messages:         BuildModeMessage[]
  extractionSchema: TSchema
  signal?:          AbortSignal
}
export type StreamFn = <TSchema extends ZodTypeAny>(
  opts: StreamFnOpts<TSchema>,
) => BuildModeStreamResult<TSchema>

export type RunInterviewTurnOpts = {
  childName:    string
  childBrief:   Record<string, unknown>
  priorProfile: Partial<BuildModeExtractionHTTP>
  priorProgress: BuildModeProgress
  history:      BuildModeMessage[]
  /**
   * rr-8-build3-sibling-gender-year chat-quality (2026-05-21) —
   * birthday-derived UK Year hint (current academic year + next
   * September). Renders into the sibling_basics opener as
   * "From the birthday, I have yoyo as Year 9 now, likely Year 10
   * from September. Is that right?". The turn route computes this
   * from children.date_of_birth via buildUkYearHint(). Null when DOB
   * is missing or DOB resolves to a non-UK-school year.
   */
  siblingYearHint?: UkYearHint | null
  /**
   * Codex r7 P2.1 — true when this child is actually a sibling
   * (other children exist on the user's account). Used by the
   * sibling_basics prompt branch to neutralise "earlier child"
   * wording when false, since pickFocus also fires for legacy
   * first children with missing child_profile basics. The turn route
   * derives this from a children-count query; default false is the
   * safer choice (no false sibling claim).
   */
  isSibling?:   boolean
  signal?:      AbortSignal
  /** Defaults to the real OpenAI-backed streamBuildModeTurn. Tests inject a mock. */
  streamFn?:    StreamFn
  /** Override for deterministic tests. Defaults to `new Date()`. */
  now?:         () => Date
}

export type RunInterviewTurnResult = {
  focus:         TargetKey | 'confirm_contradiction' | 'sibling_basics' | 'free'
  proseStream:   AsyncIterable<string>
  payload:       Promise<BuildModeTurnPayload>
  mergeResult:   Promise<MergeResult>
  // Session 4 — forwarded from the LLM helper so the route can log
  // tokens + model + timing into nana_chat_logs (the spend-tracking
  // table that Mission Control's Nana Chats + Costs tabs read from).
  // Promise resolves alongside `payload`; both reject together if the
  // stream errors. The test-mock streamFn may not provide this; the
  // route treats absence as "skip nana_chat_logs insert".
  meta?:         Promise<{
    model:    string
    usage:    { input_tokens: number; output_tokens: number }
    ttft_ms:  number
    total_ms: number
  }>
}

// ── Focus picker (deterministic) ──────────────────────────────────────

// "Headroom" = how much progress the target could still gain. Higher
// headroom = more reason to focus on it now.
function targetHeadroom(state: ProgressState): number {
  const m = ProgressStateMultipliers[state]
  return 1 - m.total
}

/** Public helper so tests can assert focus selection without running the LLM. */
export function pickFocus(
  progress:    BuildModeProgress,
  priorProfile?: Partial<BuildModeExtractionHTTP>,
): TargetKey | 'confirm_contradiction' | 'sibling_basics' | 'free' {
  // Contradictions trump everything — must be resolved before drift.
  if (progress.pending_confirmations.length > 0) return 'confirm_contradiction'

  // rr-8-build3-sibling-gender-year (2026-05-21): siblings skip the
  // 5-question wizard and inherit only the 4 family-constant fields
  // (region/boarding/budget/curriculum) from parent_profiles. If
  // child_gender or child_year is missing on THIS child's profile,
  // run a one-shot opener turn to capture them BEFORE diving into the
  // interview proper — otherwise the turn + finalize routes fall back
  // to parent_profiles.child_gender/year, which still carries the FIRST
  // child's values, silently mis-targeting recommendations. Optional
  // priorProfile keeps backwards-compat for any caller that doesn't yet
  // pass it (gate just doesn't fire).
  if (priorProfile && (!priorProfile.child_gender || !priorProfile.child_year)) {
    return 'sibling_basics'
  }

  // Pick the target with the largest weight × headroom. TARGET_KEYS
  // order is the deterministic tie-breaker.
  let best: { key: TargetKey; score: number } | null = null
  for (const key of TARGET_KEYS) {
    const t = progress.targets[key]
    const state = t?.state ?? 'missing'
    const score = TARGET_WEIGHTS[key] * targetHeadroom(state)
    if (best == null || score > best.score) {
      best = { key, score }
    }
  }

  // If every target is saturated (score==0 everywhere), let the parent
  // free-flow — interview is essentially done.
  if (!best || best.score === 0) return 'free'
  return best.key
}

// ── Main entry ───────────────────────────────────────────────────────

export function runInterviewTurn(opts: RunInterviewTurnOpts): RunInterviewTurnResult {
  const streamFn = opts.streamFn ?? streamBuildModeTurn
  const now      = opts.now      ?? (() => new Date())

  const focus = pickFocus(opts.priorProgress, opts.priorProfile)

  const systemPrompt = buildSystemPrompt({
    childName:       opts.childName,
    progress:        opts.priorProgress,
    brief:           opts.childBrief,
    priorProfile:    opts.priorProfile,
    currentFocus:    focus,
    siblingYearHint: opts.siblingYearHint ?? null,
    isSibling:       opts.isSibling ?? false,
  })

  const messages: BuildModeMessage[] = [
    { role: 'system', content: systemPrompt },
    ...opts.history,
  ]

  const stream = streamFn({
    messages,
    extractionSchema: BuildModeTurnPayloadSchema,
    signal:           opts.signal,
  })

  // Compose mergeResult promise. Reject cleanly when extraction fails,
  // never produce a half-merged state (Codex r2 R7 + P3).
  const turnAt = now().toISOString()

  // Chat-quality (2026-05-21): pull the current user message + the
  // immediately-prior Nana prose out of history so the merge layer
  // can invoke the deterministic sibling-basics parser as a safety
  // net on the LLM's structured-output bias toward null. The
  // chronological convention is: `opts.history` is oldest → newest
  // and the FINAL entry is the current user message the LLM is
  // responding to (set by the turn route before calling).
  const userMessage = (() => {
    for (let i = opts.history.length - 1; i >= 0; i--) {
      const m = opts.history[i]
      if (m && m.role === 'user') return m.content
    }
    return null
  })()
  const lastNanaProse = (() => {
    for (let i = opts.history.length - 1; i >= 0; i--) {
      const m = opts.history[i]
      if (m && m.role === 'assistant') return m.content
    }
    return null
  })()

  const mergeResult: Promise<MergeResult> = stream.extraction.then((payload) =>
    mergeBuildModeTurn({
      priorProfile:  opts.priorProfile,
      priorProgress: opts.priorProgress,
      payload,
      currentFocus:  focus,
      turnAt,
      userMessage,
      lastNanaProse,
    }),
  )

  // `meta` is only present on the production stream helper (build-mode-llm).
  // Test mocks satisfy `BuildModeStreamResult` via duck typing and may
  // omit it; the route checks for undefined before logging.
  const streamMeta = (stream as { meta?: BuildModeStreamResult<typeof BuildModeTurnPayloadSchema>['meta'] }).meta

  return {
    focus,
    proseStream:  stream.prose,
    payload:      stream.extraction as Promise<BuildModeTurnPayload>,
    mergeResult,
    meta:         streamMeta,
  }
}

// ── Follow-up question safety net (Codex r7 Option D) ────────────────
//
// Browser smoke 2026-05-15 surfaced that gpt-5.4-mini emits prose
// without a closing question on ~50% of turns, even with the explicit
// "ALWAYS end with a question" prompt rule. The LLM also can't know
// the next focus (focus is computed from priorProgress; merge runs
// after the prose stream). The orchestrator has both pieces after
// mergeResult resolves — so it's the right place to enforce the
// guarantee.
//
// Strategy: if the LLM's prose has no terminal `?`, append a
// deterministic per-focus question chosen from the POST-merge next
// focus. The route streams this appendix to the UI as a token so it
// feels continuous, then persists the concatenated text.

/**
 * True if `prose` ends with a `?` (allowing trailing whitespace and
 * common close-quotes/brackets the LLM sometimes wraps with).
 */
export function hasTerminalQuestion(prose: string): boolean {
  return /\?\s*["')\]]?\s*$/.test(prose)
}

const FOCUS_FOLLOW_UPS: Readonly<Record<TargetKey, (childName: string) => string>> = {
  goals:          (n) => `What would success look like for ${n} in five years' time?`,
  interests:      (n) => `What does ${n} love doing outside class — sports, arts, anything they light up about?`,
  child_wants:    (n) => `What does ${n} say they want from a new school?`,
  went_wrong:     (n) => `What's been hardest for ${n} at their current school?`,
  nonnegotiables: (n) => `What would you walk away from a school over for ${n} — co-ed vs single-sex, distance, a minimum amount of sport, anything like that?`,
  drill_down:     (n) => `Could you tell me a bit more about that — what level of detail matters most for ${n}?`,
  other:          (n) => `Is there anything else about ${n} — temperament, family context, anxieties — that we should keep in mind?`,
}

const GENERIC_FALLBACK = (n: string) => `Anything else you'd like to tell me about ${n} before we move on?`

/**
 * Deterministic, natural-language follow-up question for the given
 * post-merge focus. Used by the turn route when the LLM forgets to ask.
 * `confirm_contradiction` and `free` are handled by the caller (the
 * route only appends when focus is a real target).
 *
 * rr-8-build3-sibling-gender-year (Codex r1 P1.2 + r2 P2.1):
 * `sibling_basics` has a deterministic follow-up too. The LLM is
 * known to drop terminal questions on ~50% of turns; without a
 * dedicated appendix, the sibling-basics opener could ship a turn
 * that recites the prior facts and then stops, leaving the parent
 * with no prompt to respond to.
 *
 * Partial-aware (Codex r2 P2.1): the route passes `mergedProfile` so
 * the appendix only re-asks the field that's still missing. Without
 * this, a parent who answered only gender would be re-asked BOTH
 * questions if the LLM forgot the year — which feels robotic and
 * could read as the system ignoring their first answer.
 *
 * The deflection escape hatches ("either" / "not sure") let the
 * parent move on without retyping.
 */
// Codex r3 NIT.1: all three variants end with `?` since they're the
// terminal fallback question. The route's hasTerminalQuestion regex
// doesn't actually check the appendix (only the LLM prose), but reading
// quality matters — a question that ends with `.)` reads as an aside,
// not a prompt. The earlier "(Or 'either' …)" parenthetical is folded
// inline so the sentence ends with the question mark.
const SIBLING_BASICS_BOTH = `Quick check first — is this for a son or a daughter (or "either" if you'd rather we show co-ed and both single-sex options)? And what year group are they entering — Year 7, Year 9, Year 10, Sixth Form, or "not sure"?`
const SIBLING_BASICS_GENDER_ONLY = `One quick basic before we dive in — is this for a son or a daughter, or would you rather we show co-ed and both single-sex schools ("either")?`
const SIBLING_BASICS_YEAR_ONLY = `One quick basic before we dive in — what year group are they entering: Year 7, Year 9, Year 10, Sixth Form, or "not sure"?`

export function buildFollowUpQuestion(opts: {
  childName:      string
  focus:          TargetKey | 'confirm_contradiction' | 'sibling_basics' | 'free'
  /** Codex r2 P2.1 — partial-aware sibling_basics appendix. Optional for back-compat. */
  mergedProfile?: Partial<BuildModeExtractionHTTP>
}): string {
  const name = opts.childName?.trim() || 'your child'
  if (opts.focus === 'sibling_basics') {
    const missingGender = !opts.mergedProfile?.child_gender
    const missingYear   = !opts.mergedProfile?.child_year
    if (missingGender && !missingYear) return SIBLING_BASICS_GENDER_ONLY
    if (missingYear   && !missingGender) return SIBLING_BASICS_YEAR_ONLY
    return SIBLING_BASICS_BOTH
  }
  if (opts.focus === 'confirm_contradiction' || opts.focus === 'free') {
    return GENERIC_FALLBACK(name)
  }
  const fn = FOCUS_FOLLOW_UPS[opts.focus]
  return fn ? fn(name) : GENERIC_FALLBACK(name)
}

// Re-export the LLM message shape so callers don't have to reach into
// the helper module.
export type { BuildModeMessage } from './build-mode-llm.ts'
