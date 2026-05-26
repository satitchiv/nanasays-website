// school-name-overrides unit tests — focused on getEffectiveSchoolGender
// and isGenderCompatible. Codex r2 (2026-05-26) caught a regression where
// year-aware exemptions fell through to the column AFTER the SQL backfill
// set the column to 'boys'; tests below pin the corrected behaviour.
//
// Run via:
//   node --experimental-strip-types --test \
//     lib/school-name-overrides.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getEffectiveSchoolGender,
  isGenderCompatible,
  normalizeSchoolName,
} from './school-name-overrides.ts'

// ── Override layer: name-keyed boys-only ─────────────────────────────

test('Dulwich College resolves to boys-only at non-exempt years regardless of column', () => {
  // Column says 'co-ed' (pre-backfill state). Override must still hold.
  const sch = { slug: 'dulwich-college', name: 'Dulwich College', gender_split: 'co-ed' }
  assert.equal(getEffectiveSchoolGender(sch, 'year-9'),    'boys-only')
  assert.equal(getEffectiveSchoolGender(sch, 'year-10'),   'boys-only')
  // No year-exempt entry for Dulwich → sixth-form still boys-only.
  assert.equal(getEffectiveSchoolGender(sch, 'sixth-form'), 'boys-only')
})

test('Queenswood resolves to girls-only at all years', () => {
  // Column says 'co-ed' (pre-backfill). Override holds.
  const sch = { slug: 'queenswood-school', name: 'Queenswood School', gender_split: 'co-ed' }
  assert.equal(getEffectiveSchoolGender(sch, 'year-9'),    'girls-only')
  assert.equal(getEffectiveSchoolGender(sch, 'sixth-form'), 'girls-only')
})

test('Godolphin and Latymer resolves to girls-only when column is NULL', () => {
  const sch = { slug: 'godolphin-and-latymer-school', name: 'The Godolphin and Latymer School', gender_split: null }
  assert.equal(getEffectiveSchoolGender(sch, 'year-10'), 'girls-only')
})

// ── Year-aware exemptions (Codex r2 P1 #1 regression guard) ──────────

test('Westminster sixth-form resolves to co-ed despite column=boys', () => {
  // This is the bug Codex r2 caught: pre-fix, the exemption fell
  // through to the column, which post-backfill says 'boys', returning
  // 'boys-only'. Post-fix, the exemption returns 'co-ed' explicitly.
  const sch = { slug: 'westminster-school-uk', name: 'Westminster School', gender_split: 'boys' }
  assert.equal(getEffectiveSchoolGender(sch, 'sixth-form'), 'co-ed')
  // Non-exempted years stay boys-only.
  assert.equal(getEffectiveSchoolGender(sch, 'year-9'),  'boys-only')
  assert.equal(getEffectiveSchoolGender(sch, 'year-7'),  'boys-only')
})

test('Winchester sixth-form resolves to co-ed despite column=boys', () => {
  const sch = { slug: 'winchester-college', name: 'Winchester College', gender_split: 'boys' }
  assert.equal(getEffectiveSchoolGender(sch, 'sixth-form'), 'co-ed')
  assert.equal(getEffectiveSchoolGender(sch, 'year-9'),     'boys-only')
})

test('UCS sixth-form resolves to co-ed (slug-based exemption)', () => {
  // UCS normalizes to "university" so name set can't carry it without
  // collision. Slug-based exempt map.
  const sch = { slug: 'university-college-school-uk', name: 'University College School', gender_split: 'boys' }
  assert.equal(getEffectiveSchoolGender(sch, 'sixth-form'), 'co-ed')
  assert.equal(getEffectiveSchoolGender(sch, 'year-9'),     'boys-only')
})

