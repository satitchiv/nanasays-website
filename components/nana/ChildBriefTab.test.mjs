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

test('Phase 3 sidebar: scrollIntoView with smooth behavior on activeChildId change', () => {
  // Phase 3 smoke fix #1.2 (2026-05-24): scroll now lives in a useEffect on
  // activeChildId so external child changes (top-right dropdown) also scroll.
  assert.ok(
    /scrollIntoView\(\{\s*behavior:\s*['"]smooth['"]/.test(src),
    'expected scrollIntoView with behavior: smooth (in useEffect or click handler)',
  )
})

test('Phase 3 smoke fix #1.2: useEffect watches activeChildId for scroll-on-external-change', () => {
  // The useEffect must depend on activeChildId so the top-right dropdown's
  // change triggers a scroll, not just sidebar clicks.
  assert.ok(
    /useEffect\([\s\S]*?activeChildId[\s\S]*?scrollIntoView[\s\S]*?\}\s*,\s*\[activeChildId/m.test(src),
    'expected useEffect with activeChildId in deps that calls scrollIntoView',
  )
})

test('Codex r1 #1: useEffect placed BEFORE the children.length === 0 early return', () => {
  // Rules of Hooks: hook count must be identical on every render. If the
  // useEffect sat after the early-return, adding the first child would
  // change the hook count and crash with "Rendered more hooks than during
  // the previous render."
  const effectIdx = src.indexOf('lastAutoScrolledChildId = useRef')
  const earlyReturnIdx = src.indexOf('if (children.length === 0)')
  assert.ok(effectIdx > 0 && earlyReturnIdx > 0, 'both markers must be present')
  assert.ok(
    effectIdx < earlyReturnIdx,
    `expected lastAutoScrolledChildId useRef (idx ${effectIdx}) to appear BEFORE early-return (idx ${earlyReturnIdx})`,
  )
})

test('Codex r1 #2: scroll dedupe uses lastAutoScrolledChildId ref (StrictMode-safe)', () => {
  // The brittle useRef(true)-then-flip-false pattern double-fires under
  // React 18 StrictMode. Use a "track last scrolled id" ref initialised
  // to current activeChildId — first render's ref already matches, both
  // StrictMode mounts skip.
  assert.ok(
    /lastAutoScrolledChildId\s*=\s*useRef<string \| null>\(activeChildId\)/.test(src),
    'expected lastAutoScrolledChildId = useRef<string | null>(activeChildId) (StrictMode-safe)',
  )
  assert.ok(
    /lastAutoScrolledChildId\.current\s*===\s*activeChildId[\s\S]{0,40}return/.test(src),
    'expected `if (lastAutoScrolledChildId.current === activeChildId) return` skip guard',
  )
  assert.ok(
    /lastAutoScrolledChildId\.current\s*=\s*activeChildId/.test(src),
    'expected `lastAutoScrolledChildId.current = activeChildId` AFTER successful scroll',
  )
})

test('Codex r1 #3: effect guarded by isActiveTab so hidden tabs do not scroll', () => {
  // Without this guard, switching child via the top-right dropdown while on
  // Verdict tab would scroll inside the hidden Brief panel and could leak
  // to ancestor scroll containers.
  assert.match(src, /isActiveTab\?:\s*boolean/, 'expected isActiveTab?: boolean in Props')
  assert.match(src, /isActiveTab\s*=\s*true/, 'expected isActiveTab = true default in destructure')
  assert.ok(
    /if\s*\(!isActiveTab\)\s*return/.test(src),
    'expected `if (!isActiveTab) return` early-out in the auto-scroll effect',
  )
})

test('Codex r1 #4: effect retries when anchor DOM is not yet ready', () => {
  // ChildAdded sets new activeChildId before router.refresh delivers the
  // new children prop — first render's getElementById returns null.
  // Effect must NOT update the lastScrolled ref on miss so the next render
  // (after children.length changes) re-runs the effect and retries.
  assert.ok(
    /const el = document\.getElementById\(`child-brief-\$\{activeChildId\}`\)[\s\S]{0,80}if \(!el\) return/.test(src),
    'expected null-anchor guard `if (!el) return` BEFORE the scroll + ref update',
  )
  // r2 Codex #1: activeChildIsRendered is the narrower, semantic dep —
  // flips precisely when the anchor for the current child becomes
  // available, including the same-length child-set-swap case (one
  // archived, one added) that children.length would miss.
  assert.ok(
    /\[activeChildId,\s*showSidebar,\s*isActiveTab,\s*activeChildIsRendered\]/.test(src),
    'expected activeChildIsRendered in useEffect deps so anchor-ready retry fires',
  )
  assert.ok(
    /const activeChildIsRendered\s*=\s*!!activeChildId && children\.some\(c => c\.id === activeChildId\)/.test(src),
    'expected activeChildIsRendered derivation',
  )
})

test('Codex r2 #2: onJumpToChild scrolls directly so clicking already-selected child re-jumps', () => {
  // The earlier "useEffect owns the scroll" pattern broke clicking the
  // currently-selected child (no activeChildId change → no effect fire).
  // r2 restores the inline scroll on EVERY sidebar click; the useEffect
  // covers external activeChildId changes (top-right dropdown). Both
  // paths converge on the same anchor — when both fire the second
  // smooth-scroll is a no-op.
  const m = src.match(/onJumpToChild=\{\(id\)\s*=>\s*\{([\s\S]*?)\}\}/)
  assert.ok(m, 'expected onJumpToChild={(id) => { ... }} arrow function')
  assert.match(m[1], /onActiveChildChange\?\.\(id\)/, 'expected onActiveChildChange?.(id)')
  assert.match(m[1], /scrollIntoView/, 'expected inline scrollIntoView for click-already-selected case')
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

test('Phase 3 sidebar: onJumpToChild calls onActiveChildChange (scroll handled by useEffect)', () => {
  // Smoke fix #1.2 (2026-05-24): scroll moved to useEffect on activeChildId
  // change so external dropdown changes also scroll. Sidebar click only
  // needs to call onActiveChildChange; the effect handles the rest.
  assert.ok(
    /onJumpToChild=\{\(id\)\s*=>\s*\{[\s\S]*?onActiveChildChange\?\.\(id\)/.test(src),
    'expected onActiveChildChange?.(id) in onJumpToChild handler',
  )
})
