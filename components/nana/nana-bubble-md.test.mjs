// Tests for parseInlineBold — markdown bold parser used by NanaBubble's
// renderMd. Drives the regex that turns `**text**` into <strong> JSX in
// every Nana chat bubble + every advisor prose paragraph.
//
// Bug history: original regex /(\*\*[^*]+\*\*)/g forbade any `*` inside
// the bold content, which broke on A-level notation like
// `**92% A-level A*-A**` (literal asterisks rendered to parents). Fixed
// to /(\*\*[^\n]+?\*\*)/g.
//
// Run:
//   cd website && node --experimental-strip-types \
//     --test components/nana/nana-bubble-md.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseInlineBold } from './nana-bubble-md.ts'

// ── The bug case (Codex/user-spotted regression) ─────────────────────

test('parseInlineBold: A-level notation A*-A renders as bold (not literal asterisks)', () => {
  const out = parseInlineBold('**92% A-level A*-A**')
  // Expect: one bold segment containing the full text including the internal `*`.
  // Original regex would have failed to match and left the asterisks visible.
  const bolds = out.filter(s => s.bold)
  assert.equal(bolds.length, 1)
  assert.equal(bolds[0].text, '92% A-level A*-A')
})

test('parseInlineBold: bold span with internal `*` works mid-sentence', () => {
  const out = parseInlineBold('Result: **A*-A standard** confirmed.')
  const bolds = out.filter(s => s.bold)
  assert.equal(bolds.length, 1)
  assert.equal(bolds[0].text, 'A*-A standard')
})

// ── Common cases ──────────────────────────────────────────────────────

test('parseInlineBold: plain text → single non-bold segment', () => {
  const out = parseInlineBold('plain text only')
  assert.equal(out.length, 1)
  assert.equal(out[0].bold, false)
  assert.equal(out[0].text, 'plain text only')
})

test('parseInlineBold: simple bold → one bold segment', () => {
  const out = parseInlineBold('**hello**')
  const bolds = out.filter(s => s.bold)
  assert.equal(bolds.length, 1)
  assert.equal(bolds[0].text, 'hello')
})

test('parseInlineBold: two bolds in one line', () => {
  const out = parseInlineBold('**A** and **B**')
  const bolds = out.filter(s => s.bold)
  assert.equal(bolds.length, 2)
  assert.equal(bolds[0].text, 'A')
  assert.equal(bolds[1].text, 'B')
})

test('parseInlineBold: bold + plain + bold preserves plain text between', () => {
  const out = parseInlineBold('**A** middle **B**')
  // segments: ['', '**A**', ' middle ', '**B**', '']
  const plains = out.filter(s => !s.bold).map(s => s.text).join('|')
  assert.match(plains, / middle /)
})

// ── Edge cases ────────────────────────────────────────────────────────

test('parseInlineBold: empty string → single empty plain segment', () => {
  const out = parseInlineBold('')
  assert.equal(out.length, 1)
  assert.equal(out[0].text, '')
  assert.equal(out[0].bold, false)
})

test('parseInlineBold: unclosed `**` → no bold, just plain text', () => {
  const out = parseInlineBold('**unclosed bold')
  const bolds = out.filter(s => s.bold)
  assert.equal(bolds.length, 0)
})

test('parseInlineBold: empty bold `**` (no content) → not treated as bold', () => {
  // p.length >= 4 guard rejects `**` (length 2) and `****` (length 4 but
  // content empty — slice would yield empty string, which is degenerate).
  const out = parseInlineBold('**')
  const bolds = out.filter(s => s.bold)
  assert.equal(bolds.length, 0)
})

test('parseInlineBold: non-greedy stops at FIRST closing **', () => {
  // Ensures `**A** plain **B**` doesn't get matched as `**A** plain **B**`
  // (one giant bold from first `**` to last `**`).
  const out = parseInlineBold('**A** plain **B**')
  const bolds = out.filter(s => s.bold)
  assert.equal(bolds.length, 2)
  assert.equal(bolds[0].text, 'A')
  assert.equal(bolds[1].text, 'B')
})

test('parseInlineBold: internal `*` in middle of sentence preserved', () => {
  // Single asterisk in plain text shouldn't be removed.
  const out = parseInlineBold('plain * text')
  assert.equal(out.length, 1)
  assert.equal(out[0].text, 'plain * text')
})

test('parseInlineBold: bold containing punctuation + symbols', () => {
  const out = parseInlineBold('**£12,500–£54,000 per year**')
  const bolds = out.filter(s => s.bold)
  assert.equal(bolds.length, 1)
  assert.equal(bolds[0].text, '£12,500–£54,000 per year')
})
