// Tests for the subject_strengths.keywords regex (Codex P1.4 2026-05-26).
//
// Codex flagged the previous coarse-stem regex (math|biolog|chemist|...)
// as both over-firing on bystander words AND under-firing on real subjects
// (e.g. `chemist` matched "chemist on site" the pharmacist, while
// `chemistry` itself failed the \b...\b boundary check).
//
// Fix: dim.keywords now derives from SUBJECT_INTENT_RE (canonical patterns
// in subject-intents.mjs), so the suggestion regex and the per-subject
// ranking-intent regexes stay in lockstep. SUBJECT_INTENT_RE was also
// tightened on chemistry (require -ry/-ries) and economics (require -s).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS } from './dimensions.js';
import { SUBJECT_INTENT_RE, extractSubjectIntents } from './subject-intents.mjs';

const SUBJECT_KEYWORDS_RE = DIMENSIONS.subject_strengths.keywords;

// ── Real subject queries should fire ────────────────────────────────────

test('keywords fires on canonical subject phrasings', () => {
  for (const q of [
    'best for maths',
    'best for biology',
    'physics olympiad',
    'chemistry set',
    'english literature',
    'business studies',
    'computer science',
    'software engineering',
    'historians of art',
    'french spanish german',
    'economics class',
    'microeconomics',
    'macroeconomics',
  ]) {
    assert.equal(SUBJECT_KEYWORDS_RE.test(q), true, `expected match: "${q}"`);
  }
});

// ── Known false-positive bystander words should NOT fire ────────────────

test('keywords does NOT fire on bystander words (P1.4 false-positive fixes)', () => {
  for (const q of [
    'physical fitness',          // physics stem used to over-fire (it didn't actually, but kept as guard)
    'family history',            // history without subject-context
    'natural sciences',          // science generally
    'chemist on site',           // pharmacist, not chemistry — P1.4 fix
    'english speaking',          // ESL, not English literature
    'economic class',            // sociology, not economics — P1.4 fix
    'economic background',       // sociology, not economics — P1.4 fix
    'family business',           // parent biz, not business studies
  ]) {
    assert.equal(SUBJECT_KEYWORDS_RE.test(q), false, `expected NO match: "${q}"`);
  }
});

// ── Specific P1.4 regressions caught by the rebuild ─────────────────────

test('P1.4: biology now matches (was missing under \\bbiolog\\b stem)', () => {
  assert.equal(SUBJECT_KEYWORDS_RE.test('best schools for biology'), true);
});

test('P1.4: chemistry now matches (was missing under \\bchemist\\b stem)', () => {
  assert.equal(SUBJECT_KEYWORDS_RE.test('chemistry set'), true);
});

test('P1.4: chemist (pharmacist) no longer matches', () => {
  assert.equal(SUBJECT_KEYWORDS_RE.test('chemist on site'), false);
  assert.equal(SUBJECT_KEYWORDS_RE.test('local chemist'), false);
});

test('P1.4: bare "economic" no longer matches; "economics" still does', () => {
  assert.equal(SUBJECT_KEYWORDS_RE.test('economic class'), false);
  assert.equal(SUBJECT_KEYWORDS_RE.test('economic background'), false);
  assert.equal(SUBJECT_KEYWORDS_RE.test('economic crisis'), false);
  assert.equal(SUBJECT_KEYWORDS_RE.test('economics'), true);
  assert.equal(SUBJECT_KEYWORDS_RE.test('macroeconomics'), true);
});

// ── extractSubjectIntents stays consistent with the suggestion regex ────

test('extractSubjectIntents picks up chemistry from "chemistry set"', () => {
  assert.equal(extractSubjectIntents('chemistry set').has('chemistry'), true);
});

test('extractSubjectIntents does NOT pick chemistry from "chemist on site"', () => {
  assert.equal(extractSubjectIntents('chemist on site').has('chemistry'), false);
});

test('extractSubjectIntents picks up economics_business from "microeconomics"', () => {
  assert.equal(extractSubjectIntents('microeconomics').has('economics_business'), true);
});

test('extractSubjectIntents does NOT pick economics_business from "economic background"', () => {
  assert.equal(extractSubjectIntents('economic background').has('economics_business'), false);
});

// ── Suggestion / extraction lockstep ────────────────────────────────────

test('suggestion regex and SUBJECT_INTENT_RE stay in lockstep (Codex P1.4 design intent)', () => {
  // For any question that mentions a real subject, BOTH the suggestion
  // gate AND extractSubjectIntents should fire. Drift between them was
  // the pre-P1.4 bug pattern (e.g. biology suggestible but not extractable).
  const subjectQuestions = [
    'best for maths',
    'biology programmes',
    'chemistry set',
    'physics teacher',
    'english literature',
    'business studies',
    'computer science',
    'software engineering',
    'french spanish german',
    'historians of art',
    'economics class',
  ];
  for (const q of subjectQuestions) {
    const suggested  = SUBJECT_KEYWORDS_RE.test(q);
    const extracted  = extractSubjectIntents(q).size > 0;
    assert.equal(suggested,  true, `suggestion missed: "${q}"`);
    assert.equal(extracted, true, `extraction missed: "${q}"`);
  }
});
