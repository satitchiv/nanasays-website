import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent, _internals } from './intent-router.js';
import { DIMENSIONS } from './dimensions.js';

const { detectDimension } = _internals;

// Pre-enable-4 contract: detectDimension MUST never return a dimension whose
// `enabled` flag is false. Without this, the deterministic plan can suggest
// a disabled dim and tools.js (post pre-enable-2) silently skips it, which
// renders as `(no data)` via tool-result-compact.js.

test('there is at least one disabled dim to exercise the contract', () => {
  const disabled = Object.entries(DIMENSIONS).filter(([, d]) => d.enabled === false);
  assert.ok(disabled.length > 0, 'expected at least one disabled dim as a fixture');
});

test('enabled safeguarding_integrity keywords (isi/inspection/compliance) route correctly', () => {
  assert.equal(detectDimension('what is the isi compliance record?'), 'safeguarding_integrity');
  assert.equal(detectDimension('show me the inspection record'), 'safeguarding_integrity');
});

test('safeguarding query still resolves to enabled pastoral_model (keyword-loop order, not alias)', () => {
  // pastoral_model.keywords matches 'safeguarding' AND pastoral_model is
  // declared before safeguarding_integrity in DIMENSIONS, so the keyword
  // loop returns pastoral_model first. This is the right UX: a parent
  // asking "safeguarding record at Eton?" gets a pastoral answer, not (no data).
  assert.equal(detectDimension('what is the safeguarding record at eton?'), 'pastoral_model');
});

// T4.16 Gap B wiring exists for ethos_match / intl_share / device_policy.
// Each dim only routes after source-backed coverage + smoke review. ethos_match
// has passed; intl_share and device_policy remain disabled.
test('enabled ethos_match returns for ethos keywords', () => {
  assert.equal(detectDimension("what is the school's ethos?"), 'ethos_match');
});

test('enabled weekend_life returns for weekend keywords', () => {
  assert.equal(detectDimension('what is weekend life like for boarders?'), 'weekend_life');
});

test('disabled intl_share is not returned for international keywords', () => {
  assert.equal(detectDimension('how many international pupils does the school have?'), null);
});

test('disabled device_policy is not returned for phone keywords', () => {
  assert.equal(detectDimension('what is the phone policy?'), null);
});

test('enabled tennis_strength still routes correctly via alias', () => {
  assert.equal(detectDimension('how strong is tennis here?'), 'tennis_strength');
});

test('enabled academic_strength still routes correctly via multi-word phrase', () => {
  assert.equal(detectDimension('what are the a-level results?'), 'academic_strength');
});

test('enabled fees_value still routes correctly via keyword regex', () => {
  assert.equal(detectDimension('how much are the fees?'), 'fees_value');
});

test('enabled academic_strength still routes correctly via keyword regex', () => {
  // 'gcse' alias also points at academic_strength — either way, contract
  // is "an enabled dim is returned for an enabled-keyword query".
  assert.equal(detectDimension('how are gcse results at this school?'), 'academic_strength');
});

// ── Route-level locks (Codex r1 ask): assert that no plan emitted by
// routeIntent ever names a disabled dim in compareSchools / rankSchools args.
// Mirrors the user-visible promise — disabled dims never reach the tool layer.

const DISABLED = new Set(
  Object.entries(DIMENSIONS).filter(([, d]) => d.enabled === false).map(([n]) => n),
);

function dimsInPlan(match) {
  if (!match?.plan?.tools) return [];
  const out = [];
  for (const t of match.plan.tools) {
    if (t.name === 'compareSchools' && Array.isArray(t.args?.dimensions)) out.push(...t.args.dimensions);
    if (t.name === 'rankSchools'    && t.args?.dimension) out.push(t.args.dimension);
  }
  return out;
}

test('compare_two_on_dim with weekend keyword passes weekend_life into compareSchools', () => {
  const m = routeIntent('compare eton and harrow on weekend life', {
    mentionedSlugs: ['eton-college', 'harrow-school'],
  });
  assert.ok(m, 'expected a compare_two_on_dim match');
  assert.equal(m.intent, 'compare_two_on_dim');
  const dims = dimsInPlan(m);
  assert.ok(dims.includes('weekend_life'), 'expected weekend_life in compareSchools plan');
  for (const d of dims) assert.ok(!DISABLED.has(d), `disabled dim ${d} leaked into plan`);
});

test('top_n_for_dim succeeds when keyword maps to enabled weekend_life', () => {
  const m = routeIntent('best schools for weekend life', {});
  assert.ok(m, 'expected a top_n_for_dim match');
  assert.equal(m.intent, 'top_n_for_dim');
  assert.deepEqual(dimsInPlan(m), ['weekend_life']);
  for (const d of dimsInPlan(m)) assert.ok(!DISABLED.has(d), `disabled dim ${d} in plan`);
});

