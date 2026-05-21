// Slice 8 Build 3 — Build Mode merge layer.
//
// Pure functions over (prior state + LLM turn) → (next state + diff).
// Called by the server route in session 2/3 BEFORE the RPC apply call,
// so the route writes the desired final state and the existing
// `child_profile = child_profile || p_fields` operator is safe (Codex
// r2 R1: merge happens server-side, not in the browser).
//
// Two halves:
//   1. mergeChildProfile  — array-aware merge of writable JSONB fields.
//   2. mergeProgress      — enum-state transitions on the 7 targets +
//                            pending-confirmation tracking for enum
//                            contradictions.
//
// Codex r2 R4: visible notes (personality/anchors/academic/goals/child_wants)
// MUST stay parent-readable. NO `[turn N]` markers. Idempotency is enforced
// via a substring check before appending a new paragraph.

import type {
  BuildModeProgress,
  BuildModeTurnPayload,
  PendingConfirmation,
  ProgressState,
  TargetKey,
  BuildModeExtractionHTTP,
} from './build-mode-schemas.ts'
import {
  BUILD_MODE_FIELD_KEYS,
  TARGET_KEYS,
  TARGET_WEIGHTS,
  computeTotals,
} from './build-mode-schemas.ts'
import {
  parseSiblingBasicsAnswer,
  type SiblingBasicsParseResult,
} from './sibling-basics-parser.ts'

const VISIBLE_NOTES_CAP = 4000   // per-field char cap on visible text
const MAX_NONNEGOTIABLES = 20
const MAX_INTEREST_ITEMS = 20

// Which child_profile fields contribute to which interview targets.
// Some fields contribute to multiple targets; the merge picks the
// best confidence among them per target.
const TARGET_TO_FIELDS: Readonly<Record<TargetKey, readonly (keyof BuildModeTurnPayload['fields'])[]>> = {
  goals:          ['goal_orientation', 'goals_notes'],
  interests:      ['interests_sports', 'interests_arts', 'anchors_notes'],
  child_wants:    ['child_wants'],
  went_wrong:     ['academic_notes', 'personality_notes'],
  nonnegotiables: ['nonnegotiables'],
  // drill_down + other have no unique fields — they advance based on
  // the orchestrator's current focus (passed in below) AND any
  // confidence the LLM reported. Used as catch-all when the parent
  // shared something contextual that doesn't slot into the above.
  drill_down:     [],
  other:          [],
}

// Confidence rank for forward-only state transitions. `refused` is its
// own absorbing-like state (parent can still later confirm, but
// nothing below `refused` can downgrade it accidentally).
const CONFIDENCE_RANK: Readonly<Record<ProgressState, number>> = {
  missing:   0,
  vague:     1,
  inferred:  2,
  confirmed: 3,
  refused:   2,  // ranked equal to inferred so a later "vague" answer
                 // doesn't override a refusal, but a confirmed answer does.
}

function advanceState(current: ProgressState, incoming: ProgressState): ProgressState {
  if (incoming === 'refused') {
    // Codex r3 P2 (Q6/Q7): refusal must not erase existing confirmed
    // evidence. Treat refusal as "stop asking" — accept it only when
    // the parent had not yet given usable signal (missing/vague).
    if (current === 'missing' || current === 'vague') return 'refused'
    return current
  }
  if (current  === 'refused')   {
    // Parent changed their mind — allow forward movement to inferred/confirmed
    // (but not back to vague/missing).
    return incoming === 'confirmed' || incoming === 'inferred' ? incoming : 'refused'
  }
  const cur  = CONFIDENCE_RANK[current]
  const next = CONFIDENCE_RANK[incoming]
  return next > cur ? incoming : current
}

// ── String + array merge primitives ──────────────────────────────────

