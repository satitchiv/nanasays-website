// Codex 2026-05-25 GREEN-NIT: pin the per-school summary one-liner's
// range-shape class_size handling in pack-prompt-injection.js. The branch
// at ~line 119 handles both scalar (`class size ~15`) and projected range
// (`class size 20–25`) shapes that the projector now emits for 6 production
// schools (Eton/Sevenoaks/Oundle/Queenswood/CLC/St-Catherine's-Bramley).
//
// Run via:
//   cd website
//   node --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/pack-prompt-injection-range.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPackContextString } from './pack-prompt-injection.js';

function makePack(slug, notion_backfill) {
  return {
    parent: { child_year: 'Year 9' },
    shortlist: [slug],
    schools: {
      [slug]: {
        meta: { name: 'Test School' },
        notion_backfill,
      },
    },
  };
}

test('pack one-liner renders scalar class_size as "class size ~15"', () => {
  const s = buildPackContextString(makePack('eton-college', { class_size: { senior: 15 } }));
  assert.ok(s, 'pack should produce a string');
  assert.match(s, /class size ~15/);
  assert.doesNotMatch(s, /class size 15–/, 'no range syntax for scalar');
});

test('pack one-liner renders range class_size as "class size 20–25"', () => {
  // Eton-shape: senior {min: 20, max: 25}.
  const s = buildPackContextString(makePack('eton-college', {
    class_size: { senior: { min: 20, max: 25 }, sixth: 10 },
  }));
  assert.ok(s);
  // senior wins precedence over sixth in the one-liner (same as renderer).
  assert.match(s, /class size 20–25/);
});

test('pack one-liner falls back to sixth when senior absent (range shape)', () => {
  // Sevenoaks-shape sixth-only: {sixth: {min: 8, max: 10}}.
  const s = buildPackContextString(makePack('sevenoaks-school', {
    class_size: { sixth: { min: 8, max: 10 } },
  }));
  assert.ok(s);
  assert.match(s, /class size 8–10/);
});

test('pack one-liner falls back to average when senior + sixth absent (range shape)', () => {
  // CLC / St Catherine's Bramley shape: average-only range.
  const s = buildPackContextString(makePack('cheltenham-ladies-college', {
    class_size: { average: { min: 12, max: 15 } },
  }));
  assert.ok(s);
  assert.match(s, /class size 12–15/);
});

test('pack one-liner emits NO class-size bit when class_size missing', () => {
  const s = buildPackContextString(makePack('test', { total_pupils: 500 }));
  assert.ok(s);
  assert.doesNotMatch(s, /class size/);
});

test('pack one-liner handles mixed scalar + range across schools in one pack', () => {
  const pack = {
    parent: { child_year: 'Year 9' },
    shortlist: ['eton-college', 'harrow-school'],
    schools: {
      'eton-college': {
        meta: { name: 'Eton College' },
        notion_backfill: { class_size: { senior: { min: 20, max: 25 } } },
      },
      'harrow-school': {
        meta: { name: 'Harrow School' },
        notion_backfill: { class_size: { senior: 16 } },
      },
    },
  };
  const s = buildPackContextString(pack);
  assert.ok(s);
  // Both shapes must render in the same summary.
  assert.match(s, /Eton College.*class size 20–25/s);
  assert.match(s, /Harrow School.*class size ~16/s);
});
