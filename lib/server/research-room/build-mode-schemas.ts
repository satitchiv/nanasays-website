// Slice 8 Build 3 — single source of truth for Build Mode schemas.
//
// Two surfaces consume the extraction shape:
//   1. The LLM helper (`build-mode-llm.ts`) requires `.nullable()` because
//      OpenAI strict structured outputs rejects `.optional()` fields.
//   2. The HTTP route (`/api/research-room/build-mode/extract`) wants
//      `.optional()` PATCH semantics so partial writes don't need to send
//      every field on every turn.
//
// Codex r1 finding 8 + r2 P1: keep ONE field-defs object and derive both
// schemas from it so they can't drift. A `node --test` walks both schemas
// and asserts identical key sets + identical base types.
//
// Codex r2 finding 6: ProgressTarget shape is `{state, weight}`, not a raw
// number. `state` is enum-ish so the progress bar reflects extraction
// QUALITY, not just "did the field transition null→set". The live RPC
// (scripts/migrations/2026-05-14-build-mode-rpcs.sql:166) computes total
// as AVG of numbers — a migration in session 3 swaps that for the
// weighted-sum function below.
//
// Codex r2 finding 9: the LLM payload's inner extracted-data field is
// named `fields` (not `extraction`) to avoid the nested
// `turn.extraction.extraction.goal_orientation` chain when the Step 0.1
// helper wraps this as `{ prose, extraction }`.

import { z } from 'zod'

// ── Field definitions (single source) ────────────────────────────────

// Each entry is the BASE zod type for a writable child_profile field.
// Schemas below add .nullable() (LLM) or .optional() (HTTP) per surface.
// Caps mirror Slice 5's `propose_add_row` validator caps + the route's
// per-field 8KB guard against runaway LLM output.
//
// rr-8-build3-sibling-gender-year (2026-05-21): child_gender + child_year
// added to the allowlist so a sibling's Build Mode interview can capture
// them on the child_profile directly. Enums mirror the onboarding wizard
// values in lib/onboarding-fields.ts so the Brief tab + scorer continue
// to read a consistent vocabulary. Without these, sibling routes were
// reading gender/year from parent_profiles (the FIRST child's values),
// producing silently-wrong recommendations.
//
// wizard-inheritance-2026-05-22: boarding_pref / home_region / budget_range
// / curriculum_pref added so the turn-time LLM can capture parent
// contradictions of the 4 family-constant fields a sibling inherits from
// parent_profiles. Enums mirror lib/onboarding-fields.ts. Without these,
// Yoko (sibling) kept her inherited boarding_pref='full' / home_region=
// 'midlands' even after the parent said "no boarding, London" multiple
// times in chat. The merge layer queues a pending_confirmation when the
// LLM extracts a contradicting value with confidence='confirmed'; Nana
// then asks the parent to confirm next turn before flipping the value.
const FIELD_DEFS = {
  personality_notes: z.string().max(8000),
  anchors_notes:     z.string().max(8000),
  academic_notes:    z.string().max(8000),
  goals_notes:       z.string().max(8000),
  child_wants:       z.string().max(8000),
  nonnegotiables:    z.array(z.string().max(500)).max(20),
  goal_orientation:  z.enum(['university_track', 'discovery', 'sport_career']),
  interests_sports:  z.array(
    z.object({
      sport: z.string().min(1).max(64),
      level: z.string().min(1).max(64),
    }).strict(),
  ).max(20),
  interests_arts:    z.array(
    z.object({
      art:   z.string().min(1).max(64),
      level: z.string().min(1).max(64),
    }).strict(),
  ).max(20),
  child_gender:      z.enum(['boy', 'girl', 'either']),
  child_year:        z.enum(['year-7', 'year-9', 'year-10', 'sixth-form', 'not-sure']),
  boarding_pref:     z.enum(['full', 'weekly', 'flexi', 'day', 'open']),
  home_region:       z.enum(['anywhere', 'london', 'south-east', 'south-west', 'midlands', 'north', 'scotland-wales', 'overseas']),
  budget_range:      z.enum(['under-30k', '30k-40k', '40k-50k', 'over-50k', 'bursary']),
  curriculum_pref:   z.enum(['a-level', 'ib', 'either', 'no-preference']),
} as const

// Codex wizard-inheritance design r1: derive CorrectionsSchema and
// ConfidenceMapSchema shapes from FIELD_DEFS so they cannot silently
// drift when a new field is added. Previously both were hand-spelled
// objects — adding a key to FIELD_DEFS without remembering to update
// both companion schemas would have produced runtime parse errors at
// best, silently dropped corrections / confidence at worst.
type MirrorFieldShape<T> = { -readonly [K in keyof typeof FIELD_DEFS]: T }
function mirrorFieldShape<T>(value: T): MirrorFieldShape<T> {
  const out = {} as MirrorFieldShape<T>
  for (const k of Object.keys(FIELD_DEFS) as Array<keyof typeof FIELD_DEFS>) {
    out[k] = value
  }
  return out
}

