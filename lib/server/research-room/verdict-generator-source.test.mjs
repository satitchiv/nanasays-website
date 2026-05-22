import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const generator = readFileSync(new URL('./verdict-generator.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../../../app/api/research-room/verdict/route.ts', import.meta.url), 'utf8')

test('research verdict v2 model + v3 overlay constants are present in source', () => {
  // v2 fallback strings still present (back-compat for callers without
  // schoolFacts; ternary'd into the emitted JSON).
  assert.match(generator, /'evidence_pool_v2'/)
  assert.match(generator, /'research_verdict_v2'/)
  // v3 overlay strings (2026-05-21: paths/couldnt_compare/brief_tensions).
  assert.match(generator, /'paths_v3'/)
  assert.match(generator, /'research_verdict_v3'/)
  // Hash payload version bumps when v3 is active. v2 fallback uses 3, v3 uses 4.
  assert.match(generator, /version:\s*v3Overlay\s*\?\s*4\s*:\s*3/)
  assert.match(generator, /stableHashValue/)
})

test('rank-like sport rows are lower-is-better', () => {
  assert.match(generator, /\(rank\|ranking\|dmt\|socs\|position\|league table\)/)
  assert.match(generator, /return 'lower'/)
})

test('child-specific rubric handles Theo-style sport, full boarding, and stage mismatch', () => {
  assert.match(generator, /rubric\.topPriority === 'sport'/)
  assert.match(generator, /rubric\.boardingPref\?\.includes\('full'\)/)
  assert.match(generator, /prep\|preparatory\|primary/)
  assert.match(generator, /Year \$\{rubric\.childYear\}/)
})

test('verdict route loads all current evidence rows, not the visible comparison tab', () => {
  assert.match(route, /loadVerdictEvidenceData/)
  assert.doesNotMatch(route, /loadComparisonData\(svc, user\.id, child\.id, baseLensKind/)
})
