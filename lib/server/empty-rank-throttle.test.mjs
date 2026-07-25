// Tests for empty-rank-throttle.mjs (Codex P1.3 perf fix 2026-05-26).
//
// Validates the pure helpers that gate the agentic loop's empty-rank
// fallback cascade. Live loop wiring lives in agentic-loop.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_RANK_DIAG_BUDGET,
  EMPTY_RANK_HINT,
  makeEmptyRankState,
  isEmptyRankResult,
  shouldThrottleFactCall,
  updateEmptyRankState,
} from './empty-rank-throttle.mjs';

test('EMPTY_RANK_DIAG_BUDGET is 1 (Codex spec: one diagnostic call max)', () => {
  assert.equal(EMPTY_RANK_DIAG_BUDGET, 1);
});

test('EMPTY_RANK_HINT mentions getSchoolFacts + what_we_dont_know', () => {
  assert.match(EMPTY_RANK_HINT, /getSchoolFacts/);
  assert.match(EMPTY_RANK_HINT, /what_we_dont_know/);
});

test('makeEmptyRankState returns clean initial state', () => {
  const s = makeEmptyRankState();
  assert.equal(s.emptyRankSeen, false);
  assert.equal(s.diagFactCallsAfterEmpty, 0);
  assert.equal(s.activatedDimension, null);
});

test('isEmptyRankResult: rankSchools with empty schools array → true', () => {
  assert.equal(isEmptyRankResult('rankSchools', { dimension: 'x', count: 0, schools: [] }), true);
});

test('isEmptyRankResult: rankSchools with populated schools array → false', () => {
  assert.equal(
    isEmptyRankResult('rankSchools', { dimension: 'x', count: 1, schools: [{ slug: 'a' }] }),
    false,
  );
});

test('isEmptyRankResult: non-rankSchools tools always → false', () => {
  assert.equal(isEmptyRankResult('compareSchools', { schools: [] }), false);
  assert.equal(isEmptyRankResult('getSchoolFacts', { data: {} }), false);
  assert.equal(isEmptyRankResult('searchSchoolText', { chunks: [] }), false);
});

test('isEmptyRankResult: malformed result → false (defensive)', () => {
  assert.equal(isEmptyRankResult('rankSchools', null), false);
  assert.equal(isEmptyRankResult('rankSchools', undefined), false);
  assert.equal(isEmptyRankResult('rankSchools', { error: 'db' }), false);
  assert.equal(isEmptyRankResult('rankSchools', { schools: 'not-an-array' }), false);
});

test('shouldThrottleFactCall: clean state → no throttle', () => {
  const s = makeEmptyRankState();
  assert.deepEqual(shouldThrottleFactCall('getSchoolFacts', s), { throttle: false });
});

test('shouldThrottleFactCall: empty rank seen, 0 diag calls → no throttle (first call allowed)', () => {
  const s = { emptyRankSeen: true, diagFactCallsAfterEmpty: 0 };
  assert.deepEqual(shouldThrottleFactCall('getSchoolFacts', s), { throttle: false });
});

test('shouldThrottleFactCall: empty rank seen, 1 diag call already → THROTTLE', () => {
  const s = { emptyRankSeen: true, diagFactCallsAfterEmpty: 1 };
  const out = shouldThrottleFactCall('getSchoolFacts', s);
  assert.equal(out.throttle, true);
  assert.match(out.reason, /rankSchools/);
  assert.match(out.reason, /final_answer/);
  assert.match(out.reason, /what_we_dont_know/);
});

test('shouldThrottleFactCall: non-getSchoolFacts tools → never throttle', () => {
  const s = { emptyRankSeen: true, diagFactCallsAfterEmpty: 5 };
  assert.deepEqual(shouldThrottleFactCall('rankSchools',     s), { throttle: false });
  assert.deepEqual(shouldThrottleFactCall('compareSchools',  s), { throttle: false });
  assert.deepEqual(shouldThrottleFactCall('searchSchoolText',s), { throttle: false });
  assert.deepEqual(shouldThrottleFactCall('filterSchools',   s), { throttle: false });
});

test('shouldThrottleFactCall: custom budget honoured', () => {
  const s = { emptyRankSeen: true, diagFactCallsAfterEmpty: 1 };
  assert.equal(shouldThrottleFactCall('getSchoolFacts', s, 2).throttle, false);
  assert.equal(shouldThrottleFactCall('getSchoolFacts', s, 1).throttle, true);
});

