// Phase 4 item #2 + item #3 — Build Mode intent classifier.
//
// Item #2 (2026-05-22): replaced ~1240 lines of regex (12 Codex review
// rounds, never converged) with a one-shot OpenAI classification call.
// Output {academic_intent, top_uni_intent} feeds score-for-build-mode.
// See memory `feedback_regex_wrong_tool_for_sentiment` for the lesson.
//
// Item #3 (2026-05-22): extended to 8-field output addressing Codex
// audit lines 6289-6290 (child_wants + personality_notes only had regex
// hints; went_wrong + drill_down PROGRESS TARGETS had no scoring rep).
// Note: went_wrong and drill_down are interview-tracking progress states
// — their content gets routed by the interview merger into the existing
// prose fields (academic_notes, personality_notes, child_wants, etc.).
// So the classifier reads the actual data fields and the new OUTPUT
// fields (current_school_pain, parent_drill_focus) capture the signal
// those progress targets represent. Also closes the 4 sentiment-direction
// regex paths (PASTORAL_HINT_RE, INCLUSIVE_HINT_RE, SMALL_CLASS_HINT_RE,
// FULL_BOARDING_HINT_RE). Keyword regexes (medicine/law/eng/subject)
// stay — keyword matching is not sentiment.
//
// HARD-LOCK (matches build-mode-llm.ts): zero Anthropic imports, zero
// nana-brain.js fallback path. Build Mode MUST satisfy CLAUDE.md's hard-
// stop rule via audit-by-grep on this file's import block.
//
// Architecture (per Codex 2026-05-22 design review):
//   - Classify once per finalize call (don't push into the scorer — that
//     would make scoring nondeterministic, slower, and harder to test).
//   - Schema-constrained JSON output via zodResponseFormat. Reject anything
//     that doesn't parse → fall back to FALLBACK_INTENT (all 'none').
//   - Timeout, then fall back. Never throw — the scorer must keep working
//     even if OpenAI is down. v1 does NOT retry: user is waiting in real
//     time, so a retry chain would add latency without much reliability
//     gain. Fallback is already safe.
//   - The classifier classifies STATED INTENT only (LITERAL). It does NOT
//     recommend schools, NEVER infers beyond the notes, and the scorer
//     enforces all POLICY (e.g. hasAcademicPain suppression, capped
//     wantsStretch boost for bored kids).
//   - Empty prose short-circuits to FALLBACK_INTENT — empty notes must
//     NEVER erase or downgrade wizard answers (Codex r1 design GREEN).

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
const TIMEOUT_MS    = Number(process.env.BUILD_MODE_INTENT_TIMEOUT_MS || 12_000)
const MAX_TOKENS    = 512  // 8-field JSON output is still tiny; raised from 256 to give headroom

// Versioned for future cache invalidation (Codex r1 design recommendation).
// Bump when the prompt or schema changes meaningfully. Cache keys should
// include this so a prompt revision invalidates stored intents.
// Phase 2.8 (2026-05-25): added sport_focus enum — bumped from
// phase-4-item-3-v1 → phase-2-8-sport-focus-v1.
// 2026-05-27: added 'flexi' to boarding_pref_from_prose enum (was
// missing — wizard has flexi but classifier coerced flexible-boarding
// prose to 'none'). Caught by recommender eval battery Theo persona
// (sixth-form boy, IB, flexible boarding) — classifier missed his
// 'flexible boarding' wording 2× in a row. Bumped to v2.
// Keep in lockstep with effective-top-priority.ts
// DEFAULT_EXPECTED_VERSION.
export const CLASSIFICATION_VERSION = 'phase-2-8-sport-focus-v2-flexi'

// ── Schema ──────────────────────────────────────────────────────────
//
// The LLM-facing schema (BuildModeIntentLlmSchema) does NOT include
// classification_version — we attach that programmatically so the model
// doesn't waste tokens echoing a constant. The public BuildModeIntent
// type carries it for downstream consumers (cache keys, telemetry).