export const BUILD_MODE_FIELD_KEYS = Object.keys(FIELD_DEFS) as readonly (keyof typeof FIELD_DEFS)[]

// ── LLM-side schema (.nullable()) ────────────────────────────────────

// OpenAI strict structured outputs REQUIRES `.nullable()`, NOT `.optional()`.
// Tests/parity-check walk this against the HTTP variant below.
export const BuildModeExtractionLLMSchema = z.object({
  personality_notes: FIELD_DEFS.personality_notes.nullable(),
  anchors_notes:     FIELD_DEFS.anchors_notes.nullable(),
  academic_notes:    FIELD_DEFS.academic_notes.nullable(),
  goals_notes:       FIELD_DEFS.goals_notes.nullable(),
  child_wants:       FIELD_DEFS.child_wants.nullable(),
  nonnegotiables:    FIELD_DEFS.nonnegotiables.nullable(),
  goal_orientation:  FIELD_DEFS.goal_orientation.nullable(),
  interests_sports:  FIELD_DEFS.interests_sports.nullable(),
  interests_arts:    FIELD_DEFS.interests_arts.nullable(),
  child_gender:      FIELD_DEFS.child_gender.nullable(),
  child_year:        FIELD_DEFS.child_year.nullable(),
  boarding_pref:     FIELD_DEFS.boarding_pref.nullable(),
  home_region:       FIELD_DEFS.home_region.nullable(),
  budget_range:      FIELD_DEFS.budget_range.nullable(),
  curriculum_pref:   FIELD_DEFS.curriculum_pref.nullable(),
}).strict()

// ── HTTP-side schema (.optional()) ───────────────────────────────────

// Route receives the MERGED desired state from the server-side caller
// (per Codex r2 R1: merge happens in the route layer, not the browser).
// Each field is `.optional()` because the merge may have nothing to write
// for fields the LLM didn't touch this turn.
export const BuildModeExtractionHTTPSchema = z.object({
  personality_notes: FIELD_DEFS.personality_notes.optional(),
  anchors_notes:     FIELD_DEFS.anchors_notes.optional(),
  academic_notes:    FIELD_DEFS.academic_notes.optional(),
  goals_notes:       FIELD_DEFS.goals_notes.optional(),
  child_wants:       FIELD_DEFS.child_wants.optional(),
  nonnegotiables:    FIELD_DEFS.nonnegotiables.optional(),
  goal_orientation:  FIELD_DEFS.goal_orientation.optional(),
  interests_sports:  FIELD_DEFS.interests_sports.optional(),
  interests_arts:    FIELD_DEFS.interests_arts.optional(),
  child_gender:      FIELD_DEFS.child_gender.optional(),
  child_year:        FIELD_DEFS.child_year.optional(),
  boarding_pref:     FIELD_DEFS.boarding_pref.optional(),
  home_region:       FIELD_DEFS.home_region.optional(),
  budget_range:      FIELD_DEFS.budget_range.optional(),
  curriculum_pref:   FIELD_DEFS.curriculum_pref.optional(),
}).strict()

export type BuildModeExtractionLLM  = z.infer<typeof BuildModeExtractionLLMSchema>
export type BuildModeExtractionHTTP = z.infer<typeof BuildModeExtractionHTTPSchema>

// ── Interview-turn payload ───────────────────────────────────────────

// The 7 interview targets the progress bar tracks. Weights MUST sum to
// 1.0 (asserted in test) so `total` stays in [0,1]. Source: brief
// Decision 6.
export const TARGET_KEYS = [
  'goals',
  'interests',
  'child_wants',
  'went_wrong',
  'nonnegotiables',
  'drill_down',
  'other',
] as const
export type TargetKey = typeof TARGET_KEYS[number]

export const TARGET_WEIGHTS: Readonly<Record<TargetKey, number>> = {
  goals:           0.25,
  interests:       0.20,
  child_wants:     0.15,
  went_wrong:      0.15,
  nonnegotiables:  0.10,
  drill_down:      0.10,
  other:           0.05,
}

const TargetKeyEnum = z.enum(TARGET_KEYS)

