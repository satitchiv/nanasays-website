// Unit tests for the generic-sport registry + scorer (2026-07-05).
//
// Run via:
//   cd website && node --test lib/server/generic-sport.test.mjs
//
// Fixtures mirror LIVE school_structured_data.sports_profile rows sampled
// 2026-07-05 (ACS Cobham, Bloxham, Alleyn's) so the scorer is tested against
// the real data shapes, not idealised ones.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERIC_SPORTS,
  GENERIC_SPORT_KEYS,
  GENERIC_SPORT_DIM_NAMES,
  genericSportDimName,
  detectGenericSport,
  matchGenericSportLabel,
  scoreSportOffering,
} from './generic-sport.mjs';

// ── Fixtures (live-shape) ────────────────────────────────────────────

// ACS Cobham-like: golf is academy-tier with a national competition entry,
// visible teams, and a named facility.
const ACS_LIKE = {
  signature_sports: ['Football', 'Swimming', 'Basketball', 'Tennis', 'Track and Field'],
  sport_categories: {
    major: ['Basketball', 'Football', 'Swimming'],
    academy: ['Golf', 'Tennis'],
    optional: ['Cross Country', 'Volleyball', 'Dance'],
  },
  teams_by_sport: [
    { sport: 'Golf', gender: 'mixed', team_count: null, team_levels: ['Academy', 'Competitive teams'] },
    { sport: 'Football', gender: 'mixed', team_count: null, team_levels: ['U11', 'U13'] },
  ],
  competitions_entered: [
    { name: 'ISGA & HMC Tournaments', scope: 'national', sport: 'Golf', featured: false },
  ],
  recent_achievements: [],
  facilities: ['Five par-3 practice golf holes', '25m indoor pool'],
  sports_offered: ['Golf', 'Football', 'Swimming', 'Basketball'],
  source_urls: ['https://www.acs-schools.com/sports'],
};

// Bloxham-like: golf is optional-tier with three visible teams.
const BLOXHAM_LIKE = {
  signature_sports: ['Rugby', 'Hockey', 'Cricket', 'Tennis', 'Netball'],
  sport_categories: {
    major: ['Rugby Union', 'Hockey', 'Cricket', 'Netball', 'Tennis'],
    academy: [],
    optional: ['Badminton', 'Squash', 'Golf', 'Sailing', 'Swimming'],
  },
  teams_by_sport: [
    { sport: 'Golf', gender: 'mixed', team_count: 3, team_levels: ['1st Boys', '1st Girls', '1st Mixed'] },
  ],
  competitions_entered: [],
  recent_achievements: [],
  facilities: [],
  sports_offered: ['Rugby Union', 'Hockey', 'Golf', 'Sailing'],
  source_urls: ['https://www.bloxhamschool.com/sport'],
};

// No golf anywhere.
const NO_GOLF = {
  signature_sports: ['Rugby'],
  sport_categories: { major: ['Rugby Union'], academy: [], optional: [] },
  teams_by_sport: [{ sport: 'Rugby Union', gender: 'boys', team_count: 19, team_levels: ['1st XV'] }],
  sports_offered: ['Rugby Union', 'Hockey'],
  source_urls: [],
};

// ── Registry shape ───────────────────────────────────────────────────

test('registry: every entry has label + regex; dim names derive as <key>_offering', () => {
  for (const key of GENERIC_SPORT_KEYS) {
    const spec = GENERIC_SPORTS[key];
    assert.ok(typeof spec.label === 'string' && spec.label.length > 0, `${key} label`);
    assert.ok(spec.re instanceof RegExp, `${key} regex`);
  }
  assert.ok(GENERIC_SPORT_DIM_NAMES.includes('golf_offering'));
  assert.equal(genericSportDimName('swimming'), 'swimming_offering');
});

test('registry: big-five sports are NOT in the generic registry', () => {
  for (const bigFive of ['tennis', 'rugby', 'cricket', 'football', 'hockey']) {
    assert.ok(!GENERIC_SPORT_KEYS.includes(bigFive), `${bigFive} must stay on its *_strength dimension`);
  }
});

// ── Detection ────────────────────────────────────────────────────────

test('detectGenericSport: parent question phrasings', () => {
  assert.equal(detectGenericSport('which schools are best for golf?')?.key, 'golf');
  assert.equal(detectGenericSport('strongest swimming programme')?.key, 'swimming');
  assert.equal(detectGenericSport('top rowing schools')?.key, 'rowing');
  assert.equal(detectGenericSport('is there horse riding?')?.key, 'equestrian');
  assert.equal(detectGenericSport('any clay pigeon shooting?')?.key, 'shooting');
});

