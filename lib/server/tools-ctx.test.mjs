import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Pre-enable-1 (Gap A) plumbing test. Locks the wire shape for the new
// `ctx` 3rd arg threaded from prose-runner / agentic-loop → tools.js →
// dim.rank(row, ctx). Source-grep style because tools.js transitively
// imports a .ts file that node --test can't resolve standalone (Next.js
// handles it in the build). Same approach used elsewhere in the repo
// when an integration import chain is too heavy for a unit harness.
//
// The scorer side of the contract — dim.rank(row, ctx) reading
// ctx.parent.<pref>_pref — is already locked by dimensions-scorers.test.mjs.

const toolsSrc   = readFileSync(new URL('./tools.js',         import.meta.url), 'utf8');
const proseSrc   = readFileSync(new URL('./prose-runner.js',  import.meta.url), 'utf8');
const agenticSrc = readFileSync(new URL('./agentic-loop.js',  import.meta.url), 'utf8');

// ── tools.js: scorer-facing surface ─────────────────────────────────────────

test('rankSchools accepts ctx as 3rd param with default {}', () => {
  assert.match(toolsSrc, /export async function rankSchools\(supabase, args, ctx\s*=\s*\{\}\)/);
});

test('rankSchools threads ctx to dim.rank', () => {
  assert.match(toolsSrc, /const score = dim\.rank\(enrichedRow, ctx\);/);
});

test('compareSchools accepts ctx as 3rd param with default {}', () => {
  assert.match(toolsSrc, /export async function compareSchools\(supabase, args, ctx\s*=\s*\{\}\)/);
});

test('compareSchools threads ctx to dim.rank inside the per-dim loop', () => {
  assert.match(toolsSrc, /Math\.round\(dim\.rank\(enrichedRow, ctx\) \* 10\) \/ 10/);
});

test('loadDimFactsBundles filters source-less facts before user-visible ranking', () => {
  assert.match(toolsSrc, /source-less legacy_backfill/);
  assert.match(toolsSrc, /if \(!f\.source_url\) continue;/);
});

// D-step-1 fix (2026-05-26): subject_strengths column must be in
// ALL_STRUCTURED_COLS. Without it, the now-enabled subject_strengths dim's
// hasRequiredData filter drops every row and rankSchools returns 0 schools
// for any subject question. Smoke surfaced this; this test prevents
// regression.
test('ALL_STRUCTURED_COLS includes subject_strengths', () => {
  // Match the literal string inside the array (between quotes), guarding
  // against a future "subject_strengths_summary" or similar near-miss column.
  assert.match(toolsSrc, /['"]subject_strengths['"]\s*,/);
});

// D-step-1 fix (2026-05-26): rankSchools + compareSchools must pass ctx to
// dim.format() so subject_strengths can emit per-subject evidence lines.
// Without ctx, format falls back to "School — subjects." with no item
// counts, and the model can't tell which schools have populated maths
// data. Smoke surfaced: Nana said "tool result here only confirms one
// clear leader" because every other school's summary was empty of evidence.
test('rankSchools passes ctx to dim.format', () => {
  assert.match(toolsSrc, /summary:\s*dim\.format\(row,\s*school,\s*ctx\)/);
});

test('compareSchools passes ctx to dim.format', () => {
  assert.match(toolsSrc, /summary:\s*dim\.format\(enrichedRow,\s*school,\s*ctx\)/);
});

// ── Caller dispatch: prose-runner ───────────────────────────────────────────

test('prose-runner builds toolCtx with parent: opts.pack?.parent', () => {
  // Relaxed from single-line match — agentic-loop went multi-line in D-step-1
  // (2026-05-26) to add subject_intents. prose-runner went multi-line too in
  // the follow-up fix to add subject_intents from the question.
  assert.match(proseSrc, /parent:\s*opts\.pack\?\.parent\s*\?\?\s*null/);
});

// D-step-1 follow-up fix (2026-05-26): prose-runner is the actual chat
// surface for shortlist-locked sessions (not agentic-loop). Without
// subject_intents in toolCtx here, subject_strengths.rank() returned 0 for
// every school but Wellington (which had prior-turn context). Mirrors the
// agentic-loop contract.
test('prose-runner threads subject_intents into toolCtx (D-step-1 follow-up)', () => {
  assert.match(proseSrc, /subject_intents:\s*extractSubjectIntents\(question\)/);
});

test('prose-runner imports extractSubjectIntents from ./subject-intents.mjs', () => {
  assert.match(proseSrc, /import \{ extractSubjectIntents \} from '\.\/subject-intents\.mjs'/);
});

test('prose-runner passes toolCtx as 3rd arg to TOOLS dispatch', () => {
  assert.match(proseSrc, /TOOLS\[def\.name\]\(supabase, def\.args, toolCtx\)/);
});

// ── Caller dispatch: agentic-loop ───────────────────────────────────────────

test('agentic-loop builds toolCtx with parent: opts.pack?.parent', () => {
  assert.match(agenticSrc, /parent:\s*opts\.pack\?\.parent\s*\?\?\s*null/);
});

// D-step-1 (2026-05-26): agentic-loop now also threads subject_intents into
// toolCtx, populated from the parent's question via extractSubjectIntents.
test('agentic-loop threads subject_intents into toolCtx (D-step-1)', () => {
  assert.match(agenticSrc, /subject_intents:\s*extractSubjectIntents\(question\)/);
});

test('agentic-loop imports extractSubjectIntents from ./subject-intents.mjs', () => {
  assert.match(agenticSrc, /import \{ extractSubjectIntents \} from '\.\/subject-intents\.mjs'/);
});

test('agentic-loop passes toolCtx as 3rd arg to TOOLS dispatch', () => {
  assert.match(agenticSrc, /TOOLS\[toolName\]\(supabase, effectiveArgs, toolCtx\)/);
});