test('top_n_for_dim succeeds when keyword maps to an enabled dim', () => {
  const m = routeIntent('best schools for tennis', {});
  assert.ok(m, 'expected a top_n_for_dim match');
  assert.equal(m.intent, 'top_n_for_dim');
  for (const d of dimsInPlan(m)) assert.ok(!DISABLED.has(d), `disabled dim ${d} in plan`);
});

// ────────────────────────────────────────────────────────────────────────────
// Codex r4 P1 (2026-05-25): route-level tests for the notion-sidecar
// quant-fact short-circuit (rules 2 + 2b + the new rule 2c for terse asks).
// Earlier rounds covered the regex coverage + plan shape via source-text
// grep; these tests exercise routeIntent() end-to-end so a regex tweak that
// changes match coverage trips here too.
// ────────────────────────────────────────────────────────────────────────────

const SHORTLIST = ['eton-college', 'harrow-school', 'radley-college'];

test('routeIntent rule 2 (shortlist + compare verb + quant fact) → shortlist_quant_facts', () => {
  const m = routeIntent('compare my shortlist on class sizes', { shortlistSlugs: SHORTLIST });
  assert.ok(m, 'expected a match');
  assert.equal(m.intent, 'shortlist_quant_facts');
  assert.equal(m.plan.mode, 'deterministic');
  assert.equal(m.plan.parallel, true);
  // Per-slug getSchoolFacts for every shortlist member.
  const facts = m.plan.tools.filter(t => t.name === 'getSchoolFacts');
  assert.equal(facts.length, SHORTLIST.length);
  assert.deepEqual(facts.map(t => t.args.slug).sort(), [...SHORTLIST].sort());
});

test('routeIntent rule 2b (shortlist + non-deictic verb + quant fact) → shortlist_quant_facts', () => {
  const m = routeIntent('rank them by pupil count', { shortlistSlugs: SHORTLIST });
  assert.ok(m, 'expected a match');
  assert.equal(m.intent, 'shortlist_quant_facts');
  assert.equal(m.plan.parallel, true);
});

test('routeIntent rule 2c (terse quant fact, NO compare verb) → shortlist_quant_facts', () => {
  // This is the Codex r4 P1 failure mode — terse questions without
  // "compare/rank/these" verbs that previously fell through to legacy:global.
  for (const q of [
    'what are the average class sizes',
    'how many pupils',
    'what is the boarding percentage',
    'distance from Heathrow',
    'what year does boarding start',
    'GCSE 9-7 results',
  ]) {
    const m = routeIntent(q, { shortlistSlugs: SHORTLIST });
    assert.ok(m, `expected a match for "${q}"`);
    assert.equal(m.intent, 'shortlist_quant_facts', `"${q}" must route to shortlist_quant_facts`);
    const facts = m.plan.tools.filter(t => t.name === 'getSchoolFacts');
    assert.equal(facts.length, SHORTLIST.length, `"${q}" must emit per-slug getSchoolFacts`);
  }
});

test('routeIntent rule 2c respects mentionedSlugs short-circuit (defers to rule 1)', () => {
  // When parent names schools explicitly, rule 1 (compare_two_on_dim)
  // should win over rule 2c even though the regex matches.
  const m = routeIntent('compare Eton and Harrow on class sizes', {
    shortlistSlugs: SHORTLIST,
    mentionedSlugs: ['eton-college', 'harrow-school'],
  });
  assert.ok(m, 'expected a match');
  assert.equal(m.intent, 'compare_two_on_dim');
});

test('routeIntent mixed-ask (quant fact + dimension) emits both compareSchools + getSchoolFacts', () => {
  // "culture" maps to pastoral_model dimension; "class sizes" hits the
  // quant regex. Mixed-ask should produce a plan with BOTH tools.
  const m = routeIntent('compare my shortlist on culture and class sizes', {
    shortlistSlugs: SHORTLIST,
  });
  assert.ok(m, 'expected a match');
  assert.equal(m.intent, 'shortlist_quant_facts');
  assert.ok(m.plan.tools.some(t => t.name === 'compareSchools'),
    'mixed-ask must include compareSchools for the dimension side');
  const facts = m.plan.tools.filter(t => t.name === 'getSchoolFacts');
  assert.equal(facts.length, SHORTLIST.length,
    'mixed-ask must still include per-slug getSchoolFacts for the quant side');
});

test('routeIntent rule 2c does NOT fire when shortlist has fewer than 2 schools', () => {
  const m = routeIntent('what is the class size', { shortlistSlugs: ['eton-college'] });
  // Should fall through to other rules / legacy fallback. Just assert it
  // did NOT produce shortlist_quant_facts.
  if (m) assert.notEqual(m.intent, 'shortlist_quant_facts');
});

