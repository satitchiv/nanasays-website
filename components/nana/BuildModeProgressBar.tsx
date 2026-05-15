'use client'

import type { BuildModeStreamState } from '@/lib/nana/types'

// Slice 8 Build 3 session 4 — Build Mode progress bar.
//
// Renders a thin segmented bar above the chat thread when Build Mode is
// active. Each of the 7 interview targets gets a segment whose width is
// proportional to its weight (sum = 1.0), filled by its progress state
// using the SAME `usable` multipliers the route reports as
// progress.usable_total. Per-segment "usable" — not "total" — because
// `total` counts refused targets as covered (1.0) while `usable` zeroes
// them; refused contributions shouldn't make the bar look fuller than
// the interview actually is for the ≥80% "build the table now" gate.
//
// MUST stay in sync with lib/server/research-room/build-mode-schemas.ts:
//   • TARGET_KEYS order + TARGET_WEIGHTS values
//   • STATE_USABLE values (mirrors ProgressStateMultipliers[s].usable)
// The schemas file owns the canonical constants + a test that enforces
// weights sum to 1.0; this file's constants are checked at runtime via
// the assertion below (one-time on module load).

// Order matches the schemas file's TARGET_KEYS array so segment order is
// deterministic and matches focus highlighting.
const TARGET_ORDER = [
  'goals',
  'interests',
  'child_wants',
  'went_wrong',
  'nonnegotiables',
  'drill_down',
  'other',
] as const

const TARGET_WEIGHTS: Record<string, number> = {
  goals:           0.25,
  interests:       0.20,
  child_wants:     0.15,
  went_wrong:      0.15,
  nonnegotiables:  0.10,
  drill_down:      0.10,
  other:           0.05,
}

// Multiplier on the segment's weight for fill width. Matches
// ProgressStateMultipliers[<state>].usable in build-mode-schemas.ts.
const STATE_USABLE: Record<string, number> = {
  missing:   0.0,
  vague:     0.2,
  inferred:  0.5,
  confirmed: 1.0,
  refused:   0.0,
}

const TARGET_LABEL: Record<string, string> = {
  goals:           'Goals',
  interests:       'Interests',
  child_wants:     'What they want',
  went_wrong:      'What didn’t work',
  nonnegotiables:  'Must-haves',
  drill_down:      'Drilling in',
  other:           'Anything else',
}

const FOCUS_HEADING: Record<string, string> = {
  goals:                  'Nana is asking about goals',
  interests:              'Nana is asking about interests',
  child_wants:            'Nana is asking what your child wants',
  went_wrong:             'Nana is asking what didn’t work before',
  nonnegotiables:         'Nana is asking about must-haves',
  drill_down:             'Nana is drilling into details',
  other:                  'Nana is asking if there’s anything else',
  confirm_contradiction:  'Nana is sorting out a small contradiction',
  free:                   'Nana is following your lead',
}

// child_profile field name → human label for the "Nana learned: …" line.
// Covers every writable field defined in BUILD_MODE_FIELD_KEYS.
const FIELD_LABEL: Record<string, string> = {
  personality_notes: 'personality',
  anchors_notes:     'anchors',
  academic_notes:    'academic profile',
  goals_notes:       'goals',
  child_wants:       'what they want',
  nonnegotiables:    'must-haves',
  goal_orientation:  'school track',
  interests_sports:  'sports interests',
  interests_arts:    'arts interests',
}

// One-time runtime check: if the weights ever drift from 1.0 the bar will
// over- or under-fill. Cheap to do on module load; surfaces in DevTools
// instead of as a silent visual bug.
if (typeof window !== 'undefined') {
  const sum = TARGET_ORDER.reduce((acc, k) => acc + (TARGET_WEIGHTS[k] ?? 0), 0)
  if (Math.abs(sum - 1) > 1e-6) {
    console.warn('[BuildModeProgressBar] TARGET_WEIGHTS drift — sum =', sum)
  }
}

type Props = {
  state: BuildModeStreamState
  // Slice 8 Build 3 session 4 — render-only callbacks. The bar surfaces
  // affordances; ResearchRoomChat owns the actual state transitions.
  // `onBuildTableNow` shows only when usable_total ≥ 0.8 (Decision 6
  // "build the table now" threshold).
  onBuildTableNow?: () => void
}

// Brief Decision 6 — bar starts showing the "build the table now" CTA
// at 80% usable. Exposed so commits 2/3 can reference the same threshold
// in tests without duplicating the magic number.
export const BUILD_TABLE_THRESHOLD = 0.80

export default function BuildModeProgressBar({ state, onBuildTableNow }: Props) {
  const { progress, focus, lastDiff } = state
  const pct = Math.round(progress.usable_total * 100)
  const ready = progress.usable_total >= BUILD_TABLE_THRESHOLD
  const heading = FOCUS_HEADING[focus] ?? FOCUS_HEADING.free

  // "Nana learned: …" microcopy from this turn's diff. Combine
  // `set` + `appended` (both mean "new info captured"); ignore
  // contradicted/refused — those don't read as wins to the parent.
  const learnedFields = lastDiff
    ? Array.from(new Set([...lastDiff.set, ...lastDiff.appended]))
        .map(f => FIELD_LABEL[f] ?? f)
    : []

  return (
    <div className="rr-build-progress" aria-label="Build Mode progress">
      <div className="rr-build-progress-head">
        <span className="rr-build-progress-focus">
          {ready ? 'Ready when you are' : heading}
        </span>
        <span className="rr-build-progress-pct" aria-live="polite">{pct}%</span>
      </div>
      {/* Single continuous fill anchored to the LEFT, like a conventional
          progress bar. Browser smoke 2026-05-16 caught the per-segment
          fill model misreading as "fill in the middle" when only an
          inner segment (e.g. interests at vague) had data: visually the
          green sliver appeared mid-bar because the first segment was
          empty. Conventional left-aligned fill matches parent intuition.
          Per-target detail still flows through the "Nana learned:" line
          below, so we don't lose granularity — just simplify the bar. */}
      <div
        className="rr-build-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        title={TARGET_ORDER.map(key => {
          const t = progress.targets[key]
          return `${TARGET_LABEL[key]}: ${t?.state ?? 'missing'}`
        }).join(' · ')}
      >
        <div
          className="rr-build-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      {learnedFields.length > 0 && (
        <div className="rr-build-progress-learned" aria-live="polite">
          Nana learned: <strong>{learnedFields.join(', ')}</strong>
        </div>
      )}
      {learnedFields.length === 0 && lastDiff && lastDiff.refused.length > 0 && (
        <div className="rr-build-progress-learned" aria-live="polite">
          Nana noted you’d rather skip those questions — moving on.
        </div>
      )}
      {ready && onBuildTableNow && (
        <button
          type="button"
          className="rr-build-progress-cta"
          onClick={onBuildTableNow}
        >
          <span className="rr-build-progress-cta-icon" aria-hidden="true">✦</span>
          <span className="rr-build-progress-cta-body">
            <span className="rr-build-progress-cta-title">Want me to build your comparison table now?</span>
            <span className="rr-build-progress-cta-sub">I’ll propose rows from what we’ve covered — you can always tell me more as we go.</span>
          </span>
          <span className="rr-build-progress-cta-arrow" aria-hidden="true">→</span>
        </button>
      )}
    </div>
  )
}
