// D-step-1 (2026-05-26): tests for extractSubjectIntents, the chat-side
// regex pass that populates ctx.subject_intents for DIMENSIONS.subject_strengths.
//
// SUBJECT_INTENT_RE is DUPED from score-for-build-mode.ts:534. Build Mode's
// own tests live alongside that file. These tests validate the chat-side
// integration: the exported helper, empty-input safety, and the canonical
// question shapes parents type into the chatbot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSubjectIntents } from './subject-intents.mjs';

test('extractSubjectIntents: empty / non-string input returns empty Set', () => {
  assert.equal(extractSubjectIntents('').size, 0);
  assert.equal(extractSubjectIntents(null).size, 0);
  assert.equal(extractSubjectIntents(undefined).size, 0);
  assert.equal(extractSubjectIntents(42).size, 0);
});

test('extractSubjectIntents: "best schools for maths" picks up maths', () => {
  const out = extractSubjectIntents('What are the best schools for maths?');
  assert.ok(out.has('maths'), 'expected maths intent');
  assert.equal(out.size, 1, `expected only maths, got ${[...out].join(',')}`);
});

test('extractSubjectIntents: "best maths and most competitions" picks up maths', () => {
  const out = extractSubjectIntents('Which schools have the best maths and won the most competitions?');
  assert.ok(out.has('maths'));
});

test('extractSubjectIntents: "engineering at top unis" picks up computer_science via engineer cognate', () => {
  // "engineering" is in the computer_science regex (software engineer/engineering).
  // For pure engineering questions (mechanical/civil), an Oxbridge engineering
  // composite would be needed — that's D-step-3 (career composites).
  const out = extractSubjectIntents('Best schools for software engineering at top universities');
  assert.ok(out.has('computer_science'), 'software engineering should map to computer_science');
});

test('extractSubjectIntents: physicists question picks up physics', () => {
  const out = extractSubjectIntents('Which schools produce the most physicists?');
  assert.ok(out.has('physics'));
});

test('extractSubjectIntents: multi-subject question picks up all mentioned', () => {
  const out = extractSubjectIntents('My child loves maths, physics, and chemistry — best schools?');
  assert.ok(out.has('maths'));
  assert.ok(out.has('physics'));
  assert.ok(out.has('chemistry'));
});

test('extractSubjectIntents: pure non-subject question returns empty', () => {
  // Boarding question — no subject intent should fire.
  const out = extractSubjectIntents('Which schools offer the best boarding experience?');
  assert.equal(out.size, 0, `expected empty, got ${[...out].join(',')}`);
});

test('extractSubjectIntents: avoids known false positives', () => {
  // "family history" should NOT trigger history intent (Codex r1 P1.1 from Build Mode).
  const familyHistory = extractSubjectIntents('Tell me about the school\'s family history');
  assert.ok(!familyHistory.has('history'), '"family history" must not trigger history intent');

  // "more economical" should NOT trigger economics_business (Codex r2 P1).
  const cheap = extractSubjectIntents('Looking for a more economical school option');
  assert.ok(!cheap.has('economics_business'), '"economical" must not trigger economics_business');

  // "first-language English" should NOT trigger english intent.
  const firstLang = extractSubjectIntents('My child\'s first-language English ability');
  assert.ok(!firstLang.has('english'), '"first-language English" alone must not trigger english intent');
});

test('extractSubjectIntents: parent-shaped maths question lands cleanly', () => {
  // The exact wording from the user's three test questions.
  const q1 = extractSubjectIntents('What are the best schools to go to for best maths?');
  assert.ok(q1.has('maths'));
  assert.equal(q1.size, 1);

  const q3 = extractSubjectIntents('Which schools have the best math and won the most competitions');
  assert.ok(q3.has('maths'), '"math" (US spelling) should match');
  assert.equal(q3.size, 1);
});

test('extractSubjectIntents: modern_languages catches french/spanish/german', () => {
  assert.ok(extractSubjectIntents('Best schools for French immersion').has('modern_languages'));
  assert.ok(extractSubjectIntents('Schools strong on Spanish A-level').has('modern_languages'));
  assert.ok(extractSubjectIntents('German GCSE results').has('modern_languages'));
});
