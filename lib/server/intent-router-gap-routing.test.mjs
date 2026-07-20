// RRV-8 — gap→alternative retrieval routing tests (2026-07-20).
//
// Single-school worry/fit/fact intents (safeguarding_or_pastoral,
// tell_me_about_school, fact_lookup) now also fetch getSchoolFacts for up to
// 3 OTHER shortlisted schools (role: 'neighbour', same fields as the target)
// so prose-runner.js has real data to route an honest gap to instead of
// inventing an alternative. Pins: neighbour tools appear/are capped/exclude
// the target/vanish without a shortlist, across all 3 touched intents.
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/intent-router-gap-routing.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent } from './intent-router.js';

const SHORTLIST_5 = ['oakham-school', 'wellington-college', 'brighton-college', 'sherborne-school', 'reeds-school-uk'];

function neighbourTools(route) {
  return (route?.plan?.tools || []).filter(t => t.role === 'neighbour');
}
function primaryTools(route) {
  return (route?.plan?.tools || []).filter(t => t.role === 'primary');
}

// ── safeguarding_or_pastoral ────────────────────────────────────────────────

test('safeguarding: shortlist present → up to 3 neighbour getSchoolFacts calls, target excluded', () => {
  const r = routeIntent('What is the pastoral care and wellbeing support like at Oakham for boarders?', {
    mentionedSlugs: ['oakham-school'],
    shortlistSlugs: SHORTLIST_5,
  });
  assert.equal(r?.intent, 'safeguarding_or_pastoral');
  const neighbours = neighbourTools(r);
  assert.equal(neighbours.length, 3, 'capped at 3');
  assert.ok(neighbours.every(t => t.name === 'getSchoolFacts'));
  assert.ok(neighbours.every(t => t.args.slug !== 'oakham-school'), 'target never appears as its own neighbour');
  const pastoralFields = ['pastoral_model', 'pastoral_care', 'wellbeing_staffing', 'policies_summary'];
  for (const t of neighbours) assert.deepEqual(t.args.fields, pastoralFields, 'neighbour reuses the target\'s own fields');
});

test('safeguarding: primary tools (searchSafeguarding + getSchoolFacts) still tagged role=primary', () => {
  const r = routeIntent('what is pastoral care like at Oakham?', { mentionedSlugs: ['oakham-school'], shortlistSlugs: SHORTLIST_5 });
  const primary = primaryTools(r);
  assert.equal(primary.length, 2);
  assert.ok(primary.some(t => t.name === 'searchSafeguarding' && t.args.slug === 'oakham-school'));
  assert.ok(primary.some(t => t.name === 'getSchoolFacts' && t.args.slug === 'oakham-school'));
});

test('safeguarding: no shortlist → no neighbour tools, behavior unchanged', () => {
  const r = routeIntent('what is pastoral care like at Oakham?', { mentionedSlugs: ['oakham-school'] });
  assert.equal(r?.intent, 'safeguarding_or_pastoral');
  assert.equal(neighbourTools(r).length, 0);
  assert.equal(r.plan.tools.length, 2);
});

test('safeguarding: duplicate shortlist entries are deduped before the neighbour cap', () => {
  const r = routeIntent('What is the pastoral care and wellbeing support like at Oakham for boarders?', {
    mentionedSlugs: ['oakham-school'],
    shortlistSlugs: ['wellington-college', 'wellington-college', 'brighton-college', 'oakham-school'],
  });
  const neighbours = neighbourTools(r);
  const slugs = neighbours.map(t => t.args.slug);
  assert.deepEqual(slugs, [...new Set(slugs)], 'no duplicate neighbour calls for a duplicated shortlist entry');
  assert.equal(neighbours.length, 2, 'wellington-college counted once, brighton-college once, oakham excluded');
});

test('safeguarding: shortlist only contains the target itself → no neighbour tools', () => {
  const r = routeIntent('what is pastoral care like at Oakham?', {
    mentionedSlugs: ['oakham-school'],
    shortlistSlugs: ['oakham-school'],
  });
  assert.equal(neighbourTools(r).length, 0);
});

// ── tell_me_about_school ────────────────────────────────────────────────────

test('tell_me_about_school: neighbours fetched with the same 10-field list, capped at 3', () => {
  const r = routeIntent('Tell me about Wellington College', {
    mentionedSlugs: ['wellington-college'],
    shortlistSlugs: SHORTLIST_5,
  });
  assert.equal(r?.intent, 'tell_me_about_school');
  const neighbours = neighbourTools(r);
  assert.equal(neighbours.length, 3);
  assert.ok(neighbours.every(t => t.args.slug !== 'wellington-college'));
  const target = primaryTools(r).find(t => t.name === 'getSchoolFacts');
  for (const t of neighbours) assert.deepEqual(t.args.fields, target.args.fields);
  // searchSchoolText (vector search) must NOT be duplicated per neighbour — cost control.
  assert.equal(r.plan.tools.filter(t => t.name === 'searchSchoolText').length, 1);
});

test('tell_me_about_school: fit-phrasing question routes the same way', () => {
  const r = routeIntent('Would Wellington be a good fit for my daughter?', {
    mentionedSlugs: ['wellington-college'],
    shortlistSlugs: SHORTLIST_5,
  });
  assert.equal(r?.intent, 'tell_me_about_school');
  assert.equal(neighbourTools(r).length, 3);
});

// ── fact_lookup ──────────────────────────────────────────────────────────────

test('fact_lookup: dimension-derived fields propagate to neighbours', () => {
  const r = routeIntent('What are the admissions requirements at Sherborne?', {
    mentionedSlugs: ['sherborne-school'],
    shortlistSlugs: SHORTLIST_5,
  });
  assert.equal(r?.intent, 'fact_lookup');
  const neighbours = neighbourTools(r);
  assert.ok(neighbours.length > 0 && neighbours.length <= 3);
  assert.ok(neighbours.every(t => t.args.slug !== 'sherborne-school'));
  const target = primaryTools(r).find(t => t.name === 'getSchoolFacts');
  for (const t of neighbours) assert.deepEqual(t.args.fields, target.args.fields);
});

test('fact_lookup: no explicit fields (default set) still threads consistently to neighbours', () => {
  const r = routeIntent('What is the school code for Reed\'s?', {
    mentionedSlugs: ['reeds-school-uk'],
    shortlistSlugs: SHORTLIST_5,
  });
  if (r?.intent !== 'fact_lookup') return; // routing depends on FACT_LOOKUP_RE matching this exact phrasing
  const target = primaryTools(r).find(t => t.name === 'getSchoolFacts');
  const neighbours = neighbourTools(r);
  for (const t of neighbours) assert.deepEqual(t.args.fields, target.args.fields);
});

// ── comparison-shaped intents must be untouched ─────────────────────────────

test('comparison-shaped intents never get role tags (out of scope for RRV-8)', () => {
  const r = routeIntent('Compare Oakham and Wellington on pastoral care', {
    mentionedSlugs: ['oakham-school', 'wellington-college'],
  });
  assert.equal(r?.intent, 'compare_two_on_dim');
  assert.ok((r.plan.tools || []).every(t => t.role === undefined));
});
