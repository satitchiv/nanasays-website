// sport_breadth dimension tests (2026-07-05).
//
// scoreSportBreadth is the whole-programme scorer behind the sport_breadth
// dimension ("strong academics plus sports" asks that name no sport). Pins:
//   - scorer math + evidence strings on realistic profile shapes
//   - dimension registration + wiring contracts (BIG_COLS, fieldsForDimension)
//   - the specific-sport-first priority (golf beats sport_breadth)
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/sport-breadth.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSportBreadth } from './generic-sport.mjs';
import { DIMENSIONS, fieldsForDimension } from './dimensions.js';
import { BIG_COLS_BY_DIM, colsForRankSchools } from './structured-cols.mjs';

const RICH_PROFILE = {
  signature_sports: ['Golf', 'Tennis', 'Swimming'],
  sport_categories: { academy: ['Golf', 'Tennis'], major: ['Rugby', 'Hockey'], optional: ['Fencing'] },
  teams_by_sport: [
    { sport: 'Rugby', team_count: 12, team_levels: ['1st XV', 'A', 'B'] },
    { sport: 'Hockey', team_count: 8 },
  ],
  competitions_entered: [{ name: 'ISGA', sport: 'Golf', scope: 'national' }, { name: 'Youll Cup', sport: 'Tennis' }],
  facilities: ['9-hole golf course', '25m pool', 'astro pitch'],
  scholarships: { note: 'Sport scholarships at 11+, 13+, 16+' },
  representative_honours: 'Two pupils in county squads',
  source_urls: ['https://example.school/sport'],
};

test('rich multi-academy programme scores high with human-readable evidence', () => {
  const { score, evidence } = scoreSportBreadth(RICH_PROFILE);
  // signature 3×2=6 + academy 2×2=4 + major 2×1=2 + teams min(20/4,4)=4
  // + comps min(2/2,3)=1 + facilities min(3/3,3)=1 + scholarships 2 + honours 1
  assert.equal(score, 21);
  const joined = evidence.join(' | ');
  assert.match(joined, /signature sports: Golf, Tennis, Swimming/);
  assert.match(joined, /academy-level programmes: Golf, Tennis/);
  assert.match(joined, /20 teams across 2 sports/);
  assert.ok(!/[{}"[\]]/.test(joined), `evidence must not leak raw JSON: ${joined}`);
});

test('thin profile (sports merely listed) scores near zero', () => {
  const { score } = scoreSportBreadth({ sports_offered: ['golf', 'tennis'] });
  assert.equal(score, 0);
});

test('null / malformed profiles score 0 without throwing', () => {
  assert.equal(scoreSportBreadth(null).score, 0);
  assert.equal(scoreSportBreadth('oops').score, 0);
  assert.equal(scoreSportBreadth({ teams_by_sport: 'not-an-array', sport_categories: 7 }).score, 0);
});

test('dimension is registered with rank/format/citations and keyword regex', () => {
  const dim = DIMENSIONS.sport_breadth;
  assert.ok(dim, 'sport_breadth must be registered');
  assert.equal(dim.requires_field, 'sports_profile');
  assert.ok(dim.keywords.test('best schools for sport'));
  assert.ok(dim.keywords.test('โรงเรียนที่เด่นด้านกีฬา'));
  assert.ok(!dim.keywords.test('best schools for golf'), 'named sports must not trip the generic keyword');
  assert.equal(dim.rank({ sports_profile: RICH_PROFILE }), 21);
  assert.match(dim.format({ sports_profile: RICH_PROFILE }, { name: 'Testville' }), /^Testville — sport programme: signature sports/);
  assert.match(dim.format({}, { name: 'Empty School' }), /no sport-programme evidence/);
  assert.deepEqual(dim.citations({ sports_profile: RICH_PROFILE }), ['https://example.school/sport']);
});

test('wiring contracts: BIG_COLS opt-in + fieldsForDimension mapping', () => {
  assert.ok(BIG_COLS_BY_DIM.sports_profile.has('sport_breadth'), 'rankSchools must fetch sports_profile for sport_breadth');
  assert.ok(colsForRankSchools('sport_breadth').includes('sports_profile'));
  assert.deepEqual(fieldsForDimension('sport_breadth'), ['sports_profile', 'facilities']);
});