export const BuildModeIntentLlmSchema = z.object({
  // ── Item #2 (DO NOT regress — fixtures locked) ──────────────────
  academic_intent: z.enum(['strong', 'struggle', 'none']),
  top_uni_intent:  z.enum(['wants',  'rejects',  'none']),

  // ── Item #3 (new fields) ────────────────────────────────────────
  pastoral_priority:        z.enum(['high', 'normal', 'none']),
  inclusive_priority:       z.enum(['high', 'normal', 'none']),
  small_env_pref:           z.enum(['wants', 'rejects', 'none']),
  // 2026-05-27 — 'flexi' added to mirror wizard enum
  // (lib/onboarding-fields.ts boarding_pref). Without it, parents
  // saying "flexible boarding" or "a few nights a week" coerced to
  // 'none' and downstream resolveBoardingPref couldn't honour the
  // signal.
  boarding_pref_from_prose: z.enum(['full', 'weekly', 'flexi', 'day', 'rejects', 'none']),
  // Codex r1 implementation review (2026-05-22): 'cultural' was captured
  // but never persisted or scored. Dropped to reduce model burden and
  // keep the schema honest. Re-add when we have a place to act on it
  // (likely as a sub-direction field, e.g. cultural_pain_direction).
  current_school_pain:      z.enum(['academic_bored', 'academic_overwhelmed', 'pastoral', 'logistical', 'none']),
  parent_drill_focus:       z.enum(['academic', 'sport', 'pastoral', 'arts', 'all-round', 'none']),
  // Phase 2.8 (2026-05-25) — concrete sport mentioned in prose as a
  // school-search driver. Routes recommender + verdict to the right
  // DIMENSIONS.<sport>_strength scorer.
  sport_focus:              z.enum(['tennis', 'rugby', 'cricket', 'football', 'hockey', 'none']),
}).strict()

export type BuildModeIntentLlm = z.infer<typeof BuildModeIntentLlmSchema>

export type BuildModeIntent = BuildModeIntentLlm & {
  classification_version: string
}

export const FALLBACK_INTENT: BuildModeIntent = {
  academic_intent:          'none',
  top_uni_intent:           'none',
  pastoral_priority:        'none',
  inclusive_priority:       'none',
  small_env_pref:           'none',
  boarding_pref_from_prose: 'none',
  current_school_pain:      'none',
  parent_drill_focus:       'none',
  sport_focus:              'none',
  classification_version:   CLASSIFICATION_VERSION,
}

// ── Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You classify a parent's free-text notes about their child's school search into structured intent fields. Output ONLY the JSON matching the schema — no prose, no explanation, no extra fields.

## Fields

**academic_intent**
- "strong" — parent indicates the child IS academically capable / strong / driven. Examples: "she's a real bookworm", "academically strong", "high-achiever", "loves studying", "thrives academically", "she's a top student".
- "struggle" — parent indicates the child STRUGGLES academically / has poor grades / is behind / has academic difficulties / is not academically strong. Examples: "she struggles academically", "academically behind", "poor grades", "she has academic difficulties", "she is not academically strong", "her A-Level results are poor".
- "none" — neither clearly expressed, OR mixed/ambiguous, OR parent only mentioned subjects/careers without stating overall academic standing.

**top_uni_intent**
- "wants" — parent positively wants the child to aim for a top-tier university (Oxbridge / Oxford / Cambridge / Russell Group / Ivy League / Harvard / Yale / Princeton / Stanford / MIT / leading universities). Examples: "wants Oxbridge", "Oxford is the goal", "we hope she can aim for Cambridge", "Russell Group track".
- "rejects" — parent explicitly rejects top-uni pressure. Examples: "no Oxford pressure", "Oxbridge is not the goal", "we don't want Oxbridge", "Oxford is not on her radar", "no longer the priority".
- "none" — neither clearly expressed.

**pastoral_priority**
- "high" — parent describes the child as needing strong pastoral support: anxious, sensitive, shy, lonely, vulnerable, struggling socially, lost confidence, bullied, low mental health, fragile. Examples: "He's a sensitive boy", "very anxious", "lost his confidence", "she struggled with bullying", "shy and needs nurturing", "fragile right now", "mental health has been hard".
- "normal" — parent EXPLICITLY describes a resilient / outgoing / confident child, OR explicitly says no pastoral concerns. Examples: "She thrives anywhere", "very resilient", "outgoing and social", "no pastoral worries".
- "none" — no signal in either direction. Default when prose doesn't characterise the child's emotional/social state at all.

**inclusive_priority**
- "high" — parent signals identity-belonging / inclusion concerns: LGBTQ+, queer, gay, lesbian, bi, trans, non-binary, neurodivergence-belonging (autism/ADHD identity), race, religion-as-identity, "diversity matters", "inclusive culture", "trans-friendly". Examples: "our child is queer", "non-binary kid", "we want an inclusive culture", "trans-friendly", "LGBTQ+ acceptance is critical", "as a same-sex family we need".
- "normal" — parent EXPLICITLY says inclusion is not specifically required (e.g. "diversity isn't a particular priority for us", "we don't have specific inclusion needs"). Use this ONLY when the parent stated the negative explicitly.
- "none" — no signal in either direction. Default when prose doesn't mention identity/inclusion at all.

