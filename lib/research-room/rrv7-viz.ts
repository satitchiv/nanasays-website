// RRV-7 (travel corridor + exam context band, 2026-07-20) — pure layout
// helpers + viz payload types, shared by the server loader
// (lib/research-comparison.ts, which assembles the payloads) and the client
// renderer (components/nana/ComparisonView.tsx, which draws them). Kept
// framework-free and side-effect-free: research-comparison.ts is
// `server-only` so the client component cannot import it, and the visible
// labels / aria sentences must come from the SAME formatters on both sides
// so they can't drift.

// ─── Payload types ──────────────────────────────────────────────────────────

// One school plotted on the Heathrow corridor. `pos` is the precomputed
// left-offset in % of the corridor's inner width — layout math runs once,
// server-side, so the client renders dumb absolute positions.
export type TravelStop = {
  slug: string
  name: string
  minutes: number
  pos: number
}

export type TravelCorridorViz = {
  kind: 'travel-corridor'
  // Sorted by minutes ascending; pos already collision-adjusted.
  stops: TravelStop[]
  // Shortlisted schools with no verified drive-time on record. Named
  // honestly in a caption — their table cells above already carry the
  // RRV-2 ladder treatment (cohort/Ask-Nana), so no extra buttons here.
  missing: string[]
}

// One school plotted on the GCSE context band. `pos` is % along the fixed
// axis; `labelBelow` alternates crowded neighbours' labels above/below the
// track so they don't overpaint each other.
export type ExamBandDot = {
  slug: string
  name: string
  pct: number
  pos: number
  labelBelow: boolean
}

export type ExamBandViz = {
  kind: 'exam-band'
  dots: ExamBandDot[]
  // Middle half (p25–p75) of verified 9–7 shares across the UK pool schools
  // we track — computed from live data at load time, never hardcoded. Null
  // when fewer than TYPICAL_MIN_SCHOOLS peers have a verified value (dots
  // still render; the range window is suppressed rather than fabricated).
  typical: { lo: number; hi: number; n: number } | null
  // Schools that publish 9–8 only (alt-band cells carry no numeric by
  // design — the 9-7 invariant): never plotted as if 9–7, named instead.
  altBand: string[]
  // Schools with no GCSE results on record at all.
  missing: string[]
}

export type RowViz = TravelCorridorViz | ExamBandViz

// ─── Axis + layout constants ────────────────────────────────────────────────

// Corridor: the LHR origin sits at ORIGIN_POS; school stops occupy
// (ORIGIN_POS, MAX_POS]. MIN_GAP keeps ~110px-wide stacked labels legible
// on the 640px-min inner strip.
export const CORRIDOR_ORIGIN_POS = 4
const CORRIDOR_MAX_POS = 94
const CORRIDOR_MIN_GAP = 11

// Exam band: fixed 20–100% axis (live 9–7 values span 29–99.2 as of the
// 2026-07-20 trace; a fixed axis keeps the band comparable across sessions).
export const BAND_AXIS_MIN = 20
export const BAND_AXIS_MAX = 100
// Neighbours closer than this (in axis %) get alternating label sides.
const BAND_LABEL_CROWD_GAP = 7
// Floor below which the typical-range window is suppressed (n=81 live
// today, so this only bites if the pool data shrinks drastically).
export const TYPICAL_MIN_SCHOOLS = 8

// ─── Formatters ─────────────────────────────────────────────────────────────

// 35 → "35m" · 105 → "1h 45m" · 120 → "2h". (Mock §7 writes "0h 35m";
// dropping the zero-hour reads better — deviation noted in the build plan.)
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

