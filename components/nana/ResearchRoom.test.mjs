// Slice 8 Build 7 Phase C — ResearchRoom gate + state regression tests.
//
// Source-grep tests against the component source. Behaviour-level tests
// would need a React test harness; source-grep catches the wiring: gate
// derivation shape, dismiss set, pruning effect, chat-open invariant,
// exit primitive, fullscreen-related prop forwarding.
//
// Run via:
//   node --experimental-strip-types --test components/nana/ResearchRoom.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./ResearchRoom.tsx', import.meta.url), 'utf8')

test('Phase C: no initialFullscreenBuildMode server prop (gate is client-derived)', () => {
  // Codex r2 P1 #2 redesign: dropped the server-side gate entirely.
  // Phase B's funnel_state threading in childSummaries is enough.
  assert.ok(
    !/initialFullscreenBuildMode/.test(src),
    'ResearchRoom must NOT accept initialFullscreenBuildMode',
  )
})

test('Phase C: derives currentChild from childSummaries + activeChildId', () => {
  assert.ok(
    /childSummaries\.find\(\s*c\s*=>\s*c\.id\s*===\s*activeChildId/.test(src),
    'expected currentChild derivation via childSummaries.find',
  )
})

test('Phase C: derives fullscreenBuildMode from funnel_state + dismissed set', () => {
  assert.ok(
    /currentChild\?\.funnel_state\s*===\s*['"]interview['"]/.test(src),
    'expected currentChild?.funnel_state === "interview" check',
  )
  assert.ok(
    /dismissedFullscreenChildIds\.has\(/.test(src),
    'expected dismissedFullscreenChildIds.has(...) check',
  )
})

test('Phase C: dismissed set is typed as ReadonlySet<string>', () => {
  // r2 P1 #1: per-child semantic via a Set rather than string | null.
  assert.ok(
    /useState<ReadonlySet<string>>/.test(src),
    'expected useState<ReadonlySet<string>> for dismissedFullscreenChildIds',
  )
})

test('Phase C: pruning effect removes ids whose funnel_state left interview', () => {
  assert.ok(
    /useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?setDismissedFullscreenChildIds\([\s\S]*?funnel_state\s*!==\s*['"]interview['"][\s\S]*?\}\s*,\s*\[\s*childSummaries\s*\]\s*\)/m.test(src),
    'expected pruning effect on [childSummaries] that drops ids whose funnel_state has left "interview"',
  )
})

test('Phase C: derives chatBuildMode = buildMode || fullscreenBuildMode', () => {
  // r2 NIT #8: renamed from effectiveBuildMode for clarity.
  assert.ok(
    /chatBuildMode\s*=\s*buildMode\s*\|\|\s*fullscreenBuildMode/.test(src),
    'expected chatBuildMode = buildMode || fullscreenBuildMode',
  )
})

test('Phase C v5: chat-open invariant deps include both fullscreenBuildMode AND chatState', () => {
  // r4 P1: the v4 effect with deps [fullscreenBuildMode] alone wouldn't
  // re-fire if Escape (or any future close path) set chatState='closed'
  // while fullscreen was still on. v5 fix: include chatState in deps.
  assert.ok(
    /useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?fullscreenBuildMode\s*&&\s*chatState\s*===\s*['"]closed['"][\s\S]*?setChatState\(\s*['"]default['"]\s*\)[\s\S]*?\}\s*,\s*\[\s*fullscreenBuildMode\s*,\s*chatState\s*\]\s*\)/m.test(src),
    'chat-open invariant must guard `fullscreenBuildMode && chatState === "closed"`, ' +
    'call setChatState("default"), and depend on [fullscreenBuildMode, chatState]',
  )
})

test('Phase C: handleExitInterview shared by Skip and Build-table-now', () => {
  // Must call setBuildMode(false) AND update the dismissed set.
  assert.ok(
    /handleExitInterview\s*=\s*\(\s*\)\s*=>\s*\{[\s\S]*?setBuildMode\(\s*false\s*\)[\s\S]*?setDismissedFullscreenChildIds/m.test(src),
    'handleExitInterview must call setBuildMode(false) AND setDismissedFullscreenChildIds(...)',
  )
})

test('Phase C: handleSkipBuildMode delegates exit to handleExitInterview', () => {
  // Skip's body calls handleExitInterview() and still fires the POST.
  assert.ok(
    /handleSkipBuildMode\s*=\s*\(\s*\)\s*=>\s*\{[\s\S]*?handleExitInterview\(\s*\)[\s\S]*?fetch\(\s*['"]\/api\/research-room\/build-mode\/skip['"]/m.test(src),
    'handleSkipBuildMode must call handleExitInterview() and POST to /skip',
  )
})

test('Phase C: shellClass appends rr-shell-fullscreen when fullscreen', () => {
  assert.ok(
    /['"]rr-shell-fullscreen['"]/.test(src),
    'shellClass derivation must include rr-shell-fullscreen modifier',
  )
})

test('Phase C: main column gets aria-hidden when fullscreen', () => {
  // r1 P2 #5: screen readers skip the hidden comparison panel.
  assert.ok(
    /aria-hidden=\{\s*fullscreenBuildMode/.test(src),
    'expected aria-hidden={fullscreenBuildMode || undefined} on .rr-main',
  )
})

test('Phase C: passes chatBuildMode + fullscreenBuildMode + onExitInterview to chat', () => {
  assert.ok(/buildMode=\{\s*chatBuildMode\s*\}/.test(src), 'passes chatBuildMode as buildMode prop')
  assert.ok(/fullscreenBuildMode=\{\s*fullscreenBuildMode\s*\}/.test(src), 'passes fullscreenBuildMode prop')
  assert.ok(/onExitInterview=\{\s*handleExitInterview\s*\}/.test(src), 'passes onExitInterview={handleExitInterview}')
})

// ── Phase C followup #2: auto-switch to Compare tab after Build-table-now ──

test('Phase C followup #2: handleTableBuilt calls handleTabClick(\'compare\')', () => {
  // Source-of-truth tab routing — must reuse handleTabClick so the mobile
  // pager scrolls alongside the chip highlight. Raw setActiveTab leaves
  // the pager visually mis-aligned.
  assert.ok(
    /const handleTableBuilt\s*=\s*\(\s*\)\s*=>\s*\{[\s\S]*?handleTabClick\(\s*['"]compare['"]\s*\)[\s\S]*?\}/m.test(src),
    'handleTableBuilt must call handleTabClick(\'compare\')',
  )
})

test('Phase C followup #2: passes onTableBuilt={handleTableBuilt} to ResearchRoomChat', () => {
  assert.ok(
    /onTableBuilt=\{\s*handleTableBuilt\s*\}/.test(src),
    'expected onTableBuilt={handleTableBuilt} in <ResearchRoomChat> JSX',
  )
})

// ── Phase C followup: auto-activate new children ──────────────────────
// Browser-smoke caught that adding 2nd/3rd child didn't trigger the
// funnel — server's POST /api/children persisted active_child_id but
// router.refresh() doesn't reset useState(initialActiveChildId). Fix:
// new handler `handleChildAdded` setActiveChildId + router.refresh.
// ChildBriefTab is wired with onChildAdded={handleChildAdded}.

test('Phase C followup: handleChildAdded setActiveChildId(newChildId) + router.refresh', () => {
  assert.ok(
    /handleChildAdded\s*=\s*\(\s*newChildId:\s*string\s*\)\s*=>\s*\{[\s\S]*?setActiveChildId\(\s*newChildId\s*\)[\s\S]*?router\.refresh\(\s*\)/m.test(src),
    'handleChildAdded must setActiveChildId(newChildId) AND call router.refresh()',
  )
})

test('Phase C followup: ChildBriefTab call wires onChildAdded={handleChildAdded}', () => {
  assert.match(src, /onChildAdded=\{\s*handleChildAdded\s*\}/)
})