test('detectGenericSport: water polo wins over polo; bare polo still matches polo', () => {
  assert.equal(detectGenericSport('best schools for water polo')?.key, 'water_polo');
  assert.equal(detectGenericSport('schools with a polo team')?.key, 'polo');
});

test('detectGenericSport: unknown sport / junk → null', () => {
  assert.equal(detectGenericSport('best schools for kabaddi'), null);
  assert.equal(detectGenericSport(''), null);
  assert.equal(detectGenericSport(null), null);
});

test('matchGenericSportLabel: parent interview labels', () => {
  assert.equal(matchGenericSportLabel('Golf'), 'golf');
  assert.equal(matchGenericSportLabel('horse riding'), 'equestrian');
  assert.equal(matchGenericSportLabel('Clay Pigeon Shooting'), 'shooting');
  // Big-five labels are NOT generic — they belong to the *_strength path.
  assert.equal(matchGenericSportLabel('rugby'), null);
  assert.equal(matchGenericSportLabel('tennis'), null);
  assert.equal(matchGenericSportLabel(''), null);
  assert.equal(matchGenericSportLabel(null), null);
});

// ── Scoring ──────────────────────────────────────────────────────────

test('scoreSportOffering: academy golf with national competition beats optional golf beats no golf', () => {
  const acs = scoreSportOffering(ACS_LIKE, 'golf');
  const blox = scoreSportOffering(BLOXHAM_LIKE, 'golf');
  const none = scoreSportOffering(NO_GOLF, 'golf');

  assert.ok(acs.score > blox.score, `ACS (${acs.score}) should beat Bloxham (${blox.score})`);
  assert.ok(blox.score > 0, 'Bloxham offers golf — must score > 0');
  assert.equal(none.score, 0, 'no golf evidence → 0 (school drops from ranking, no guessing)');
});

test('scoreSportOffering: ACS-like golf breakdown matches the documented model', () => {
  const { score, breakdown, evidence } = scoreSportOffering(ACS_LIKE, 'golf');
  assert.equal(breakdown.category, 5, 'academy category');
  assert.equal(breakdown.teams, 2, '2 team levels, team_count null');
  assert.equal(breakdown.competitions, 3, '1 competition (+2) with national scope (+1)');
  assert.equal(breakdown.facilities, 2, 'golf facility string');
  assert.equal(breakdown.offered, 1, 'listed in sports_offered');
  assert.equal(score, 13);
  // Evidence strings must be parent-readable and cite the actual data.
  const joined = evidence.join('; ');
  assert.match(joined, /academy-level programme/);
  assert.match(joined, /ISGA & HMC Tournaments/);
  assert.match(joined, /par-3 practice golf holes/);
});

test('scoreSportOffering: signature sport scores +6 with evidence', () => {
  const { score, breakdown, evidence } = scoreSportOffering(ACS_LIKE, 'swimming');
  assert.equal(breakdown.signature, 6);
  assert.ok(score >= 6 + 4 + 1, 'signature + major category + offered at minimum');
  assert.match(evidence.join('; '), /signature sports/);
});

test('scoreSportOffering: null / malformed profiles never throw, always 0', () => {
  assert.equal(scoreSportOffering(null, 'golf').score, 0);
  assert.equal(scoreSportOffering(undefined, 'golf').score, 0);
  assert.equal(scoreSportOffering('not-an-object', 'golf').score, 0);
  assert.equal(scoreSportOffering({}, 'golf').score, 0);
  // Strings are neither arrays nor object maps — arr() returns [] and the
  // malformed field contributes nothing rather than throwing.
  assert.equal(scoreSportOffering({ sports_offered: 'golf-not-an-array' }, 'golf').score, 0);
});

test('scoreSportOffering: unknown sport key → 0', () => {
  assert.equal(scoreSportOffering(ACS_LIKE, 'kabaddi').score, 0);
});

test('scoreSportOffering: teams_by_sport as object map (legacy shape) still counts', () => {
  const legacy = {
    teams_by_sport: { golf: { sport: 'Golf', team_count: 2, team_levels: ['1st', '2nd'] } },
    sports_offered: ['Golf'],
  };
  const { score, breakdown } = scoreSportOffering(legacy, 'golf');
  assert.equal(breakdown.teams, 2);
  assert.equal(score, 3);
});

test('rowing regex: sailing regattas are not rowing evidence, Henley is', () => {
  const re = GENERIC_SPORTS.rowing.re;
  assert.equal(re.test('National Schools Sailing Regatta'), false);
  assert.equal(re.test('Schools Sailing Regatta squad'), false);
  assert.equal(re.test('Henley Royal Regatta'), true);
  assert.equal(re.test('entered the National Schools Regatta'), true);
});