**small_env_pref**
- "wants" — parent signals desire for a small school / small classes / intimate community. Examples: "she'd thrive in a smaller school", "smaller classes please", "needs personal attention", "current school feels too big", "we want a tight community", "individual attention matters".
- "rejects" — parent EXPLICITLY says child needs / prefers / thrives in large environments. Examples: "she thrives in a big bustling community", "wants a large school", "small schools haven't worked".
- "none" — neither.

**boarding_pref_from_prose**
- "full" — parent positively signals full boarding desired. Examples: "we want full boarding", "boarding 7 days a week", "live in".
- "weekly" — parent signals weekly boarding. Examples: "weekly boarding suits us", "home at weekends".
- "flexi" — parent signals flexible/flexi boarding (a few nights a week, can vary). Examples: "we're open to flexible boarding", "flexi boarding works for us", "flexible boarding if the right school comes along", "a few nights a week", "flexi" (alone in boarding context).
- "day" — parent positively signals day-school. Examples: "she'd prefer day", "stays at home", "day pupil".
- "rejects" — parent explicitly rejects boarding (any kind). Examples: "no boarding", "she's not ready for boarding", "boarding isn't right for him", "we don't want boarding".
- "none" — neither, or only mentions boarding incidentally / current-school context.

**current_school_pain**
- "academic_bored" — current school is too easy / lacks challenge / child under-stretched. Examples: "she's bored at her current school", "no challenge", "too easy for him", "ahead of the class", "not stretched", "ceiling too low".
- "academic_overwhelmed" — current school too hard / pace too fast / child falling behind. Examples: "she's overwhelmed", "behind in every subject", "pace is too much", "drowning at school".
- "pastoral" — bullying, loneliness, friendship problems, anxiety, mental-health pain AT current school. Examples: "bullied at current school", "no friends there", "miserable", "lonely at school", "anxiety has worsened".
- "logistical" — commute, schedule, location issues. Examples: "too far", "long commute", "logistically painful".
- "none" — no clear current-school pain stated, OR only generic dissatisfaction without a specific cause, OR pain is purely cultural/religious (no enum value for that — see rule 17).

**parent_drill_focus**
- "academic" — parent says academic results / university placement / exam performance is the most important focus.
- "sport" — sport development / athletics / physical development.
- "pastoral" — pastoral care / wellbeing / mental health is the priority.
- "arts" — arts / music / drama / creative subjects.
- "all-round" — explicit balance / all-rounder / "we want a bit of everything".
- "none" — no clear focus stated.

**sport_focus** (Phase 2.8)
- "tennis" — parent indicates child plays / wants tennis specifically as a school-search driver. Examples: "tennis pathway", "wants tennis academy", "she's a county tennis player", "LTA-rated", "wants Wimbledon route", "national tennis player".
- "rugby" — child plays / wants rugby specifically. Examples: "rugby player wants 1st XV", "DMT", "wants Premiership academy", "school rugby tour", "loves rugby and wants to develop it".
- "cricket" — Examples: "cricketer", "1st XI cricket", "MCC pathway", "county cricket", "wants test cricket".
- "football" — Examples: "footballer", "ISFA", "ESFA", "academy football", "wants Premiership football pathway", "1st XI soccer".
- "hockey" — Examples: "hockey player", "ISHC", "England hockey", "GB hockey", "1st XI hockey", "wants astro hockey programme".
- "none" — no specific sport named as a school-search driver, OR child plays multiple sports without a clear priority (recommender uses generic sport breadth fallback), OR the sport is mentioned only as a hobby (see rule 18 below).

## Critical disambiguation rules

1. **Direction matters.** "academically strong" = strong. "not academically strong" = struggle. "no longer struggling" = none (was struggle, now not). "doesn't love studying" = none-to-struggle.

2. **Positive idioms.** "not only X" / "not just X" / "not merely X" mean "X AND more" — these are POSITIVE. "Not only academically strong" → academic_intent="strong".

3. **Double-negation reassurance is NOT negative.** "no academic issues" / "no problems academically" / "doesn't have any academic problems" / "without academic difficulties" = parent is reassuring, NOT signalling struggle. Set academic_intent="none" (or "strong" if other strong evidence exists), NOT "struggle". Same principle for pastoral: "no pastoral concerns" = pastoral_priority="none" or "normal", NOT "high".

