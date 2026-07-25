// Tests for hasRequiredData — focused on the Codex P1.1 (2026-05-26)
// tightening for subject_strengths. The generic null/empty-string gate is
// not exhaustively retested here; existing dim-scorer tests + tools-ctx
// source-grep test cover the broader contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasRequiredData } from './dimensions.js';

// ── Generic gate behaviour (regression guards) ──────────────────────────

test('hasRequiredData: returns false for unknown dimension', () => {
  assert.equal(hasRequiredData({ foo: 'bar' }, 'nonexistent_dimension'), false);
});

test('hasRequiredData: returns false when required field is null', () => {
  assert.equal(hasRequiredData({ subject_strengths: null }, 'subject_strengths'), false);
});

test('hasRequiredData: returns false when required field is undefined', () => {
  assert.equal(hasRequiredData({}, 'subject_strengths'), false);
});

test('hasRequiredData: returns false when required field is empty string', () => {
  // exam_results is requires_field for academic_strength
  assert.equal(hasRequiredData({ exam_results: '' }, 'academic_strength'), false);
});

// ── Codex P1.1 subject_strengths tightening ─────────────────────────────

test('P1.1: subject_strengths={} (empty object) is rejected', () => {
  assert.equal(hasRequiredData({ subject_strengths: {} }, 'subject_strengths'), false);
});

test('P1.1: subject_strengths with bucket but no items[] is rejected', () => {
  assert.equal(
    hasRequiredData({ subject_strengths: { maths: {} } }, 'subject_strengths'),
    false,
  );
});

test('P1.1: subject_strengths with bucket carrying empty items[] is rejected', () => {
  assert.equal(
    hasRequiredData({ subject_strengths: { maths: { items: [] } } }, 'subject_strengths'),
    false,
  );
});

test('P1.1: subject_strengths with ALL buckets carrying empty items[] is rejected', () => {
  assert.equal(
    hasRequiredData(
      { subject_strengths: { maths: { items: [] }, physics: { items: [] } } },
      'subject_strengths',
    ),
    false,
  );
});

test('P1.1: subject_strengths with non-array items field is rejected', () => {
  // Defensive: extractor shape drift could put a string here.
  assert.equal(
    hasRequiredData({ subject_strengths: { maths: { items: 'not-an-array' } } }, 'subject_strengths'),
    false,
  );
});

test('P1.1: subject_strengths with one populated bucket is ACCEPTED', () => {
  assert.equal(
    hasRequiredData(
      { subject_strengths: { maths: { items: [{ claim: 'top set' }] } } },
      'subject_strengths',
    ),
    true,
  );
});

test('P1.1: subject_strengths with one populated + one empty bucket is ACCEPTED', () => {
  // At least one non-empty bucket is the bar — empty siblings don't disqualify.
  assert.equal(
    hasRequiredData(
      {
        subject_strengths: {
          maths: { items: [{ claim: 'top set' }] },
          physics: { items: [] },
        },
      },
      'subject_strengths',
    ),
    true,
  );
});

test('P1.1: subject_strengths with multiple populated buckets is ACCEPTED', () => {
  assert.equal(
    hasRequiredData(
      {
        subject_strengths: {
          maths: { items: [{ claim: 'a' }, { claim: 'b' }] },
          physics: { items: [{ claim: 'c' }] },
        },
      },
      'subject_strengths',
    ),
    true,
  );
});

test('P1.1: subject_strengths as top-level array is rejected (Codex r1 defensive nit)', () => {
  // Malformed extractor output could ship `[{ items: [...] }]` instead of
  // `{ maths: { items: [...] } }`. Without the array guard, Object.values
  // iterates array elements and this would slip through.
  assert.equal(
    hasRequiredData({ subject_strengths: [{ items: [{ claim: 'a' }] }] }, 'subject_strengths'),
    false,
  );
});

test('P1.1: tightening is scoped to subject_strengths (other dims unaffected)', () => {
  // academic_strength uses requires_field='exam_results'. A populated string
  // value should still pass under the generic gate even if the tighter
  // predicate would reject it.
  assert.equal(
    hasRequiredData({ exam_results: '95% A*-A at A-Level' }, 'academic_strength'),
    true,
  );
});
