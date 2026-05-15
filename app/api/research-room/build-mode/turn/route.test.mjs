// Slice 8 Build 3 session 3 — turn route source-grep regression tests.
//
// Why source-grep instead of integration: the route imports `next/server`,
// `@supabase/ssr`, `next/headers`, `supabaseService`, plus our own engine
// chain. A real integration test would need to mock all of those at module
// level, which Node's --test runner doesn't make easy without a separate
// harness. Source-grep tests are the pattern used elsewhere in this repo
// (lib/server/tools-ctx.test.mjs) for routes whose import graph is too
// heavy for unit-level mocking.
//
// What this DOES catch:
//   • Did I forget to add the rate limit?
//   • Did I drop one of the auth gates (feature flag / origin / paid)?
//   • Are the RPC params shaped correctly for v5 (p_targets_state,
//     p_pending) — i.e. would this code call into the old v4 signature
//     and 500 in production?
//   • Are the SSE event types emitted in the right order
//     (token → build_mode_progress → final)?
//   • Is research_session_messages.parsed_answer carrying kind:'build_mode'
//     so history reconstruction can filter cleanly?
//
// What this does NOT catch: actual runtime behaviour under load, race
// conditions, real Supabase responses, real OpenAI streaming. The engine
// layer (mergeBuildModeTurn, runInterviewTurn) has 35 unit tests for that.
//
// Run via:
//   node --experimental-strip-types --test \
//     app/api/research-room/build-mode/turn/route.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

// ── Auth gates ───────────────────────────────────────────────────────

test('route: feature flag gate', () => {
  assert.match(src, /if \(!isResearchRoomEnabled\(\)\)/)
})

test('route: origin allowlist gate', () => {
  assert.match(src, /if \(!\(await isAllowedOrigin\(\)\)\)/)
})

