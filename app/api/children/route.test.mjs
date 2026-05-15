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
