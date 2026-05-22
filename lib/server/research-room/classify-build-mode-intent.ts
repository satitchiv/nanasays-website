// Phase 4 item #2 — Build Mode intent classifier.
//
// Replaces ~1240 lines of regex (12 Codex review rounds, never converged)
// with a one-shot OpenAI classification call. The original regex approach
// kept finding harm-class bugs in the same false-positive class — boosting
// selective schools for kids whose parents wrote ambitious-sounding but
// contextually-negative prose ("not academically strong", "we don't want
// Oxbridge pressure", "Oxford pressure, Cambridge pressure, or Russell
// Group pressure"). See memory `feedback_regex_wrong_tool_for_sentiment`
// for the lesson.
//
// HARD-LOCK (matches build-mode-llm.ts): zero Anthropic imports, zero
// nana-brain.js fallback path. Build Mode MUST satisfy CLAUDE.md's hard-
// stop rule via audit-by-grep on this file's import block.
//
// Architecture (per Codex 2026-05-22 advice):
//   - Classify once per finalize call (don't push into the scorer — that
//     would make scoring nondeterministic, slower, and harder to test).
//   - Schema-constrained JSON output via zodResponseFormat. Reject anything
//     that doesn't parse → fall back to {none, none}.
//   - Timeout, then fall back. Never throw — the scorer must keep working
//     even if OpenAI is down. v1 does NOT retry: the user is waiting on
//     finalize in real-time, so a retry chain would add latency without
//     much reliability gain (the fallback is already safe). If observed
//     transient-failure rate is high, add a single retry with 1s delay.
//   - The classifier classifies STATED INTENT only. It does NOT recommend
//     schools and MUST NOT infer beyond the notes.

import 'server-only'
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set — Build Mode intent classifier requires OpenAI provider')
  }
  _client = new OpenAI({ apiKey })
  return _client
}

const INTENT_MODEL  = process.env.BUILD_MODE_INTENT_MODEL || 'gpt-5.4-mini'
const TIMEOUT_MS    = Number(process.env.BUILD_MODE_INTENT_TIMEOUT_MS || 10_000)
const MAX_TOKENS    = 256  // tight upper bound — JSON output is tiny

// ── Schema ──────────────────────────────────────────────────────────

export const BuildModeIntentSchema = z.object({
  academic_intent: z.enum(['strong', 'struggle', 'none']),
  top_uni_intent:  z.enum(['wants',  'rejects',  'none']),
}).strict()

export type BuildModeIntent = z.infer<typeof BuildModeIntentSchema>

export const FALLBACK_INTENT: BuildModeIntent = {
  academic_intent: 'none',
  top_uni_intent:  'none',
}

// ── Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You classify a parent's free-text notes about their child's school search into two intent fields. Output ONLY the JSON matching the schema — no prose, no explanation, no extra fields.

## Fields

**academic_intent**
- "strong" — parent indicates the child IS academically capable / strong / driven. Examples: "she's a real bookworm", "academically strong", "high-achiever", "loves studying", "thrives academically", "she's a top student".
- "struggle" — parent indicates the child STRUGGLES academically / has poor grades / is behind / has academic difficulties / is not academically strong. Examples: "she struggles academically", "academically behind", "poor grades", "she has academic difficulties", "she is not academically strong", "her A-Level results are poor".
- "none" — neither clearly expressed, OR mixed/ambiguous, OR parent only mentioned subjects/careers without stating overall academic standing.

**top_uni_intent**
- "wants" — parent positively wants the child to aim for a top-tier university (Oxbridge / Oxford / Cambridge / Russell Group / Ivy League / Harvard / Yale / Princeton / Stanford / MIT / leading universities). Examples: "wants Oxbridge", "Oxford is the goal", "we hope she can aim for Cambridge", "Russell Group track".
- "rejects" — parent explicitly rejects top-uni pressure. Examples: "no Oxford pressure", "Oxbridge is not the goal", "we don't want Oxbridge", "Oxford is not on her radar", "no longer the priority".
- "none" — neither clearly expressed.

## Critical disambiguation rules