// Confidence states for the per-field signal the LLM reports.
// `vague`     — answer was indirect, drill-down recommended
// `inferred`  — LLM read the answer with reasonable confidence
// `confirmed` — parent said the thing directly, no ambiguity
export const ConfidenceStateEnum = z.enum(['vague', 'inferred', 'confirmed'])
export type ConfidenceState = z.infer<typeof ConfidenceStateEnum>

// Codex r3 P0: OpenAI strict structured outputs requires ALL keys
// present. `.partial().strict()` produces `additionalProperties: false`
// but ALSO marks every property optional, which `zodResponseFormat()`
// rejects with "uses `.optional()` without `.nullable()` which is not
// supported by the API". Spell every field key explicitly with a
// `.nullable()` value; null = "no signal this turn".
//
// The schema-compile smoke test in build-mode-interview.test.mjs runs
// `zodResponseFormat()` against the wrapper schema so this kind of
// regression can't ship undetected.

const ConfidenceFieldSchema = ConfidenceStateEnum.nullable()

// `corrections` is per-field, not a single boolean (Codex r2 R5). The LLM
// sets `corrections.goal_orientation = true` when the parent's wording
// indicates an explicit correction of an earlier statement. Default false
// (the LLM must emit `false` for every key — the prompt requires it).
//
// Codex wizard-inheritance r1: derived from FIELD_DEFS via mirrorFieldShape
// so a new field added to FIELD_DEFS automatically appears here. Without
// this, the hand-spelled object silently fell out of sync any time the
// extraction schema grew.
const CorrectionsSchema = z.object(mirrorFieldShape(z.boolean())).strict()

const ConfidenceMapSchema = z.object(mirrorFieldShape(ConfidenceFieldSchema)).strict()

// Top-level LLM payload. Step 0.1's helper wraps this as
// `{ prose, extraction: <this> }`, so the full server-side type is
// effectively `{ prose: string; extraction: BuildModeTurnPayload }`.
export const BuildModeTurnPayloadSchema = z.object({
  fields:      BuildModeExtractionLLMSchema,
  refused:     z.array(TargetKeyEnum).max(TARGET_KEYS.length),
  confidence:  ConfidenceMapSchema,
  corrections: CorrectionsSchema,
}).strict()

export type BuildModeTurnPayload = z.infer<typeof BuildModeTurnPayloadSchema>

// ── Progress shape ───────────────────────────────────────────────────

// Per-target state. `refused` is treated as "covered" for interview
// completion (so the bar fills) but as zero usable evidence for row
// proposals — see ProgressStateMultipliers below.
export const ProgressStateEnum = z.enum([
  'missing',
  'vague',
  'inferred',
  'confirmed',
  'refused',
])
export type ProgressState = z.infer<typeof ProgressStateEnum>

const ProgressTargetSchema = z.object({
  state:  ProgressStateEnum,
  weight: z.number().min(0).max(1),
}).strict()
export type ProgressTarget = z.infer<typeof ProgressTargetSchema>

// Codex r2 R6: pending contradictions must survive a refresh between
// turns, otherwise the confirmation prompt vanishes. Persisted under
// build_mode_progress.pending_confirmations.
export const PendingConfirmationSchema = z.object({
  field:    z.string().min(1).max(64),
  prior:    z.unknown(),
  incoming: z.unknown(),
  turn_at:  z.string().min(1).max(64),  // ISO-8601 from the producer
}).strict()
export type PendingConfirmation = z.infer<typeof PendingConfirmationSchema>

export const BuildModeProgressSchema = z.object({
  targets:               z.record(TargetKeyEnum, ProgressTargetSchema),
  total:                 z.number().min(0).max(1),
  usable_total:          z.number().min(0).max(1),
  mode:                  z.enum(['detailed', 'minimal']),
  pending_confirmations: z.array(PendingConfirmationSchema).max(20),
  last_updated_at:       z.string().min(1).max(64),
}).strict()
export type BuildModeProgress = z.infer<typeof BuildModeProgressSchema>

// ── Finalize ("Build my comparison table now") schemas ────────────────
//
// Slice 8 Build 3 session 4 — when the parent clicks the ≥80% CTA, the
// finalize route asks the LLM for 3-5 row proposals derived from the
// captured child_profile. Each proposal is the same shape as
// `ProposedAddRow` in lib/nana/types.ts, but with cell_data emitted as
// an array of {slug, value, source?, note?} entries (OpenAI strict
// structured output doesn't support z.record's `additionalProperties`
// pattern; the route converts the array → record before persisting).

