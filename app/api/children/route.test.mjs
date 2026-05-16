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
  // funnel — parent had to manually click "Set active". Drop the prior
  // isFirstChild guard on the active-child auto-set so the funnel fires
  // reliably for siblings. (NB: Followup #3 later introduces a SEPARATE
  // isFirstChild gate for seed-field selection — that one is correct
  // and must stay. The grep below checks the active_child_id branch
  // specifically.)
  const activeBlock = src.match(/active_child_id:\s*created\.id[\s\S]*?\.eq\(\s*['"]id['"]\s*,\s*user\.id\s*\)/m)
  assert.ok(activeBlock, 'expected active_child_id update block')
  assert.ok(!/if \(isFirstChild\)/.test(activeBlock[0]), 'active_child_id branch must not be guarded by isFirstChild')
  assert.match(src, /\.update\(\s*\{\s*active_child_id:\s*created\.id\s*\}\s*\)/)
})

test('children: POST imports FAMILY_CONSTANT_FIELD_NAMES (Phase C followup #3)', () => {
  // Selective inheritance: sibling-create only carries 6 family-level
  // fields. The import is part of the contract — without it the
  // sibling branch silently falls back to copying everything.
  assert.match(
    src,
    /import\s*\{[^}]*FAMILY_CONSTANT_FIELD_NAMES[^}]*\}\s*from\s*['"]@\/lib\/onboarding-fields['"]/,
    'must import FAMILY_CONSTANT_FIELD_NAMES from @/lib/onboarding-fields',
  )
})

test('children: POST computes isFirstChild via all-child count (Phase C followup #3)', () => {
  // Count every existing child, including archived, so archive-only
  // accounts don't full-copy stale child-specific parent_profiles fields.
  // (Codex r1 P1: was active-only, would re-bleed after archive-only-
  // child → add new child path.)
  const probe = src.match(/const \{ count: existingChildCount[\s\S]*?const isFirstChild/m)
  assert.ok(probe, 'expected HEAD count on children before deriving isFirstChild')
  assert.match(probe[0], /from\(\s*['"]children['"]\s*\)/)
  assert.match(probe[0], /head:\s*true/)
  assert.match(probe[0], /\.eq\(\s*['"]user_id['"]\s*,\s*user\.id\s*\)/)
  assert.ok(!/\.eq\(\s*['"]is_archived['"]/.test(probe[0]), 'count must include archived children')

  // …and the derived flag.
  assert.match(src, /const isFirstChild\s*=\s*\(?[^)]*existingChildCount/)
})

test('children: POST seedFields branches on isFirstChild (Phase C followup #3)', () => {
  // First child → full ONBOARDING_FIELD_NAMES set (legacy behaviour
  // for the wizard-fresh case). Sibling → FAMILY_CONSTANT_FIELD_NAMES.
  assert.match(
    src,
    /const seedFields\s*=\s*isFirstChild\s*\?\s*ONBOARDING_FIELD_NAMES\s*:\s*FAMILY_CONSTANT_FIELD_NAMES/,
    'seedFields must use ternary on isFirstChild',
  )

  // Both the SELECT and the per-key loop must use seedFields, NOT the
  // hardcoded ONBOARDING_FIELD_NAMES.
  assert.match(
    src,
    /\.select\(\s*seedFields\.join\(', '\)\s*\)/,
    'parent_profiles SELECT must use seedFields.join',
  )
  assert.match(
    src,
    /for \(const key of seedFields\)/,
    'inheritance loop must iterate seedFields',
  )
})

test('children: POST returns 500 if seed-count probe fails (Phase C followup #3)', () => {
  // If the count probe errors, we MUST NOT fall back to either branch
  // silently — the choice is load-bearing for not-bleed correctness.
  assert.match(
    src,
    /if \(countErr\)[\s\S]*?status:\s*500/m,
    'count probe error must return 500',
  )
})
