// Codex P1.5 (2026-05-26): toolCtx wiring contract tests.
//
// Codex's perf review flagged 4 product surfaces that could potentially
// bypass the agentic-loop + prose-runner pipeline and miss the
// ctx.subject_intents that DIMENSIONS.subject_strengths.rank needs:
//   1. Build-mode recommender   (lib/research-room/score-for-build-mode.ts)
//   2. Comparison-view          (Research Room compare table)
//   3. Deep-report Nana panel   (/api/nana-parent-chatbot/[slug])
//   4. Partner brief            (/api/research-room/partner-brief)
//
// Audit findings (2026-05-26):
//   Surface 1 (Build Mode): scoreForBuildMode at line ~1356 calls
//     dim.rank(struct, { subject_intents: subjectIntents }) — has a
//     dedicated subject_strengths branch that wires its own intents.
//     The generic dim-scoring loop above uses buildScorerCtx (no subject
//     intents) — correct because subject_strengths is the only dim that
//     reads ctx.subject_intents, and it's handled in the dedicated branch.
//   Surface 2 (Comparison-view): no direct DIMENSIONS.rank calls —
//     comparison table renders pre-computed scores from the recommender.
//   Surface 3 (Deep-report Nana panel): runOneQuestionStream in
//     nana-brain.js is single-school Q&A with NO tool calls — injects
//     subject_strengths data into Claude's prompt via
//     renderSubjectStrengthsLines (line ~1248 in nana-brain.js). Doesn't
//     need toolCtx because it doesn't rank cross-school.
//   Surface 4 (Partner brief): reads from partner_briefs table — no
//     scoring.
//
// One residual brittleness: recommend-shortlist.ts:151 calls
// dim.rank({...}) for sport dims WITHOUT ctx. Safe today because sport
// dims don't read ctx — but adding a ctx-using sport dim in the future
// would silently miss the signal. Filed as a P3 followup.
//
// These tests source-grep the known scoring surfaces to assert the
// toolCtx contract — if a future refactor removes the subject_intents
// wiring, the tests fail and surface the regression.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const agenticSrc       = readFileSync(new URL('./agentic-loop.js',                                      import.meta.url), 'utf8');
const proseSrc         = readFileSync(new URL('./prose-runner.js',                                      import.meta.url), 'utf8');
const buildModeSrc     = readFileSync(new URL('../research-room/score-for-build-mode.ts',               import.meta.url), 'utf8');
const brainSrc         = readFileSync(new URL('./nana-brain.js',                                        import.meta.url), 'utf8');

// ── Surface 1: agentic-loop (Research Room chat / DecisionHub) ─────────

test('P1.5 surface 1a: agentic-loop imports extractSubjectIntents from subject-intents.mjs', () => {
  assert.match(agenticSrc, /import\s*\{[^}]*extractSubjectIntents[^}]*\}\s*from\s*['"]\.\/subject-intents\.mjs['"]/);
});

test('P1.5 surface 1a: agentic-loop builds toolCtx with subject_intents from the question', () => {
  // The exact pattern that wires the chat-side intent set into rankSchools.
  // Loose match because the field can appear in any object-property order,
  // but the call to extractSubjectIntents must be present in a toolCtx-shaped
  // construction.
  assert.match(agenticSrc, /toolCtx\s*=\s*\{[\s\S]*?subject_intents:\s*extractSubjectIntents\(question\)/);
});

// ── Surface 1b: prose-runner (intent-router execution path) ────────────

test('P1.5 surface 1b: prose-runner imports extractSubjectIntents', () => {
  assert.match(proseSrc, /import\s*\{[^}]*extractSubjectIntents[^}]*\}\s*from\s*['"]\.\/subject-intents\.mjs['"]/);
});

test('P1.5 surface 1b: prose-runner builds toolCtx with subject_intents from the question', () => {
  assert.match(proseSrc, /toolCtx\s*=\s*\{[\s\S]*?subject_intents:\s*extractSubjectIntents\(question\)/);
});

// ── Surface 2: Build-mode recommender (score-for-build-mode.ts) ────────

test('P1.5 surface 2: build-mode recommender has a dedicated subject_strengths rank call with subject_intents', () => {
  // The recommender has BOTH a generic dim-scoring loop (uses
  // buildScorerCtx, no subject_intents) AND a dedicated subject_strengths
  // branch. The dedicated branch is what wires the intent.
  assert.match(
    buildModeSrc,
    /dim\.rank\([^,]+,\s*\{\s*subject_intents:\s*subjectIntents\s*\}\s*\)/,
    'expected subject_strengths-specific rank call: dim.rank(struct, { subject_intents: subjectIntents })',
  );
});

// ── Surface 3: Deep-report Nana panel (single-school Q&A) ──────────────

test('P1.5 surface 3: deep-report panel injects subject_strengths data into Claude prompt (no ranking needed)', () => {
  // runOneQuestionStream uses no tool calls — it relies on Claude reading
  // the pre-fetched school context. The structured-block renderer must
  // include subject_strengths lines, otherwise Claude can't answer
  // subject questions on the deep-report panel.
  assert.match(brainSrc, /renderSubjectStrengthsLines\s*\(\s*structured\.subject_strengths\s*\)/);
});

test('P1.5 surface 3: nana-brain exports renderSubjectStrengthsLines (used by structured-block)', () => {
  assert.match(brainSrc, /export\s+function\s+renderSubjectStrengthsLines/);
});

// ── Cross-surface invariant ────────────────────────────────────────────

test('P1.5 cross-surface: SUBJECT_INTENT_RE export shape is stable for cross-file consumers', () => {
  // Both agentic-loop AND prose-runner consume extractSubjectIntents,
  // which is the only public function in subject-intents.mjs that touches
  // SUBJECT_INTENT_RE. dimensions.js also imports SUBJECT_INTENT_RE
  // directly to build dim.keywords. Asserting the canonical export name
  // here so a rename in subject-intents.mjs surfaces here, not at runtime.
  const subjectIntentsSrc = readFileSync(new URL('./subject-intents.mjs', import.meta.url), 'utf8');
  assert.match(subjectIntentsSrc, /export\s+const\s+SUBJECT_INTENT_RE\s*=\s*\{/);
  assert.match(subjectIntentsSrc, /export\s+function\s+extractSubjectIntents/);
});
