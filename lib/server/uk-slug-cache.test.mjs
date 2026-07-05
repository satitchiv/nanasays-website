// loadUkSlugSet cache tests (2026-07-05).
//
// The UK-evidence slug set gated EVERY global rankSchools call behind 26
// sequential round-trips (~6.1s live). Pins the fix: count-first parallel
// pagination + 10-minute module cache, with the partial-failure path NOT
// cached (so a flaky page doesn't freeze a truncated set for 10 minutes —
// truncation here silently EXCLUDES schools from every ranking).
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/uk-slug-cache.test.mjs

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadUkSlugSet, _resetUkSlugCache } from './tools.js';

// Chainable mock of the one supabase query shape loadUkSlugSet uses:
// from('schools_status').select('school_slug', {count}).eq(...).range(a, b)
function mockSupabase({ total, failOffsets = new Set() }) {
  const calls = [];
  const rows = Array.from({ length: total }, (_, i) => ({ school_slug: `school-${i}` }));
  return {
    calls,
    from() {
      const q = {
        _wantCount: false,
        select(_cols, opts) { q._wantCount = !!opts?.count; return q; },
        eq() { return q; },
        range(a, b) {
          calls.push([a, b]);
          if (failOffsets.has(a)) return Promise.resolve({ data: null, error: { message: 'boom' }, count: null });
          return Promise.resolve({
            data: rows.slice(a, b + 1),
            error: null,
            count: q._wantCount ? total : null,
          });
        },
      };
      return q;
    },
  };
}

beforeEach(() => _resetUkSlugCache());

test('multi-page set loads completely and pages fetch beyond page 1', async () => {
  const sb = mockSupabase({ total: 2500 });
  const set = await loadUkSlugSet(sb);
  assert.equal(set.size, 2500);
  assert.equal(sb.calls.length, 3); // 0-999, 1000-1999, 2000-2499
});

test('second call within TTL hits the cache — zero DB round-trips', async () => {
  const sb = mockSupabase({ total: 2500 });
  const first = await loadUkSlugSet(sb);
  const callsAfterFirst = sb.calls.length;
  const second = await loadUkSlugSet(sb);
  assert.equal(sb.calls.length, callsAfterFirst, 'no new queries on cache hit');
  assert.equal(second, first, 'same Set instance returned');
});

test('partial page failure returns partial set but does NOT cache it', async () => {
  const sb = mockSupabase({ total: 2500, failOffsets: new Set([1000]) });
  const set = await loadUkSlugSet(sb);
  assert.equal(set.size, 1500, 'partial set returned (page 2 lost)');
  const healthy = mockSupabase({ total: 2500 });
  const retry = await loadUkSlugSet(healthy);
  assert.equal(retry.size, 2500, 'next call retried instead of serving the truncated cache');
});

test('empty / error first page returns empty set without caching', async () => {
  const sb = mockSupabase({ total: 0 });
  const set = await loadUkSlugSet(sb);
  assert.equal(set.size, 0);
  const healthy = mockSupabase({ total: 1200 });
  assert.equal((await loadUkSlugSet(healthy)).size, 1200);
});
