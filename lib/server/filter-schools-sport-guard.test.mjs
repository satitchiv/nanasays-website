// filterSchools has_sport guardrail (2026-07-05).
//
// has_sport reads schools_status has_<sport>_extracted flags — those exist
// only for tennis/football/rugby/cricket/hockey. Before this guard, a
// non-flag sport (golf) matched ZERO schools silently, and the model
// answered "no schools offer golf" — false. The guard returns an explicit
// redirect to the <sport>_offering rankSchools path BEFORE any DB access
// (so it's testable with supabase=null).
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/filter-schools-sport-guard.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSchools } from './tools.js';

test('has_sport=golf → explicit redirect error, no silent empty result', async () => {
  const r = await filterSchools(null, { has_sport: 'golf' });
  assert.ok(r.result.error, 'expected an error payload');
  assert.match(r.result.error, /golf_offering/);
  assert.match(r.result.error, /rankSchools/);
  assert.equal(r.result.schools, undefined, 'must not return an empty schools list');
});

test('has_sport normalisation: " Water Polo " → water_polo_offering hint', async () => {
  const r = await filterSchools(null, { has_sport: ' Water Polo ' });
  assert.match(r.result.error, /water_polo_offering/);
});

test('flag-backed sports pass the guard (tennis reaches the DB path)', async () => {
  // supabase=null → the guard must NOT fire; the call then throws/fails on
  // the DB access, proving it got past the guard. We only assert it doesn't
  // return the redirect error.
  let redirected = false;
  try {
    const r = await filterSchools(null, { has_sport: 'tennis' });
    redirected = !!r?.result?.error && /offering/.test(r.result.error);
  } catch {
    // DB throw = expected with a null client; the guard did not fire.
  }
  assert.equal(redirected, false, 'tennis must not be redirected');
});

test('alias sports resolve through the registry: "ping pong" → table_tennis_offering', async () => {
  const r = await filterSchools(null, { has_sport: 'ping pong' });
  assert.match(r.result.error, /table_tennis_offering/);
});

test('unknown sport gets no fabricated dimension name', async () => {
  const r = await filterSchools(null, { has_sport: 'kabaddi' });
  assert.ok(r.result.error, 'expected an error payload');
  assert.doesNotMatch(r.result.error, /kabaddi_offering/);
  assert.match(r.result.error, /matches no tracked sport dimension/);
});
