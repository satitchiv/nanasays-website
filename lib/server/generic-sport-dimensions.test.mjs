// Integration tests: generic sport-offering dimensions registered in
// DIMENSIONS + the plumbing contracts around them (2026-07-05).
//
// Run via:
//   cd website && node --test lib/server/generic-sport-dimensions.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIMENSIONS,
  hasRequiredData,
  listDimensions,
  suggestDimensions,
  fieldsForDimension,
} from './dimensions.js';
import { GENERIC_SPORT_DIM_NAMES } from './generic-sport.mjs';
import { colsForRankSchools, colsForCompareSchools } from './structured-cols.mjs';

const GOLF_ROW = {
  school_slug: 'acs-international-school-cobham',
  sports_profile: {
    sport_categories: { major: [], academy: ['Golf'], optional: [] },
    teams_by_sport: [{ sport: 'Golf', gender: 'mixed', team_count: null, team_levels: ['Academy', 'Competitive teams'] }],
    competitions_entered: [{ name: 'ISGA & HMC Tournaments', scope: 'national', sport: 'Golf' }],
    facilities: ['Five par-3 practice golf holes'],
    sports_offered: ['Golf', 'Football'],
    source_urls: ['https://www.acs-schools.com/sports'],
  },
};

const NO_PROFILE_ROW = { school_slug: 'no-profile-school', sports_profile: null };

test('every generic sport dim is registered, enabled, and grouped', () => {
  for (const name of GENERIC_SPORT_DIM_NAMES) {
    const dim = DIMENSIONS[name];
    assert.ok(dim, `${name} missing from DIMENSIONS`);
    assert.notEqual(dim.enabled, false, `${name} must not be disabled`);
    assert.equal(dim.doc_group, 'sport_offering');
    assert.equal(dim.requires_field, 'sports_profile');
  }
});

test('generic dims never shadow the big-five *_strength dims', () => {
  // The registry excludes tennis/rugby/cricket/football/hockey, so no
  // <bigfive>_offering name may exist AND the *_strength dims must be intact.
  for (const strength of ['tennis_strength', 'rugby_standing', 'football_strength', 'cricket_strength', 'hockey_strength']) {
    assert.ok(DIMENSIONS[strength], `${strength} must survive registration`);
    assert.notEqual(DIMENSIONS[strength].doc_group, 'sport_offering');
  }
});

test('golf_offering.rank scores the live-shape row; format carries evidence; citations = source_urls', () => {
  const dim = DIMENSIONS.golf_offering;
  const score = dim.rank(GOLF_ROW);
  assert.ok(score > 0, `expected positive golf score, got ${score}`);

  const formatted = dim.format(GOLF_ROW, { name: 'ACS Cobham' });
  assert.match(formatted, /ACS Cobham — golf:/);
  assert.match(formatted, /academy-level programme/);
  assert.match(formatted, /ISGA & HMC Tournaments/);

  assert.deepEqual(dim.citations(GOLF_ROW), ['https://www.acs-schools.com/sports']);
});

test('rank/format degrade honestly when the school has no sports_profile', () => {
  const dim = DIMENSIONS.golf_offering;
  assert.equal(dim.rank(NO_PROFILE_ROW), 0);
  assert.match(dim.format(NO_PROFILE_ROW, { name: 'X School' }), /no golf evidence/);
  assert.deepEqual(dim.citations(NO_PROFILE_ROW), []);
  assert.equal(hasRequiredData(NO_PROFILE_ROW, 'golf_offering'), false,
    'quality gate: no sports_profile → not rankable');
  assert.equal(hasRequiredData(GOLF_ROW, 'golf_offering'), true);
});

test('fieldsForDimension returns [sports_profile] for generic sport dims', () => {
  assert.deepEqual(fieldsForDimension('golf_offering'), ['sports_profile']);
  assert.deepEqual(fieldsForDimension('swimming_offering'), ['sports_profile']);
  // Unknown dims still fall through to null (getSchoolFacts default).
  assert.equal(fieldsForDimension('not_a_dimension'), null);
});

test('structured-cols: rankSchools/compareSchools fetch sports_profile for generic dims', () => {
  assert.ok(colsForRankSchools('golf_offering').includes('sports_profile'));
  assert.ok(colsForCompareSchools(['swimming_offering']).includes('sports_profile'));
  // …and still NOT for unrelated dims (the egress optimisation stays intact).
  assert.ok(!colsForRankSchools('academic_strength').includes('sports_profile'));
});

test('suggestDimensions surfaces golf_offering for a golf question', () => {
  const suggested = suggestDimensions('which schools are best for golf?');
  assert.ok(suggested.includes('golf_offering'), `got: ${suggested.join(', ')}`);
});

test('suggestDimensions still prefers tennis_strength for tennis questions', () => {
  const suggested = suggestDimensions('which schools are best for tennis?');
  assert.ok(suggested.includes('tennis_strength'));
  assert.ok(!suggested.includes('tennis_offering'), 'tennis has no generic dim');
});

test('listDimensions exposes doc_group so agentic-loop can collapse the docs', () => {
  const dims = listDimensions();
  const golf = dims.find(d => d.name === 'golf_offering');
  assert.ok(golf, 'golf_offering listed');
  assert.equal(golf.doc_group, 'sport_offering');
  const academic = dims.find(d => d.name === 'academic_strength');
  assert.equal(academic.doc_group, undefined, 'non-grouped dims unchanged');
});
