// Tests for the getSchoolFacts + searchSchoolText TOOL_DESCRIPTIONS shipped
// 2026-05-25 to fix the Research Room smoke gap where the agentic LLM picked
// vector-search over structured facts for class-size questions, returning
// "60-70 boys per boarding House" (house size) instead of "16" (Notion-curated
// senior class size).
//
// These descriptions are the LLM's primary signal for tool selection. If they
// regress to the pre-2026-05-25 wording, the smoke gap returns.
//
// We assert against the source file as text rather than import TOOL_DESCRIPTIONS
// directly — tools.js imports a sibling .ts file (school-name-overrides.ts)
// which node's native test runner can't load without --experimental-strip-types.
//
// Run via:
//   cd website
//   node --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/tools-getschoolfacts-description.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const TOOLS_SRC = await fs.readFile(
  path.resolve(process.cwd(), 'lib/server/tools.js'),
  'utf8',
);

// Pull the TOOL_DESCRIPTIONS literal as a substring. We don't need a full
// parser — just enough to scope the assertions to each tool's description
// block so an accidental mention in a different tool's prose doesn't pass.
function extractToolDescription(toolName) {
  // Look for `  toolName: {` then capture until the matching `},` (greedy on
  // string contents, balanced on outer braces — descriptions contain `{`/`}`
  // via JSON-shape examples like `{slug, ...}` so naive `[^}]*` won't work).
  const re = new RegExp(`\\b${toolName}:\\s*\\{([\\s\\S]*?)\\n\\s\\s\\},`);
  const m = TOOLS_SRC.match(re);
  if (!m) throw new Error(`Couldn't locate ${toolName} in tools.js`);
  return m[1];
}

test('getSchoolFacts description names every Notion-curated field', () => {
  const block = extractToolDescription('getSchoolFacts');
  for (const field of [
    'class_size',
    'total_pupils',
    'boarder_count',
    'intl_count',
    'boarding_pct',
    'gcse_pct',
    'a_level_pct',
    'lowest_boarding_entry',
    'heathrow_distance',
  ]) {
    assert.match(block, new RegExp(field), `getSchoolFacts must mention "${field}"`);
  }
});

test('getSchoolFacts description includes "notion_backfill" surface', () => {
  const block = extractToolDescription('getSchoolFacts');
  assert.match(block, /notion_backfill/, 'must name the data surface so LLM expects it');
  assert.match(block, /hand-curated/i, 'must label as hand-curated for LLM trust');
  assert.match(block, /every call/i, 'must signal notion_backfill returns by default');
});

test('getSchoolFacts description steers LLM to PREFER it for quantitative questions', () => {
  const block = extractToolDescription('getSchoolFacts');
  assert.match(block, /PREFER/, 'must use PREFER keyword (uppercase) to bias tool selection');
  assert.match(block, /quantitative/i, 'must name the question type');
});

test('searchSchoolText description warns AGAINST using it for quantitative facts', () => {
  const block = extractToolDescription('searchSchoolText');
  assert.match(block, /DO NOT/, 'must explicitly deter quantitative use');
  assert.match(block, /class size/i, 'must name class size as off-limits');
  assert.match(block, /pupil count/i, 'must name pupil count as off-limits');
  // The specific failure-mode hint that fired in the 2026-05-25 smoke.
  assert.match(block, /boarding-house/i, 'must name the boarding-house-size mismatch trap');
});

test('SSD-overlap fields still discoverable in getSchoolFacts description', () => {
  // Codex r2 fix that always-fetches these for projection — they're also
  // explicitly named in the description so the LLM still requests them when
  // it needs the SSD shape directly.
  const block = extractToolDescription('getSchoolFacts');
  for (const field of ['student_community', 'exam_results', 'admissions_format', 'location_profile']) {
    assert.match(block, new RegExp(field), `${field} must appear in the description`);
  }
});

test('getSchoolFacts args.fields hint includes notion_backfill default-on note', () => {
  const block = extractToolDescription('getSchoolFacts');
  // args object is the same block, includes `fields: '...'` hint.
  assert.match(block, /fields:.*notion_backfill/s, 'fields hint must note notion_backfill is always returned');
});

// ────────────────────────────────────────────────────────────────────────────
// Codex r1 P1 (2026-05-25): tool descriptions alone are not enough — the
// agentic-loop system prompt has stronger orchestration rules that can
// override tool-description hints. Lock the new routing rules in:
//   - Rule 1 must include the "QUANTITATIVE STRUCTURED FACTS → getSchoolFacts
//     per slug" highest-priority entry.
//   - Rule 7 must distinguish narrative-only (searchSchoolText) from
//     quantitative facts (getSchoolFacts).
// Without these, the model still routes shortlist comparisons through
// compareSchools (no class_size dimension) and never reads notion_backfill.
// ────────────────────────────────────────────────────────────────────────────

