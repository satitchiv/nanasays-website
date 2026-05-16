// Slice 8 Build 7 Phase C followup #3 — pin the family-constant
// allowlist that drives selective inheritance on sibling-create.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FAMILY_CONSTANT_FIELD_NAMES,
  ONBOARDING_FIELD_NAMES,
} from './onboarding-fields.ts'

test('FAMILY_CONSTANT_FIELD_NAMES contains the 6 user-spec fields', () => {
  const expected = [
    'home_region',
    'boarding_pref',
    'budget_range',
    'curriculum_pref',
    'ethos_pref',
    'intl_pref',
  ]
  assert.deepEqual([...FAMILY_CONSTANT_FIELD_NAMES], expected,
    'family-constant allowlist must match the user-confirmed 6 fields')
})

test('FAMILY_CONSTANT_FIELD_NAMES is a subset of ONBOARDING_FIELD_NAMES', () => {
  // Every entry must be a real onboarding field; otherwise the
  // SELECT against parent_profiles would 500.
  for (const name of FAMILY_CONSTANT_FIELD_NAMES) {
    assert.ok(
      ONBOARDING_FIELD_NAMES.includes(name),
      `${name} must be a defined OnboardingField`,
    )
  }
})

test('Child-specific fields are NOT in FAMILY_CONSTANT_FIELD_NAMES', () => {
  // The eight that should reset per child (per user spec):
  // year, gender, top_priority, class_size, sen, phone, lgbtq, pastoral.
  const childSpecific = [
    'child_year',
    'child_gender',
    'top_priority',
    'class_size_pref',
    'sen_need',
    'phone_pref',
    'lgbtq_pref',
    'pastoral_pref',
  ]
  const fam = new Set(FAMILY_CONSTANT_FIELD_NAMES)
  for (const name of childSpecific) {
    assert.ok(
      !fam.has(name),
      `${name} must NOT inherit — kids differ on this field`,
    )
  }
})
