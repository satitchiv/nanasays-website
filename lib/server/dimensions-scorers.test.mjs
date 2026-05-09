import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS } from './dimensions.js';

const ethosFacts = { ethos_label: 'cofe', sources: [] };
const intlFacts = { intl_pct_overall: 30, sources: [] };

test('ethos_match returns 0 when parent has no ethos preference (null short-circuit)', () => {
  const score = DIMENSIONS.ethos_match.rank({ ethos_facts: ethosFacts }, { parent: {} });
  assert.equal(score, 0, 'expected neutral 0 when ethos_pref is null/undefined');
});

test('ethos_match returns 5 (1 baseline + 4 match) on exact ethos match', () => {
  const score = DIMENSIONS.ethos_match.rank(
    { ethos_facts: ethosFacts },
    { parent: { ethos_pref: 'cofe' } }
  );
  assert.equal(score, 5);
});

test('ethos_match exact match works with canonical production ethos labels', () => {
  const score = DIMENSIONS.ethos_match.rank(
    { ethos_facts: { ethos_label: 'church_of_england', sources: [] } },
    { parent: { ethos_pref: 'church_of_england' } }
  );
  assert.equal(score, 5);
});

test('ethos_match returns 3 (1 baseline + 2 mixed) when school is mixed_faith and parent wants something specific', () => {
  const score = DIMENSIONS.ethos_match.rank(
    { ethos_facts: { ethos_label: 'mixed_faith' } },
    { parent: { ethos_pref: 'cofe' } }
  );
  assert.equal(score, 3);
});

test('ethos_match returns 1 when parent wants X and school is unrelated Y (neither match nor mixed)', () => {
  const score = DIMENSIONS.ethos_match.rank(
    { ethos_facts: { ethos_label: 'rc' } },
    { parent: { ethos_pref: 'cofe' } }
  );
  assert.equal(score, 1);
});

test('ethos_match returns 0 when ethos_facts missing entirely', () => {
  const score = DIMENSIONS.ethos_match.rank({}, { parent: { ethos_pref: 'cofe' } });
  assert.equal(score, 0);
});

test('intl_share returns 0 when parent has no intl preference (null short-circuit, no high-bias)', () => {
  const score = DIMENSIONS.intl_share.rank({ intl_facts: intlFacts }, { parent: {} });
  assert.equal(score, 0, 'expected neutral 0 when intl_pref is null/undefined');
});

test('intl_share rewards high pct when parent wants high', () => {
  const score = DIMENSIONS.intl_share.rank(
    { intl_facts: { intl_pct_overall: 40 } },
    { parent: { intl_pref: 'high' } }
  );
  assert.equal(score, 4); // min(40/10, 5)
});

test('intl_share caps at 5 for very high pct', () => {
  const score = DIMENSIONS.intl_share.rank(
    { intl_facts: { intl_pct_overall: 80 } },
    { parent: { intl_pref: 'high' } }
  );
  assert.equal(score, 5);
});

test('intl_share rewards low pct when parent wants low', () => {
  const score = DIMENSIONS.intl_share.rank(
    { intl_facts: { intl_pct_overall: 10 } },
    { parent: { intl_pref: 'low' } }
  );
  assert.equal(score, 4); // 5 - 10/10 = 4
});

test('intl_share returns 0 when pct missing', () => {
  const score = DIMENSIONS.intl_share.rank({ intl_facts: {} }, { parent: { intl_pref: 'high' } });
  assert.equal(score, 0);
});

test('intl_share returns 0 when ctx is missing entirely (defensive)', () => {
  const score = DIMENSIONS.intl_share.rank({ intl_facts: intlFacts }, undefined);
  assert.equal(score, 0);
});

test('ethos_match returns 0 when ctx is missing entirely (defensive)', () => {
  const score = DIMENSIONS.ethos_match.rank({ ethos_facts: ethosFacts }, undefined);
  assert.equal(score, 0);
});

// Codex NIT round 2 — defensive: empty-string preferences must short-circuit too,
// and intl_pct_overall === 0 must not collide with the null-preference path.
test('ethos_match returns 0 when ethos_pref is empty string (falsy guard)', () => {
  const score = DIMENSIONS.ethos_match.rank(
    { ethos_facts: ethosFacts },
    { parent: { ethos_pref: '' } }
  );
  assert.equal(score, 0);
});

test('intl_share returns 0 when intl_pref is empty string (falsy guard)', () => {
  const score = DIMENSIONS.intl_share.rank(
    { intl_facts: intlFacts },
    { parent: { intl_pref: '' } }
  );
  assert.equal(score, 0);
});

test('intl_share returns 0 for pct=0 when parent wants high (zero is a valid pct, not "no data")', () => {
  const score = DIMENSIONS.intl_share.rank(
    { intl_facts: { intl_pct_overall: 0 } },
    { parent: { intl_pref: 'high' } }
  );
  assert.equal(score, 0); // min(0/10, 5) = 0
});

test('intl_share returns 5 for pct=0 when parent wants low (perfectly low)', () => {
  const score = DIMENSIONS.intl_share.rank(
    { intl_facts: { intl_pct_overall: 0 } },
    { parent: { intl_pref: 'low' } }
  );
  assert.equal(score, 5); // 5 - 0/10 = 5
});

test('weekend_life scores full programme + Saturday + trips highest', () => {
  const score = DIMENSIONS.weekend_life.rank({
    weekend_life_facts: {
      weekend_freedom: 'full_weekend_program',
      saturday_school: true,
      day_trips: true,
    },
  });
  assert.equal(score, 6);
});

