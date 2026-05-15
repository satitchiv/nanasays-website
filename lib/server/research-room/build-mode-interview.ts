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
  signal?:      AbortSignal
  /** Defaults to the real OpenAI-backed streamBuildModeTurn. Tests inject a mock. */
  streamFn?:    StreamFn
  /** Override for deterministic tests. Defaults to `new Date()`. */
  now?:         () => Date
}

export type RunInterviewTurnResult = {
  focus:         TargetKey | 'confirm_contradiction' | 'free'
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
export function pickFocus(progress: BuildModeProgress): TargetKey | 'confirm_contradiction' | 'free' {
  // Contradictions trump everything — must be resolved before drift.
  if (progress.pending_confirmations.length > 0) return 'confirm_contradiction'

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

  const focus = pickFocus(opts.priorProgress)

  const systemPrompt = buildSystemPrompt({
    childName:    opts.childName,
    progress:     opts.priorProgress,
    brief:        opts.childBrief,
    priorProfile: opts.priorProfile,
    currentFocus: focus,
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
  const mergeResult: Promise<MergeResult> = stream.extraction.then((payload) =>
    mergeBuildModeTurn({
      priorProfile:  opts.priorProfile,
      priorProgress: opts.priorProgress,
      payload,
      currentFocus:  focus,
      turnAt,
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
 */
export function buildFollowUpQuestion(opts: {
  childName: string
  focus:     TargetKey | 'confirm_contradiction' | 'free'
}): string {
  const name = opts.childName?.trim() || 'your child'
  if (opts.focus === 'confirm_contradiction' || opts.focus === 'free') {
    return GENERIC_FALLBACK(name)
  }
  const fn = FOCUS_FOLLOW_UPS[opts.focus]
  return fn ? fn(name) : GENERIC_FALLBACK(name)
}

// Re-export the LLM message shape so callers don't have to reach into
// the helper module.
export type { BuildModeMessage } from './build-mode-llm.ts'
