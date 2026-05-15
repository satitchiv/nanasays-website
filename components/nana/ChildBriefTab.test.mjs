// Slice 8 Build 7 Phase C followup — ChildBriefTab source-grep tests.
//
// Created post-Phase-C-smoke (2026-05-15) when browser smoke caught that
// adding a 2nd/3rd child didn't trigger the fullscreen funnel. Root cause:
// no client-side activation after the POST, just a router.refresh which
// doesn't reset useState(initialActiveChildId) in ResearchRoom.
//
// Source-grep covers: Props prop declaration, addChild wiring to the new
// onChildAdded callback, fallback to router.refresh for back-compat.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./ChildBriefTab.tsx', import.meta.url), 'utf8')

test('Phase C followup: Props accepts onChildAdded callback', () => {
  assert.match(src, /onChildAdded\?:\s*\(\s*childId:\s*string\s*\)\s*=>\s*void/)
})

test('Phase C followup: ChildBriefTab destructures onChildAdded from props', () => {
  // Must be destructured in the function signature so addChild can close
  // over it.
  assert.ok(
    /function ChildBriefTab\(\{[\s\S]*?onChildAdded[\s\S]*?\}:\s*Props\)/m.test(src),
    'expected onChildAdded in ChildBriefTab function signature destructure',
  )
})

test('Phase C followup: addChild reads new id from json.child.id', () => {
  assert.match(src, /json\?\.child\?\.id/)
})

test('Phase C followup: addChild calls onChildAdded with new id on success', () => {
  // The handler must call onChildAdded(newId) when both newId is set AND
  // onChildAdded was provided.
  assert.ok(
    /if\s*\(\s*newId\s*&&\s*onChildAdded\s*\)\s*\{[\s\S]*?onChildAdded\(\s*newId\s*\)/m.test(src),
    'addChild must call onChildAdded(newId) inside the (newId && onChildAdded) branch',
  )
})

test('Phase C followup: addChild falls back to router.refresh when onChildAdded absent', () => {
  // Back-compat — if a future caller mounts ChildBriefTab without the
  // callback, addChild must still refresh the page so the new child is
  // at least visible (though fullscreen wouldn't fire without setState).
  assert.ok(
    /else\s*\{[\s\S]*?router\.refresh\(\s*\)/m.test(src),
    'addChild must include an `else { router.refresh() }` fallback branch',
  )
})