// Codex r6 P1 + r7 P1 — the finalize prompt instructs the LLM that every
// cell value/source/note MUST be null (verdict prose calls out shortlist
// schools but never invents per-school facts). z.null() enforces that at
// both layers: OpenAI's zodResponseFormat() serializes it as JSON Schema
// `{ "type": "null" }` so the model is constrained AT GENERATION, and the
// final Zod parse rejects any non-null fallback. (r6 first tried
// z.literal(null), but openai@6.35's zod-to-json-schema serializes that
// as `{ "type": "object" }` — see node_modules/openai/_vendor/zod-to-json
// -schema/parsers/literal.js — so the model was being pushed toward
// objects while the parser expected null, which would have made the CTA
// silently fail extraction.)
const FinalizeCellDataItemSchema = z.object({
  slug:   z.string().min(1).max(120),
  value:  z.null(),
  source: z.null(),
  note:   z.null(),
}).strict()

export const BuildModeFinalizeProposalSchema = z.object({
  row_name:   z.string().min(1).max(60),
  // v1 forces 'child-specific' so proposals can't pollute base groups.
  group_name: z.literal('child-specific'),
  weight:     z.number().min(0).max(1).nullable(),
  rationale:  z.string().min(1).max(280),
  cell_data:  z.array(FinalizeCellDataItemSchema).min(1).max(20),
}).strict()

export const BuildModeFinalizeProposalsSchema = z.array(BuildModeFinalizeProposalSchema).max(8)

export type BuildModeFinalizeProposal = z.infer<typeof BuildModeFinalizeProposalSchema>

// Slice 8 Build 6 — school proposal emitted by Build Mode finalize.
// Codex r-merge Q1 OK: use parallel arrays in the LLM payload, then
// persist as the existing discriminated `proposed_actions` map keyed
// by shortId() in the route. Caps mirror the propose_add_school
// ProposedAction type in lib/nana/types.ts.
export const BuildModeFinalizeSchoolProposalSchema = z.object({
  slug:          z.string().min(1).max(120),
  rationale:     z.string().min(1).max(280),
  match_signals: z.array(z.string().min(1).max(48)).min(1).max(5),
}).strict()

export const BuildModeFinalizeSchoolProposalsSchema = z.array(BuildModeFinalizeSchoolProposalSchema).max(5)

export type BuildModeFinalizeSchoolProposal = z.infer<typeof BuildModeFinalizeSchoolProposalSchema>

// Codex r-merge Q1 OK + Q2 NIT: top-level LLM output is a flat object
// with three parallel fields (prose + rowProposals + schoolProposals).
// Easier for strict structured output than a discriminated union; lets
// the LLM zero out either array independently when nothing fits one
// category. The route validates rows and schools independently with
// one retry on "all school proposals filtered" (Q8 NIT).
export const BuildModeFinalizeMixedSchema = z.object({
  rowProposals:    BuildModeFinalizeProposalsSchema,
  schoolProposals: BuildModeFinalizeSchoolProposalsSchema,
}).strict()

export type BuildModeFinalizeMixed = z.infer<typeof BuildModeFinalizeMixedSchema>

// State → multiplier on the target's weight, used in totalling.
// `total`        — UX progress (refused counts as "covered")
// `usable_total` — proposal-readiness (refused gives zero evidence)
export const ProgressStateMultipliers: Readonly<Record<ProgressState, { total: number; usable: number }>> = {
  missing:   { total: 0.0, usable: 0.0 },
  vague:     { total: 0.3, usable: 0.2 },
  inferred:  { total: 0.6, usable: 0.5 },
  confirmed: { total: 1.0, usable: 1.0 },
  refused:   { total: 1.0, usable: 0.0 },
}

// ── Helpers ──────────────────────────────────────────────────────────

export function emptyProgress(mode: 'detailed' | 'minimal' = 'minimal'): BuildModeProgress {
  const targets = Object.fromEntries(
    TARGET_KEYS.map(k => [k, { state: 'missing' as ProgressState, weight: TARGET_WEIGHTS[k] }]),
  ) as Record<TargetKey, ProgressTarget>
  return {
    targets,
    total:                 0,
    usable_total:          0,
    mode,
    pending_confirmations: [],
    last_updated_at:       new Date(0).toISOString(),
  }
}

export function computeTotals(targets: Record<TargetKey, ProgressTarget>): { total: number; usable_total: number } {
  let total = 0
  let usable = 0
  for (const key of TARGET_KEYS) {
    const t = targets[key]
    if (!t) continue
    const mul = ProgressStateMultipliers[t.state]
    total  += t.weight * mul.total
    usable += t.weight * mul.usable
  }
  // Pin to [0,1] in case of floating-point drift; weights sum to 1.0 by
  // construction but Number arithmetic can produce 1.0000000002 etc.
  return {
    total:        Math.min(1, Math.max(0, total)),
    usable_total: Math.min(1, Math.max(0, usable)),
  }
}
