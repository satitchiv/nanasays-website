// Projection-level tests for project-meta-fees.mjs (Tab A Step 4,
// 2026-05-25). Locks the SSD-vs-USD precedence + null handling that
// determines what `meta.fees_min/max/currency` look like for the
// chatbot's per-school summary line.
//
// Codex r1 Q8: the renderer tests in pack-prompt-injection-fees.test.mjs
// only cover formatting. This file covers the projection that lives in
// fetchSchoolBundle.
//
// Run: node --test website/lib/server/project-meta-fees.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectMetaFees, toNum } from './project-meta-fees.mjs';

// ── toNum ───────────────────────────────────────────────────────────────

test('toNum: finite number passes through', () => {
  assert.equal(toNum(63299), 63299);
  assert.equal(toNum(0), 0);
  assert.equal(toNum(-1), -1);
});

test('toNum: numeric string (Postgres `numeric` serialization) is coerced', () => {
  assert.equal(toNum('63299'), 63299);
  assert.equal(toNum('63299.5'), 63299.5);
  assert.equal(toNum('  42  '), 42);
});

test('toNum: empty / null / garbage returns null', () => {
  assert.equal(toNum(null), null);
  assert.equal(toNum(undefined), null);
  assert.equal(toNum(''), null);
  assert.equal(toNum('   '), null);
  assert.equal(toNum('abc'), null);
  assert.equal(toNum(NaN), null);
});

test('toNum: rejects Infinity / overflow (Codex r1 Q4)', () => {
  assert.equal(toNum(Infinity), null);
  assert.equal(toNum(-Infinity), null);
  assert.equal(toNum('Infinity'), null);
  assert.equal(toNum('1e999'), null);  // overflows to Infinity
});

// ── projectMetaFees: SSD-first precedence ───────────────────────────────

test('SSD with both fees + currency wins over USD-only schools row', () => {
  const ssd = { fees_min: '63299', fees_max: '63299', fees_currency: 'GBP' };
  const meta = { fees_usd_min: 80000, fees_usd_max: 80000 };
  const out = projectMetaFees(ssd, meta);
  assert.deepEqual(out, { fees_min: 63299, fees_max: 63299, fees_currency: 'GBP' });
});

test('SSD with range fees + currency renders as range', () => {
  // Real-world Dulwich shape: SSD has band, schools has separate USD value.
  const ssd = { fees_min: '20667', fees_max: '67416', fees_currency: 'GBP' };
  const meta = { fees_usd_min: 25425, fees_usd_max: 27206 };
  const out = projectMetaFees(ssd, meta);
  assert.deepEqual(out, { fees_min: 20667, fees_max: 67416, fees_currency: 'GBP' });
});

test('USD fallback fires when SSD has no fees', () => {
  // Wellington shape: schools.fees_usd_min populated, SSD fees null.
  const ssd = { fees_min: null, fees_max: null, fees_currency: 'GBP' };
  const meta = { fees_usd_min: 79058, fees_usd_max: 79058 };
  const out = projectMetaFees(ssd, meta);
  assert.deepEqual(out, { fees_min: 79058, fees_max: 79058, fees_currency: 'USD' });
});

test('USD fallback fires when SSD row is null entirely', () => {
  const out = projectMetaFees(null, { fees_usd_min: 50000, fees_usd_max: 50000 });
  assert.deepEqual(out, { fees_min: 50000, fees_max: 50000, fees_currency: 'USD' });
});

test('both sources empty → all nulls', () => {
  // St Michael's / Rugby shape: nothing populated.
  const out = projectMetaFees(
    { fees_min: null, fees_max: null, fees_currency: null },
    { fees_usd_min: null, fees_usd_max: null },
  );
  assert.deepEqual(out, { fees_min: null, fees_max: null, fees_currency: null });
});

test('SSD with min only, max null → preserves null max (Codex r1 Q2)', () => {
  // Should NOT clone min into max — renderer surfaces "from £X/yr".
  const ssd = { fees_min: '63299', fees_max: null, fees_currency: 'GBP' };
  const out = projectMetaFees(ssd, {});
  assert.deepEqual(out, { fees_min: 63299, fees_max: null, fees_currency: 'GBP' });
});

test('SSD with max only, min null → preserves null min', () => {
  const ssd = { fees_min: null, fees_max: '50000', fees_currency: 'GBP' };
  const out = projectMetaFees(ssd, {});
  assert.deepEqual(out, { fees_min: null, fees_max: 50000, fees_currency: 'GBP' });
});

test('SSD currency uppercased on read (boundary normalisation)', () => {
  const ssd = { fees_min: '50000', fees_max: '50000', fees_currency: 'gbp' };
  const out = projectMetaFees(ssd, {});
  assert.equal(out.fees_currency, 'GBP');
});

test('SSD currency whitespace trimmed', () => {
  const ssd = { fees_min: '50000', fees_max: '50000', fees_currency: '  GBP  ' };
  const out = projectMetaFees(ssd, {});
  assert.equal(out.fees_currency, 'GBP');
});

test('SSD fees present but currency empty string → fees_currency null', () => {
  // Don't fake a currency we don't actually have.
  const ssd = { fees_min: '50000', fees_max: '50000', fees_currency: '' };
  const out = projectMetaFees(ssd, {});
  assert.equal(out.fees_currency, null);
  assert.equal(out.fees_min, 50000);
});

test('USD fallback path always tags currency as USD (regardless of what SSD currency was)', () => {
  // Edge case: SSD has currency='GBP' but no fee values. USD fallback fires.
  // Should NOT label the USD value as GBP.
  const ssd = { fees_min: null, fees_max: null, fees_currency: 'GBP' };
  const meta = { fees_usd_min: 79058, fees_usd_max: 79058 };
  const out = projectMetaFees(ssd, meta);
  assert.equal(out.fees_currency, 'USD');
});

test('SSD scientific-notation string is parsed correctly (1.5e4 → 15000)', () => {
  const ssd = { fees_min: '1.5e4', fees_max: '3e4', fees_currency: 'GBP' };
  const out = projectMetaFees(ssd, {});
  assert.deepEqual(out, { fees_min: 15000, fees_max: 30000, fees_currency: 'GBP' });
});

test('regression — the original Step 4 bug: USD value cannot reach output labelled as GBP', () => {
  // Pre-fix: schools.fees_usd_min=25425 (USD!) was projected into a field
  // named fees_min_gbp and rendered with £. After fix: USD fallback
  // ALWAYS labels currency 'USD', so renderer picks '$'.
  const ssd = { fees_min: null, fees_max: null, fees_currency: null };
  const meta = { fees_usd_min: 25425, fees_usd_max: 27206 };
  const out = projectMetaFees(ssd, meta);
  assert.equal(out.fees_currency, 'USD');
  assert.notEqual(out.fees_currency, 'GBP');
});
