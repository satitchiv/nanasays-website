// Parent-battery routing tests (2026-07-05).
//
// Offline half of scripts/parent-battery.mjs — pins the ROUTING outcome for
// every battery question (the live script additionally checks retrieval
// against the DB). Covers the four fixes shipped together:
//   1. multi-dimension detection (mixed asks keep every asked dimension)
//   2. COMPARE_RE morphology ("comparing"/"compared" now match)
//   3. Thai / mixed Thai-English routing
//   4. CHOICE_RE decision phrasing ("which school should we choose")
// plus anti-regression pins for the behaviors that must NOT change.
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/intent-router-battery.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent, _internals } from './intent-router.js';

const { detectDimensions } = _internals;

const SHORTLIST = ['culford-school', 'merchiston-castle-school', 'reeds-school-uk', 'wellington-college'];

const planDims = (route) => {
  const dims = new Set();
  for (const t of route?.plan?.tools || []) {
    if (t.name === 'rankSchools' && t.args?.dimension) dims.add(t.args.dimension);
    for (const d of t.args?.dimensions || []) dims.add(d);
  }
  return dims;
};

// ── battery: global sport discovery ─────────────────────────────────────────

test('golf global discovery → top_n_for_dim(golf_offering)', () => {
  const r = routeIntent('Which schools are best for golf?', {});
  assert.equal(r?.intent, 'top_n_for_dim');
  assert.ok(planDims(r).has('golf_offering'));
});

test('tennis global discovery → top_n_for_dim(tennis_strength)', () => {
  const r = routeIntent('Which schools are best for tennis?', {});
  assert.equal(r?.intent, 'top_n_for_dim');
  assert.ok(planDims(r).has('tennis_strength'));
});

// ── battery: multi-dim asks ──────────────────────────────────────────────────

test('academics plus sports → BOTH academic_strength and sport_breadth ranked', () => {
  const r = routeIntent('Recommend schools for my child who wants strong academics plus sports.', {});
  assert.equal(r?.intent, 'top_n_for_dim');
  const dims = planDims(r);
  assert.ok(dims.has('academic_strength'), 'academic side kept');
  assert.ok(dims.has('sport_breadth'), 'sport side no longer dropped');
});

test('table ask with shortlist → shortlist compare covering all four asked dims', () => {
  const r = routeIntent(
    'Build me a table comparing the best options for golf, tennis, academics, commute/location, fees/value, and why.',
    { shortlistSlugs: SHORTLIST },
  );
  assert.equal(r?.intent, 'shortlist_rank_or_compare');
  const dims = planDims(r);
  for (const d of ['golf_offering', 'tennis_strength', 'academic_strength', 'fees_value']) {
    assert.ok(dims.has(d), `dim ${d} must be in the plan`);
  }
  // location/commute signal → per-slug location_profile facts appended
  const locTools = r.plan.tools.filter(t => t.name === 'getSchoolFacts' && t.args?.fields?.includes('location_profile'));
  assert.equal(locTools.length, SHORTLIST.length, 'one location facts call per shortlist school');
  assert.equal(r.plan.parallel, true);
});

test('choice phrasing with shortlist → shortlist compare on golf + tennis + academics', () => {
  const r = routeIntent(
    'Which school should Parent Benz choose if the child likes golf and tennis but also needs strong English/academics?',
    { shortlistSlugs: SHORTLIST },
  );
  assert.equal(r?.intent, 'shortlist_rank_or_compare');
  const dims = planDims(r);
  for (const d of ['golf_offering', 'tennis_strength', 'academic_strength']) {
    assert.ok(dims.has(d), `dim ${d} must be in the plan`);
  }
});

test('multi-dim compare of two named schools plans every asked dim', () => {
  const r = routeIntent('Compare Eton and Harrow on golf and academics', {
    mentionedSlugs: ['eton-college', 'harrow-school'],
  });
  assert.equal(r?.intent, 'compare_two_on_dim');
  const dims = planDims(r);
  assert.ok(dims.has('golf_offering'));
  assert.ok(dims.has('academic_strength'));
  // fields union: golf → sports_profile, academics → exam fields
  const facts = r.plan.tools.find(t => t.name === 'getSchoolFacts');
  assert.ok(facts.args.fields.includes('sports_profile'));
  assert.ok(facts.args.fields.includes('exam_results'));
});

// ── battery: Thai / mixed phrasing ───────────────────────────────────────────

test('pure Thai golf discovery routes deterministically', () => {
  const r = routeIntent('โรงเรียนไหนดีที่สุดสำหรับกอล์ฟ?', {});
  assert.equal(r?.intent, 'top_n_for_dim');
  assert.ok(planDims(r).has('golf_offering'));
});

