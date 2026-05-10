import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const generator = readFileSync(new URL('./verdict-generator.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../../../app/api/research-room/verdict/route.ts', import.meta.url), 'utf8')

test('research verdict v2 uses the evidence-pool model and hash version', () => {
  assert.match(generator, /decision_model:\s*'evidence_pool_v2'/)
  assert.match(generator, /format:\s*'research_verdict_v2'/)
  assert.match(generator, /version:\s*2/)
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
