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

test('route: inserts research_session_messages with kind=build_mode parsed_answer', () => {
  assert.match(src, /\.from\('research_session_messages'\)/)
  assert.match(src, /kind:\s+'build_mode'/)
})

test('route: final event carries DB-issued messageId (not null when insert succeeds)', () => {
  assert.match(src, /messageId,/)
  assert.match(src, /insertedRow\?\.id\s+\?\?\s+null/)
})

test('route: final event omits fake shareToken on insert failure (Codex r5 P1.3)', () => {
  assert.match(src, /shareToken:\s+insertError\s+\?\s+null\s+:\s+shareToken/)
})

// ── History reconstruction ───────────────────────────────────────────

test('route: history filters to kind=build_mode messages only', () => {
  assert.match(src, /\.kind === 'build_mode'/)
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
