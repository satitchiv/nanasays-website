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

// ── Caller dispatch: prose-runner ───────────────────────────────────────────

test('prose-runner builds toolCtx with parent: opts.pack?.parent', () => {
  // Relaxed from single-line match — agentic-loop went multi-line in D-step-1
  // (2026-05-26) to add subject_intents. prose-runner still uses the inline
  // form but the assertion shouldn't fight a future multi-line refactor here.
  assert.match(proseSrc, /parent:\s*opts\.pack\?\.parent\s*\?\?\s*null/);
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
