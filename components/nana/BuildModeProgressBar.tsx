'use client'

import { useEffect, useState } from 'react'
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
  // rr-8-build3-sibling-gender-year (2026-05-21): the basics-first
  // detour. The regular % is 0 at this point (no targets touched yet),
  // which made the parent think the bar was broken when they answered
  // the sibling-opener. Special head + chip strip replaces the % with
  // concrete visual feedback on which basics are still pending — see
  // the sibling_basics branch in the render below.
  sibling_basics:         'Capturing the basics first',
}

// child_profile field name → human label for the "Nana learned: …" line.
// Covers every writable field defined in BUILD_MODE_FIELD_KEYS.
//
// rr-8-build3-sibling-gender-year (Codex r5 P2.1): child_gender +
// child_year added so the "Nana learned" line never falls through to
// raw keys. They're also filtered out of `learnedFields` below since
// the chip strip is the canonical visual signal for basics capture
// — showing "Nana learned: gender, year group" alongside a chip
// transition would be redundant. The labels stay as a belt-and-braces
// safety net in case the filter is ever bypassed.
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
  child_gender:      'gender',
  child_year:        'year group',
}

// Fields whose capture is visually surfaced ELSEWHERE (the basics chip
// strip), so the "Nana learned" microcopy line should hide them. Without
// this the chip flipping ✓ + a "Nana learned: gender" line render
// together — same signal, two places.
const SUPPRESS_FROM_LEARNED = new Set(['child_gender', 'child_year'])

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
  // rr-8-build3-sibling-gender-year (2026-05-21) — INITIAL captured
  // state of the two sibling basics for THIS child, derived in
  // ResearchRoom from currentChild.child_profile. Drives the
  // chip-strip when focus === 'sibling_basics'. Live updates happen
  // via lastDiff.set inside this component — so the chips flip from
  // ⋯ to ✓ as soon as the turn route's SSE event reports the field
  // was set, without needing a router.refresh round-trip. Optional
  // for back-compat with anything that still embeds the bar bare.
  basics?: { gender: boolean; year: boolean }
}

// Brief Decision 6 — bar starts showing the "build the table now" CTA
// at 80% usable. Exposed so commits 2/3 can reference the same threshold
// in tests without duplicating the magic number.
export const BUILD_TABLE_THRESHOLD = 0.80

