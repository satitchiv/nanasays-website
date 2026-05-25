// Tests for effective-top-priority.ts (Verdict v3 Phase 2.6 — 2026-05-24).
//
// 3 sections:
//   1. hashProseSnapshot — determinism, invalidation, malformed-input safety,
//      JSON-encoding boundary fix.
//   2. cacheNeedsRefresh — refresh policy (Codex r1 P2 #4 + r3 P1 coercion).
//   3. effectiveTopPriority — precedence (wizard vs cached drill), freshness,
//      version enforcement, malformed-input safety (Codex r3 P1).

import { test } from 'node:test'
import assert from 'node:assert/strict'

const PATH = './effective-top-priority.ts'

// ── hashProseSnapshot ────────────────────────────────────────────────

test('hashProseSnapshot: identical inputs → identical hash', async () => {
  const { hashProseSnapshot } = await import(PATH)
  const profile = { academic_notes: 'a', goals_notes: 'b', personality_notes: 'c', child_wants: 'd', anchors_notes: 'e' }
  assert.equal(hashProseSnapshot(profile), hashProseSnapshot(profile))
})

test('hashProseSnapshot: editing ANY prose field changes the hash', async () => {
  const { hashProseSnapshot } = await import(PATH)
  const base = { academic_notes: 'a', goals_notes: 'b', personality_notes: 'c', child_wants: 'd', anchors_notes: 'e' }
  for (const field of ['academic_notes', 'goals_notes', 'personality_notes', 'child_wants', 'anchors_notes']) {
    const edited = { ...base, [field]: base[field] + ' (edited)' }
    assert.notEqual(hashProseSnapshot(base), hashProseSnapshot(edited), `${field} edit must change hash`)
  }
})

test('hashProseSnapshot: null/empty fields hash to a stable value', async () => {
  const { hashProseSnapshot } = await import(PATH)
  const empty = { academic_notes: null, goals_notes: null, personality_notes: null, child_wants: null, anchors_notes: null }
  const blank = { academic_notes: '',   goals_notes: '',   personality_notes: '',   child_wants: '',   anchors_notes: '' }
  assert.equal(hashProseSnapshot(empty), hashProseSnapshot(blank))
})

test('hashProseSnapshot: whitespace differences are normalised', async () => {
  const { hashProseSnapshot } = await import(PATH)
  const base   = { academic_notes: 'a', goals_notes: 'b', personality_notes: 'c', child_wants: 'd', anchors_notes: 'e' }
  const padded = { academic_notes: '  a  ', goals_notes: 'b\n', personality_notes: '\tc', child_wants: 'd ', anchors_notes: ' e' }
  assert.equal(hashProseSnapshot(base), hashProseSnapshot(padded))
})

test('hashProseSnapshot: non-string fields coerce to empty (no crash) — Codex r2 P1 #2', async () => {
  const { hashProseSnapshot } = await import(PATH)
  const malformed = { academic_notes: 123, goals_notes: true, personality_notes: { x: 1 }, child_wants: [1, 2], anchors_notes: undefined }
  const h = hashProseSnapshot(malformed)
  assert.equal(typeof h, 'string')
  assert.equal(h.length, 64)
  const allEmpty = hashProseSnapshot({ academic_notes: '', goals_notes: '', personality_notes: '', child_wants: '', anchors_notes: '' })
  assert.equal(h, allEmpty)
})

test('hashProseSnapshot: newline in field does not blur boundary (JSON encoding) — Codex r2 P2 #3', async () => {
  const { hashProseSnapshot } = await import(PATH)
  const distA = { academic_notes: 'a\nb', goals_notes: 'c', personality_notes: '', child_wants: '', anchors_notes: '' }
  const distB = { academic_notes: 'a', goals_notes: 'b\nc', personality_notes: '', child_wants: '', anchors_notes: '' }
  assert.notEqual(hashProseSnapshot(distA), hashProseSnapshot(distB))
})

// ── buildIntentFocusCache ────────────────────────────────────────────

