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

test('exclusive safeguarding_integrity keywords (isi/inspection/compliance) return null', () => {
  // safeguarding_integrity owns 'isi', 'inspection', 'compliance' uniquely —
  // pastoral_model.keywords does NOT match these, so before pre-enable-4 these
  // queries returned the disabled dim. Post-fix they return null.
  assert.equal(detectDimension('what is the isi compliance record?'), null);
  assert.equal(detectDimension('show me the inspection record'), null);
});

test('safeguarding query still resolves to enabled pastoral_model (keyword-loop order, not alias)', () => {
  // pastoral_model.keywords matches 'safeguarding' AND pastoral_model is
  // declared before safeguarding_integrity in DIMENSIONS, so the keyword
  // loop returns pastoral_model first. This is the right UX: a parent
  // asking "safeguarding record at Eton?" gets a pastoral answer, not (no data).
  assert.equal(detectDimension('what is the safeguarding record at eton?'), 'pastoral_model');
});

test('disabled ethos_match is not returned for ethos keywords', () => {
  assert.equal(detectDimension("what is the school's ethos?"), null);
});

test('disabled weekend_life is not returned for weekend keywords', () => {
  assert.equal(detectDimension('what is weekend life like for boarders?'), null);
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

test('compare_two_on_dim with ethos keyword does not pass ethos_match into compareSchools', () => {
  const m = routeIntent('compare eton and harrow on ethos', {
    mentionedSlugs: ['eton-college', 'harrow-school'],
  });
  assert.ok(m, 'expected a compare_two_on_dim match');
  assert.equal(m.intent, 'compare_two_on_dim');
  const dims = dimsInPlan(m);
  for (const d of dims) assert.ok(!DISABLED.has(d), `disabled dim ${d} leaked into plan`);
});

test('top_n_for_dim falls through (returns null) when only-matching dim is disabled', () => {
  // "best schools for ethos" — ethos used to map to ethos_match (disabled).
  // Post-fix detectDimension returns null, top_n_for_dim requires dimension,
  // so routeIntent falls through and the agentic loop handles it.
  const m = routeIntent('best schools for ethos', {});
  assert.equal(m, null);
});

test('top_n_for_dim succeeds when keyword maps to an enabled dim', () => {
  const m = routeIntent('best schools for tennis', {});
  assert.ok(m, 'expected a top_n_for_dim match');
  assert.equal(m.intent, 'top_n_for_dim');
  for (const d of dimsInPlan(m)) assert.ok(!DISABLED.has(d), `disabled dim ${d} in plan`);
});