1. **Direction matters.** "academically strong" = strong. "not academically strong" = struggle. "no longer struggling" = none (was struggle, now not). "doesn't love studying" = none-to-struggle.

2. **Positive idioms.** "not only X" / "not just X" / "not merely X" mean "X AND more" — these are POSITIVE. "Not only academically strong" → academic_intent="strong".

3. **Double-negation reassurance is NOT negative.** "no academic issues" / "no problems academically" / "doesn't have any academic problems" / "without academic difficulties" = parent is reassuring, NOT signalling struggle. Set academic_intent="none" (or "strong" if other strong evidence exists), NOT "struggle".

4. **Comparisons preserve positive.** "We want Oxford, but not Cambridge" → top_uni_intent="wants" (parent wants at least one). "Oxford, not Cambridge" → wants. "Cambridge rather than Oxford" → wants. "Not Oxford, but Cambridge" → wants.

5. **Coordinated negative lists negate ALL items.** "We don't want Oxford, Cambridge, or Russell Group" → rejects. "Oxford and Cambridge are not the goal" → rejects. "Oxford pressure, Cambridge pressure, or Russell Group pressure" (preceded by "we don't want" or "no") → rejects.

6. **School names are not top-uni intent.** "Cambridge International School" (a school name) is NOT top_uni_intent. Same for "Oxford Preparatory School", etc. Only treat the city/uni name as top-uni intent when the context is clearly about university aspirations.

7. **Subject-specific careers are NOT academic_intent.** "She wants to study medicine" or "interested in law" describe a career pathway, not overall academic standing. academic_intent="none" unless general academic standing is also stated.

8. **Be conservative.** When in genuine doubt, return "none". False negatives are safe (lose a signal). False positives are HARMFUL — boosting selective schools for kids who shouldn't be there.`

function buildUserMessage(academicNotes: string, goalsNotes: string): string {
  const academic = academicNotes.trim() || '(empty)'
  const goals    = goalsNotes.trim() || '(empty)'
  return `## academic_notes\n${academic}\n\n## goals_notes\n${goals}`
}

// ── Public API ──────────────────────────────────────────────────────

export type ClassifyOptions = {
  academic_notes?: string | null
  goals_notes?:    string | null
  signal?:         AbortSignal
}

/**
 * Classify parent's free-text academic_notes + goals_notes into structured
 * intent. Returns FALLBACK_INTENT (none/none) on any failure — never throws.
 *
 * Short-circuit: when BOTH fields are empty/whitespace, returns FALLBACK_INTENT
 * without calling OpenAI (saves cost + latency for the common no-prose case).
 */
export async function classifyBuildModeIntent(opts: ClassifyOptions): Promise<BuildModeIntent> {
  const academic = (opts.academic_notes ?? '').trim()
  const goals    = (opts.goals_notes    ?? '').trim()
  if (!academic && !goals) return FALLBACK_INTENT

  try {
    const client = getClient()
    const completion = await client.chat.completions.parse({
      model:    INTENT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserMessage(academic, goals) },
      ],
      response_format:       zodResponseFormat(BuildModeIntentSchema, 'build_mode_intent'),
      max_completion_tokens: MAX_TOKENS,
      // Codex r1 NIT #2 (2026-05-22): deterministic sampling. The
      // classification task should be stable for the same input — we don't
      // want the same parent's prose flip-flopping between recommendations
      // across finalize calls. temperature=0 + a fixed seed minimises drift.
      temperature: 0,
      seed:        42,
    }, { signal: opts.signal, timeout: TIMEOUT_MS })

    const parsed = completion.choices[0]?.message?.parsed
    if (!parsed) {
      console.warn('[classify-build-mode-intent] parsed missing, falling back')
      return FALLBACK_INTENT
    }
    return parsed
  } catch (err) {
    // Never throw — the scorer must keep working even if OpenAI is down.
    // The fallback (none/none) matches pre-feature behaviour: only
    // goal_orientation drives wantsAcademic, no prose intent leaks through.
    console.warn(
      '[classify-build-mode-intent] failed, falling back:',
      err instanceof Error ? err.message : String(err),
    )
    return FALLBACK_INTENT
  }
}
