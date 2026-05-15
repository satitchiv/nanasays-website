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
