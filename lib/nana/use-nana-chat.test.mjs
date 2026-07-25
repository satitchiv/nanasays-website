// Slice 8 Build 7 Phase C — use-nana-chat hook regression tests.
//
// Source-grep tests against the hook source. A behaviour-level test would
// need react-test-renderer + a fake EventSource — too much scaffolding
// for the surface area. Source-grep catches the wiring: state declared,
// SSE case handled, reset on submit + startNewConversation, exposed on
// return type.
//
// Run via:
//   node --experimental-strip-types --test lib/nana/use-nana-chat.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./use-nana-chat.ts', import.meta.url), 'utf8')

test('Phase C: hook declares buildModeWrapUp state', () => {
  assert.ok(
    /\[\s*buildModeWrapUp\s*,\s*setBuildModeWrapUp\s*\]\s*=\s*useState\(\s*false\s*\)/.test(src),
    'expected `const [buildModeWrapUp, setBuildModeWrapUp] = useState(false)`',
  )
})

test('Phase C: hook handles build_mode_wrap_up SSE event', () => {
  assert.ok(
    /case\s+['"]build_mode_wrap_up['"]\s*:\s*\{[^}]*setBuildModeWrapUp\(\s*true\s*\)/s.test(src),
    'expected switch case for build_mode_wrap_up that calls setBuildModeWrapUp(true)',
  )
})

test('Phase C: hook exposes buildModeWrapUp on its return type', () => {
  assert.ok(
    /buildModeWrapUp\s*:\s*boolean/.test(src),
    'expected `buildModeWrapUp: boolean` in UseNanaChatReturn',
  )
})

test('Phase C: hook resets buildModeWrapUp at least twice (ask + startNewConversation)', () => {
  const resets = src.match(/setBuildModeWrapUp\(\s*false\s*\)/g) ?? []
  assert.ok(
    resets.length >= 2,
    `expected setBuildModeWrapUp(false) in ask() AND startNewConversation() (got ${resets.length} occurrence(s))`,
  )
})

test('Phase C: hook return object includes buildModeWrapUp', () => {
  // Find the return block and verify buildModeWrapUp appears.
  const returnMatch = src.match(/return\s*\{[\s\S]*?\bbuildModeWrapUp\b[\s\S]*?\}/m)
  assert.ok(returnMatch, 'hook return object must include buildModeWrapUp')
})
