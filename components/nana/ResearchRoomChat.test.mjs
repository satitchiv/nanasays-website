// Slice 8 Build 3 session 4 r9 — ResearchRoomChat source-grep tests.
//
// Codex r9 Q2 found a gap: the buildMode gate on the `+ New` button
// (commit ba72a29, r6 P1#3) had no regression test. The fix is a JSX
// guard that hides the affordance whenever Build Mode is active, so
// parents can't accidentally clear their interview thread via the
// "Start a fresh conversation" button (which would invalidate the
// chat hook's session and wedge the Build Mode turn route at the
// `sessionId: uuid` validator).
//
// Pattern matches the existing source-grep tests under
// app/api/research-room/build-mode/{turn,finalize}/route.test.mjs.
//
// Run via:
//   node --experimental-strip-types --test \
//     components/nana/ResearchRoomChat.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./ResearchRoomChat.tsx', import.meta.url), 'utf8')

// ── +New button buildMode gate (Codex r6 P1#3) ───────────────────────

test('+New button render is gated on `!buildMode` to prevent session-clear during interview', () => {
  // The guard lives just before the <button className="rr-chat-new-btn"
  // …> element. Removing the !buildMode clause would let parents start
  // a fresh conversation mid-interview, which clears chat.session via
  // startNewConversation() — and the next Build Mode turn would fail
  // the sessionId.uuid validation server-side.
  assert.match(src, /\(messages\.length > 0 \|\| isStreaming\) && !buildMode &&/)
})

test('+New button source comment cites the Codex r6 P1#3 rationale', () => {
  // Catches a future cleanup that strips the explanatory comment and
  // leaves the guard ambiguous — Codex r6 P1#3 was the specific
  // finding that prompted the guard; preserving the citation in-file
  // ensures the next refactorer doesn't remove it as dead code.
  assert.match(src, /Codex r6 P1[\s\S]{0,80}startNewConversation/)
})

// ── Build Mode UI invariants surfaced during session 4 ───────────────