test('route: auth.getUser unauthorized gate', () => {
  assert.match(src, /supabase\.auth\.getUser\(\)/)
  assert.match(src, /if \(!user\) return jsonError\(401/)
})

test('route: paid gate via getUnlockedUser', () => {
  assert.match(src, /getUnlockedUser\(\)/)
  assert.match(src, /if \(!isPaid\) return jsonError\(402/)
})

test('route: Codex r5 P1.1 rate limit on chat bucket', () => {
  assert.match(src, /checkRateLimit\(req,\s*'chat'\)/)
  assert.match(src, /jsonError\(429/)
})

// ── Ownership checks ─────────────────────────────────────────────────

test('route: session-not-found 404', () => {
  assert.match(src, /'session_not_found'/)
})

test('route: session-not-owned-by-user 403', () => {
  assert.match(src, /sess\.user_id !== user\.id/)
})

test('route: child ownership check matches user id', () => {
  assert.match(src, /childRes\.data\.user_id !== user\.id/)
})

// ── Schema cap (Codex r5 P1.2) ───────────────────────────────────────

test('route: extractWritableProfile uses safeParse against HTTPSchema', () => {
  assert.match(src, /BuildModeExtractionHTTPSchema\.safeParse/)
})

test('route: WRITABLE_PROFILE_KEYS allowlist drops unknown keys', () => {
  assert.match(src, /WRITABLE_PROFILE_KEYS/)
})

// ── No Anthropic reach (CLAUDE.md hard stop) ─────────────────────────

test('route: no @anthropic-ai/sdk import (CLAUDE.md hard stop)', () => {
  // Match only an actual import — comments mentioning the package by
  // name are fine (we document WHY we don't use it).
  assert.doesNotMatch(src, /from ['"]@anthropic-ai\/sdk['"]/)
  assert.doesNotMatch(src, /require\(['"]@anthropic-ai\/sdk['"]\)/)
})

test('route: no nana-brain.js import (Codex r1 #12 — avoid Anthropic fallback)', () => {
  // Comments may mention nana-brain (documenting WHY we avoid it).
  // Only fail on an actual import statement.
  assert.doesNotMatch(src, /from ['"][^'"]*nana-brain[^'"]*['"]/)
  assert.doesNotMatch(src, /require\(['"][^'"]*nana-brain[^'"]*['"]\)/)
})

// ── v5 RPC call shape ────────────────────────────────────────────────

test('route: calls build_mode_apply_extraction RPC with v5 param names', () => {
  assert.match(src, /\.rpc\('build_mode_apply_extraction',\s*\{/)
  assert.match(src, /p_targets_state:/)
  assert.match(src, /p_pending:/)
  assert.match(src, /p_fields:\s+merge\.nextProfile/)
})

test('route: does NOT call RPC with v4 param name p_targets', () => {
  // v4 used `p_targets:`. v5 uses `p_targets_state:`. A regression here
  // would 500 at runtime against the v5 RPC.
  // We allow the substring `p_targets` to appear ONLY as a prefix to
  // p_targets_state.
  const matches = src.match(/p_targets[^_a-zA-Z]/g)
  assert.equal(matches, null, `unexpected p_targets without _state suffix: ${matches}`)
})

// ── SSE event ordering ───────────────────────────────────────────────

test('route: emits session_ready before token stream', () => {
  const sessionIdx = src.indexOf("type: 'session_ready'")
  const tokenIdx   = src.indexOf("type: 'token'")
  assert.ok(sessionIdx > 0, 'session_ready emit missing')
  assert.ok(tokenIdx > 0, 'token emit missing')
  assert.ok(sessionIdx < tokenIdx, 'session_ready must come before token')
})

test('route: emits build_mode_progress before final', () => {
  const progressIdx = src.indexOf("type:        'build_mode_progress'")
  const finalIdx    = src.indexOf("type:       'final'")
  assert.ok(progressIdx > 0, 'build_mode_progress emit missing')
  assert.ok(finalIdx > 0,    'final emit missing')
  assert.ok(progressIdx < finalIdx, 'build_mode_progress must come before final')
})

test('route: persistence_warning emitted on RPC/insert failure', () => {
  assert.match(src, /type: 'persistence_warning'/)
  assert.match(src, /code: 'apply_failed'/)
  assert.match(src, /code: 'insert_failed'/)
})

// ── Persistence shape ────────────────────────────────────────────────

test('route: inserts research_session_messages with build_mode marker on parsed_answer', () => {
  assert.match(src, /\.from\('research_session_messages'\)/)
  // Build-mode messages carry a `build_mode` sibling key on parsed_answer
  // so page.tsx's direct-map renderer treats them like regular ParsedAnswer
  // (sections.short_answer holds the prose) while the marker lets the
  // history-reconstruction filter pick them out.
  assert.match(src, /sections:\s+\{\s+short_answer:\s+proseAccum/)
  assert.match(src, /build_mode:\s+\{/)
})

test('route: final event carries DB-issued messageId (not null when insert succeeds)', () => {
  assert.match(src, /messageId,/)
  assert.match(src, /insertedRow\?\.id\s+\?\?\s+null/)
})

test('route: final event omits fake shareToken on insert failure (Codex r5 P1.3)', () => {
  assert.match(src, /shareToken:\s+insertError\s+\?\s+null\s+:\s+shareToken/)
})

// ── History reconstruction ───────────────────────────────────────────

test('route: history filters to messages with build_mode marker only', () => {
  // Filter excludes regular-chat messages so the LLM's history slot
  // stays on-topic. Renames in either direction would be a regression
  // worth flagging. Codex r6 P1: filter now also drops finalize
  // messages (build_mode.finalize === true) so the interview LLM
  // doesn't see its own table-proposal turn replayed as Q/A.
  assert.match(src, /\.build_mode\b/)
  assert.match(src, /\.finalize !== true/)
})

test('route r6: excludes finalize messages from interview history', () => {
  // The finalize endpoint writes parsed_answer.build_mode = { finalize: true, … }.
  // Without this guard, the next interview turn would replay the table-
  // proposal text as another Q/A pair and try to "extract" from it.
  assert.match(src, /finalize !== true/)
})

test('route: history HISTORY_LIMIT cap is in scope (prompt-size guard)', () => {
  assert.match(src, /HISTORY_LIMIT/)
  assert.match(src, /\.limit\(HISTORY_LIMIT\)/)
})

test('route: history flattened oldest → newest before LLM call', () => {
  // Supabase returns DESC (latest first); we must reverse() before
  // pushing to history so the LLM sees the natural order.
  assert.match(src, /\.reverse\(\)/)
})

// ── AbortController plumbing ─────────────────────────────────────────

test('route: AbortController wired to req.signal', () => {
  assert.match(src, /new AbortController\(\)/)
  assert.match(src, /req\.signal\.addEventListener\('abort'/)
})

test('route: stream cancel() aborts the LLM call', () => {
  assert.match(src, /cancel\(\)\s*\{[\s\S]*?ac\.abort\(\)/)
})

// ── DETAILED / MINIMAL detection (session 4) ─────────────────────────

test('route: DETAILED_WORD_THRESHOLD constant defined for first-turn mode detection', () => {
  // Brief Decision 6 — parents who open with a paragraph dump get
  // DETAILED mode; the threshold lives in the route so it doesn't
  // accidentally drift between detection (route) and engine pacing.
  assert.match(src, /DETAILED_WORD_THRESHOLD\s*=\s*100/)
  assert.match(src, /function countWords\(/)
})

test('route: DETAILED detection only fires on truly first turn + fresh progress', () => {
  // All four guards must be present so the mode upgrade can't fire on
  // turn 2+ (history reset between sessions) or against a session that
  // already started DETAILED.
  assert.match(src, /progress\.mode === 'minimal'/)
  assert.match(src, /progress\.usable_total === 0/)
  assert.match(src, /recentBuildModeMsgs\.length === 0/)
  assert.match(src, /countWords\(body\.question\) >= DETAILED_WORD_THRESHOLD/)
})

test('route: DETAILED upgrade mutates progress.mode immutably (new object, not in-place)', () => {
  // Use spread, not direct assignment, so a future TS refactor doesn't
  // accidentally mutate the `parsed_data` object Supabase returned.
  assert.match(src, /progress = \{ \.\.\.progress, mode: 'detailed' \}/)
})

// ── nana_chat_logs spend tracking (session 4) ────────────────────────

test('route: writes to nana_chat_logs so MC dashboard tracks Build Mode spend', () => {
  // Before session 4, Build Mode turns were invisible to Mission
  // Control's 💬 Nana Chats + 💰 Costs tabs because only message
  // history (research_session_messages) was being written. The insert
  // must use backend='build-mode' so dashboards can break it out from
  // regular Nana research chats.
  assert.match(src, /\.from\('nana_chat_logs'\)\.insert\(/)
  assert.match(src, /backend:\s+'build-mode'/)
})

test('route: nana_chat_logs insert is gated on turn.meta presence (test-mock safe)', () => {
  // runInterviewTurn's `meta` field is optional so test mocks satisfying
  // BuildModeStreamResult don't have to provide it. The route must skip
  // the log insert when meta is undefined rather than calling .then on
  // undefined.
  assert.match(src, /if \(turn\.meta\)/)
})

test('route: gpt-5.4-mini pricing matches nana-brain PRICING_PER_MTOK', () => {
  // Pricing constants are duplicated here (rather than imported from
  // nana-brain.js, which would violate the no-nana-brain-import test
  // above). If nana-brain.js's PRICING_PER_MTOK['gpt-5-4-mini'] changes,
  // this test surfaces the drift so dashboards stay honest.
  assert.match(src, /input:\s+0\.75/)
  assert.match(src, /cache_read:\s+0\.075/)
  assert.match(src, /output:\s+4\.50/)
})

// ── Slice 8 Build 7 Phase C — wrap-up emission tests ──
//
// Wrap-up is the deterministic "interview is saturated" signal. Phase C
// requires it to (a) fire when pickFocus()==='free', (b) emit AFTER the
// RPC apply so we can gate on persist success, and (c) gate on !rpcError
// so finalize doesn't run against stale profile data.

test('Phase C: emits build_mode_wrap_up SSE event when !rpcError && nextFocus === free', () => {
  const hasWrapUpEmission =
    /if\s*\(\s*!\s*rpcError\s*&&\s*nextFocus\s*===\s*['"]free['"]\s*\)\s*\{[^}]*send\(\s*\{\s*type:\s*['"]build_mode_wrap_up['"]\s*\}\s*\)/s
    .test(src)
  assert.ok(
    hasWrapUpEmission,
    'Route should emit { type: "build_mode_wrap_up" } when !rpcError && nextFocus === "free".',
  )
})

test('Phase C: wrap-up emission is placed AFTER the RPC apply', () => {
  const wrapUpIdx = src.indexOf("'build_mode_wrap_up'")
  const rpcIdx    = src.indexOf('build_mode_apply_extraction')
  assert.ok(wrapUpIdx > 0, 'expected build_mode_wrap_up send to exist')
  assert.ok(rpcIdx > 0,    'expected build_mode_apply_extraction RPC call to exist')
  assert.ok(
    wrapUpIdx > rpcIdx,
    'build_mode_wrap_up must be emitted AFTER the RPC apply so the !rpcError gate works.',
  )
})

test('Phase C: wrap-up emission references rpcError as suppression gate', () => {
  assert.ok(
    /!\s*rpcError\s*&&\s*nextFocus/.test(src),
    'wrap-up emission must include !rpcError in the if-condition',
  )
})
