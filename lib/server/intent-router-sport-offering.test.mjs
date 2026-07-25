// Intent-router coverage for generic sport questions (2026-07-05).
//
// The 2026-07 parent-testing gap: "which schools are best for golf?" had no
// deterministic route — golf isn't a big-five sport, detectDimension returned
// null, and the question fell to the slow agentic loop where rankSchools had
// no dimension to rank on. These tests pin the new behaviour: any registry
// sport routes through top_n_for_dim / compare_two_on_dim with its
// <sport>_offering dimension, while the big-five keep their *_strength dims.
//
// Run via:
//   cd website && node --test lib/server/intent-router-sport-offering.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent, _internals } from './intent-router.js';

const { detectDimension } = _internals;

// ── detectDimension ──────────────────────────────────────────────────

test('detectDimension: generic sports resolve to their _offering dim', () => {
  assert.equal(detectDimension('which schools are best for golf?'), 'golf_offering');
  assert.equal(detectDimension('strongest swimming schools'), 'swimming_offering');
  assert.equal(detectDimension('schools with a rowing programme'), 'rowing_offering');
  assert.equal(detectDimension('best schools for netball'), 'netball_offering');
});

test('detectDimension: big-five sports still map to *_strength (priority intact)', () => {
  assert.equal(detectDimension('best schools for tennis'), 'tennis_strength');
  assert.equal(detectDimension('best schools for rugby'), 'rugby_standing');
  assert.equal(detectDimension('best schools for football'), 'football_strength');
  assert.equal(detectDimension('best schools for cricket'), 'cricket_strength');
  assert.equal(detectDimension('best schools for hockey'), 'hockey_strength');
});

test('detectDimension: water polo → water_polo_offering, not polo', () => {
  assert.equal(detectDimension('best schools for water polo'), 'water_polo_offering');
});

test('detectDimension: unknown sport stays null (falls through to agentic loop)', () => {
  assert.equal(detectDimension('best schools for kabaddi'), null);
});

// ── routeIntent: global discovery ────────────────────────────────────

test('"which schools are best for golf?" routes deterministically to rankSchools(golf_offering)', () => {
  const match = routeIntent('which schools are best for golf?', {});
  assert.ok(match, 'expected a deterministic route, not agentic fallthrough');
  assert.equal(match.intent, 'top_n_for_dim');
  const rank = match.plan.tools.find(t => t.name === 'rankSchools');
  assert.ok(rank, 'rankSchools in plan');
  assert.equal(rank.args.dimension, 'golf_offering');
});

test('"top 5 schools for swimming" carries the N through', () => {
  const match = routeIntent('top 5 schools for swimming', {});
  assert.ok(match);
  assert.equal(match.intent, 'top_n_for_dim');
  const rank = match.plan.tools.find(t => t.name === 'rankSchools');
  assert.equal(rank.args.dimension, 'swimming_offering');
  assert.equal(rank.args.limit, 5);
});

test('tennis discovery is unchanged by the new dims', () => {
  const match = routeIntent('what are the best schools for tennis?', {});
  assert.ok(match);
  assert.equal(match.intent, 'top_n_for_dim');
  const rank = match.plan.tools.find(t => t.name === 'rankSchools');
  assert.equal(rank.args.dimension, 'tennis_strength');
});

test('unknown sport → router returns null so the agentic loop takes over', () => {
  assert.equal(routeIntent('which schools are best for kabaddi?', {}), null);
});

// ── routeIntent: comparisons ─────────────────────────────────────────

test('"compare X and Y on golf" → compare_two_on_dim with golf_offering + sports_profile facts', () => {
  const match = routeIntent('compare eton-college and harrow-school on golf', {
    mentionedSlugs: ['eton-college', 'harrow-school'],
  });
  assert.ok(match);
  assert.equal(match.intent, 'compare_two_on_dim');
  const cmp = match.plan.tools.find(t => t.name === 'compareSchools');
  assert.deepEqual(cmp.args.dimensions, ['golf_offering']);
  // Phase 0.5a field gating must fetch the blob the dim actually reads.
  const facts = match.plan.tools.filter(t => t.name === 'getSchoolFacts');
  assert.equal(facts.length, 2);
  for (const f of facts) assert.deepEqual(f.args.fields, ['sports_profile']);
});

test('shortlist + "which of these is best for golf" compares the shortlist on golf_offering', () => {
  const match = routeIntent('which of these schools is best for golf?', {
    shortlistSlugs: ['school-a', 'school-b', 'school-c'],
  });
  assert.ok(match);
  assert.equal(match.intent, 'shortlist_rank_or_compare');
  const cmp = match.plan.tools.find(t => t.name === 'compareSchools');
  assert.ok(cmp);
  assert.deepEqual(cmp.args.dimensions, ['golf_offering']);
  assert.deepEqual(cmp.args.slugs, ['school-a', 'school-b', 'school-c']);
});

// ── Verb-style discovery (2026-07-05 opt-in) ─────────────────────────

test('"which schools offer golf?" routes via verb-discovery to rankSchools(golf_offering)', () => {
  const match = routeIntent('which schools offer golf?', {});
  assert.ok(match, 'verb-style sport discovery must not fall to agentic');
  assert.equal(match.intent, 'top_n_for_dim');
  const rank = match.plan.tools.find(t => t.name === 'rankSchools');
  assert.equal(rank.args.dimension, 'golf_offering');
});

test('"find schools with rowing" routes via verb-discovery', () => {
  const match = routeIntent('find schools with rowing', {});
  assert.ok(match);
  const rank = match.plan.tools.find(t => t.name === 'rankSchools');
  assert.equal(rank.args.dimension, 'rowing_offering');
});

test('verb-discovery opt-in does NOT leak to non-sport dims (fees polarity guard intact)', () => {
  // "which schools have high fees" must NOT route to fees_value (which
  // scores LOW fees higher). Pre-existing Codex r2 P1 guard — re-pinned here
  // because the opt-in set changed shape.
  const match = routeIntent('which schools have high fees', {});
  assert.equal(match, null);
});

test('verb-style sport discovery beats a loaded shortlist (global escape intact)', () => {
  const match = routeIntent('which schools offer golf?', {
    shortlistSlugs: ['school-a', 'school-b', 'school-c'],
  });
  assert.ok(match);
  assert.equal(match.intent, 'top_n_for_dim',
    'GLOBAL_DISCOVERY_VERB_RE escape must keep this out of the shortlist rules');
});