test('routeIntent rule 2c does NOT hijack global discovery ("best schools for X")', () => {
  const m = routeIntent('what are the best schools for class size', { shortlistSlugs: SHORTLIST });
  // GLOBAL_DISCOVERY_RE escape hatch — should route to top_n_for_dim or
  // fall through, NOT shortlist_quant_facts.
  if (m) assert.notEqual(m.intent, 'shortlist_quant_facts');
});

// 2026-05-25 cap-lift: shortlist_quant_facts originally inherited a
// `slugs.slice(0, 4)` cap from rules 2/2b's compareSchools branch — but
// getSchoolFacts is called once per slug in parallel, no per-tool ceiling.
// Browser smoke 2026-05-25 had a 6-school shortlist; Millfield + Radley were
// silently dropped. Cap is now 8 for getSchoolFacts; compareSchools still
// caps at 4 in mixed-ask (tool contract).
test('routeIntent shortlist_quant_facts emits getSchoolFacts for up to 8 schools (not 4)', () => {
  const big = [
    'eton-college', 'harrow-school', 'clifton-college', 'epsom-college',
    'millfield-school', 'radley-college',
  ]; // 6 schools — the browser-smoke set
  const m = routeIntent('compare class sizes across my shortlist', { shortlistSlugs: big });
  assert.ok(m, 'expected a match');
  assert.equal(m.intent, 'shortlist_quant_facts');
  const facts = m.plan.tools.filter(t => t.name === 'getSchoolFacts');
  assert.equal(facts.length, big.length,
    'all 6 shortlist members must get per-slug getSchoolFacts (was capped at 4)');
  assert.deepEqual(facts.map(t => t.args.slug).sort(), [...big].sort());
});

test('routeIntent shortlist_quant_facts hard-caps at 8 even with larger shortlist', () => {
  const tenSlugs = Array.from({ length: 10 }, (_, i) => `school-${i + 1}`);
  const m = routeIntent('compare class sizes across my shortlist', { shortlistSlugs: tenSlugs });
  assert.ok(m);
  const facts = m.plan.tools.filter(t => t.name === 'getSchoolFacts');
  assert.equal(facts.length, 8, 'cap holds at 8 for shortlists > 8 schools');
  // Codex GREEN-NIT: recommendedSchoolSlugs must also respect the 8-cap so
  // downstream UI consumers don't see all 10.
  assert.equal(m.recommendedSchoolSlugs.length, 8,
    'recommendedSchoolSlugs caps at 8 too (matches factsSlugs)');
});

test('routeIntent shortlist_quant_facts mixed-ask: getSchoolFacts up to 8, compareSchools up to 4', () => {
  const big = [
    'eton-college', 'harrow-school', 'clifton-college', 'epsom-college',
    'millfield-school', 'radley-college',
  ];
  const m = routeIntent('compare my shortlist on culture and class sizes', { shortlistSlugs: big });
  assert.ok(m);
  const facts = m.plan.tools.filter(t => t.name === 'getSchoolFacts');
  const compare = m.plan.tools.filter(t => t.name === 'compareSchools');
  assert.equal(facts.length, 6, 'getSchoolFacts gets all 6 (cap 8 not hit)');
  assert.equal(compare.length, 1, 'one compareSchools call');
  assert.equal(compare[0].args.slugs.length, 4,
    'compareSchools respects its 2-4 cap even when shortlist > 4');
});

test('routeIntent rule 2c does NOT hijack global discovery verbs (which/find/show/list/suggest schools)', () => {
  // Codex r5 P1 (2026-05-25): GLOBAL_DISCOVERY_VERB_RE escape hatch covers
  // query verbs that don't use "best/top/leading" but are still clearly
  // global discovery. With an active shortlist loaded these previously
  // routed to shortlist_quant_facts on the wrong set of schools.
  for (const q of [
    'which schools have the smallest class sizes',
    'find schools with low class sizes',
    'show me schools by class size',
    'list schools with the most boarders',
    'suggest schools with high A-Level results',
    'name schools near Heathrow',
    // Codex r6 P1 (2026-05-25): "what" variant + hyphenated descriptors
    // ("all-girls schools" wasn't matched by `\w` — now uses `[\w-]`).
    'what schools have the smallest class sizes',
    'which all-girls schools have the smallest class sizes',
    'what schools are closest to Heathrow',
  ]) {
    const m = routeIntent(q, { shortlistSlugs: SHORTLIST });
    if (m) {
      assert.notEqual(m.intent, 'shortlist_quant_facts',
        `"${q}" must NOT hijack to shortlist_quant_facts (global discovery)`);
    }
  }
});