test('BuildModeProgressBar mounted whenever buildMode === true with synthetic fallback state', () => {
  // Slice 8 Build 7 Phase C followup #4 — bar stays hidden outside Build
  // Mode but no longer requires a real progress event. Children with
  // prior regular chat and zero Build Mode turns get the synthetic 0%
  // state instead of a silent toggle.
  assert.match(src, /\{buildMode && \(\s*<BuildModeProgressBar/)
  assert.match(src, /state=\{buildModeState \?\? SYNTH_EMPTY_BUILD_MODE_STATE\}/)
  assert.doesNotMatch(src, /buildMode && buildModeState && \(\s*<BuildModeProgressBar/)
})

test('Skip Build Mode link gated on buildMode + onSkipBuildMode + !isStreaming', () => {
  // Three conditions in the one render guard:
  //   • buildMode             — only visible while interview is active
  //   • !isStreaming          — don't let parents bail mid-LLM-call
  //   • onSkipBuildMode       — defensive — render only if parent wired it
  // A drop of any of these would surface as a UX regression (button
  // present when it shouldn't be / disabled state out of sync).
  assert.match(src, /buildMode && !isStreaming && onSkipBuildMode && \(\s*\/\//)
})

test('Phase D: Build Mode opener leads with the blurb-first "tell me about your child" framing', () => {
  // Phase D (2026-05-15) replaces the old "what's the one thing that
  // matters most" single-question opener with a holistic-dump invitation.
  // Catches accidental reverts to the old framing. Codex r1 GREEN on
  // minimal frontend-only scope; backend "intake" focus mode deferred
  // unless smoke shows turn-1 feels jarring.
  assert.match(src, /Tell me about your child first/)
  assert.ok(
    !/what.s the one thing that matters most/i.test(src),
    'old single-question opener must not regress',
  )
})

test('Build Mode opener bubble branches on buildMode AND empty thread', () => {
  // The opener replaces the "Ask Nana anything…" fallback when
  // buildMode is on AND the parent hasn't sent any messages yet.
  // Both conditions are required — Build Mode mid-conversation
  // should NOT re-show the opener.
  assert.match(src, /messages\.length === 0 && !isStreaming && \(/)
  assert.match(src, /\{buildMode \? \(/)
})

// ── Endpoint routing (Build Mode vs regular) ─────────────────────────

test('chatEndpoint switches by buildMode at every render (ref-based)', () => {
  // useNanaChat's `endpointRef.current` is reassigned during render
  // (not via useEffect) so ask() picks up the latest endpoint on
  // every submit. If this were captured at hook-init time, toggling
  // Build Mode wouldn't route subsequent turns to the new endpoint.
  assert.match(src, /const chatEndpoint = buildMode\s*\?\s*'\/api\/research-room\/build-mode\/turn'\s*:\s*'\/api\/nana-research'/)
})

test('Finalize CTA wired to endpointOverride at /api/research-room/build-mode/finalize', () => {
  // handleBuildTableNow toggles Build Mode off and asks via the
  // finalize endpoint in the SAME handler. The endpointOverride
  // mechanism (use-nana-chat.ts) makes this race-safe — see Codex
  // r9 Q5 for the synchronous-read rationale.
  assert.match(src, /endpointOverride:\s*'\/api\/research-room\/build-mode\/finalize'/)
})

// ── Bug 1 fix: hydrate Build Mode state from DB on re-entry ──────────

test('Bug1: initialBuildModeState prop accepted + forwarded to useNanaChat', () => {
  // Browser smoke 2026-05-16 step 6: progress bar didn't render on
  // Build Mode toggle-on with prior progress in DB — because the
  // bar requires buildModeState which only populated after a new
  // SSE event. The fix threads `initialBuildModeState` from page.tsx
  // through ResearchRoom → ResearchRoomChat → useNanaChat so the
  // bar paints on mount with the saved state.
  assert.match(src, /initialBuildModeState\?:.*BuildModeStreamState \| null/)
  assert.match(src, /useNanaChat\(\{[\s\S]*?initialBuildModeState/)
})

// ── Welcome-back design pass (Codex review iteration) ───────────────

test('WelcomeBack: reads LIVE state via chat.buildModeState (not stale initial)', () => {
  // Browser smoke 2026-05-16 surfaced that the bubble was hardcoded to
  // `initialBuildModeState.progress.usable_total` — frozen at page
  // load. After parents answered turns the live `chat.buildModeState`
  // updated but the bubble stayed at the SSR-captured %. Codex Q1
  // confirmed chat.buildModeState is the right read (seeded from
  // initial, updated via SSE).
  assert.match(src, /chat\.buildModeState\.progress\?\.usable_total/)
  // Ensure the old stale reference is gone — accidentally restoring it
  // would silently re-introduce the smoke bug.
  assert.doesNotMatch(src, /initialBuildModeState\.progress\?\.usable_total/)
})

test('WelcomeBack: visibility gated on showWelcomeBack prop (lifted to parent)', () => {
  // Codex Q8 — dismiss-state lives in ResearchRoomChat (not ChatBody)
  // because ChatBody mounts separately for desktop vs mobile.
  assert.match(src, /showWelcomeBack:\s+boolean/)
  assert.match(src, /onDismissWelcomeBack:\s+\(\)\s*=>\s*void/)
  assert.match(src, /\{showWelcomeBack && chat\.buildModeState && \(/)
})

test('WelcomeBack: dismiss button has aria-label + onClick to onDismissWelcomeBack', () => {
  // Codex Q5 — accessibility.
  assert.match(src, /aria-label="Dismiss welcome back message"/)
  assert.match(src, /onClick=\{onDismissWelcomeBack\}/)
})

test('WelcomeBack: bubble has role=status + aria-live=polite', () => {
  // Codex Q5 — SR announcement on appearance.
  assert.match(src, /role="status"/)
  assert.match(src, /aria-live="polite"/)
})

test('WelcomeBack: bubble lives OUTSIDE rr-thread (anti-scroll-off-screen)', () => {
  // Codex Q6 — static descendant check. The v1–v3 bug was rendering
  // INSIDE rr-thread where auto-scroll hid it. Pinned bubble must
  // come BEFORE the rr-thread opening tag in source order.
  const pinnedIdx = src.indexOf('rr-bubble-nana--pinned')
  const threadIdx = src.indexOf('<div className="rr-thread">')
  assert.ok(pinnedIdx > 0, 'pinned bubble must exist')
  assert.ok(threadIdx > 0, 'rr-thread div must exist')
  assert.ok(pinnedIdx < threadIdx, 'pinned bubble must render before rr-thread')
})

test('WelcomeBack: ResearchRoomChat owns dismiss-state lifecycle', () => {
  // Codex Q8 — useState + useRef + useEffect for reset-on-toggle-on
  // and auto-dismiss-on-submit must be in ResearchRoomChat outer
  // scope, not inside ChatBody.
  assert.match(src, /const \[welcomeBackDismissed, setWelcomeBackDismissed\] = useState\(false\)/)
  assert.match(src, /submitSeqAtToggleRef = useRef/)
})

test('WelcomeBack Q2: dismiss tied to chat.submitSeq (not messages.length)', () => {
  // Codex Q2 — using messages.length would let failed/aborted turns
  // resurrect the bubble (messages only grows on `final`). submitSeq
  // increments at the start of every accepted ask().
  assert.match(src, /chat\.submitSeq > submitSeqAtToggleRef\.current/)
})

test('Build Mode toggle disabled while streaming (Codex Q8b)', () => {
  // Toggling mid-stream creates confusing entry/reset timing.
  // Slice 8 Build 7 Phase C r1 P1 #1 — disabled expression also includes
  // fullscreenBuildMode now, so match for chat.isStreaming somewhere in
  // the disabled prop value rather than the exact prior shape.
  assert.match(src, /disabled=\{[^}]*chat\.isStreaming[^}]*\}/)
})

// ── Slice 8 Build 7 Phase C — fullscreen mode regression tests ──
//
// Phase C wraps the chat in a fullscreen pinned-to-viewport variant when
// the active child's funnel_state is 'interview'. Catches prop wiring,
// toggle disable, wrap-up bubble gate, bar CTA suppression, mobile +
// desktop chrome suppression, focus-effect shape, build-table-now exit.
// Codex rounds 1-5 trail: YELLOW → YELLOW → YELLOW → YELLOW → GREEN.

test('Phase C: accepts fullscreenBuildMode + onExitInterview props', () => {
  assert.ok(/fullscreenBuildMode\?:\s*boolean/.test(src), 'expected fullscreenBuildMode?: boolean in Props')
  assert.ok(/onExitInterview\?:\s*\(\s*\)\s*=>\s*void/.test(src), 'expected onExitInterview?: () => void in Props')
})

test('Phase C: ChatBody receives fullscreenBuildMode prop', () => {
  const chatBodyParamMatch = src.match(/function ChatBody\(\{[\s\S]*?\}:\s*\{[\s\S]*?\}\)/m)
  assert.ok(chatBodyParamMatch, 'expected to find ChatBody function with param destructure')
  assert.ok(
    /fullscreenBuildMode:\s*boolean/.test(chatBodyParamMatch[0]),
    'ChatBody param type must include fullscreenBuildMode: boolean',
  )
})

test('Phase C: Build Mode toggle is disabled when fullscreen', () => {
  // r1 P1 #1: toggle stays clickable would foot-gun; disable in fullscreen.
  assert.ok(
    /disabled=\{[^}]*fullscreenBuildMode/.test(src),
    'rr-build-toggle must include fullscreenBuildMode in disabled condition',
  )
})

test('Phase C: handleBuildTableNow calls onExitInterview (not onToggleBuildMode)', () => {
  assert.ok(
    /handleBuildTableNow\s*=\s*\(\s*\)\s*=>\s*\{[\s\S]*?onExitInterview\?\.\(\s*\)/m.test(src),
    'handleBuildTableNow must call onExitInterview?.()',
  )
  const handlerMatch = src.match(/const handleBuildTableNow\s*=\s*\(\s*\)\s*=>\s*\{[\s\S]*?\n  \}/m)
  if (handlerMatch) {
    assert.ok(
      !/onToggleBuildMode\(/.test(handlerMatch[0]),
      'handleBuildTableNow must NOT call onToggleBuildMode (r1 P1 #1)',
    )
  }
})

test('Phase C followup #2: onTableBuilt is declared as optional prop', () => {
  // Outer ResearchRoomChat Props must expose onTableBuilt alongside
  // onExitInterview so ResearchRoom can wire its tab routing.
  assert.ok(
    /onTableBuilt\?:\s*\(\s*\)\s*=>\s*void/.test(src),
    'Props must declare onTableBuilt?: () => void',
  )
})

test('Phase C followup #4: SYNTH_EMPTY_BUILD_MODE_STATE declared with usable_total=0 and focus=free', () => {
  // Module-level constant the bar falls back to when buildModeState is
  // null. Pin its key fields so a future contributor can't accidentally
  // ship a non-zero default that would visually mislead the parent.
  assert.match(
    src,
    /const SYNTH_EMPTY_BUILD_MODE_STATE[\s\S]*?usable_total:\s*0/m,
    'must declare SYNTH_EMPTY_BUILD_MODE_STATE with usable_total: 0',
  )
  assert.match(
    src,
    /SYNTH_EMPTY_BUILD_MODE_STATE[\s\S]*?focus:\s*['"]free['"]/m,
    "synth state focus must be 'free' so heading reads 'Nana is following your lead'",
  )
  assert.match(
    src,
    /SYNTH_EMPTY_BUILD_MODE_STATE[\s\S]*?mode:\s*['"]minimal['"]/m,
    "synth state mode must be 'minimal' to mirror server's emptyProgress('minimal')",
  )
})

test('Phase C followup #4: fresh-start bubble fires on non-empty thread without progress', () => {
  // Disjoint from welcome-back via !buildModeState, and disjoint from
  // empty-thread welcome via messages.length > 0. Pinned outside rr-thread
  // so it doesn't pretend to be a retroactive chat message.
  assert.match(
    src,
    /\{\s*buildMode\s*&&\s*!buildModeState\s*&&\s*messages\.length\s*>\s*0\s*&&\s*!isStreaming\s*&&\s*\(/m,
    'fresh-start bubble must gate on `buildMode && !buildModeState && messages.length > 0 && !isStreaming`',
  )
})

test('Phase C followup #4: fresh-start bubble copy + pinned class', () => {
  // Copy includes the "Build Mode" framing + the Skip affordance pointer
  // so the parent knows their out. Pinned outside rr-thread (mirrors v4
  // welcome-back) so it doesn't read as a retroactive chat message.
  const freshBlock = src.match(/!buildModeState\s*&&\s*messages\.length\s*>\s*0[\s\S]*?<\/div>\s*\)\s*\}/m)
  assert.ok(freshBlock, 'expected to find fresh-start bubble block')
  // Wider gap allows for HTML-encoded apostrophe (&rsquo; = 7 chars).
  assert.match(freshBlock[0], /You.{0,15}re in Build Mode/, "copy must include \"You're in Build Mode\"")
  assert.match(freshBlock[0], /Skip Build Mode/, 'copy must mention the Skip affordance')
  assert.match(freshBlock[0], /rr-bubble-nana--pinned/, 'fresh-start bubble must use the pinned class (outside rr-thread)')
})

test('Phase C followup #2: handleBuildTableNow fires onTableBuilt between exitInterview and chat.ask', () => {
  const handlerMatch = src.match(/const handleBuildTableNow\s*=\s*\(\s*\)\s*=>\s*\{[\s\S]*?\n  \}/m)
  assert.ok(handlerMatch, 'expected to find handleBuildTableNow handler block')
  const body = handlerMatch[0]

  const exitIdx       = body.search(/onExitInterview\?\.\(\s*\)/)
  const tableBuiltIdx = body.search(/onTableBuilt\?\.\(\s*\)/)
  // Match the literal invocation, not the prose mention in adjacent
  // comments (which reads "BEFORE chat.ask()" and would otherwise win
  // the index race against the real call site).
  const askIdx        = body.search(/void chat\.ask\(/)

  assert.ok(exitIdx >= 0,       'must call onExitInterview?.()')
  assert.ok(tableBuiltIdx >= 0, 'must call onTableBuilt?.()')
  assert.ok(askIdx >= 0,        'must call chat.ask(...)')
  assert.ok(
    exitIdx < tableBuiltIdx && tableBuiltIdx < askIdx,
    `expected order: exitInterview → onTableBuilt → chat.ask (got indices ${exitIdx}/${tableBuiltIdx}/${askIdx})`,
  )
})

test('Phase C: bar CTA is suppressed when wrap-up bubble is active', () => {
  // r1 P2 #6: BuildModeProgressBar.onBuildTableNow gated on !buildModeWrapUp.
  assert.ok(
    /onBuildTableNow=\{[^}]*buildModeWrapUp[^}]*\}/.test(src),
    'BuildModeProgressBar.onBuildTableNow must reference buildModeWrapUp',
  )
})

test('Phase C: rr-chat-head block contains a !fullscreenBuildMode guard', () => {
  // r2 P2 #6: split-out check anchored at the chat-head block.
  const headBlock = src.match(/<header className="rr-chat-head">[\s\S]*?<\/header>/m)
  assert.ok(headBlock, 'expected to find <header className="rr-chat-head"> block')
  assert.ok(
    /!fullscreenBuildMode\s*&&/.test(headBlock[0]),
    'rr-chat-head must contain !fullscreenBuildMode guard',
  )
})

test('Phase C: chrome guard wraps both onToggleFocus + onCollapse buttons', () => {
  const singleGuard = src.match(/!fullscreenBuildMode\s*&&\s*\(\s*<>([\s\S]*?)<\/>\s*\)/m)
  if (singleGuard) {
    assert.ok(/onToggleFocus/.test(singleGuard[1]), 'single guard region must contain onToggleFocus')
    assert.ok(/onCollapse/.test(singleGuard[1]),    'single guard region must contain onCollapse')
    return
  }
  const focusGuarded    = /!fullscreenBuildMode\s*&&[\s\S]{0,400}?onClick=\{\s*onToggleFocus/.test(src)
  const collapseGuarded = /!fullscreenBuildMode\s*&&[\s\S]{0,400}?onClick=\{\s*onCollapse/.test(src)
  assert.ok(focusGuarded,    'onToggleFocus button must sit under a !fullscreenBuildMode guard')
  assert.ok(collapseGuarded, 'onCollapse button must sit under a !fullscreenBuildMode guard')
})

test('Phase C: mobile FAB hidden in fullscreen', () => {
  assert.ok(
    /state\s*===\s*['"]closed['"]\s*&&\s*!fullscreenBuildMode/.test(src),
    'FAB render gate must include && !fullscreenBuildMode',
  )
})

test('Phase C: mobile sheet renders when fullscreen even if state is closed', () => {
  assert.ok(
    /\(state\s*!==\s*['"]closed['"]\s*\|\|\s*fullscreenBuildMode\)/.test(src),
    'mobile sheet render gate must be (state !== "closed" || fullscreenBuildMode)',
  )
})

test('Phase C: mobile scrim suppressed in fullscreen', () => {
  assert.ok(
    /!fullscreenBuildMode\s*&&\s*\(\s*<button[\s\S]*?className="rr-scrim"/m.test(src),
    'scrim must be wrapped in {!fullscreenBuildMode && (...)}',
  )
})

test('Phase C: mobile drag handle suppressed in fullscreen', () => {
  assert.ok(
    /!fullscreenBuildMode\s*&&\s*\(\s*<button[\s\S]*?className="rr-sheet-handle"/m.test(src),
    'drag handle must be wrapped in {!fullscreenBuildMode && (...)}',
  )
})

test('Phase C: wrap-up CTA bubble gated on three conditions', () => {
  assert.ok(
    /fullscreenBuildMode\s*&&\s*chat\.buildModeWrapUp\s*&&\s*!chat\.isStreaming/.test(src),
    'wrap-up bubble must be gated on fullscreenBuildMode && buildModeWrapUp && !isStreaming',
  )
})

test('Phase C v4: universal focus effect depends on [fullscreenBuildMode, state] with state guard', () => {
  // r3 P1: effect-only-on-[fullscreenBuildMode] stranded focus when state
  // was 'closed' on first fire. v4 fix: include state in deps + guard.
  assert.ok(
    /useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?fullscreenBuildMode[\s\S]*?state\s*===\s*['"]closed['"][\s\S]*?chat\.inputRef\.current\?\.focus[\s\S]*?\}\s*,\s*\[\s*fullscreenBuildMode\s*,\s*state\b/m.test(src),
    'universal focus effect must include `state === "closed"` guard AND deps starting [fullscreenBuildMode, state, ...]',
  )
})

test('Phase C: mobile focus effect retargets to chat.inputRef when fullscreen', () => {
  assert.ok(
    /useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?matchMedia[\s\S]*?fullscreenBuildMode\s*\)\s*\{[\s\S]*?chat\.inputRef\.current\?\.focus/m.test(src),
    'mobile focus effect must route fullscreen → chat.inputRef.current?.focus()',
  )
})