test('Abingdon Year 7 + Year 9 + Sixth Form resolve to co-ed (Sept 2026 intake)', () => {
  const sch = { slug: 'abingdon-school', name: 'Abingdon School', gender_split: 'boys' }
  assert.equal(getEffectiveSchoolGender(sch, 'year-7'),     'co-ed')
  assert.equal(getEffectiveSchoolGender(sch, 'year-9'),     'co-ed')
  assert.equal(getEffectiveSchoolGender(sch, 'sixth-form'), 'co-ed')
  // Year 10 NOT in exemption — still boys-only.
  assert.equal(getEffectiveSchoolGender(sch, 'year-10'),    'boys-only')
})

// ── 'not-sure' / null defer to strict interpretation ─────────────────

test("'not-sure' and null treat exempt schools strictly (boys-only stays)", () => {
  const sch = { slug: 'westminster-school-uk', name: 'Westminster School', gender_split: 'boys' }
  assert.equal(getEffectiveSchoolGender(sch, 'not-sure'), 'boys-only')
  assert.equal(getEffectiveSchoolGender(sch, null),       'boys-only')
})

// ── Column fallback (no override) ────────────────────────────────────

test('Co-ed school with no override falls through to column', () => {
  const sch = { slug: 'reeds-school-uk', name: "Reed's School", gender_split: 'co-ed' }
  assert.equal(getEffectiveSchoolGender(sch, 'year-9'), 'co-ed')
})

test('Unknown school with no column resolves to unknown', () => {
  const sch = { slug: 'random-school', name: 'Random School', gender_split: null }
  assert.equal(getEffectiveSchoolGender(sch, 'year-9'), 'unknown')
})

// ── isGenderCompatible behaviour ─────────────────────────────────────

test('Girl at sixth-form is compatible with Westminster (year-aware exemption)', () => {
  const sch = { slug: 'westminster-school-uk', name: 'Westminster School', gender_split: 'boys' }
  assert.equal(isGenderCompatible(sch, 'girl', 'sixth-form'), true)
  // Year 9 girl still blocked.
  assert.equal(isGenderCompatible(sch, 'girl', 'year-9'),     false)
})

test('Boy is compatible with Westminster at all years', () => {
  const sch = { slug: 'westminster-school-uk', name: 'Westminster School', gender_split: 'boys' }
  assert.equal(isGenderCompatible(sch, 'boy', 'sixth-form'), true)
  assert.equal(isGenderCompatible(sch, 'boy', 'year-9'),     true)
})

test('Year-9 girl is blocked from Dulwich (no exemption)', () => {
  const sch = { slug: 'dulwich-college', name: 'Dulwich College', gender_split: 'boys' }
  assert.equal(isGenderCompatible(sch, 'girl', 'year-9'), false)
})

test('Year-9 boy is blocked from Queenswood (no exemption)', () => {
  const sch = { slug: 'queenswood-school', name: 'Queenswood School', gender_split: 'girls' }
  assert.equal(isGenderCompatible(sch, 'boy', 'year-9'), false)
})

test('Year-7 girl is compatible with Abingdon (Sept 2026 intake)', () => {
  const sch = { slug: 'abingdon-school', name: 'Abingdon School', gender_split: 'boys' }
  assert.equal(isGenderCompatible(sch, 'girl', 'year-7'),     true)
  assert.equal(isGenderCompatible(sch, 'girl', 'year-9'),     true)
  assert.equal(isGenderCompatible(sch, 'girl', 'sixth-form'), true)
  // Year 10 NOT exempted yet.
  assert.equal(isGenderCompatible(sch, 'girl', 'year-10'),    false)
})

test('null childGender passes everything (no preference)', () => {
  const sch = { slug: 'eton-college', name: 'Eton College', gender_split: 'boys' }
  assert.equal(isGenderCompatible(sch, null,      'year-9'), true)
  assert.equal(isGenderCompatible(sch, undefined, 'year-9'), true)
})

// ── normalize collision sanity ───────────────────────────────────────

test('UCS name normalizes to "university" — slug override prevents collision', () => {
  // The name "University College School" strips to "university" — which
  // would falsely match any "University X" school if added to the name
  // set. The slug-based set sidesteps this.
  assert.equal(normalizeSchoolName('University College School'), 'university')
  assert.equal(normalizeSchoolName('University of Whatever'),    'university of whatever')
})
