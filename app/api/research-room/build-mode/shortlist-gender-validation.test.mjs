// 2026-05-18 — Source-grep tests for shortlist gender validation.
//
// Covers:
//   • Migration SQL shape (shortlist_gender_compatible + RPC patches)
//   • API route surface (rejected_gender_mismatch returns 409 with code)
//   • recommend-shortlist.ts quality knobs (min-confidence floor + bumped
//     region penalty)
//
// Run via:
//   cd website
//   node --experimental-strip-types --test app/api/research-room/build-mode/shortlist-gender-validation.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readFile(rel) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
}

const MIGRATION = '../scripts/migrations/2026-05-18-shortlist-gender-validation.sql'

// ── 1. Helper function shape ────────────────────────────────────────

test('migration: shortlist_gender_compatible(text, text) defined', () => {
  const sql = readFile(MIGRATION)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.shortlist_gender_compatible\(\s*p_child_gender\s+text,\s*p_school_gender\s+text\s*\)/)
  assert.match(sql, /RETURNS boolean/)
  assert.match(sql, /IMMUTABLE/)
})

test('migration: helper handles NULL on either side permissively', () => {
  const sql = readFile(MIGRATION)
  // NULL or empty child_gender → true (no preference)
  assert.match(sql, /WHEN p_child_gender IS NULL OR btrim\(p_child_gender\) = '' THEN true/)
  // NULL or empty school_gender → true (data unknown, don't reject)
  assert.match(sql, /WHEN p_school_gender IS NULL OR btrim\(p_school_gender\) = '' THEN true/)
})

test('migration: helper matches BOY_COMPAT / GIRL_COMPAT JS sets', () => {
  const sql = readFile(MIGRATION)
  // Boy: 5 compatible gender_split values
  assert.match(sql, /WHEN p_child_gender = 'boy' THEN[\s\S]*?ARRAY\['boys', 'boys only', 'co-ed', 'co-educational', 'mixed'\]/)
  // Girl: 5 compatible gender_split values
  assert.match(sql, /WHEN p_child_gender = 'girl' THEN[\s\S]*?ARRAY\['girls', 'girls only', 'co-ed', 'co-educational', 'mixed'\]/)
})

test('migration: helper grants execute only to authenticated', () => {
  const sql = readFile(MIGRATION)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.shortlist_gender_compatible\(text, text\) FROM PUBLIC/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.shortlist_gender_compatible\(text, text\) TO authenticated/)
})

// ── 2. confirm_add_school gender gate ───────────────────────────────

test('migration: confirm_add_school loads child_gender + school_gender_split', () => {
  const sql = readFile(MIGRATION)
  assert.match(sql, /SELECT child_profile ->> 'child_gender' INTO v_child_gender/)
  assert.match(sql, /SELECT gender_split INTO v_school_gender/)
})

test('migration: confirm_add_school returns rejected_gender_mismatch and SKIPS insert/stamp', () => {
  const sql = readFile(MIGRATION)
  // Check happens BEFORE the insert and BEFORE the stamp
  const checkIdx = sql.indexOf("IF NOT public.shortlist_gender_compatible(v_child_gender, v_school_gender) THEN")
  const insertIdx = sql.indexOf("INSERT INTO public.shortlisted_schools (user_id, school_slug, child_id)")
  const stampIdx = sql.indexOf("'kind',        'add_school',")
  assert.ok(checkIdx > 0, 'gender check present')
  assert.ok(insertIdx > checkIdx, 'INSERT comes after gender check')
  assert.ok(stampIdx > checkIdx, 'stamp comes after gender check')
  // Rejection branch returns + EXITS the function
  assert.match(sql, /RETURN QUERY SELECT v_slug, 'rejected_gender_mismatch'::text, v_session_id, v_session_child;\s*\n\s*RETURN;/)
})

// ── 3. add_school_to_shortlist gender gate ──────────────────────────

test('migration: add_school_to_shortlist loads child_gender alongside child ownership', () => {
  const sql = readFile(MIGRATION)
  assert.match(sql, /SELECT user_id, child_profile ->> 'child_gender'\s*\n\s*INTO v_child_user, v_child_gender/)
})

test('migration: add_school_to_shortlist returns rejected_gender_mismatch', () => {
  const sql = readFile(MIGRATION)
  assert.match(sql, /RETURN QUERY SELECT p_school_slug, 'rejected_gender_mismatch'::text;/)
})

// ── 4. API route surface ────────────────────────────────────────────

test('route: /api/research-room/shortlist surfaces rejected_gender_mismatch as 409', () => {
  const src = readFile('app/api/research-room/shortlist/route.ts')
  assert.match(src, /out_status === 'rejected_gender_mismatch'/)
  assert.match(src, /code: 'rejected_gender_mismatch'/)
  assert.match(src, /status: 409/)
})

test('route: /api/research-room/write-action surfaces rejected_gender_mismatch as 409', () => {
  const src = readFile('app/api/research-room/write-action/route.ts')
  assert.match(src, /out_status === 'rejected_gender_mismatch'/)
  assert.match(src, /code: 'rejected_gender_mismatch'/)
  assert.match(src, /status: 409/)
})

// ── 5. recommend-shortlist.ts quality knobs ─────────────────────────

test('recommend-shortlist: min-confidence floor (>=10 or NULL) on candidate query', () => {
  const src = readFile('lib/recommend-shortlist.ts')
  assert.match(src, /\.or\('confidence_score\.is\.null,confidence_score\.gte\.10'\)/)
})

test('recommend-shortlist: wrong-region penalty bumped to -2.0', () => {
  const src = readFile('lib/recommend-shortlist.ts')
  // Penalty subtracted from score on wrong-bucket region
  assert.match(src, /score -= 2\.0/)
  // Old -1.0 region penalty is gone (still allowed elsewhere — bound it)
  assert.doesNotMatch(src, /score -= 1\.0\s*\n\s*\}\s*\n\s*\}/)
})
