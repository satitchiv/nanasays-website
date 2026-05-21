// Tests for renderSubjectStrengthsLines (Recommender Phase 2 nana-brain.js).
// Covers both shapes the renderer sees in production:
//   - raw v2.0 blob (when the pack assembler hasn't projected yet — used in
//     other paths that read structured directly)
//   - projected shape from projectSubjectStrengths (top-3 buckets carry
//     summary + ≤3 items; count-only buckets carry items=[] + item_count)
//
// Run via:
//   cd website
//   node --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/nana-brain-subject-renderer.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSubjectStrengthsLines } from './nana-brain.js';
import { projectSubjectStrengths } from './subject-strengths-projection.mjs';

test('renderer returns [] for null/undefined input', () => {
  assert.deepEqual(renderSubjectStrengthsLines(null), []);
  assert.deepEqual(renderSubjectStrengthsLines(undefined), []);
  assert.deepEqual(renderSubjectStrengthsLines('string'), []);
});

test('renderer skips meta keys (schema_version, provenance, _health)', () => {
  const lines = renderSubjectStrengthsLines({
    schema_version: 'v2.0',
    provenance: { extracted_at: '2026-05-21' },
    _health:    { drop_reasons: {} },
  });
  assert.deepEqual(lines, [], 'meta-only input produces no lines');
});

test('renderer emits section header + one line per non-empty subject', () => {
  const ss = {
    schema_version: 'v2.0',
    maths:   { items: [{ source_url: 'https://x/m' }, { source_url: 'https://x/m2' }],
               summary_paragraph_for_chatbot: 'Strong maths.' },
    biology: { items: [{ source_url: 'https://x/b' }],
               summary_paragraph_for_chatbot: 'Biology summary.' },
  };
  const lines = renderSubjectStrengthsLines(ss);
  assert.equal(lines.length, 3, 'header + 2 subjects = 3 lines');
  assert.match(lines[0], /^\nSUBJECT STRENGTHS/);
  assert.match(lines[1], /^  • MATHS: 2 items/);
  assert.match(lines[1], /Strong maths\./);
  assert.match(lines[2], /^  • BIOLOGY: 1 item/);
});

test('renderer prefers item_count over items.length when both present (projected shape)', () => {
  const projected = {
    schema_version: 'v2.0',
    maths: {
      items: [{ source_url: 'https://x/m' }],  // only top-3 sample preserved
      item_count: 12,                           // ORIGINAL count from before projection
      summary_paragraph_for_chatbot: 'Strong maths.',
    },
    biology: {
      items: [],
      item_count: 7,
    },
  };
  const lines = renderSubjectStrengthsLines(projected);
  // First line: header. Second: maths shows 12 items, not 1. Third: biology shows 7, not 0.
  assert.match(lines[1], /^  • MATHS: 12 items/, `expected 12 items label, got: ${lines[1]}`);
  assert.match(lines[2], /^  • BIOLOGY: 7 items/, `expected 7 items label, got: ${lines[2]}`);
});

test('renderer skips count-only stubs with item_count=0 + no summary', () => {
  const projected = {
    schema_version: 'v2.0',
    maths: { items: [], item_count: 0 },
    biology: { items: [{ source_url: 'https://x' }], item_count: 1, summary_paragraph_for_chatbot: 'B.' },
  };
  const lines = renderSubjectStrengthsLines(projected);
  // header + biology only
  assert.equal(lines.length, 2);
  assert.match(lines[1], /BIOLOGY/);
});

test('renderer truncates the summary paragraph to ~240 chars', () => {
  const longSummary = 'A'.repeat(500);
  const ss = {
    schema_version: 'v2.0',
    maths: { items: [{ source_url: 'https://x' }], summary_paragraph_for_chatbot: longSummary },
  };
  const lines = renderSubjectStrengthsLines(ss);
  // The line contains the truncated summary; verify it doesn't carry the full 500 chars.
  const summaryPart = lines[1];
  assert.ok(summaryPart.length < 400,
    `summary line should be trimmed, got length=${summaryPart.length}`);
  assert.ok(summaryPart.includes('…'), 'truncated marker present');
});

test('renderer appends source URL when an item carries one', () => {
  const ss = {
    schema_version: 'v2.0',
    maths: {
      items: [{ source_url: 'https://example.com/maths.pdf' }],
      summary_paragraph_for_chatbot: 'M.',
    },
  };
  const lines = renderSubjectStrengthsLines(ss);
  assert.match(lines[1], /source: https:\/\/example\.com\/maths\.pdf/,
    `expected source URL in line, got: ${lines[1]}`);
});

test('renderer end-to-end: projected blob produces correct chatbot lines', () => {
  // The fully exercised path: raw v2.0 → projectSubjectStrengths → renderer
  const raw = {
    schema_version: 'v2.0',
    provenance: { extractor_version: 'v2.2' },
    maths:    { items: new Array(10).fill({ source_url: 'https://x/m' }), summary_paragraph_for_chatbot: 'Maths is strong.' },
    biology:  { items: new Array(6).fill({ source_url: 'https://x/b' }),  summary_paragraph_for_chatbot: 'Biology is strong.' },
    physics:  { items: new Array(5).fill({ source_url: 'https://x/p' }),  summary_paragraph_for_chatbot: 'Physics is strong.' },
    chemistry:{ items: new Array(3).fill({ source_url: 'https://x/c' }),  summary_paragraph_for_chatbot: 'Chem.' },
    english:  { items: [{ source_url: 'https://x/e' }], summary_paragraph_for_chatbot: 'Eng tiny.' },
  };
  const projected = projectSubjectStrengths(raw);
  const lines = renderSubjectStrengthsLines(projected);
  // Header + 5 subject lines (no school_cohort, no empties).
  // Renderer uses canonical SUBJECT_STRENGTHS_SUBJECT_ORDER (maths, biology,
  // chemistry, physics, english, ...) NOT item-count order. So physics
  // (top-3, has summary) appears AFTER chemistry (below-top-3, count-only).
  assert.equal(lines.length, 6, `expected 6 lines (header + 5 subjects), got ${lines.length}`);
  const joined = lines.join('\n');
  // Top-3 (maths, biology, physics) carry summary text:
  assert.ok(joined.includes('MATHS: 10 items · Maths is strong.'),   `expected maths line with summary, got: ${joined}`);
  assert.ok(joined.includes('BIOLOGY: 6 items · Biology is strong.'), `expected biology line with summary, got: ${joined}`);
  assert.ok(joined.includes('PHYSICS: 5 items · Physics is strong.'), `expected physics line with summary, got: ${joined}`);
  // Below-top-3 (chemistry, english) are count-only — no summary substring:
  const chemLine    = lines.find(l => l.includes('CHEMISTRY'));
  const englishLine = lines.find(l => l.includes('ENGLISH'));
  assert.match(chemLine,    /CHEMISTRY: 3 items$/, `chemistry should be count-only, got: ${chemLine}`);
  assert.match(englishLine, /ENGLISH: 1 item$/,    `english should be count-only, got: ${englishLine}`);
});
