// Slice 8 Build 7 — children route source-grep tests for
// funnel_state plumbing. Same pattern as adjacent build-mode tests.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

test('children: GET SELECT includes funnel_state', () => {
  // GET returns children with funnel_state so the client can mirror
  // server state without an extra round trip.
  assert.match(src, /\.select\([^)]*funnel_state[^)]*\)/)
})

test('children: POST inserts new child with funnel_state interview', () => {
  // New children land at 'interview' — they're past onboarding by
  // the time the INSERT fires.
  assert.match(src, /funnel_state:\s*'interview'/)
})

test('children: POST always auto-sets active_child_id to new child (Phase C followup)', () => {
  // Phase C followup (browser-smoke 2026-05-15): Phase C's fullscreen
  // gate reads the active child's funnel_state. Without auto-activation
  // for 2nd/3rd/Nth children, adding a new child didn't trigger the
  // funnel — parent had to manually click "Set active". Drop the
  // isFirstChild gate so the funnel fires reliably.
  assert.ok(!/if \(isFirstChild\)/.test(src), 'isFirstChild guard must be removed')
  assert.match(src, /\.update\(\s*\{\s*active_child_id:\s*created\.id\s*\}\s*\)/)
})
