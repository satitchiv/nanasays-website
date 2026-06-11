// Tests the overflow-notice + 10-school render cap in pack-prompt-injection.js
// (whole-landscape slice, 2026-06-11).
//
// Run: node --test website/lib/server/pack-prompt-injection-overflow.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPackContextString } from './pack-prompt-injection.js';

function makePack({ slugCount = 1, overflowActions = [] } = {}) {
  const schools = {};
  for (let i = 0; i < slugCount; i++) {
    schools[`school-${i}`] = {
      meta: { name: `School ${i}`, boarding_type: 'day', gender_split: 'co-ed' },
    };
  }
  return {
    parent: { child_year: 'Year 9', top_priority: 'academics' },
    shortlist: Object.keys(schools),
    schools,
    meta: { overflow_actions: overflowActions },
  };
}

test('overflow notice renders when reducers dropped context', () => {
  const out = buildPackContextString(
    makePack({ overflowActions: ['dropped_isi_prose_background', 'dropped_facts'] }),
  );
  assert.ok(out.includes('Context omitted for space'), 'notice line must render');
  assert.ok(out.includes('dropped_isi_prose_background, dropped_facts'), 'action names must be listed');
  assert.ok(out.includes('NOT LOADED'), 'must instruct the model not to treat gaps as absence of data');
});

test('no overflow notice when nothing was dropped', () => {
  const out = buildPackContextString(makePack({ overflowActions: [] }));
  assert.ok(!out.includes('Context omitted for space'));
});

test('no overflow notice when meta is missing entirely', () => {
  const pack = makePack();
  delete pack.meta;
  const out = buildPackContextString(pack);
  assert.ok(!out.includes('Context omitted for space'));
});

test('non-string overflow entries are filtered, not rendered', () => {
  const out = buildPackContextString(
    makePack({ overflowActions: ['dropped_facts', 42, null, { evil: true }] }),
  );
  assert.ok(out.includes('(dropped_facts)'), 'string entries still listed');
  assert.ok(!out.includes('[object Object]'), 'object entries must not leak into the prompt');
});

test('all 10 in-scope schools render (old cap silently hid schools 6-10)', () => {
  const out = buildPackContextString(makePack({ slugCount: 10 }));
  for (let i = 0; i < 10; i++) {
    assert.ok(out.includes(`school-${i}:`), `school-${i} must appear in the pack string`);
  }
  assert.ok(out.includes('In-scope schools (10)'));
});
