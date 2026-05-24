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

// ─── Phase 3 sidebar tests (Verdict v3 UX iteration, 2026-05-24) ───────────

test('Phase 3 sidebar: ChildBriefSidebar component exists', () => {
  assert.match(src, /function ChildBriefSidebar\(\{/, 'expected inner ChildBriefSidebar function')
})

test('Phase 3 sidebar: gated by 2+ children (single-child households skip)', () => {
  // showSidebar = children.length >= 2 keeps single-child households on the
  // original single-column layout (no empty rail).
  assert.ok(
    /const\s+showSidebar\s*=\s*children\.length\s*>=\s*2/.test(src),
    'expected `const showSidebar = children.length >= 2` gate',
  )
})

test('Phase 3 sidebar: layout class added conditionally when showSidebar is true', () => {
  assert.ok(
    /rr-cb-sidebar-layout has-sidebar/.test(src),
    'expected has-sidebar class to be conditionally added',
  )
})

test('Phase 3 sidebar: ChildPanel section gets id="child-brief-${id}" anchor', () => {
  assert.ok(
    /id=\{`child-brief-\$\{child\.id\}`\}/.test(src),
    'expected ChildPanel section to set id={`child-brief-${child.id}`} for sidebar scrollIntoView',
  )
})

test('Phase 3 sidebar: onJumpToChild calls scrollIntoView with smooth behavior', () => {
  assert.ok(
    /scrollIntoView\(\{\s*behavior:\s*['"]smooth['"]/.test(src),
    'expected scrollIntoView with behavior: smooth on sidebar item click',
  )
})

test('Phase 3 sidebar: archived takes precedence over funnel_state for status', () => {
  // Order matters in the chained ternary — is_archived check must come first
  // so an archived child shows as archived even if funnel_state is 'comparison'.
  assert.ok(
    /c\.is_archived\s*\?\s*['"]archived['"][\s\S]{0,300}funnel_state\s*===\s*['"]comparison['"]/.test(src),
    'expected is_archived check before funnel_state for status derivation',
  )
})

test('Phase 3 sidebar: data-initials computed from name (first 2 chars uppercase)', () => {
  // Initials drive the rail-mode rendering at 1000px viewport via CSS
  // attr(data-initials).
  assert.ok(
    /data-initials=\{initials\}/.test(src),
    'expected data-initials attribute on sidebar button for rail-mode CSS',
  )
  assert.ok(
    /split\(\/\[\\s-\]\+\/\)/.test(src),
    'expected name split on whitespace/hyphen for initials',
  )
})

test('Phase 3 sidebar: onJumpToChild also sets active child via onActiveChildChange', () => {
  // Clicking a sidebar item should both scroll AND mark the child active.
  assert.ok(
    /onActiveChildChange\?\.\(id\)[\s\S]{0,200}scrollIntoView/.test(src),
    'expected onActiveChildChange?.(id) called before scrollIntoView in jump handler',
  )
})