4. **Comparisons preserve positive.** "We want Oxford, but not Cambridge" → top_uni_intent="wants" (parent wants at least one). "Oxford, not Cambridge" → wants. "Cambridge rather than Oxford" → wants. "Not Oxford, but Cambridge" → wants.

5. **Coordinated negative lists negate ALL items.** "We don't want Oxford, Cambridge, or Russell Group" → rejects. "Oxford and Cambridge are not the goal" → rejects. "Oxford pressure, Cambridge pressure, or Russell Group pressure" (preceded by "we don't want" or "no") → rejects.

6. **School names are not top-uni intent.** "Cambridge International School" (a school name) is NOT top_uni_intent. Same for "Oxford Preparatory School", etc. Only treat the city/uni name as top-uni intent when the context is clearly about university aspirations.

7. **Subject-specific careers are NOT academic_intent.** "She wants to study medicine" or "interested in law" describe a career pathway, not overall academic standing. academic_intent="none" unless general academic standing is also stated.

8. **Be conservative.** When in genuine doubt, return "none". False negatives are safe (lose a signal). False positives are HARMFUL — boosting selective schools for kids who shouldn't be there, flagging pastoral high-priority for resilient kids, inferring boarding desire from a passing mention.

## Rules specific to item #3 (parent-experience harm classes)

9. **Wizard-pref taxonomy.** parent_drill_focus MUST be one of {academic, sport, pastoral, arts, all-round, none} — match the wizard's enum exactly. Do NOT invent values like "cost" or "community". If the parent's drill_down text is about cost or community, return "none".

10. **Pastoral pain reinforcement.** When parent describes pastoral suffering at the CURRENT school (bullying, loneliness, anxiety AT school), set BOTH current_school_pain="pastoral" AND pastoral_priority="high". They reinforce each other; the parent is telling you twice.

11. **Bored ≠ strong.** "Bored at current school" (current_school_pain="academic_bored") does NOT automatically mean academic_intent="strong". A bored kid may also be struggling in other ways, OR may just dislike the teaching style. Only set academic_intent="strong" when there is DIRECT evidence of academic capability (grades, "top of the class", "academically strong", etc.).

12. **Boarding rejection.** "She's not ready for boarding" / "no boarding" / "weekly was too much" = boarding_pref_from_prose="rejects". DO NOT infer "wants full" from any mention of the word "boarding". A parent describing the negative experience of boarding is NOT signalling they want more of it.

13. **Small-school direction.** "Small schools didn't work" / "she struggled at a small school" / "needs more stimulation than a small school can give" = small_env_pref="rejects" or "none", NOT "wants". The mention of "small school" with negative or past-tense framing reverses the signal.

14. **Identity vs pastoral.** LGBTQ+, neurodivergence-identity, race, and religion-as-identity concerns belong in inclusive_priority, NOT pastoral_priority. Pastoral is about emotional/social/mental support generally. Inclusive is about identity safety and belonging specifically. They are SEPARATE outputs. A queer kid who is also anxious gets BOTH inclusive_priority="high" AND pastoral_priority="high".

15. **Drill_down does not override wizard.** parent_drill_focus is classified literally from the parent's prose emphasis across all input fields. It does NOT need to match what the parent earlier clicked in the wizard top_priority dropdown — the scorer (NOT you) resolves conflicts. Just classify the prose literally.