test('updateEmptyRankState: empty rankSchools sets emptyRankSeen=true + captures dimension', () => {
  const s = makeEmptyRankState();
  updateEmptyRankState('rankSchools', { dimension: 'x', count: 0, schools: [] }, s);
  assert.equal(s.emptyRankSeen, true);
  assert.equal(s.diagFactCallsAfterEmpty, 0);
  assert.equal(s.activatedDimension, 'x', 'dimension from result captured');
});

test('updateEmptyRankState: empty rankSchools prefers toolArgs.dimension over result.dimension', () => {
  const s = makeEmptyRankState();
  updateEmptyRankState(
    'rankSchools',
    { dimension: 'fallback_label', count: 0, schools: [] },
    s,
    { dimension: 'subject_strengths', restrict_to_slugs: ['a', 'b'] },
  );
  assert.equal(s.activatedDimension, 'subject_strengths', 'toolArgs.dimension wins');
});

test('updateEmptyRankState: non-empty rankSchools clears state (model recovered)', () => {
  const s = { emptyRankSeen: true, diagFactCallsAfterEmpty: 1, activatedDimension: 'subject_strengths' };
  updateEmptyRankState('rankSchools', { dimension: 'x', count: 1, schools: [{ slug: 'a' }] }, s);
  assert.equal(s.emptyRankSeen, false);
  assert.equal(s.diagFactCallsAfterEmpty, 0);
  assert.equal(s.activatedDimension, null, 'dimension cleared on recovery');
});

test('updateEmptyRankState: getSchoolFacts increments counter only when emptyRankSeen', () => {
  const clean = makeEmptyRankState();
  updateEmptyRankState('getSchoolFacts', { data: {} }, clean);
  assert.equal(clean.diagFactCallsAfterEmpty, 0, 'no increment without empty rank seen');

  const after = { emptyRankSeen: true, diagFactCallsAfterEmpty: 0 };
  updateEmptyRankState('getSchoolFacts', { data: {} }, after);
  assert.equal(after.diagFactCallsAfterEmpty, 1);

  updateEmptyRankState('getSchoolFacts', { data: {} }, after);
  assert.equal(after.diagFactCallsAfterEmpty, 2, 'second call also counted');
});

test('updateEmptyRankState: malformed rankSchools result leaves state untouched', () => {
  const s = { emptyRankSeen: false, diagFactCallsAfterEmpty: 0 };
  updateEmptyRankState('rankSchools', { error: 'db error' }, s);
  assert.equal(s.emptyRankSeen, false);
  assert.equal(s.diagFactCallsAfterEmpty, 0);
});

test('updateEmptyRankState: handles null state gracefully', () => {
  assert.doesNotThrow(() => updateEmptyRankState('rankSchools', { schools: [] }, null));
  assert.doesNotThrow(() => updateEmptyRankState('rankSchools', { schools: [] }, undefined));
});

// ── End-to-end scenario: the exact cascade Codex flagged ────────────────────
test('scenario: empty rankSchools → 1 fact call allowed → 2nd fact call throttled', () => {
  const s = makeEmptyRankState();

  updateEmptyRankState('rankSchools', { dimension: 'subject_strengths', count: 0, schools: [] }, s);
  assert.equal(s.emptyRankSeen, true);

  assert.equal(shouldThrottleFactCall('getSchoolFacts', s).throttle, false, 'first fact call passes');
  updateEmptyRankState('getSchoolFacts', { data: {} }, s);

  assert.equal(shouldThrottleFactCall('getSchoolFacts', s).throttle, true, 'second fact call throttled');
});

test('scenario: empty rankSchools → non-empty rankSchools → throttle cleared', () => {
  const s = makeEmptyRankState();
  updateEmptyRankState('rankSchools', { dimension: 'x', count: 0, schools: [] }, s);
  updateEmptyRankState('getSchoolFacts', { data: {} }, s);
  assert.equal(s.diagFactCallsAfterEmpty, 1);

  updateEmptyRankState('rankSchools', { dimension: 'y', count: 2, schools: [{}, {}] }, s);

  assert.equal(s.emptyRankSeen, false);
  assert.equal(s.diagFactCallsAfterEmpty, 0);
  assert.equal(shouldThrottleFactCall('getSchoolFacts', s).throttle, false, 'fact calls re-allowed');
});
