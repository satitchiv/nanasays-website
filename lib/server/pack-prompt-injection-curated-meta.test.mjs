// Tests the curated_meta rendering in pack-prompt-injection.js
// (Tab A Step 3 chatbot wiring, 2026-05-25).
//
// Run: node --test website/lib/server/pack-prompt-injection-curated-meta.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPackContextString } from './pack-prompt-injection.js';

function makePack(curated_meta) {
  return {
    parent: { child_year: 'Year 9', top_priority: 'academics' },
    schools: {
      'eton-college': {
        meta: { name: 'Eton College', boarding_type: 'full', gender_split: 'boys', fees_min_gbp: 50000 },
        curated_meta,
      },
    },
  };
}

test('curated_meta head + tenure renders with year', () => {
  const out = buildPackContextString(makePack({
    head_of_school: 'Simon Henderson',
    head_tenure_start: '2015-09-01',
  }));
  assert.match(out, /head: Simon Henderson \(since 2015\)/);
});

test('curated_meta head without tenure renders without year', () => {
  const out = buildPackContextString(makePack({
    head_of_school: 'Simon Henderson',
    head_tenure_start: null,
  }));
  assert.match(out, /head: Simon Henderson(?! \(since)/);
});

test('curated_meta head_tenure_start malformed → no "since" suffix (regex guard)', () => {
  const out = buildPackContextString(makePack({
    head_of_school: 'Simon Henderson',
    head_tenure_start: 'not-a-date',
  }));
  assert.match(out, /head: Simon Henderson/);
  assert.doesNotMatch(out, /since/);
});

test('curated_meta house_system + house_names renders both (count from house_names.length when house_count absent)', () => {
  const out = buildPackContextString(makePack({
    house_system: 'traditional 25-house system',
    house_names: ['College', 'Long Chamber', 'Penn House', 'South Lawn', 'The Hopgarden', 'Manor House', 'Westbury'],
  }));
  assert.match(out, /house system: traditional 25-house system/);
  assert.match(out, /houses \(7\): College, Long Chamber, Penn House, South Lawn, The Hopgarden, Manor House…/);
});

test('curated_meta renders TRUE house_count (e.g. Eton 25) even when projection capped names to 12', () => {
  // Codex r1 P7: count must reflect reality, not the projection cap.
  const out = buildPackContextString(makePack({
    house_names: ['College', 'Long Chamber', 'Penn House', 'South Lawn', 'The Hopgarden', 'Manor House',
                  'h7', 'h8', 'h9', 'h10', 'h11', 'h12'],  // 12 — the projection cap
    house_count: 25,  // true pre-cap count
  }));
  assert.match(out, /houses \(25\): College, Long Chamber, Penn House, South Lawn, The Hopgarden, Manor House…/);
});

test('curated_meta house_count falls back to house_names.length when house_count is null', () => {
  const out = buildPackContextString(makePack({
    house_names: ['College', 'Long Chamber'],
    house_count: null,
  }));
  assert.match(out, /houses \(2\): College, Long Chamber/);
});

test('curated_meta EAL=true with hours + cost renders all', () => {
  const out = buildPackContextString(makePack({
    eal_support: true,
    eal_hours_per_week: 4,
    eal_cost_usd: 3500,
  }));
  assert.match(out, /EAL: yes, 4 hrs\/week, \$3500/);
});

test('curated_meta EAL=true with no hours/cost renders "yes" only', () => {
  const out = buildPackContextString(makePack({ eal_support: true }));
  assert.match(out, /EAL: yes(?!,)/);
});

test('curated_meta EAL=false renders "no"', () => {
  const out = buildPackContextString(makePack({ eal_support: false }));
  assert.match(out, /EAL: no/);
});

test('curated_meta thai_students > 0 renders count', () => {
  const out = buildPackContextString(makePack({ thai_students: 12 }));
  assert.match(out, /12 Thai students/);
});

test('curated_meta thai_students = 0 omits line', () => {
  const out = buildPackContextString(makePack({ thai_students: 0 }));
  assert.doesNotMatch(out, /Thai students/);
});

test('curated_meta open_day_text + url renders combined', () => {
  const out = buildPackContextString(makePack({
    open_day_text: 'Saturday 12 October',
    open_day_url: 'https://eton.example/open',
  }));
  assert.match(out, /open day: Saturday 12 October \(https:\/\/eton\.example\/open\)/);
});

test('curated_meta open_day_url only (no text) still renders url', () => {
  const out = buildPackContextString(makePack({
    open_day_text: null,
    open_day_url: 'https://eton.example/open',
  }));
  assert.match(out, /open day: https:\/\/eton\.example\/open/);
});

test('curated_meta bus_service=true renders "yes"', () => {
  const out = buildPackContextString(makePack({ bus_service: true }));
  assert.match(out, /school bus: yes/);
});

test('curated_meta bus_service=false omits line (only positive case shown)', () => {
  const out = buildPackContextString(makePack({ bus_service: false }));
  assert.doesNotMatch(out, /school bus/);
});

test('curated_meta = null adds no lines', () => {
  const baseline = buildPackContextString(makePack(undefined));
  const withNull = buildPackContextString(makePack(null));
  assert.equal(baseline, withNull);
});

test('curated_meta absent entirely (school has no field at all) adds no lines', () => {
  const pack = {
    parent: { child_year: 'Year 9', top_priority: 'academics' },
    schools: {
      'eton-college': { meta: { name: 'Eton College' } },
    },
  };
  const out = buildPackContextString(pack);
  assert.doesNotMatch(out, /head:|EAL:|Thai|school bus|food:|USP/);
});

test('curated_meta all fields populated produces a substantial-length summary line', () => {
  const out = buildPackContextString(makePack({
    eal_support: true,
    eal_hours_per_week: 4,
    eal_cost_usd: 3500,
    thai_students: 12,
    thai_community: 'active parent network',
    open_day_text: 'Saturday 12 October',
    open_day_url: 'https://eton.example/open',
    prospectus_url: 'https://eton.example/prospectus.pdf',
    head_of_school: 'Simon Henderson',
    head_tenure_start: '2015-09-01',
    house_system: '25-house system',
    house_names: ['College', 'Long Chamber'],
    house_count: 2,
    food_options: 'in-house catering, halal + vegetarian options',
    bus_service: true,
    unique_selling_points: 'oldest boys boarding school in continuous operation',
  }));
  for (const expected of [
    'head: Simon Henderson (since 2015)',
    'house system: 25-house system',
    'houses (2): College, Long Chamber',
    'EAL: yes, 4 hrs/week, $3500',
    '12 Thai students',
    'Thai community: active parent network',
    'school bus: yes',
    'food: in-house catering, halal + vegetarian options',
    'open day: Saturday 12 October (https://eton.example/open)',
    'prospectus: https://eton.example/prospectus.pdf',
    'USP: oldest boys boarding school in continuous operation',
  ]) {
    assert.ok(out.includes(expected), `expected output to include "${expected}"\n--- output ---\n${out}\n--- end ---`);
  }
});
