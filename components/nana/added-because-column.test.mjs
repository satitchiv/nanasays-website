// Slice 8 Build 2b (2026-05-18) — "Added because:" comparison column header.
//
// Source-grep tests covering:
//   • SchoolColumn type carries addedBecause
//   • loadSchoolColumns SELECT includes match_reasons + builds display string
//   • ComparisonView renders the line conditionally with title-attr fallback
//   • CSS class names exist
//
// Run via:
//   cd website
//   node --experimental-strip-types --test components/nana/added-because-column.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readFile(rel) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
}

// ── 1. Type ──────────────────────────────────────────────────────────

test('Build 2b: SchoolColumn type carries optional addedBecause', () => {
  const src = readFile('components/nana/comparison-placeholder.ts')
  // Optional string-or-null so the render path can skip nicely.
  assert.match(src, /addedBecause\?:\s*string \| null/)
})

// ── 2. Loader ────────────────────────────────────────────────────────

test('Build 2b: loadSchoolColumns SELECT includes match_reasons', () => {
  const src = readFile('lib/research-comparison.ts')
  assert.match(src, /\.select\('school_slug, added_at, match_reasons'\)/)
})

test('Build 2b: loader caps reasons display (4 reasons, 120 chars)', () => {
  const src = readFile('lib/research-comparison.ts')
  // Cap constants to keep the column header from overflowing on schools
  // with very long match lists.
  assert.match(src, /REASONS_DISPLAY_CAP\s*=\s*4/)
  assert.match(src, /REASONS_LENGTH_CAP\s*=\s*120/)
  // The slice + ellipsis truncate path
  assert.match(src, /slice\(0, REASONS_LENGTH_CAP - 1\)/)
})

test('Build 2b: loader is null-safe on missing/malformed match_reasons', () => {
  const src = readFile('lib/research-comparison.ts')
  // The shortlist row type marks match_reasons nullable.
  // Phase 2.8.6 (Codex r1 P2): type extended with rank_position?: unknown —
  // assert per-key rather than the exact inline shape so future extensions
  // (rules_version?, etc.) don't break this regex.
  assert.match(src, /match_reasons:\s*\{[^}]*reasons\?:\s*unknown/,
    'match_reasons inline type must declare reasons?: unknown')
  assert.match(src, /match_reasons:\s*\{[^}]*rank_position\?:\s*unknown/,
    'match_reasons inline type must declare rank_position?: unknown (Phase 2.8.6)')
  assert.match(src, /match_reasons:\s*\{[^}]*\}\s*\|\s*null/,
    'match_reasons must be `| null` (nullable column)')
  // Defensive guard against non-array reasons (legacy / malformed JSONB).
  assert.match(src, /if \(!Array\.isArray\(reasonsRaw\)\)/)
})

test('Build 2b: loader writes addedBecause onto every column', () => {
  const src = readFile('lib/research-comparison.ts')
  // Every SchoolColumn now carries addedBecause; ?? null preserves the
  // null-or-undefined invariant for the React conditional render.
  assert.match(src, /addedBecause:\s*addedBecauseBySlug\.get\(slug\)\s*\?\?\s*null/)
})

// ── 3. ComparisonView render ─────────────────────────────────────────

test('Build 2b: ComparisonView renders rr-cmp-head-reasons when addedBecause is truthy', () => {
  const src = readFile('components/nana/ComparisonView.tsx')
  // Conditional render — empty/null string is falsy and skips the line.
  assert.match(src, /\{s\.addedBecause && \(/)
  // Both the label and the text span are emitted.
  assert.match(src, /rr-cmp-head-reasons-label/)
  assert.match(src, /rr-cmp-head-reasons-text/)
  // "Added because:" is the literal label users see.
  assert.match(src, />Added because:</)
})

test('Build 2b: ComparisonView passes addedBecause through the title attr for hover-truncation', () => {
  const src = readFile('components/nana/ComparisonView.tsx')
  // The CSS clamp truncates at 2 lines; the title attr restores full
  // text on hover so parents don't lose data when it overflows.
  assert.match(src, /title=\{`Added because: \$\{s\.addedBecause\}`\}/)
})

// ── 4. CSS ───────────────────────────────────────────────────────────

test('Build 2b: CSS defines rr-cmp-head-reasons with two-line clamp', () => {
  const src = readFile('components/nana/research-room.css')
  assert.match(src, /\.rr-cmp-head-reasons \{/)
  assert.match(src, /-webkit-line-clamp:\s*2/)
  assert.match(src, /-webkit-box-orient:\s*vertical/)
})

test('Build 2b: CSS defines reasons-label + reasons-text helper classes', () => {
  const src = readFile('components/nana/research-room.css')
  assert.match(src, /\.rr-cmp-head-reasons-label \{/)
  assert.match(src, /\.rr-cmp-head-reasons-text \{/)
})