const AGENTIC_LOOP_SRC = await fs.readFile(
  path.resolve(process.cwd(), 'lib/server/agentic-loop.js'),
  'utf8',
);

test('agentic-loop Rule 1 routes quantitative structured facts to getSchoolFacts', () => {
  // The new entry must:
  //   1. Be inside the Rule 1 question-shape list.
  //   2. Use the keyword "QUANTITATIVE STRUCTURED FACTS" so future-maintainers
  //      can find it via grep when updating the field list.
  //   3. Name each of the 9 Notion-curated parent-question fields.
  //   4. Route to getSchoolFacts (NOT compareSchools, NOT searchSchoolText).
  //   5. Mention notion_backfill so the LLM knows where to read the data.
  assert.match(AGENTIC_LOOP_SRC, /QUANTITATIVE STRUCTURED FACTS/, 'Rule 1 must label the new category');
  assert.match(AGENTIC_LOOP_SRC, /class size.*getSchoolFacts/s, 'class size → getSchoolFacts');
  assert.match(AGENTIC_LOOP_SRC, /notion_backfill/, 'must name the data surface');
  // Negative bias: must explicitly steer away from compareSchools + searchSchoolText for these.
  assert.match(AGENTIC_LOOP_SRC, /Do NOT use compareSchools/, 'must deter compareSchools for class_size etc');
  assert.match(AGENTIC_LOOP_SRC, /do NOT use searchSchoolText/i, 'must deter searchSchoolText for these');
});

test('agentic-loop Rule 7 distinguishes narrative-only from quantitative routing', () => {
  // Rule 7 used to say "NARRATIVE QUESTIONS → searchSchoolText" only.
  // Codex r1 P1 required tightening so the model doesn't fall back to
  // searchSchoolText for quantitative questions when Rule 1 doesn't fire.
  assert.match(AGENTIC_LOOP_SRC, /NARRATIVE-ONLY/, 'Rule 7 must use NARRATIVE-ONLY label');
  assert.match(AGENTIC_LOOP_SRC, /QUANTITATIVE STRUCTURED FACTS.*getSchoolFacts/s,
    'Rule 7 must route quantitative facts back to getSchoolFacts');
  assert.match(AGENTIC_LOOP_SRC, /boarding-house sizes/i,
    'Rule 7 must name the boarding-house-size mismatch trap');
});

test('agentic-loop notion_backfill is returned without being in fields[]', () => {
  // Specifically test the "notion_backfill is returned automatically" note
  // appears in the Rule 1 getSchoolFacts guidance — so the LLM doesn't try
  // to add a non-existent `notion_backfill` value to its fields array
  // (which would fail validation since it's not in ALLOWED_FACT_FIELDS).
  assert.match(AGENTIC_LOOP_SRC, /notion_backfill is returned automatically/,
    'Rule 1 must clarify notion_backfill is auto-returned, not requested via fields');
});

test('agentic-loop Rule 1 acknowledges the 4-turn budget for big shortlists', () => {
  // Codex r2 P1 (2026-05-25): "getSchoolFacts FOR EACH RELEVANT SLUG" cannot
  // be unbounded — the agentic loop is 4 turns with turn 4 reserved for
  // final_answer, so 4+ school shortlists must be capped. Rule 1 now tells
  // the model to fetch top-3 most relevant and name the un-fetched in
  // what_we_dont_know rather than skipping the answer.
  assert.match(AGENTIC_LOOP_SRC, /TURN-BUDGET CAVEAT/,
    'Rule 1 must surface the turn-budget caveat');
  assert.match(AGENTIC_LOOP_SRC, /top 3 most relevant slugs/,
    'Rule 1 must state the cap');
  assert.match(AGENTIC_LOOP_SRC, /what_we_dont_know/,
    'Rule 1 must route un-fetched schools to what_we_dont_know');
});

// ────────────────────────────────────────────────────────────────────────────
// Codex r2 P1 (2026-05-25, second finding): intent-router.js was the OTHER
// place where shortlist quantitative comparisons got mis-routed to
// compareSchools. Now: rules 2 and 2b detect QUANT_STRUCTURED_FACT_RE first
// and emit per-slug getSchoolFacts in parallel.
// ────────────────────────────────────────────────────────────────────────────

const INTENT_ROUTER_SRC = await fs.readFile(
  path.resolve(process.cwd(), 'lib/server/intent-router.js'),
  'utf8',
);

