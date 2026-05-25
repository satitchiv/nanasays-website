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

// ── Recommender Phase 2 (2026-05-21): subject_strengths dim ─────────

const SS_ROW = {
  subject_strengths: {
    schema_version: 'v2.0',
    maths:    { items: new Array(10).fill({ source_url: 'https://x.com/a' }), summary_paragraph_for_chatbot: 'Maths summary.' },
    biology:  { items: new Array(3).fill({ source_url: 'https://x.com/b' }),  summary_paragraph_for_chatbot: 'Biology summary.' },
    physics:  { items: [{ source_url: 'https://x.com/c' }], summary_paragraph_for_chatbot: 'Physics one item.' },
  },
};

test('subject_strengths returns 0 when ctx.subject_intents is missing (null short-circuit)', () => {
  const score = DIMENSIONS.subject_strengths.rank(SS_ROW, {});
  assert.equal(score, 0, 'no intents → no boost');
});

test('subject_strengths returns 0 when subject_intents Set is empty', () => {
  const score = DIMENSIONS.subject_strengths.rank(SS_ROW, { subject_intents: new Set() });
  assert.equal(score, 0);
});

test('subject_strengths returns 1.0 for a subject with ≥5 items (strong band)', () => {
  const score = DIMENSIONS.subject_strengths.rank(SS_ROW, { subject_intents: new Set(['maths']) });
  assert.equal(score, 1.0, `maths has 10 items → +1.0, got ${score}`);
});

test('subject_strengths returns 0.5 for a subject with 2-4 items (moderate band)', () => {
  const score = DIMENSIONS.subject_strengths.rank(SS_ROW, { subject_intents: new Set(['biology']) });
  assert.equal(score, 0.5, `biology has 3 items → +0.5, got ${score}`);
});

test('subject_strengths returns 0 for a subject with <2 items', () => {
  const score = DIMENSIONS.subject_strengths.rank(SS_ROW, { subject_intents: new Set(['physics']) });
  assert.equal(score, 0, `physics has 1 item → +0, got ${score}`);
});

test('subject_strengths sums across multiple matched subjects', () => {
  const score = DIMENSIONS.subject_strengths.rank(SS_ROW, { subject_intents: new Set(['maths', 'biology', 'physics']) });
  // 1.0 (maths 10) + 0.5 (biology 3) + 0 (physics 1) = 1.5
  assert.equal(score, 1.5, `expected 1.5, got ${score}`);
});

test('subject_strengths returns 0 when subject_strengths column is null/missing', () => {
  assert.equal(DIMENSIONS.subject_strengths.rank({}, { subject_intents: new Set(['maths']) }), 0);
  assert.equal(DIMENSIONS.subject_strengths.rank({ subject_strengths: null }, { subject_intents: new Set(['maths']) }), 0);
});

test('subject_strengths citations() returns top source URLs for matched subjects (deduped, capped at 5)', () => {
  const urls = DIMENSIONS.subject_strengths.citations(SS_ROW, { subject_intents: new Set(['maths', 'biology']) });
  assert.ok(Array.isArray(urls), 'citations is an array');
  assert.ok(urls.length >= 1, 'citations returns at least 1 URL');
  assert.ok(urls.length <= 5, 'citations capped at 5');
  // Dedup check: the 10-item maths bucket has all same URL; should appear once.
  assert.equal(new Set(urls).size, urls.length, 'citations are deduplicated');
});

// T4.16 enable gate regression. Gap B wiring exists for ethos_match /
// intl_share / device_policy, but each dim only flips on after source-backed
// coverage + smoke review. weekend_life, safeguarding_integrity, and
// ethos_match have passed; intl_share and device_policy remain disabled until
// their rankable source-backed coverage is no longer sparse.
const DISABLED_DIMS = [
  'intl_share',
  'device_policy',
  // Recommender Phase 2 (2026-05-21): subject_strengths is invoked directly
  // by score-for-build-mode.ts with a hand-built ctx; chat-side dim routing
  // has no way to populate ctx.subject_intents yet, so stays disabled.
  'subject_strengths',
];
const ENABLED_DIMS = ['weekend_life', 'safeguarding_integrity', 'ethos_match', 'proximity_to_heathrow'];

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

// ────────────────────────────────────────────────────────────────────────────
// proximity_to_heathrow — 2026-05-25 (Heathrow global-discovery slice).
// Scorer reads SSD location_profile.airports[] Heathrow distance and returns
// 1000/(1+miles) (always positive, closer wins). Uses the same _heathrow-
// MilesFromLocation logic as nana-brain.js _ssdHeathrowMiles.
// ────────────────────────────────────────────────────────────────────────────