test('buildIntentFocusCache: produces stable shape', async () => {
  const { buildIntentFocusCache, DEFAULT_EXPECTED_VERSION } = await import(PATH)
  const cache = buildIntentFocusCache({
    drillFocus: 'sport',
    sportFocus: 'tennis',
    profile: { academic_notes: 'a' },
    version: DEFAULT_EXPECTED_VERSION,
  })
  assert.equal(cache.value, 'sport')
  assert.equal(cache.sport_focus, 'tennis')
  assert.equal(typeof cache.source_hash, 'string')
  assert.equal(cache.source_hash.length, 64)
  assert.equal(cache.version, DEFAULT_EXPECTED_VERSION)
  assert.ok(Date.parse(cache.computed_at) > 0)
})

test('buildIntentFocusCache: null/undefined drillFocus stores "none"', async () => {
  const { buildIntentFocusCache } = await import(PATH)
  for (const v of [null, undefined, 'none']) {
    const cache = buildIntentFocusCache({ drillFocus: v, profile: {}, version: 'v' })
    assert.equal(cache.value, 'none')
  }
})

// ── cacheNeedsRefresh ────────────────────────────────────────────────

test('cacheNeedsRefresh: true when existing is null', async () => {
  const { cacheNeedsRefresh, buildIntentFocusCache } = await import(PATH)
  const cand = buildIntentFocusCache({ drillFocus: 'sport', profile: {}, version: 'v' })
  assert.equal(cacheNeedsRefresh(null, cand), true)
  assert.equal(cacheNeedsRefresh(undefined, cand), true)
})

test('cacheNeedsRefresh: false when value+hash+version match (computed_at differs)', async () => {
  const { cacheNeedsRefresh, buildIntentFocusCache } = await import(PATH)
  const a = buildIntentFocusCache({ drillFocus: 'sport', profile: { goals_notes: 'rugby' }, version: 'v' })
  const b = { ...a, computed_at: new Date(Date.now() + 1000).toISOString() }
  assert.equal(cacheNeedsRefresh(a, b), false)
})

test('cacheNeedsRefresh: true when value differs', async () => {
  const { cacheNeedsRefresh, buildIntentFocusCache } = await import(PATH)
  const a = buildIntentFocusCache({ drillFocus: 'sport',    profile: {}, version: 'v' })
  const b = buildIntentFocusCache({ drillFocus: 'academic', profile: {}, version: 'v' })
  assert.equal(cacheNeedsRefresh(a, b), true)
})

test('cacheNeedsRefresh: true when source_hash differs (prose edited)', async () => {
  const { cacheNeedsRefresh, buildIntentFocusCache } = await import(PATH)
  const a = buildIntentFocusCache({ drillFocus: 'sport', profile: { goals_notes: 'rugby' }, version: 'v' })
  const b = buildIntentFocusCache({ drillFocus: 'sport', profile: { goals_notes: 'cricket' }, version: 'v' })
  assert.equal(cacheNeedsRefresh(a, b), true)
})

test('cacheNeedsRefresh: true when version bumped', async () => {
  const { cacheNeedsRefresh, buildIntentFocusCache } = await import(PATH)
  const a = buildIntentFocusCache({ drillFocus: 'sport', profile: {}, version: 'v1' })
  const b = buildIntentFocusCache({ drillFocus: 'sport', profile: {}, version: 'v2' })
  assert.equal(cacheNeedsRefresh(a, b), true)
})

test('cacheNeedsRefresh: malformed existing cache fields treated as empty (no crash) — Codex r3 P1', async () => {
  const { cacheNeedsRefresh, buildIntentFocusCache } = await import(PATH)
  const candidate = buildIntentFocusCache({ drillFocus: 'sport', profile: {}, version: 'v1' })
  const malformedExisting = { value: 123, source_hash: null, version: undefined, computed_at: 'x' }
  assert.equal(cacheNeedsRefresh(malformedExisting, candidate), true)
})

// ── effectiveTopPriority ─────────────────────────────────────────────

test('effectiveTopPriority: null profile → empty string', async () => {
  const { effectiveTopPriority } = await import(PATH)
  assert.equal(effectiveTopPriority(null), '')
})

test('effectiveTopPriority: malformed top_priority (non-string) returns empty — Codex r3 P1', async () => {
  const { effectiveTopPriority } = await import(PATH)
  assert.equal(effectiveTopPriority({ top_priority: 123 }), '')
  assert.equal(effectiveTopPriority({ top_priority: null }), '')
  assert.equal(effectiveTopPriority({ top_priority: undefined }), '')
  assert.equal(effectiveTopPriority({ top_priority: { x: 1 } }), '')
})

