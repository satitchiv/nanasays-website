// Slice 8 Build 2 r1 — idempotency key namespace test.
//
// Codex Q2 answer: brief-seeded rows use the prefix `seed:v1:general:brief_`
// to satisfy the seed_research_session_rows RPC validator (which forbids
// non-general lens_kind values in the key prefix). To prevent future
// collisions, no GENERAL_SPECS slug may start with `brief_`.
//
// This test reads seed-rows.ts as source text (rather than importing — the
// file uses `import 'server-only'` which can't load under raw node) and
// extracts the GENERAL_SPECS slug strings via regex.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'seed-rows.ts'), 'utf8')

function extractSlugs(arrayName) {
  const re = new RegExp(`const ${arrayName}[^=]*=\\s*\\[(.*?)^\\]`, 'sm')
  const m = source.match(re)
  if (!m) throw new Error(`couldn't locate ${arrayName} array in seed-rows.ts`)
  const body = m[1]
  return [...body.matchAll(/slug:\s*'([^']+)'/g)].map(x => x[1])
}

test('no GENERAL_SPECS slug starts with "brief_" (reserved prefix)', () => {
  const generalSlugs = extractSlugs('GENERAL_SPECS')
  assert.ok(generalSlugs.length > 0, 'expected at least one GENERAL_SPECS slug')
  for (const slug of generalSlugs) {
    assert.ok(
      !slug.startsWith('brief_'),
      `GENERAL_SPECS slug '${slug}' starts with reserved 'brief_' prefix`,
    )
  }
})

test('every BRIEF_SPECS slug becomes a valid idempotency key', () => {
  // Constraint from migration 2026-05-08-research-room-lens-kind.sql §6:
  //   ^seed:v\d+:<lens_kind>:[a-zA-Z0-9_-]{1,40}$
  // BRIEF_SPECS keys are formatted as `seed:v1:general:brief_<slug>` so
  // the slug portion is `brief_<slug>` and must fit the 40-char cap.
  const briefSlugs = extractSlugs('BRIEF_SPECS')
  assert.ok(briefSlugs.length > 0, 'expected at least one BRIEF_SPECS slug')
  for (const slug of briefSlugs) {
    const composite = `brief_${slug}`
    assert.match(composite, /^[a-zA-Z0-9_-]{1,40}$/, `brief_${slug} fails slug-shape constraint`)
  }
})