16. **Multi-pain priority (Codex r1 implementation review 2026-05-22).** \`current_school_pain\` is a single enum so it must pick one when multiple pains coexist. Apply this priority order: \`academic_overwhelmed\` > \`academic_bored\` > \`pastoral\` > \`logistical\` > \`none\`. WHY: academic pain (especially overwhelmed) is the bigger scoring harm — it triggers \`hasAcademicPain\` which suppresses selective-school boosts. If the prose says BOTH "she's overwhelmed academically" AND "she's lonely", set \`current_school_pain='academic_overwhelmed'\` AND \`pastoral_priority='high'\` — the pastoral signal is still captured via its own output field. NEVER let pastoral pain hide academic pain in the \`current_school_pain\` slot.

17. **Cultural / religion-mismatch pain.** There is no \`cultural\` enum value (intentionally dropped — direction is too ambiguous to score safely). If parent describes religion/values mismatch at current school: do NOT use \`current_school_pain\` for it. Instead, if the family has a clear identity-belonging concern (e.g. "we want a school where our Muslim/Jewish/etc. identity is welcomed"), set \`inclusive_priority='high'\`. If they want a religion-specific school (e.g. "we want a Catholic school"), do NOT encode it in any classifier output — that belongs in the wizard \`ethos_pref\` field. \`parent_drill_focus\` is a priority taxonomy (academic/sport/pastoral/arts/all-round), NOT an ethos field — never put religion there.

18. **Sport_focus is independent of parent_drill_focus (Phase 2.8).** Emit a non-"none" sport_focus whenever the parent's prose names a specific sport AS A SCHOOL-SEARCH DRIVER — i.e. the sport is part of why the parent is searching. Do NOT emit a sport_focus for hobby mentions ("she plays tennis on weekends", "they happen to offer tennis"). Examples that SHOULD emit sport_focus regardless of drill_focus:
   - "she's an all-rounder but rugby is her standout sport" → parent_drill_focus="all-round", sport_focus="rugby"
   - "he wants academic stretch AND a tennis pathway" → parent_drill_focus="academic", sport_focus="tennis"
   The downstream scorer decides whether to apply sport-specific scoring based on the full intent picture; your job is to classify the prose literally.`

function buildUserMessage(args: {
  academic_notes:    string
  goals_notes:       string
  personality_notes: string
  child_wants:       string
  anchors_notes:     string
}): string {
  const v = (s: string) => s.trim() || '(empty)'
  return `## academic_notes
${v(args.academic_notes)}

## goals_notes
${v(args.goals_notes)}

## personality_notes
${v(args.personality_notes)}

## child_wants
${v(args.child_wants)}

## anchors_notes
${v(args.anchors_notes)}`
}

// ── Public API ──────────────────────────────────────────────────────

export type ClassifyOptions = {
  academic_notes?:    string | null
  goals_notes?:       string | null
  personality_notes?: string | null
  child_wants?:       string | null
  anchors_notes?:     string | null
  signal?:            AbortSignal
}

/**
 * Classify parent's free-text notes into structured Build Mode intent.
 * Returns FALLBACK_INTENT (all-none) on any failure — never throws.
 *
 * Short-circuit: when ALL five prose fields are empty/whitespace, returns
 * FALLBACK_INTENT without calling OpenAI (saves cost + latency for the
 * common no-prose case where parents skip Build Mode interview).
 *
 * Note: went_wrong and drill_down are interview PROGRESS targets, not
 * data fields. Their content is routed by build-mode-merge.ts into the
 * 5 prose fields above. The classifier reads those fields and emits
 * structured pain/focus signals via the OUTPUT enum fields
 * (current_school_pain, parent_drill_focus).
 */
export async function classifyBuildModeIntent(opts: ClassifyOptions): Promise<BuildModeIntent> {
  const academic    = (opts.academic_notes    ?? '').trim()
  const goals       = (opts.goals_notes       ?? '').trim()
  const personality = (opts.personality_notes ?? '').trim()
  const wants       = (opts.child_wants       ?? '').trim()
  const anchors     = (opts.anchors_notes     ?? '').trim()
  if (!academic && !goals && !personality && !wants && !anchors) {
    return FALLBACK_INTENT
  }

  try {
    const client = getClient()
    const completion = await client.chat.completions.parse({
      model:    INTENT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserMessage({
          academic_notes:    academic,
          goals_notes:       goals,
          personality_notes: personality,
          child_wants:       wants,
          anchors_notes:     anchors,
        }) },
      ],
      response_format:       zodResponseFormat(BuildModeIntentLlmSchema, 'build_mode_intent'),
      max_completion_tokens: MAX_TOKENS,
      // Deterministic sampling — same input → same output across runs.
      // Item #2 fixtures (44/44) confirmed temperature=0 + seed=42 stable.
      temperature: 0,
      seed:        42,
    }, { signal: opts.signal, timeout: TIMEOUT_MS })

    const parsed = completion.choices[0]?.message?.parsed
    if (!parsed) {
      console.warn('[classify-build-mode-intent] parsed missing, falling back')
      return FALLBACK_INTENT
    }
    return { ...parsed, classification_version: CLASSIFICATION_VERSION }
  } catch (err) {
    // Never throw — the scorer must keep working even if OpenAI is down.
    // The fallback (all-none) matches pre-feature behaviour: only wizard
    // dropdowns drive scoring, no prose intent leaks through.
    console.warn(
      '[classify-build-mode-intent] failed, falling back:',
      err instanceof Error ? err.message : String(err),
    )
    return FALLBACK_INTENT
  }
}
