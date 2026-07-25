// TABLE_FORMAT_NOTE + location_profile carve-out tests (2026-07-05).
//
// (a) When the parent explicitly asks for a table (English or Thai ตาราง),
//     the pass-1 user message must instruct a markdown table with "no data"
//     cells — otherwise the prose voice rules win and the parent gets
//     paragraphs instead of the table they asked for.
// (b) getSchoolFacts location_profile blobs must render commute facts
//     (airport drive times, nearest town) as usable lines, not the generic
//     compactor's "[3 × {name,…}]" shape summary.
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/prose-runner-table-note.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUserMessage, TABLE_FORMAT_NOTE, TABLE_REQUEST_RE } from './prose-runner.js';
import { injectToolResult } from './tool-result-compact.js';

const BLOBS = [{ name: 'compareSchools', summary: '…', compact: '…' }];
const msgFor = (question) => buildUserMessage(question, { intent: 'shortlist_rank_or_compare' }, BLOBS, null, null);

test('table note fires for explicit table asks (English + Thai)', () => {
  assert.ok(msgFor('Build me a table comparing golf and fees').includes(TABLE_FORMAT_NOTE));
  assert.ok(msgFor('show this as a table please').includes(TABLE_FORMAT_NOTE));
  assert.ok(msgFor('ขอเป็นตารางเปรียบเทียบหน่อยค่ะ').includes(TABLE_FORMAT_NOTE));
});

test('table note does NOT fire without a table ask', () => {
  assert.ok(!msgFor('compare these schools on golf and fees').includes(TABLE_FORMAT_NOTE));
  // "timetable" must not count as a table request
  assert.ok(!TABLE_REQUEST_RE.test('what does the weekly timetable look like'));
});

test('note demands full cells + explicit "no data" for gaps', () => {
  assert.match(TABLE_FORMAT_NOTE, /markdown table/);
  assert.match(TABLE_FORMAT_NOTE, /"no data"/);
  assert.match(TABLE_FORMAT_NOTE, /one row per school/);
});

test('location_profile carve-out renders commute facts, not shape summaries', () => {
  const result = {
    slug: 'testville-school',
    name: 'Testville School',
    data: {
      location_profile: {
        lat: 51.3, lng: -0.4, region: 'South East', setting: 'suburban', postcode: 'KT11 2PU',
        nearest_town: { name: 'Cobham', type: 'town', distance_km: 2.7 },
        airports: [
          { name: 'Heathrow', distance_km: 16, drive_time_min_estimate: 31 },
          { name: 'Gatwick', distance_km: 24, drive_time_min_estimate: 41 },
        ],
        setting_note: 'Prosperous Surrey commuter town with easy access to Heathrow and London.',
        crime_summary: { period: '2025', interpretation: 'MUST NOT LEAK — has its own UI surface' },
      },
    },
  };
  const blob = injectToolResult('getSchoolFacts', result);
  assert.match(blob, /• setting: suburban, South East, KT11 2PU/);
  assert.match(blob, /• nearest town: Cobham \(2\.7 km\)/);
  assert.match(blob, /• airports: Heathrow \(16 km, ~31 min drive\); Gatwick \(24 km, ~41 min drive\)/);
  assert.match(blob, /• area: Prosperous Surrey commuter town/);
  assert.ok(!blob.includes('MUST NOT LEAK'), 'crime interpretation prose stays out of the compact blob');
  assert.ok(!/\[\d+ × \{/.test(blob), 'no shape-summary rendering for location_profile');
});

test('malformed location_profile falls back to the generic compactor without throwing', () => {
  const result = { slug: 's', name: 'S', data: { location_profile: { unexpected: { deep: [1, 2, 3] } } } };
  const blob = injectToolResult('getSchoolFacts', result);
  assert.match(blob, /location_profile: /);
});

test('TABLE_REQUEST_RE ignores "table tennis" (registry sport, not a table ask)', () => {
  assert.equal(TABLE_REQUEST_RE.test('which schools are best for table tennis?'), false);
  assert.equal(TABLE_REQUEST_RE.test('compare these schools on table-tennis'), false);
  assert.equal(TABLE_REQUEST_RE.test('build me a table comparing golf and fees'), true);
});
