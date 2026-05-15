// Slice 8 Build 7 — children.ts source-grep tests.
//
// Pins the funnel_state plumbing on the server-page load path
// (page.tsx → loadActiveChildren). If the SELECT loses funnel_state,
// the page can't read state and the funnel gate is dead.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./children.ts', import.meta.url), 'utf8')

test('children.ts: FunnelState type pins three legal values', () => {
  assert.match(
    src,
    /export type FunnelState\s*=\s*['"]onboarding['"]\s*\|\s*['"]interview['"]\s*\|\s*['"]comparison['"]/,
  )
})

test('children.ts: Child type includes funnel_state', () => {
  assert.match(src, /funnel_state:\s*FunnelState/)
})

test('loadActiveChildren: SELECT includes funnel_state', () => {
  assert.match(src, /\.select\([^)]*funnel_state[^)]*\)/)
})
