import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const generator = readFileSync(new URL('./verdict-generator.ts', import.meta.url), 'utf8')
const route = readFileSync(new URL('../../../app/api/research-room/verdict/route.ts', import.meta.url), 'utf8')

test('research verdict v3 model constants are present in source', () => {
  // Codex r1 Delete #2 (2026-05-22): v2 fallback path removed. The format/
  // decision_model union members 'research_verdict_v2'/'evidence_pool_v2' may
  // still live in the type definition (defensive read-only shim for any
  // pre-migration cached row), but the producer never emits them.
  assert.match(generator, /'paths_v3'/)
  assert.match(generator, /'research_verdict_v3'/)
  // Hash payload uses version 4 (v3 era). v2's `version: 3` branch deleted
  // with the fallback path.
  assert.match(generator, /version:\s*4,/)
  assert.match(generator, /stableHashValue/)
  // Format literals must appear EXACTLY once in source (the producer's emit).
  // Multiple matches would mean the v2 emission path crept back in.
  const formatMatches = generator.match(/'research_verdict_v3'/g) ?? []
  assert.equal(formatMatches.length, 2,
    `'research_verdict_v3' should appear exactly twice (once in the type union, once in the producer's emit). Saw ${formatMatches.length}.`)
  const decisionMatches = generator.match(/'paths_v3'/g) ?? []
  assert.equal(decisionMatches.length, 2,
    `'paths_v3' should appear exactly twice (type union + producer emit). Saw ${decisionMatches.length}.`)
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
