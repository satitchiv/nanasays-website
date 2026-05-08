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

// T4.16-pre-enable-2 regression — locks in `enabled: false` on the 5 new
// dims. tools.js compareSchools (lines 400-408) and rankSchools (via
// hasRequiredData) both gate on this flag; if any dim is accidentally
// flipped to true without going through the proper enable review chain,
// these tests will fail before the change ships.
const DISABLED_DIMS = ['safeguarding_integrity', 'weekend_life', 'ethos_match', 'intl_share', 'device_policy'];

for (const dimName of DISABLED_DIMS) {
  test(`${dimName} stays enabled:false until T4.16 enable review`, () => {
    assert.equal(DIMENSIONS[dimName].enabled, false,
      `${dimName} must remain disabled — enabling requires Codex review + ctx plumbing`);
  });
}