test('effectiveTopPriority: malformed cache.value treated as empty — Codex r3 P1', async () => {
  const { effectiveTopPriority, hashProseSnapshot, DEFAULT_EXPECTED_VERSION } = await import(PATH)
  const prose = { academic_notes: 'a' }
  const profile = {
    top_priority: 'academic',
    ...prose,
    intent_focus_cache: {
      value: 123,                                    // malformed
      source_hash: hashProseSnapshot(prose),
      version: DEFAULT_EXPECTED_VERSION,
      computed_at: new Date().toISOString(),
    },
  }
  assert.equal(effectiveTopPriority(profile), 'academic')
})

test('effectiveTopPriority: no cache, wizard top_priority → wizard wins', async () => {
  const { effectiveTopPriority } = await import(PATH)
  assert.equal(effectiveTopPriority({ top_priority: 'academic' }), 'academic')
})

test('effectiveTopPriority: FRESH cache with non-none drill_focus wins over wizard', async () => {
  const { effectiveTopPriority, hashProseSnapshot, DEFAULT_EXPECTED_VERSION } = await import(PATH)
  const prose = { academic_notes: 'a', goals_notes: 'b', personality_notes: 'c', child_wants: 'd', anchors_notes: 'e' }
  const profile = {
    top_priority: 'academic',
    ...prose,
    intent_focus_cache: { value: 'sport', source_hash: hashProseSnapshot(prose), version: DEFAULT_EXPECTED_VERSION, computed_at: new Date().toISOString() },
  }
  assert.equal(effectiveTopPriority(profile), 'sport')
})

test('effectiveTopPriority: STALE cache (hash mismatch) falls back to wizard', async () => {
  const { effectiveTopPriority, DEFAULT_EXPECTED_VERSION } = await import(PATH)
  const profile = {
    top_priority: 'academic',
    academic_notes: 'parent edited this AFTER classification ran',
    goals_notes: '', personality_notes: '', child_wants: '', anchors_notes: '',
    intent_focus_cache: { value: 'sport', source_hash: 'stale-hash', version: DEFAULT_EXPECTED_VERSION, computed_at: '2026-05-23T00:00:00Z' },
  }
  assert.equal(effectiveTopPriority(profile), 'academic')
})

test('effectiveTopPriority: VERSION MISMATCH falls back to wizard — Codex r2 P2 #3', async () => {
  const { effectiveTopPriority, hashProseSnapshot } = await import(PATH)
  const prose = { goals_notes: 'rugby' }
  const profile = {
    top_priority: 'academic',
    ...prose,
    intent_focus_cache: { value: 'sport', source_hash: hashProseSnapshot(prose), version: 'old-classifier-version-v0', computed_at: new Date().toISOString() },
  }
  assert.equal(effectiveTopPriority(profile), 'academic')
})

test('effectiveTopPriority: explicit expectedVersion override', async () => {
  const { effectiveTopPriority, hashProseSnapshot } = await import(PATH)
  const prose = { goals_notes: 'rugby' }
  const profile = {
    top_priority: 'academic',
    ...prose,
    intent_focus_cache: { value: 'sport', source_hash: hashProseSnapshot(prose), version: 'custom-v9', computed_at: new Date().toISOString() },
  }
  assert.equal(effectiveTopPriority(profile, 'custom-v9'), 'sport')
  assert.equal(effectiveTopPriority(profile, 'something-else'), 'academic')
})

test('effectiveTopPriority: cache with "none" value falls back to wizard', async () => {
  const { effectiveTopPriority, hashProseSnapshot, DEFAULT_EXPECTED_VERSION } = await import(PATH)
  const prose = { academic_notes: 'a' }
  const profile = {
    top_priority: 'academic',
    ...prose,
    intent_focus_cache: { value: 'none', source_hash: hashProseSnapshot(prose), version: DEFAULT_EXPECTED_VERSION, computed_at: new Date().toISOString() },
  }
  assert.equal(effectiveTopPriority(profile), 'academic')
})

test('effectiveTopPriority: lowercase normalisation', async () => {
  const { effectiveTopPriority } = await import(PATH)
  assert.equal(effectiveTopPriority({ top_priority: 'SPORT' }), 'sport')
  assert.equal(effectiveTopPriority({ top_priority: '  Academic  ' }), 'academic')
})