test('weekend_life scores optional activities as partial signal', () => {
  const score = DIMENSIONS.weekend_life.rank({
    weekend_life_facts: {
      weekend_freedom: 'optional_weekend_activities',
      saturday_school: false,
      day_trips: false,
    },
  });
  assert.equal(score, 2);
});

test('weekend_life returns 0 when facts are missing', () => {
  const score = DIMENSIONS.weekend_life.rank({});
  assert.equal(score, 0);
});

test('safeguarding_integrity scores compliance met + excellent quality highest', () => {
  const score = DIMENSIONS.safeguarding_integrity.rank({
    safeguarding_facts: {
      compliance: 'met',
      quality: 'excellent',
      concerns_count: 0,
    },
  });
  assert.equal(score, 9);
});

test('safeguarding_integrity subtracts up to 3 concerns and floors at 0', () => {
  const score = DIMENSIONS.safeguarding_integrity.rank({
    safeguarding_facts: {
      compliance: 'partially_met',
      quality: null,
      concerns_count: 10,
    },
  });
  assert.equal(score, 0);
});

test('safeguarding_integrity returns 0 when facts are missing', () => {
  const score = DIMENSIONS.safeguarding_integrity.rank({});
  assert.equal(score, 0);
});

// Pre-enable-1 r1 (Codex): device_policy contract parity with intl/ethos.
// Previously defaulted phone_pref to 'strict' when missing, which biased
// scoring instead of returning 0. Locking the null-short-circuit shape here.
const phoneFacts = { phone_policy: 'phones_banned_full', sources: [] };

test('device_policy returns 0 when parent has no phone preference (null short-circuit)', () => {
  const score = DIMENSIONS.device_policy.rank({ device_policy_facts: phoneFacts }, { parent: {} });
  assert.equal(score, 0, 'expected neutral 0 when phone_pref is null/undefined');
});

test('device_policy returns 0 when phone_pref is empty string (falsy guard)', () => {
  const score = DIMENSIONS.device_policy.rank(
    { device_policy_facts: phoneFacts },
    { parent: { phone_pref: '' } }
  );
  assert.equal(score, 0);
});

test('device_policy returns 0 when ctx is missing entirely (defensive)', () => {
  const score = DIMENSIONS.device_policy.rank({ device_policy_facts: phoneFacts }, undefined);
  assert.equal(score, 0);
});

test('device_policy rewards strict policy when parent wants strict', () => {
  const score = DIMENSIONS.device_policy.rank(
    { device_policy_facts: { phone_policy: 'phones_banned_full' } },
    { parent: { phone_pref: 'strict' } }
  );
  assert.equal(score, 5);
});

test('device_policy inverts score when parent wants flexible', () => {
  const score = DIMENSIONS.device_policy.rank(
    { device_policy_facts: { phone_policy: 'phones_banned_full' } },
    { parent: { phone_pref: 'flexible' } }
  );
  assert.equal(score, 1); // 6 - 5 = 1 (strict ban penalised for flexible parents)
});

test('device_policy returns 0 when device_policy_facts missing', () => {
  const score = DIMENSIONS.device_policy.rank({}, { parent: { phone_pref: 'strict' } });
  assert.equal(score, 0);
});

// Pre-enable-1 r2 (Codex): unknown/missing phone_policy must NOT invert
// under 'flexible' — the old `score ?? 0` then `6 - 0 = 6` gave max points
// to no-data, which was the opposite of intended.
test('device_policy returns 0 when phone_policy is unknown (no inversion under flexible)', () => {
  const score = DIMENSIONS.device_policy.rank(
    { device_policy_facts: { phone_policy: 'novel_unmapped_value' } },
    { parent: { phone_pref: 'flexible' } }
  );
  assert.equal(score, 0, 'unknown phone_policy must NOT invert to 6 under flexible');
});

test('device_policy returns 0 when phone_policy missing (no inversion under flexible)', () => {
  const score = DIMENSIONS.device_policy.rank(
    { device_policy_facts: {} },
    { parent: { phone_pref: 'flexible' } }
  );
  assert.equal(score, 0, 'missing phone_policy must NOT invert to 6 under flexible');
});

test('device_policy phones_allowed_open scores 1 for strict (least preferred)', () => {
  const score = DIMENSIONS.device_policy.rank(
    { device_policy_facts: { phone_policy: 'phones_allowed_open' } },
    { parent: { phone_pref: 'strict' } }
  );
  assert.equal(score, 1);
});

test('device_policy phones_allowed_open scores 5 for flexible (most preferred)', () => {
  const score = DIMENSIONS.device_policy.rank(
    { device_policy_facts: { phone_policy: 'phones_allowed_open' } },
    { parent: { phone_pref: 'flexible' } }
  );
  assert.equal(score, 5); // 6 - 1 = 5
});

// T4.16 enable gate regression. Gap B wiring exists for ethos_match /
// intl_share / device_policy, but each dim only flips on after source-backed
// coverage + smoke review. weekend_life, safeguarding_integrity, and
// ethos_match have passed; intl_share and device_policy remain disabled until
// their rankable source-backed coverage is no longer sparse.
const DISABLED_DIMS = [
  'intl_share',
  'device_policy',
];
const ENABLED_DIMS = ['weekend_life', 'safeguarding_integrity', 'ethos_match'];

for (const dimName of DISABLED_DIMS) {
  test(`${dimName} stays enabled:false until enable review`, () => {
    assert.equal(DIMENSIONS[dimName].enabled, false,
      `${dimName} must remain disabled — enabling requires source-backed coverage + smoke review`);
  });
}

for (const dimName of ENABLED_DIMS) {
  test(`${dimName} stays enabled:true after source-backed enable review`, () => {
    assert.equal(DIMENSIONS[dimName].enabled, true,
      `${dimName} must stay enabled unless a later smoke review disables it`);
  });
}
