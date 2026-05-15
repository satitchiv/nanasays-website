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

test('BuildModeProgressBar mounted only when buildMode === true && buildModeState present', () => {
  // The bar takes the latest SSE progress event from the chat hook.
  // Rendering it without buildMode would leak the bar into regular
  // chat sessions whose state.progress is stale (e.g. parent switched
  // children mid-interview).
  assert.match(src, /buildMode && buildModeState && \(\s*<BuildModeProgressBar/)
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
  assert.match(src, /disabled=\{chat\.isStreaming\}/)
})

