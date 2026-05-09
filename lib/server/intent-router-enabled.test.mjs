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