test('proximity_to_heathrow scores Eton-shape (direct miles 9) at 100', () => {
  const row = { location_profile: { airports: [{ name: 'Heathrow', distance_miles: 9 }] } };
  const score = DIMENSIONS.proximity_to_heathrow.rank(row);
  // 1000 / (1 + 9) = 100
  assert.equal(score, 100);
});

test('proximity_to_heathrow scores Wellington-shape (distance_km 27 → ~17 mi)', () => {
  // 27 km × 0.621371 ≈ 16.78 → rounded 17. Score = 1000 / (1 + 17) ≈ 55.56.
  const row = {
    location_profile: {
      airports: [{ name: 'Heathrow', distance_km: 27, drive_time_min_estimate: 45 }],
    },
  };
  const score = DIMENSIONS.proximity_to_heathrow.rank(row);
  assert.ok(score > 55 && score < 56, `expected ~55.56, got ${score}`);
});

test('proximity_to_heathrow scores LHR code + distance_miles direct', () => {
  const row = { location_profile: { airports: [{ code: 'LHR', distance_miles: 18 }] } };
  const score = DIMENSIONS.proximity_to_heathrow.rank(row);
  // 1000 / (1 + 18) ≈ 52.63
  assert.ok(score > 52 && score < 53);
});

test('proximity_to_heathrow scores Millfield-shape (102 mi) at ~9.7', () => {
  const row = { location_profile: { airports: [{ name: 'Heathrow', distance_miles: 102 }] } };
  const score = DIMENSIONS.proximity_to_heathrow.rank(row);
  // 1000 / (1 + 102) ≈ 9.71. Always positive — passes rankSchools score>0 filter.
  assert.ok(score > 9 && score < 10, `expected ~9.7, got ${score}`);
  assert.ok(score > 0, 'far schools still positive — rankSchools score>0 filter must not drop them');
});

test('proximity_to_heathrow returns 0 when SSD has no airports[]', () => {
  const row = { location_profile: { region: 'South East', setting: 'rural' } };
  assert.equal(DIMENSIONS.proximity_to_heathrow.rank(row), 0);
});

test('proximity_to_heathrow returns 0 when location_profile entirely missing', () => {
  assert.equal(DIMENSIONS.proximity_to_heathrow.rank({}), 0);
  assert.equal(DIMENSIONS.proximity_to_heathrow.rank({ location_profile: null }), 0);
});

test('proximity_to_heathrow returns 0 when airports[] has no Heathrow entry (Gatwick only)', () => {
  const row = {
    location_profile: { airports: [{ name: 'Gatwick Airport', distance_miles: 12 }] },
  };
  assert.equal(DIMENSIONS.proximity_to_heathrow.rank(row), 0);
});

test('proximity_to_heathrow returns 0 when Heathrow entry has only drive-time (wrong unit)', () => {
  // Drive-time alone is minutes, not miles — scorer cannot use it directly.
  const row = {
    location_profile: { airports: [{ name: 'Heathrow', drive_time_min_estimate: 45 }] },
  };
  assert.equal(DIMENSIONS.proximity_to_heathrow.rank(row), 0);
});

test('proximity_to_heathrow format returns "N miles from Heathrow" prose', () => {
  const row = { location_profile: { airports: [{ name: 'Heathrow', distance_miles: 9 }] } };
  const summary = DIMENSIONS.proximity_to_heathrow.format(row, { name: 'Eton College' });
  assert.equal(summary, 'Eton College — 9 miles from Heathrow.');
});

test('proximity_to_heathrow format gracefully handles missing data', () => {
  const summary = DIMENSIONS.proximity_to_heathrow.format({}, { name: 'Test School' });
  assert.match(summary, /Heathrow distance unknown/);
});

test('proximity_to_heathrow.citations returns empty array (no source_url for airport data)', () => {
  assert.deepEqual(DIMENSIONS.proximity_to_heathrow.citations({}), []);
});

test('proximity_to_heathrow.keywords matches expected parent phrasings', () => {
  const re = DIMENSIONS.proximity_to_heathrow.keywords;
  for (const q of [
    'heathrow',
    'LHR',
    'close to heathrow',
    'near heathrow',
    'closest to heathrow',
    'nearest to heathrow',
    'airport access',
    'close to london airport',
  ]) {
    assert.ok(re.test(q.toLowerCase()), `keywords must match "${q}"`);
  }
});
