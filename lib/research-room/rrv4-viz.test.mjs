// RRV-4 (entry timeline) — pure-helper unit tests + wiring/sign-bug guards.
//
// Run via:
//   node --experimental-strip-types --test lib/research-room/rrv4-viz.test.mjs
//
// Layer 1 imports the real helpers (framework-free module, safe outside
// the server bundle, same as rrv7-viz.test.mjs). Layer 2 source-greps
// buildEntryTimelineViz in the server loader for the future-vs-past sign
// bug caught in post-build review: deciding the sign from `Math.round`ed
// months is wrong for a deadline within ~15 days of today, because
// `Math.round(-0.33)` is `-0` and `-0 >= 0` is true in JS.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { monthsBetween, captionForDated, ROLLING_CAPTION, VAGUE_CAPTION_PREFIX } from './rrv4-viz.ts'

// ─── Layer 1: date math ───────────────────────────────────────────────────

test('monthsBetween — future, past, and same-day', () => {
  assert.equal(monthsBetween('2026-07-20', '2026-11-13'), 4)   // ≈116 days
  // 10 days past rounds to 0 — but Math.round(-0.33) is the FLOAT -0, not
  // plain 0 (Object.is distinguishes them, which is exactly the trap
  // buildEntryTimelineViz avoided by not deriving the sign from this
  // value — see Layer 2 below). == 0 is true for both.
  assert.equal(monthsBetween('2026-07-20', '2026-07-10') == 0, true)
  assert.equal(monthsBetween('2026-07-20', '2026-07-20'), 0)
  assert.equal(monthsBetween('2026-07-20', '2025-11-13'), -8)
})

test('monthsBetween — the exact just-passed case that caused the sign bug', () => {
  // 10 days in the past: -10/30.44 ≈ -0.33 → Math.round(-0.33) is -0.
  // monthsBetween itself is fine (just a magnitude); the bug was deciding
  // future-vs-past FROM this rounded value in buildEntryTimelineViz — see
  // Layer 2 below for the guard that this can't regress.
  const months = monthsBetween('2026-07-20', '2026-07-10')
  assert.equal(Object.is(months, -0) || months === 0, true)
  assert.equal(months >= 0, true, 'demonstrates why sign-from-months is unsafe: this IS >= 0 despite being a past date')
})

test('captionForDated — both future and past carry the "last published" hedge', () => {
  const future = captionForDated('dated-future', 4, '13 November 2026')
  assert.match(future, /last published deadline/i)
  assert.match(future, /confirming/i)
  const past = captionForDated('dated-past', -8, '13 November 2025')
  assert.match(past, /last published deadline/i)
  assert.match(past, /worth asking/i)
  // Neither ever asserts certainty ("Closed", "you missed it").
  assert.doesNotMatch(future, /\bclosed\b/i)
  assert.doesNotMatch(past, /\bclosed\b/i)
})

test('ROLLING_CAPTION / VAGUE_CAPTION_PREFIX are non-empty, parent-facing strings', () => {
  assert.ok(ROLLING_CAPTION.length > 0)
  assert.ok(VAGUE_CAPTION_PREFIX.length > 0)
})

// ─── Layer 2: future-vs-past sign-decision guard (post-build review catch) ──

const loaderSrc = readFileSync(new URL('../research-comparison.ts', import.meta.url), 'utf8')

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} found in research-comparison.ts`)
  const next = src.indexOf('\nfunction ', start + 1)
  const nextAsync = src.indexOf('\nasync function ', start + 1)
  const candidates = [next, nextAsync].filter(i => i >= 0)
  const end = candidates.length > 0 ? Math.min(...candidates) : src.length
  return src.slice(start, end)
}

test('buildEntryTimelineViz decides future-vs-past from the ISO date compare, never from rounded months', () => {
  const body = extractFunction(loaderSrc, 'buildEntryTimelineViz')
  assert.match(body, /raw\.deadlineIso\s*>=\s*today/,
    'must compare ISO date strings directly — deciding from `months >= 0` mislabels a just-passed deadline as future (Math.round(-0.33) is -0, and -0 >= 0 is true)')
  assert.doesNotMatch(body, /months\s*>=\s*0\s*\?\s*'dated-future'/,
    'regression guard: the sign must not be re-derived from the rounded months value')
})

test('viz is assembled in loadLensRows only, never in loadVerdictRows (RRV-4 slug)', () => {
  const lens = extractFunction(loaderSrc, 'loadLensRows')
  assert.ok(/buildEntryTimelineViz/.test(lens), 'loadLensRows assembles the entry timeline')
  const verdict = extractFunction(loaderSrc, 'loadVerdictRows')
  assert.ok(!/buildEntryTimelineViz/.test(verdict), 'loadVerdictRows must never touch the entry-timeline viz')
})