// Spoken variant for aria sentences: "35 minutes" / "1 hour 45 minutes".
export function formatMinutesSpoken(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m} minutes`
  const h = Math.floor(m / 60)
  const rem = m % 60
  const hours = `${h} ${h === 1 ? 'hour' : 'hours'}`
  return rem === 0 ? hours : `${hours} ${rem} minutes`
}

// Attach-time fallback for sessions whose seeded heathrow cell predates the
// parallel `minutes` field (reconcileSeededRows refreshes cell_data on next
// load, but the very first render after deploy may still see old rows).
// Matches exactly the numeric branch's display format in
// buildHeathrowMinutes ("${m} min").
export function parseMinutesFromDisplay(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^(\d+(?:\.\d+)?) min$/.exec(value.trim())
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

// Same idea for GCSE cells seeded before the 2026-07-16 `numeric` field
// (live trace 2026-07-20: several real sessions still carry numeric-less
// "77%" cells; the seeder's reconcile refresh runs before the loader on
// page load but is fail-soft, so the loader must not depend on it).
// Matches exactly the display format both 9–7 branches of buildGcsePct
// write ("NN%"); the caller is responsible for only using this on true
// 9–7 sources, never the 9–8 alt band.
export function parsePctFromDisplay(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^(\d+(?:\.\d+)?)%$/.exec(value.trim())
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
}

// ─── Layout math ────────────────────────────────────────────────────────────

// Positions for stops sorted by minutes ascending. Proportional to the
// slowest school, then a forward min-gap pass (a 19-min and a 25-min school
// must not overpaint), then a backward pass so the last stop never exceeds
// MAX_POS. The gap compresses when the stop count wouldn't otherwise fit
// the span (post-build review: a fixed 11% gap underflows past ~9 stops),
// so positions stay strictly increasing inside [ORIGIN, MAX] for any n —
// real shortlists are 3–6 schools, this is a degrade-gracefully guard.
export function corridorStopPositions(minutesSorted: number[]): number[] {
  const n = minutesSorted.length
  if (n === 0) return []
  const max = minutesSorted[n - 1]
  const span = CORRIDOR_MAX_POS - CORRIDOR_ORIGIN_POS
  const gap = Math.min(CORRIDOR_MIN_GAP, span / n)
  const pos = minutesSorted.map(m =>
    max > 0 ? CORRIDOR_ORIGIN_POS + (m / max) * span : CORRIDOR_MAX_POS
  )
  for (let i = 0; i < n; i++) {
    const floor = CORRIDOR_ORIGIN_POS + gap * (i + 1)
    if (pos[i] < floor) pos[i] = floor
    if (i > 0 && pos[i] < pos[i - 1] + gap) pos[i] = pos[i - 1] + gap
  }
  for (let i = n - 1; i >= 0; i--) {
    const ceil = CORRIDOR_MAX_POS - gap * (n - 1 - i)
    if (pos[i] > ceil) pos[i] = ceil
  }
  return pos
}

// Map a 9–7 share onto the fixed band axis, clamped to the axis ends.
export function bandAxisPos(pct: number): number {
  const clamped = Math.min(BAND_AXIS_MAX, Math.max(BAND_AXIS_MIN, pct))
  return ((clamped - BAND_AXIS_MIN) / (BAND_AXIS_MAX - BAND_AXIS_MIN)) * 100
}

// Label sides for dots sorted by pct ascending: default below (mock §8);
// when a dot crowds its left neighbour, flip to the opposite side of that
// neighbour so adjacent labels never share a baseline.
export function bandLabelSides(pctsSorted: number[]): boolean[] {
  const below: boolean[] = []
  for (let i = 0; i < pctsSorted.length; i++) {
    if (i === 0) {
      below.push(true)
      continue
    }
    const crowded = pctsSorted[i] - pctsSorted[i - 1] < BAND_LABEL_CROWD_GAP
    below.push(crowded ? !below[i - 1] : true)
  }
  return below
}

// Interpolated percentile (matches Postgres percentile_cont) over a
// non-empty sorted-ascending array.
export function percentileSorted(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length
  if (n === 1) return sortedAsc[0]
  const rank = p * (n - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo)
}
