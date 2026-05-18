// 2026-05-18 — Build 6 row-dedup followup source-grep tests.
//
// Surfaces: each "Build my comparison table now" re-click runs finalize
// fresh, so without dedup the LLM proposed near-duplicates on subsequent
// clicks ("Pastoral care and social fit" vs "Pastoral care after
// bullying"; "Maths support when behind" vs "Maths support when under
// pressure"). Filed as rr-8-build6-row-dedup in TASKS.md.
//
// Fix has two layers:
//   • Prompt layer — list the parent's existing rows + an explicit
//     dedupe rule so the LLM avoids near-duplicates by topic.
//   • Defense-in-depth filter — drop exact-name duplicates after
//     extraction in case the LLM ignores the prompt rule.
//
// Run via:
//   cd website
//   node --experimental-strip-types --test app/api/research-room/build-mode/finalize-row-dedup.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readFile(rel) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
}

const SRC = 'app/api/research-room/build-mode/finalize/route.ts'

// ── 1. Load existing rows ─────────────────────────────────────────────

test('row-dedup: finalize reads comparison_rows.row_name for this session', () => {
  const src = readFile(SRC)
  // Service-role read of active rows. session-scoped, undone_at IS NULL,
  // capped at 64 to keep the prompt under control.
  assert.match(src, /\.from\('comparison_rows'\)\s*\n\s*\.select\('row_name'\)\s*\n\s*\.eq\('session_id', body\.sessionId\)\s*\n\s*\.is\('undone_at', null\)/)
  assert.match(src, /\.limit\(64\)/)
})

test('row-dedup: best-effort — read failure falls back to empty list', () => {
  const src = readFile(SRC)
  // The catch block logs + leaves existingRowNames=[] so the LLM still
  // gets called (just without the dedupe context).
  assert.match(src, /existing rows read failed/)
  assert.match(src, /existing rows read threw/)
  assert.match(src, /let existingRowNames:\s*string\[\]\s*=\s*\[\]/)
})

// ── 2. Prompt threading ───────────────────────────────────────────────

test('row-dedup: buildFinalizeSystemPrompt accepts existingRowNames', () => {
  const src = readFile(SRC)
  // Required arg on the prompt builder signature.
  assert.match(src, /existingRowNames:\s+string\[\]/)
  // Passed from the caller.
  assert.match(src, /existingRowNames\s*\}\)/)
})

test('row-dedup: prompt lists the EXISTING COMPARISON ROWS block', () => {
  const src = readFile(SRC)
  assert.match(src, /EXISTING COMPARISON ROWS \(already in the parent's table/)
  // Empty-list branch tells the LLM this is the first finalize.
  assert.match(src, /\(none — this is the first finalize for this session\.\)/)
})

test('row-dedup: prompt has an explicit DEDUPE rule (rule 6)', () => {
  const src = readFile(SRC)
  assert.match(src, /6\. DEDUPE against EXISTING COMPARISON ROWS/)
  // Reference the exact duplicate-pair from the 2026-05-15 browser smoke
  // so a future reader can trace why this rule exists.
  assert.match(src, /Pastoral care and social fit/)
  assert.match(src, /Pastoral care after bullying/)
})

test('row-dedup: numbering renumber preserves school + general rules', () => {
  const src = readFile(SRC)
  // schoolProposals rules shifted from 6-9 to 7-10 to make room for
  // the new rowProposals dedupe rule.
  assert.match(src, /7\. slug: MUST be EXACTLY one of the OFF-SHORTLIST/)
  assert.match(src, /8\. rationale: one short sentence/)
  assert.match(src, /9\. match_signals/)
  assert.match(src, /10\. Only propose schools where/)
  // GENERAL rules shifted from 10-11 to 11-12.
  assert.match(src, /11\. Do NOT mention schools outside the shortlist/)
  assert.match(src, /12\. Return JSON matching the response_format schema/)
})

// ── 3. Defense-in-depth post-extraction filter ────────────────────────

test('row-dedup: post-extraction filter drops exact-name duplicates', () => {
  const src = readFile(SRC)
  // The filter only runs when existingRowNames has content (skip the
  // O(n) work on first finalize for a session).
  assert.match(src, /if \(existingRowNames\.length > 0\) \{/)
  // Case-insensitive trimmed comparison.
  assert.match(src, /existingRowNames\.map\(n => n\.trim\(\)\.toLowerCase\(\)\)/)
  // Drops the row when it matches; preserves rows with blank name
  // (let downstream validation surface that).
  assert.match(src, /return name === '' \|\| !existingLc\.has\(name\)/)
})

test('row-dedup: filter telemetry logs drop count for ops visibility', () => {
  const src = readFile(SRC)
  assert.match(src, /row-dedup dropped \$\{before - rowProposalsExtracted\.length\} exact-name duplicates/)
})