test('intent-router defines QUANT_STRUCTURED_FACT_RE covering the 9 Notion fields', () => {
  // Scope the assertion to the regex definition itself so a keyword landing
  // elsewhere in the file doesn't false-pass.
  const defStart = INTENT_ROUTER_SRC.indexOf('QUANT_STRUCTURED_FACT_RE');
  assert.notEqual(defStart, -1, 'QUANT_STRUCTURED_FACT_RE must be defined');
  // r3 P1: regex is now constructed via `new RegExp(...)` with multi-line
  // string concatenation. Scope to a 4000-char window after the constant
  // declaration so we catch the full body.
  const defBlock = INTENT_ROUTER_SRC.slice(defStart, defStart + 4000);

  // Substring checks (avoid regex-in-regex escaping pain). Each keyword is
  // a literal slice of the regex source that proves the parent phrasing is
  // covered. If the regex is rewritten or split, update these as the
  // contract expects the keywords to remain matchable.
  for (const slice of [
    'class\\\\s*sizes?',       // class size / class sizes (plural)
    'pupil\\\\s*count',         // pupil count
    'boarder\\\\s*count',       // boarder count
    'international',           // international students / pupils / count
    'boarding',                // boarding share / percentage / ratio
    'gcse',                    // GCSE results / rate / %
    'a[- ]?level',             // a-level / a level
    'heathrow',                // Heathrow distance / miles / airport
    'lowest',                  // lowest boarding entry
  ]) {
    assert.ok(defBlock.includes(slice),
      `QUANT_STRUCTURED_FACT_RE definition must include "${slice}"`);
  }
});