export default function BuildModeProgressBar({ state, onBuildTableNow, basics }: Props) {
  const { progress, focus, lastDiff } = state
  const pct = Math.round(progress.usable_total * 100)
  const ready = progress.usable_total >= BUILD_TABLE_THRESHOLD

  // rr-8-build3-sibling-gender-year (2026-05-21) — live captured state
  // for the two basics chips. Seeded from the `basics` prop
  // (currentChild.child_profile on mount) and then OR'd forward as the
  // turn route's SSE diff reports field-set events. Captured state is
  // monotonic (once true, stays true) so the chip never reverts from
  // ✓ to ⋯ during a session — matches the way the underlying RPC
  // writes child_profile via `||` merge.
  const [genderCaptured, setGenderCaptured] = useState(basics?.gender ?? false)
  const [yearCaptured,   setYearCaptured]   = useState(basics?.year   ?? false)

  // Sync from props when they change (e.g. router.refresh after a
  // sibling_basics turn lands the RPC). The `if (basics?.X)` gate
  // keeps the OR semantics — a refreshed prop with `false` doesn't
  // un-capture, because the local state may have been advanced by
  // the SSE diff faster than the server round-trip.
  useEffect(() => {
    if (basics?.gender) setGenderCaptured(true)
    if (basics?.year)   setYearCaptured(true)
  }, [basics?.gender, basics?.year])

  // Sync from SSE diff — the turn route's build_mode_progress event
  // lists which writable fields were SET this turn. When child_gender
  // or child_year shows up, flip the chip immediately so the parent
  // sees visible feedback BEFORE the next router.refresh lands the
  // updated profile from the DB.
  useEffect(() => {
    if (!lastDiff) return
    if (lastDiff.set.includes('child_gender')) setGenderCaptured(true)
    if (lastDiff.set.includes('child_year'))   setYearCaptured(true)
  }, [lastDiff])

  // "Nana learned: …" microcopy from this turn's diff. Combine
  // `set` + `appended` (both mean "new info captured"); ignore
  // contradicted/refused — those don't read as wins to the parent.
  // Codex r5 P2.1: drop child_gender + child_year because the chip
  // strip already surfaces those (showing "Nana learned: gender"
  // alongside a flipping ✓ chip would double-announce the same fact).
  const learnedFields = lastDiff
    ? Array.from(new Set([...lastDiff.set, ...lastDiff.appended]))
        .filter(f => !SUPPRESS_FROM_LEARNED.has(f))
        .map(f => FIELD_LABEL[f] ?? f)
    : []

  // rr-8-build3-sibling-gender-year (2026-05-21) — chip strip replaces
  // the % when sibling_basics is the active focus. The interview hasn't
  // started yet (pct === 0) and showing "0%" makes the bar look broken
  // to a parent who just answered a question; the chip strip shows
  // which basics are still pending + flips to ✓ as each gets captured.
  // Bar itself stays rendered at 0% so the visual real estate matches
  // the post-basics state.
  //
  // Codex r5 P2.2 — local "both captured" guard. The SSE event reports
  // `focus: turn.focus` (the focus the orchestrator just answered),
  // NOT the post-merge focus. So when the parent answers BOTH basics
  // in one turn, server still says focus='sibling_basics' until the
  // next user message arrives. Without this guard the chip strip would
  // stay visible with both chips ✓ + the head would read "Capturing
  // the basics first" — stale UI. When both chips are captured, fall
  // through to the neutral 'free' heading + show the % so the parent
  // sees the transition from basics to interview.
  const basicsComplete = genderCaptured && yearCaptured
  const inSiblingBasics = focus === 'sibling_basics' && !basicsComplete
  const displayFocus = (focus === 'sibling_basics' && basicsComplete) ? 'free' : focus
  const displayHeading = FOCUS_HEADING[displayFocus] ?? FOCUS_HEADING.free

  return (
    <div className="rr-build-progress" aria-label="Build Mode progress">
      <div className="rr-build-progress-head">
        <span className="rr-build-progress-focus">
          {ready ? 'Ready when you are' : displayHeading}
        </span>
        {inSiblingBasics ? (
          // Codex r5 P2.4 — role="status" + a visually-hidden text node
          // that updates with the captured state. Many screen-reader
          // stacks announce live-region TEXT mutations, but not
          // aria-label attribute changes — so the earlier draft was
          // not reliably accessible. role="status" carries implicit
          // aria-live="polite" and the .rr-sr-only span gives the AT
          // an actual text mutation to announce.
          <span className="rr-build-progress-basics" role="status">
            <span className="rr-sr-only">
              {`Basics captured: year group ${yearCaptured ? 'captured' : 'pending'}, gender ${genderCaptured ? 'captured' : 'pending'}.`}
            </span>
            <span className={`rr-build-progress-basic-chip${yearCaptured ? ' is-captured' : ''}`}>
              Year group <span className="rr-build-progress-basic-chip-mark" aria-hidden="true">{yearCaptured ? '✓' : '⋯'}</span>
            </span>
            <span className="rr-build-progress-basic-divider" aria-hidden="true">·</span>
            <span className={`rr-build-progress-basic-chip${genderCaptured ? ' is-captured' : ''}`}>
              Gender <span className="rr-build-progress-basic-chip-mark" aria-hidden="true">{genderCaptured ? '✓' : '⋯'}</span>
            </span>
          </span>
        ) : (
          <span className="rr-build-progress-pct" aria-live="polite">{pct}%</span>
        )}
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
