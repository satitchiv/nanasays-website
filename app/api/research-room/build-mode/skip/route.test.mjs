// Slice 8 Build 7 — skip route source-grep regression tests.
// Same pattern as ../finalize/route.test.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

// ── Gates ────────────────────────────────────────────────────────────

test('skip: feature flag gate', () => {
  assert.match(src, /if \(!isResearchRoomEnabled\(\)\)/)
})

test('skip: feature flag uses feature_disabled code (matches sibling routes)', () => {
  assert.match(src, /jsonError\(404,\s*'feature_disabled'/)
})

test('skip: origin allowlist gate (CSRF)', () => {
  assert.match(src, /isAllowedOrigin\(\)/)
  assert.match(src, /jsonError\(403,\s*'forbidden_origin'/)
})

test('skip: auth.getUser unauthorized gate', () => {
  assert.match(src, /supabase\.auth\.getUser\(\)/)
  assert.match(src, /if \(!user\) return jsonError\(401/)
})

test('skip: paid gate via getUnlockedUser uses payment_required code', () => {
  assert.match(src, /getUnlockedUser\(\)/)
  assert.match(src, /if \(!isPaid\) return jsonError\(402,\s*'payment_required'/)
})

test('skip: rate-limit gate reuses chat bucket', () => {
  assert.match(src, /checkRateLimit\(req,\s*'chat'\)/)
  assert.match(src, /jsonError\(429/)
})

test('skip: body validation via zod', () => {
  assert.match(src, /RequestSchema\.parse\(/)
  assert.match(src, /z\.object\(\s*\{\s*childId:\s*z\.string\(\)\.uuid\(\)/)
})

// ── State transition contract ────────────────────────────────────────

test('skip: UPDATE sets funnel_state to comparison', () => {
  assert.match(src, /funnel_state:\s*'comparison'/)
})

test('skip: UPDATE bumps updated_at', () => {
  assert.match(src, /updated_at:\s*new Date\(\)\.toISOString\(\)/)
})

test('skip: UPDATE scoped to childId AND user_id (RLS belt-and-braces)', () => {
  assert.match(src, /\.eq\(\s*'id',\s*body\.childId\s*\)/)
  assert.match(src, /\.eq\(\s*'user_id',\s*user\.id\s*\)/)
})

test('skip: 404 when no row matched', () => {
  assert.match(src, /!count \|\| count === 0/)
  assert.match(src, /jsonError\(404,\s*'child_not_found'/)
})

test('skip: idempotent — no funnel_state WHERE-clause guard anywhere', () => {
  // Per Codex r9 design lock: skip is valid from ANY state.
  assert.doesNotMatch(src, /\.eq\(\s*['"]funnel_state['"]/)
})