test('mixed Thai/English shortlist compare routes deterministically', () => {
  const r = routeIntent('ช่วยเปรียบเทียบโรงเรียนพวกนี้เรื่อง golf กับ tennis ให้หน่อยค่ะ', {
    shortlistSlugs: SHORTLIST,
  });
  assert.equal(r?.intent, 'shortlist_rank_or_compare');
  const dims = planDims(r);
  assert.ok(dims.has('golf_offering'));
  assert.ok(dims.has('tennis_strength'));
});

test('Thai tennis + academics discovery detects both dims', () => {
  const dims = detectDimensions('โรงเรียนไหนเด่นเรื่องเทนนิสและวิชาการ');
  assert.ok(dims.includes('tennis_strength'));
  assert.ok(dims.includes('academic_strength'));
});

test('random Thai chit-chat does NOT route (stays agentic/legacy)', () => {
  assert.equal(routeIntent('สวัสดีค่ะ วันนี้อากาศดีมาก', {}), null);
});

// ── battery: missing-data sport ─────────────────────────────────────────────

test('untracked sport (curling) has no deterministic route', () => {
  assert.equal(routeIntent('Which schools are best for curling?', {}), null);
});

// ── anti-regression pins ─────────────────────────────────────────────────────

test('COMPARE_RE morphology: "comparing" no longer misroutes to global fees_value', () => {
  const r = routeIntent(
    'Build me a table comparing the best options for golf, tennis, academics, commute/location, fees/value, and why.',
    { shortlistSlugs: SHORTLIST },
  );
  assert.notEqual(r?.intent, 'fees_value');
});

test('single-dim questions still plan exactly one dimension (no multi-dim noise)', () => {
  const r = routeIntent('Which schools are best for golf?', {});
  const ranks = r.plan.tools.filter(t => t.name === 'rankSchools');
  assert.equal(ranks.length, 1, 'one rankSchools call for a one-dim ask');
});

test('rule 3 multi-dim rank fan-out is capped at 3', () => {
  const r = routeIntent('Recommend the best schools for golf, tennis, swimming, rowing and academics', {});
  assert.equal(r?.intent, 'top_n_for_dim');
  const ranks = r.plan.tools.filter(t => t.name === 'rankSchools');
  assert.ok(ranks.length <= 3, `got ${ranks.length} rankSchools calls`);
});

test('verb-style small-class discovery still routes (opt-in preserved)', () => {
  const r = routeIntent('which schools have the smallest class sizes?', {});
  assert.equal(r?.intent, 'top_n_for_dim');
  assert.ok(planDims(r).has('small_class_size'));
});

test('proximity discovery still forces proximity_to_heathrow first', () => {
  const r = routeIntent('nearest schools to Heathrow with strong academics', {});
  assert.equal(r?.intent, 'top_n_for_dim');
  const ranks = r.plan.tools.filter(t => t.name === 'rankSchools');
  assert.equal(ranks[0].args.dimension, 'proximity_to_heathrow');
  assert.ok(ranks.some(t => t.args.dimension === 'academic_strength'));
});

test('global discovery escape still beats shortlist hijack', () => {
  const r = routeIntent('what are the best schools for tennis in Surrey?', { shortlistSlugs: SHORTLIST });
  assert.equal(r?.intent, 'top_n_for_dim');
});

test('"value for money" ask still pulls fees_value alongside the primary dim', () => {
  const r = routeIntent('rank these on academics and value for money', { shortlistSlugs: SHORTLIST });
  const dims = planDims(r);
  assert.ok(dims.has('academic_strength'));
  assert.ok(dims.has('fees_value'));
});

test('detectDimensions preserves single-dim priority order (first hit = old detectDimension)', () => {
  // phrase pass beats keywords: 'pastoral care' → pastoral_care not pastoral_model
  assert.equal(detectDimensions('how good is the pastoral care?')[0], 'pastoral_care');
  // named sport beats sport_breadth even when 'sport' also appears
  const dims = detectDimensions('is golf a big sport at these schools?');
  assert.equal(dims[0], 'golf_offering');
  assert.ok(dims.includes('sport_breadth'));
});

test('Thai table tennis routes to table_tennis_offering, not tennis_strength', () => {
  const dims = detectDimensions('โรงเรียนไหนดีที่สุดสำหรับเทเบิลเทนนิส');
  assert.ok(dims.includes('table_tennis_offering'), 'expected table_tennis_offering');
  assert.ok(!dims.includes('tennis_strength'), 'must not misroute to tennis_strength');
  const plain = detectDimensions('โรงเรียนไหนดีที่สุดสำหรับเทนนิส');
  assert.ok(plain.includes('tennis_strength'), 'plain Thai tennis still routes to tennis_strength');
});
