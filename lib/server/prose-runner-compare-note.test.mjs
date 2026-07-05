// buildUserMessage coverage-rule tests (2026-07-05).
//
// Comparison answers sometimes covered only the data-rich schools and
// silently dropped the rest. The deterministic fix injects
// COMPARE_COMPLETENESS_NOTE into the pass-1 user message for
// comparison-shaped intents only. These tests pin (a) the note fires for
// all four comparison intents, (b) it does NOT fire for single-school
// intents, so non-comparison answers don't pay the extra tokens.
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/prose-runner-compare-note.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUserMessage, COMPARE_COMPLETENESS_NOTE } from './prose-runner.js';

const TOOL_BLOBS = [
  { name: 'compareSchools', summary: 'Compared 3 schools', compact: 'School A: …\nSchool B: …\nSchool C: …' },
];

function msgFor(intent) {
  return buildUserMessage('some question', { intent }, TOOL_BLOBS, null, null);
}

test('coverage rule fires for all comparison-shaped intents', () => {
  for (const intent of ['compare_two_on_dim', 'shortlist_rank_or_compare', 'shortlist_quant_facts', 'top_n_for_dim']) {
    assert.ok(msgFor(intent).includes(COMPARE_COMPLETENESS_NOTE), `${intent} should carry the coverage rule`);
  }
});

test('coverage rule does NOT fire for single-school intents', () => {
  for (const intent of ['tell_me_about_school', 'fact_lookup', 'fees_value', 'safeguarding_or_pastoral']) {
    assert.ok(!msgFor(intent).includes(COMPARE_COMPLETENESS_NOTE), `${intent} should not carry the coverage rule`);
  }
});

test('message structure is otherwise unchanged (question + tool block + meta instruction)', () => {
  const msg = msgFor('compare_two_on_dim');
  assert.match(msg, /PARENT QUESTION: some question/);
  assert.match(msg, /═══ TOOL \[compareSchools\]/);
  assert.match(msg, /nana-meta/);
  // The rule sits between the tool block and the write instruction.
  assert.ok(msg.indexOf(COMPARE_COMPLETENESS_NOTE) > msg.indexOf('═══ TOOL'));
  assert.ok(msg.indexOf(COMPARE_COMPLETENESS_NOTE) < msg.indexOf('Write the answer in markdown prose'));
});