// Codex r3 P1.1 (2026-05-25): the FUNCTIONAL test — feed natural parent
// phrasings to QUANT_STRUCTURED_FACT_RE via routeIntent and assert each
// routes to the shortlist_quant_facts intent (not shortlist_rank_or_compare).
// This catches regex coverage gaps even when the source-text test passes.
// Loaded via dynamic import because intent-router.js depends on dimensions.js
// which transitively pulls in TS — we use the source-text grep approach here
// instead.
test('QUANT_STRUCTURED_FACT_RE matches natural parent phrasings (functional grep)', () => {
  // We can't routeIntent() here without the TS import chain. Instead, we
  // reconstruct the regex from the source and feed it test strings.
  const defStart = INTENT_ROUTER_SRC.indexOf('const QUANT_STRUCTURED_FACT_RE');
  const ctorStart = INTENT_ROUTER_SRC.indexOf('new RegExp(', defStart);
  // Grab the multi-line constructor body until the matching closing paren+;
  let depth = 0;
  let i = ctorStart;
  for (; i < INTENT_ROUTER_SRC.length; i++) {
    const c = INTENT_ROUTER_SRC[i];
    if (c === '(') depth++;
    if (c === ')') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  const ctorSource = INTENT_ROUTER_SRC.slice(ctorStart, i);
  // Pull out the regex pattern + flags via eval (controlled input — own source).
  const QUANT_STRUCTURED_FACT_RE = new Function(`return ${ctorSource}`)();

  for (const q of [
    'compare my shortlist on class sizes',
    'what are the average class sizes',
    'rank them by pupil count',
    'what is the pupil count',
    'pupil numbers across these schools',
    'number of pupils at each',
    'how many pupils',
    'how many boarders are there',
    'number of boarders',
    'how many international students',
    'number of international',
    'intl count please',
    'what percent boarding',
    'percentage boarders',
    'what is the boarding percentage',
    'boarding share',
    // Note: bare "boarding %" / "% boarding" need a trailing/leading word
    // boundary that `%` (non-word char) doesn't satisfy. Parents using bare
    // `%` get the FULL-WORD variants above; if usage shifts, swap to a
    // lookahead-based regex.
    'GCSE 9-7 results',
    'gcse 9 - 7',
    'a-level a*-a',
    'a level A* - A',
    'distance from heathrow',
    'heathrow miles',
    'lowest boarding entry',
    'lowest entry year',
    'what year does boarding start',
    'boarding start year',
  ]) {
    assert.ok(QUANT_STRUCTURED_FACT_RE.test(q.toLowerCase()),
      `QUANT_STRUCTURED_FACT_RE must match "${q}" (parent phrasing)`);
  }
});

// Codex r3 P1.3 (2026-05-25): mixed-ask handling. When the question covers
// BOTH a quant fact AND a dimension/narrative side, the plan should include
// compareSchools (for the dimension) + per-slug getSchoolFacts (for the
// quant facts). The rule 2 + 2b short-circuits must do this via the
// `if (dimension)` branch that unshifts compareSchools.
test('intent-router shortlist_quant_facts mixed-ask emits both compareSchools + getSchoolFacts', () => {
  // Grep both short-circuit blocks and assert each contains an `if (dimension)`
  // branch that unshifts compareSchools onto the tools array.
  const matches = INTENT_ROUTER_SRC.match(
    /intent:\s*'shortlist_quant_facts'[\s\S]*?\};/g,
  );
  assert.ok(matches && matches.length >= 2, 'shortlist_quant_facts must appear in rule 2 + 2b');
  // Find the SOURCE blocks (preceding the intent declaration) that build the tools array.
  for (const intentBlock of matches) {
    const blockStart = INTENT_ROUTER_SRC.indexOf(intentBlock);
    const ruleStart = INTENT_ROUTER_SRC.lastIndexOf('if (QUANT_STRUCTURED_FACT_RE.test', blockStart);
    assert.notEqual(ruleStart, -1, 'each shortlist_quant_facts must follow a QUANT regex test');
    const ruleBody = INTENT_ROUTER_SRC.slice(ruleStart, blockStart + intentBlock.length);
    assert.match(ruleBody, /if\s*\(\s*dimension\s*\)/,
      'mixed-ask: rule body must check `if (dimension)` to add compareSchools');
    assert.match(ruleBody, /tools\.unshift\(\s*\{\s*name:\s*'compareSchools'/,
      'mixed-ask: rule must unshift compareSchools when dimension fires');
  }
});

// Codex r3 P1.2 (2026-05-25): prose-runner.js must include shortlist_quant_facts
// in COMPARISON_INTENTS so Slice 6 Pass-2 extracts proposed actions for these
// queries (otherwise re-rank / lens / add-row pills never appear).
test('prose-runner COMPARISON_INTENTS includes shortlist_quant_facts', async () => {
  const PROSE_SRC = await fs.readFile(
    path.resolve(process.cwd(), 'lib/server/prose-runner.js'),
    'utf8',
  );
  const setStart = PROSE_SRC.indexOf('const COMPARISON_INTENTS');
  assert.notEqual(setStart, -1, 'COMPARISON_INTENTS must be defined');
  const setEnd = PROSE_SRC.indexOf(']', setStart);
  const setBlock = PROSE_SRC.slice(setStart, setEnd);
  assert.match(setBlock, /'shortlist_quant_facts'/,
    'COMPARISON_INTENTS must include shortlist_quant_facts');
});

test('intent-router rule 2 short-circuits to per-slug getSchoolFacts for quant facts', () => {
  // The short-circuit must appear inside rule 2 (the "shortlist_rank_or_compare"
  // branch) BEFORE the compareSchools fallback. We grep for the new intent
  // name `shortlist_quant_facts` — if it's missing the routing fix has been
  // reverted.
  assert.match(INTENT_ROUTER_SRC, /intent:\s*'shortlist_quant_facts'/,
    'new shortlist_quant_facts intent must exist');
  assert.match(INTENT_ROUTER_SRC, /QUANT_STRUCTURED_FACT_RE\.test\(q\)/,
    'rule 2 must call QUANT_STRUCTURED_FACT_RE.test before falling through to compareSchools');
});

test('intent-router shortlist_quant_facts plan emits parallel getSchoolFacts (always) and compareSchools (mixed)', () => {
  // Scope to the wider rule body (from the QUANT regex test through to the
  // intent return) so we catch the const-built tools array, not just the
  // inline plan object.
  const ruleStarts = [];
  let idx = 0;
  while ((idx = INTENT_ROUTER_SRC.indexOf('if (QUANT_STRUCTURED_FACT_RE.test', idx)) !== -1) {
    ruleStarts.push(idx);
    idx += 1;
  }
  assert.ok(ruleStarts.length >= 2, 'QUANT short-circuit must appear in both rule 2 and rule 2b');

  for (const start of ruleStarts) {
    const intentDecl = INTENT_ROUTER_SRC.indexOf("intent: 'shortlist_quant_facts'", start);
    assert.notEqual(intentDecl, -1, 'each QUANT short-circuit must declare shortlist_quant_facts intent');
    const end = INTENT_ROUTER_SRC.indexOf('};', intentDecl) + 2;
    const body = INTENT_ROUTER_SRC.slice(start, end);

    // Always: per-slug getSchoolFacts factsTools.
    // 2026-05-25 cap-lift: variable renamed from `slugs` to `factsSlugs`
    // (cap 8 for getSchoolFacts vs 4 for compareSchools tool contract).
    assert.match(body, /factsTools\s*=\s*factsSlugs\.map/, 'must build factsTools per slug');
    assert.match(body, /name:\s*'getSchoolFacts'/, 'factsTools must use getSchoolFacts');
    assert.match(body, /parallel:\s*true/, 'plan must run in parallel');

    // Mixed-ask: if a dimension was also detected, also unshift compareSchools.
    assert.match(body, /if\s*\(\s*dimension\s*\)/, 'must handle mixed-ask (dimension also detected)');
    assert.match(body, /tools\.unshift\(\s*\{\s*name:\s*'compareSchools'/,
      'mixed-ask must unshift compareSchools');
  }
});
