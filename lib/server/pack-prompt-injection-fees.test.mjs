// Tests fees rendering in pack-prompt-injection.js (Tab A Step 4,
// 2026-05-25 truth-in-labelling fix). The earlier code stored
// schools.fees_usd_min/max under a fees_min_gbp/fees_max_gbp field and
// rendered with £, so Nana would read "£65000" when the value was 65000
// USD. This file locks the new currency-aware rendering.
//
// Run: node --test website/lib/server/pack-prompt-injection-fees.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPackContextString } from './pack-prompt-injection.js';

function makePack(metaFees) {
  return {
    parent: { child_year: 'Year 9', top_priority: 'academics' },
    schools: {
      'eton-college': {
        meta: {
          name: 'Eton College',
          boarding_type: 'full',
          gender_split: 'boys',
          ...metaFees,
        },
      },
    },
  };
}

test('GBP fees with min == max renders single value with £', () => {
  const out = buildPackContextString(makePack({ fees_min: 63299, fees_max: 63299, fees_currency: 'GBP' }));
  assert.match(out, /fees £63,299\/yr/);
  assert.doesNotMatch(out, /£63,299–£63,299/);  // collapse to single value
});

test('GBP fees with range (min != max) renders both with £', () => {
  const out = buildPackContextString(makePack({ fees_min: 20667, fees_max: 67416, fees_currency: 'GBP' }));
  assert.match(out, /fees £20,667–£67,416\/yr/);
});

test('USD fallback fees render with $ symbol', () => {
  const out = buildPackContextString(makePack({ fees_min: 45624, fees_max: 81606, fees_currency: 'USD' }));
  assert.match(out, /fees \$45,624–\$81,606\/yr/);
});

test('CHF fees render with "CHF " prefix (Swiss schools)', () => {
  const out = buildPackContextString(makePack({ fees_min: 95000, fees_max: 95000, fees_currency: 'CHF' }));
  assert.match(out, /fees CHF 95,000\/yr/);
});

test('THB fees render with ฿ symbol (Thai schools)', () => {
  const out = buildPackContextString(makePack({ fees_min: 800000, fees_max: 1200000, fees_currency: 'THB' }));
  assert.match(out, /fees ฿800,000–฿1,200,000\/yr/);
});

test('EUR fees render with € symbol', () => {
  const out = buildPackContextString(makePack({ fees_min: 35000, fees_max: 35000, fees_currency: 'EUR' }));
  assert.match(out, /fees €35,000\/yr/);
});

test('unknown currency code renders as 3-letter prefix, never guesses', () => {
  // Defensive: if a new code shows up that we haven't whitelisted, render
  // the code itself rather than a wrong symbol. Better truth than wrong symbol.
  const out = buildPackContextString(makePack({ fees_min: 100000, fees_max: 100000, fees_currency: 'AED' }));
  assert.match(out, /fees AED 100,000\/yr/);
});

test('null fees_currency renders the number with no prefix (rare)', () => {
  const out = buildPackContextString(makePack({ fees_min: 50000, fees_max: 50000, fees_currency: null }));
  assert.match(out, /fees 50,000\/yr/);
  assert.doesNotMatch(out, /£|\$/);  // no guessed symbol
});

test('both fees null → no fees line at all', () => {
  const out = buildPackContextString(makePack({ fees_min: null, fees_max: null, fees_currency: null }));
  assert.doesNotMatch(out, /fees /);
});

test('min populated, max null → "from £X/yr" (single-sided is not exact)', () => {
  // Codex r1 Q2: don't masquerade single-sided as exact. Range-only shape
  // when both present; otherwise from/up-to.
  const out = buildPackContextString(makePack({ fees_min: 63299, fees_max: null, fees_currency: 'GBP' }));
  assert.match(out, /fees from £63,299\/yr/);
  assert.doesNotMatch(out, /fees £63,299\/yr$/m);  // no bare "fees £X/yr"
});

test('max populated, min null → "up to £Y/yr"', () => {
  const out = buildPackContextString(makePack({ fees_min: null, fees_max: 63299, fees_currency: 'GBP' }));
  assert.match(out, /fees up to £63,299\/yr/);
});

test('malformed currency code (not /^[A-Z]{3}$/) renders the number with no prefix', () => {
  // Codex r1 Q3: defend against garbage in DB. "£GBP" / "gbp" /
  // "n/a" / "" should not leak into the prompt as a fake prefix.
  for (const code of ['gbp', 'GB', 'GBP4', 'n/a', '£GBP', '']) {
    const out = buildPackContextString(makePack({ fees_min: 50000, fees_max: 50000, fees_currency: code }));
    assert.match(out, /fees 50,000\/yr/, `code=${JSON.stringify(code)}`);
    assert.doesNotMatch(out, /£|\$|€|CHF|฿|gbp|n\/a/, `leaked prefix for code=${JSON.stringify(code)}`);
  }
});

test('regression: GBP-labelled value cannot leak as USD-rendered (the original bug)', () => {
  // Pre-Step-4 bug: schools.fees_usd_min=65000 got rendered as "£65000".
  // Now: any pack with fees_currency='GBP' MUST render £; with 'USD' MUST
  // render $. Same numeric value, different symbols.
  const gbpOut = buildPackContextString(makePack({ fees_min: 65000, fees_max: 65000, fees_currency: 'GBP' }));
  const usdOut = buildPackContextString(makePack({ fees_min: 65000, fees_max: 65000, fees_currency: 'USD' }));
  assert.match(gbpOut, /fees £65,000\/yr/);
  assert.match(usdOut, /fees \$65,000\/yr/);
  assert.notEqual(gbpOut, usdOut);
});

test('thousands separator: 1,200,000 renders correctly (not 1200000)', () => {
  const out = buildPackContextString(makePack({ fees_min: 1200000, fees_max: 1200000, fees_currency: 'THB' }));
  assert.match(out, /1,200,000/);
});
