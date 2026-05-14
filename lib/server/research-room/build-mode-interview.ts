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

// Re-export the LLM message shape so callers don't have to reach into
// the helper module.
export type { BuildModeMessage } from './build-mode-llm.ts'