function canonicalSport(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function canonicalNonneg(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Codex r3 P3 (Q3): normalise whitespace before substring check so
// reflowed/wrapped versions of the same observation still dedupe.
function normaliseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// Idempotent paragraph-append. Returns the merged text and whether
// anything changed. Caller decides whether to surface a "changed" event.
export function mergeVisibleNote(prior: string | null | undefined, incoming: string | null | undefined): { value: string; changed: boolean } {
  const trimmed = (incoming ?? '').trim()
  const base    = (prior ?? '').trim()
  if (trimmed.length === 0) return { value: base, changed: false }
  if (base.length === 0)    return { value: trimmed.slice(0, VISIBLE_NOTES_CAP), changed: true }
  // Codex r2 R4: substring idempotency check so re-extracting an
  // already-recorded observation doesn't append a duplicate paragraph.
  // Codex r3 P3: also try the whitespace-normalised form so reflowed
  // text doesn't sneak through.
  if (base.includes(trimmed)) return { value: base, changed: false }
  if (normaliseWhitespace(base).includes(normaliseWhitespace(trimmed))) {
    return { value: base, changed: false }
  }
  const merged = `${base}\n\n${trimmed}`
  // Hard cap. Truncate FROM THE FRONT so the most recent observation
  // stays intact even if older paragraphs get clipped.
  const value = merged.length <= VISIBLE_NOTES_CAP
    ? merged
    : merged.slice(merged.length - VISIBLE_NOTES_CAP)
  return { value, changed: true }
}

// Dedupe an interest array by canonical sport/art name. Order: prior
// entries first (preserves stable display), then NEW canonical entries
// from incoming. If a canonical name appears in both, the level from
// the most recent (incoming) write wins — newest info reflects the
// freshest parent statement.
export function mergeInterestArray<T extends Record<string, unknown>>(
  prior:    T[] | null | undefined,
  incoming: T[] | null | undefined,
  keyField: keyof T,
): { value: T[]; changed: boolean } {
  const priorList    = Array.isArray(prior)    ? prior    : []
  const incomingList = Array.isArray(incoming) ? incoming : []
  if (incomingList.length === 0) return { value: priorList, changed: false }

  const canon = (entry: T): string => canonicalSport(String(entry[keyField] ?? ''))
  const incomingByCanon = new Map<string, T>()
  for (const e of incomingList) {
    const c = canon(e)
    if (c.length === 0) continue
    incomingByCanon.set(c, e)  // last duplicate within incoming wins
  }

  let changed = false
  const out: T[] = []
  const seen = new Set<string>()

  for (const e of priorList) {
    const c = canon(e)
    if (c.length === 0 || seen.has(c)) continue
    seen.add(c)
    const override = incomingByCanon.get(c)
    if (override) {
      // Detect actual change: compare every property of override vs e.
      const overrideChanged = Object.keys(override).some(k => override[k as keyof T] !== e[k as keyof T])
      if (overrideChanged) changed = true
      out.push(override)
      incomingByCanon.delete(c)
    } else {
      out.push(e)
    }
  }
  for (const c of Array.from(incomingByCanon.keys())) {
    if (seen.has(c)) continue
    const e = incomingByCanon.get(c)!
    seen.add(c)
    out.push(e)
    changed = true
  }

  return { value: out.slice(0, MAX_INTEREST_ITEMS), changed }
}

// Append-only union with canonical dedupe.
export function mergeNonnegotiables(prior: string[] | null | undefined, incoming: string[] | null | undefined): { value: string[]; changed: boolean } {
  const priorList    = Array.isArray(prior)    ? prior    : []
  const incomingList = Array.isArray(incoming) ? incoming : []
  if (incomingList.length === 0) return { value: priorList, changed: false }

  const seen = new Set<string>()
  const out:  string[] = []
  for (const s of priorList) {
    const c = canonicalNonneg(s)
    if (c.length === 0 || seen.has(c)) continue
    seen.add(c)
    out.push(s.trim())
  }
  let changed = false
  for (const s of incomingList) {
    const c = canonicalNonneg(s)
    if (c.length === 0 || seen.has(c)) continue
    seen.add(c)
    out.push(s.trim())
    changed = true
  }
  return { value: out.slice(0, MAX_NONNEGOTIABLES), changed }
}

// ── MergeResult shape ────────────────────────────────────────────────

export type ProfileDiff = {
  set:          Array<{ field: keyof BuildModeExtractionHTTP; value: unknown }>
  appended:     Array<{ field: keyof BuildModeExtractionHTTP; chunk: string }>
  contradicted: Array<{ field: keyof BuildModeExtractionHTTP; prior: unknown; incoming: unknown }>
  refused:      TargetKey[]
}

export type MergeResult = {
  // Desired full state for the writable fields. Pass this verbatim as
  // `fields` to the HTTP route — it's safe to `||`-merge because we've
  // computed the desired final arrays / strings here.
  nextProfile:  BuildModeExtractionHTTP
  nextProgress: BuildModeProgress
  diff:         ProfileDiff
}

// Lightweight read of the prior child_profile JSONB. We only inspect
// the keys we know about; anything else passes through untouched on the
// DB side because the route only writes the allowlisted fields.
type PriorProfile = Partial<BuildModeExtractionHTTP>

// ── Public API ───────────────────────────────────────────────────────

export type MergeBuildModeTurnOpts = {
  priorProfile:   PriorProfile
  priorProgress:  BuildModeProgress
  payload:        BuildModeTurnPayload
  // rr-8-build3-sibling-gender-year (2026-05-21): 'sibling_basics'
  // added to mirror pickFocus's new return type. Merge layer just
  // forwards it to mergeProgress, which only uses currentFocus as a
  // tiebreaker for drill_down/other (neither path matches
  // 'sibling_basics'), so behaviour is unchanged for the new value.
  currentFocus:   TargetKey | 'confirm_contradiction' | 'sibling_basics' | 'free'
  turnAt:         string   // ISO timestamp produced by the caller
  /**
   * rr-8-build3-sibling-gender-year chat-quality (2026-05-21) — the
   * user's raw message + the last Nana prose, used by the
   * deterministic sibling-basics parser as a safety net for the
   * LLM's structured-output bias toward null on fragment answers
   * like "year 9" or "son". The parser is INVOKED ONLY when
   * currentFocus === 'sibling_basics' AND the LLM emitted null for
   * the basic. LLM-emitted values always win over the parser; the
   * parser only fills LLM-null gaps. Optional for back-compat with
   * existing callers (parser simply doesn't fire when absent).
   */
  userMessage?:   string | null
  lastNanaProse?: string | null
}

export function mergeBuildModeTurn(opts: MergeBuildModeTurnOpts): MergeResult {
  const nextProfile: BuildModeExtractionHTTP = {}
  const diff: ProfileDiff = { set: [], appended: [], contradicted: [], refused: [...opts.payload.refused] }

  const fields = opts.payload.fields
  const corrections = opts.payload.corrections ?? {}

  // ── Notes fields (visible scalars) ────────────────────────────────
  for (const noteField of ['personality_notes', 'anchors_notes', 'academic_notes', 'goals_notes', 'child_wants'] as const) {
    const incoming = fields[noteField]
    const prior    = opts.priorProfile[noteField]
    if (incoming == null) continue   // null/undefined → no-op (Codex r1 R7)
    const { value, changed } = mergeVisibleNote(prior, incoming)
    if (!changed) continue
    nextProfile[noteField] = value
    diff.appended.push({ field: noteField, chunk: incoming.trim() })
  }

  // ── interests_sports + interests_arts (arrays of objects) ─────────
  {
    const { value, changed } = mergeInterestArray(
      opts.priorProfile.interests_sports,
      fields.interests_sports,
      'sport',
    )
    if (changed) {
      nextProfile.interests_sports = value
      diff.set.push({ field: 'interests_sports', value })
    }
  }
  {
    const { value, changed } = mergeInterestArray(
      opts.priorProfile.interests_arts,
      fields.interests_arts,
      'art',
    )
    if (changed) {
      nextProfile.interests_arts = value
      diff.set.push({ field: 'interests_arts', value })
    }
  }

  // ── nonnegotiables (string array) ─────────────────────────────────
  {
    const { value, changed } = mergeNonnegotiables(opts.priorProfile.nonnegotiables, fields.nonnegotiables)
    if (changed) {
      nextProfile.nonnegotiables = value
      diff.set.push({ field: 'nonnegotiables', value })
    }
  }

  // ── child_gender + child_year (scalar enums, no contradiction track) ──
  // rr-8-build3-sibling-gender-year (2026-05-21): these are basics-level
  // facts captured by the sibling_basics opener turn. Unlike
  // goal_orientation we don't track contradictions — a parent changing
  // "son" to "daughter" mid-interview is an explicit correction the
  // simplest interpretation of which is: trust the latest answer. The
  // values flow into children.child_profile via the existing v5 RPC, and
  // the turn + finalize routes read them with child_profile preferred
  // over parent_profiles (which carries the FIRST child's stale values).
  // Spelled out per-field (instead of a for-loop) to keep the discriminated
  // zod enum type intact across the assignment — a string-indexed loop
  // collapses to `unknown` which the strict HTTPSchema rejects.
  //
  // Chat-quality (2026-05-21, Codex advisory): the deterministic
  // parser fills LLM-null gaps for sibling basics. The LLM occasionally
  // emits null on fragment answers ("year 9", "son") because strict
  // structured output biases toward null. The parser catches those
  // unambiguous patterns deterministically — Codex's framing: "the
  // difference between 'the model should remember' and 'the product
  // definitely remembers'." LLM values ALWAYS win when non-null; the
  // parser only fills when the LLM left it blank.
  let parserResult: SiblingBasicsParseResult | null = null
  if (
    opts.currentFocus === 'sibling_basics' &&
    typeof opts.userMessage === 'string' &&
    opts.userMessage.trim().length > 0
  ) {
    parserResult = parseSiblingBasicsAnswer({
      userMessage:   opts.userMessage,
      lastNanaProse: opts.lastNanaProse ?? null,
    })
  }

  // Codex r7 P2.3: ONLY let the parser fill basics that are MISSING
  // on priorProfile. Without this gate, an off-topic mention later in
  // the interview (parent says "she sees a tutor" while answering an
  // unrelated focus) could trigger the parser to flip an already-known
  // child_gender, silently corrupting the captured profile. The LLM
  // is the canonical correction path — it has full context and can
  // distinguish a deliberate correction ("actually, daughter") from
  // an incidental pronoun. The parser ONLY fills gaps the LLM left.
  const parserGender = opts.priorProfile.child_gender == null ? (parserResult?.child_gender ?? null) : null
  const parserYear   = opts.priorProfile.child_year   == null ? (parserResult?.child_year   ?? null) : null

  const resolvedGender = fields.child_gender ?? parserGender ?? null
  const resolvedYear   = fields.child_year   ?? parserYear   ?? null

  if (resolvedGender != null && resolvedGender !== opts.priorProfile.child_gender) {
    nextProfile.child_gender = resolvedGender
    diff.set.push({ field: 'child_gender', value: resolvedGender })
  }
  if (resolvedYear != null && resolvedYear !== opts.priorProfile.child_year) {
    nextProfile.child_year = resolvedYear
    diff.set.push({ field: 'child_year', value: resolvedYear })
  }

  // ── goal_orientation (enum, contradiction-tracked) ────────────────
  // Codex r3 Q15b: track when the parent confirms the prior value so
  // pending_confirmations for that field can be cleared deterministically.
  let pendingForGoal: PendingConfirmation | null = null
  const reaffirmedFields = new Set<string>()
  if (fields.goal_orientation != null) {
    const prior    = opts.priorProfile.goal_orientation ?? null
    const incoming = fields.goal_orientation
    if (prior == null) {
      nextProfile.goal_orientation = incoming
      diff.set.push({ field: 'goal_orientation', value: incoming })
    } else if (prior === incoming) {
      // Parent re-stated the same value. Codex r3 Q5: this should
      // still advance progress (re-confirmation strengthens evidence).
      // Codex r3 Q15b: also clears any pending confirmation for this
      // field, because the parent has just chosen the prior side.
      reaffirmedFields.add('goal_orientation')
    } else if (corrections.goal_orientation === true) {
      // Parent explicitly corrected.
      nextProfile.goal_orientation = incoming
      diff.set.push({ field: 'goal_orientation', value: incoming })
    } else {
      // Implicit conflict — preserve prior, surface for confirmation.
      diff.contradicted.push({ field: 'goal_orientation', prior, incoming })
      pendingForGoal = {
        field:    'goal_orientation',
        prior,
        incoming,
        turn_at:  opts.turnAt,
      }
    }
  }

  // ── Progress merge ────────────────────────────────────────────────
  const nextProgress = mergeProgress({
    prior:            opts.priorProgress,
    payload:          opts.payload,
    diff,
    pending:          pendingForGoal,
    reaffirmedFields,
    currentFocus:     opts.currentFocus,
    turnAt:           opts.turnAt,
  })

  return { nextProfile, nextProgress, diff }
}

// Decide per-target state advancement based on which fields changed +
// the confidence the LLM assigned to each. Forward-only by construction
// via advanceState().
function mergeProgress(args: {
  prior:            BuildModeProgress
  payload:          BuildModeTurnPayload
  diff:             ProfileDiff
  pending:          PendingConfirmation | null
  reaffirmedFields: Set<string>
  // rr-8-build3-sibling-gender-year (2026-05-21): 'sibling_basics' kept
  // in the union for type-consistency with mergeBuildModeTurn caller; the
  // drill_down/other tiebreaker below never matches it so behaviour
  // is unchanged for that new value.
  currentFocus:     TargetKey | 'confirm_contradiction' | 'sibling_basics' | 'free'
  turnAt:           string
}): BuildModeProgress {
  const { prior, payload, diff, pending, reaffirmedFields, currentFocus, turnAt } = args

  const targets = { ...prior.targets }
  for (const key of TARGET_KEYS) {
    if (!targets[key]) {
      targets[key] = { state: 'missing', weight: TARGET_WEIGHTS[key] }
    }
  }

  // Refused targets win first — parent explicitly opted out of these areas.
  for (const target of payload.refused) {
    targets[target] = { state: advanceState(targets[target]!.state, 'refused'), weight: TARGET_WEIGHTS[target] }
  }

  // Per-target: collect confidence from contributing fields that
  // ACTUALLY changed (per diff) OR were re-affirmed (LLM confirmed the
  // existing value). Codex r3 Q5 + Q9: re-confirmations advance
  // progress; currentFocus advances drill_down/other when their
  // catch-all bucket has nothing else to latch onto.
  const changedFields = new Set<string>()
  for (const s of diff.set)      changedFields.add(String(s.field))
  for (const a of diff.appended) changedFields.add(String(a.field))
  const signalFields = new Set<string>()
  changedFields.forEach(f => signalFields.add(f))
  reaffirmedFields.forEach(f => signalFields.add(f))

  for (const target of TARGET_KEYS) {
    if (payload.refused.includes(target)) continue   // already handled above
    const contributing = TARGET_TO_FIELDS[target]
    let bestConfidence: 'vague' | 'inferred' | 'confirmed' | null = null
    for (const field of contributing) {
      if (!signalFields.has(String(field))) continue
      const c = payload.confidence?.[field]
      if (c == null) continue
      if (bestConfidence == null || CONFIDENCE_RANK[c] > CONFIDENCE_RANK[bestConfidence]) {
        bestConfidence = c
      }
    }
    // Codex r3 Q9: drill_down + other have no unique contributing
    // fields. When THIS target is the active focus, accept confidence
    // from ANY field touched this turn so the catch-all targets can
    // advance.
    if (bestConfidence == null && contributing.length === 0 && currentFocus === target) {
      for (const field of Object.keys(payload.fields) as Array<keyof BuildModeTurnPayload['fields']>) {
        if (!signalFields.has(String(field))) continue
        const c = payload.confidence?.[field]
        if (c == null) continue
        if (bestConfidence == null || CONFIDENCE_RANK[c] > CONFIDENCE_RANK[bestConfidence]) {
          bestConfidence = c
        }
      }
    }
    if (bestConfidence == null) continue
    const next = advanceState(targets[target]!.state, bestConfidence)
    targets[target] = { state: next, weight: TARGET_WEIGHTS[target] }
  }

  const { total, usable_total } = computeTotals(targets as Record<TargetKey, { state: ProgressState; weight: number }>)

  // Merge pending_confirmations: keep prior entries unless one of them
  // is being resolved THIS turn. Three resolution signals:
  //   1. corrections.<field> === true (parent explicitly corrected)
  //   2. parent re-stated prior value (reaffirmedFields)
  //   3. (handled by adding new pending below) implicit conflict
  const resolvedFields = new Set<string>()
  for (const [k, v] of Object.entries(payload.corrections)) {
    if (v === true) resolvedFields.add(k)
  }
  reaffirmedFields.forEach(field => resolvedFields.add(field))

  const pendingNext: PendingConfirmation[] = prior.pending_confirmations.filter(
    pc => !resolvedFields.has(pc.field),
  )
  if (pending) pendingNext.push(pending)

  return {
    targets,
    total,
    usable_total,
    mode:                  prior.mode,
    pending_confirmations: pendingNext.slice(-20),  // cap at 20 most recent
    last_updated_at:       turnAt,
  }
}
