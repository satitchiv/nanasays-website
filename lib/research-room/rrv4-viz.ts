// RRV-4 (entry timeline, 2026-07-20) — pure classification + formatting
// helpers, shared by the server loader (lib/research-comparison.ts, which
// assembles the payload) and the client renderer (components/nana/
// ComparisonView.tsx). Framework-free and side-effect-free, same rule as
// rrv7-viz.ts.
//
// Deliberate deviation from mock §3 (RRV-4a audit finding, see
// docs/RESEARCH-ROOM-VISUALS-ROADMAP.md build-plan note): the mock plots
// schools on an absolute calendar axis (2024→2028, a fixed "Sept 2028
// entry" endpoint). That's not buildable honestly today — Build Mode's
// `child_year` field captures a target YEAR-GROUP ("Year 9"), never a
// calendar year or birthdate, so there is no per-family anchor for which
// September a family is actually targeting. Pre-build review (senior,
// 2026-07-20) additionally flagged that even a *relative*-to-today axis
// would imply false precision: every registration_deadline string in
// admissions_format.entry_points[] is a snapshot from ONE historical crawl,
// not a verified live status, so plotting it as a precise pixel position
// reads as more certain than the data supports. This file therefore
// classifies each school into a small set of honest STATES (no continuous
// axis, no plotted dates) — the "you are here" reference is implicit: every
// state/caption is computed relative to TODAY at render time, never baked
// in at seed time, so it can never go stale between seeds.

export type EntryTimelineState = 'rolling' | 'dated-future' | 'dated-past' | 'vague'

export type EntryTimelineEntry = {
  slug:  string
  name:  string
  state: EntryTimelineState
  // Only set for dated-future/dated-past — months between today and the
  // parsed deadline (negative if the deadline has passed). Computed live
  // by classifyMonthsAway, never persisted, so "today" is always current.
  monthsAway: number | null
  // Parent-facing one-liner. Every dated-future/dated-past caption carries
  // the "last published cycle" hedge (pre-build review must-fix #2/#4) —
  // this is never a guarantee of the family's own target cycle.
  caption: string
}

export type EntryTimelineViz = {
  kind: 'entry-timeline'
  entries: EntryTimelineEntry[]
  // Schools with no usable entry-point/deadline data at all — named
  // honestly rather than silently dropped, same convention as
  // TravelCorridorViz.missing / ExamBandViz.missing.
  missing: string[]
}

// ─── Formatting ─────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DAYS_PER_MONTH = 30.44 // average Gregorian month, matches informal "~4 months" phrasing

// Months between `today` and an ISO date (YYYY-MM-DD), rounded to the
// nearest whole month. Positive = future, negative = past. Computed at
// call time (render/load time) — never cached — so it's always accurate
// against the current date, regardless of when the underlying cell was
// last seeded.
export function monthsBetween(todayIso: string, deadlineIso: string): number {
  const today = new Date(todayIso + 'T00:00:00Z').getTime()
  const deadline = new Date(deadlineIso + 'T00:00:00Z').getTime()
  return Math.round((deadline - today) / MS_PER_DAY / DAYS_PER_MONTH)
}

// `new Date().toISOString()` equivalent, extracted so callers can pass a
// stable "today" through a render pass without re-deriving it per school.
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatMonthsAway(months: number): string {
  const abs = Math.abs(months)
  if (abs === 0) return 'this month'
  if (abs === 1) return '1 month'
  return `${abs} months`
}

// Builds the parent-facing caption for a dated state. Both future and past
// carry the same "last published cycle" hedge — a future date is just as
// unverified as a past one; only the framing differs (§ pre-build review
// must-fix #4: don't only hedge the past case).
export function captionForDated(state: 'dated-future' | 'dated-past', months: number, displayDate: string): string {
  if (state === 'dated-future') {
    return `≈ ${formatMonthsAway(months)} until ${displayDate} — last published deadline, worth confirming with the school`
  }
  return `Last published deadline (${displayDate}) was ≈ ${formatMonthsAway(months)} ago — a newer date may not be posted yet; worth asking`
}

export const ROLLING_CAPTION = 'Rolling admissions — apply any time'
export const VAGUE_CAPTION_PREFIX = 'Timing: '
