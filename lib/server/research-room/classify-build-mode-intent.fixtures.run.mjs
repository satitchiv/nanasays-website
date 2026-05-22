// Phase 4 item #2 — offline fixture runner for the intent classifier.
//
// Each fixture costs one OpenAI gpt-5.4-mini call (~256 tokens out + a
// system prompt of ~600 tokens in). With ~45 fixtures this is ~$0.02
// per full run. Don't run from CI; run on local dev when the prompt
// changes, model changes, or you're adding new fixtures.
//
// Usage (from website/):
//   OPENAI_API_KEY=sk-... node --experimental-strip-types \
//     --import ./lib/server/_test-stub-server-only.mjs \
//     lib/server/research-room/classify-build-mode-intent.fixtures.run.mjs
//
// Output: per-fixture PASS/FAIL with expected vs actual, plus summary.

import { classifyBuildModeIntent } from './classify-build-mode-intent.ts'
import { INTENT_FIXTURES } from './classify-build-mode-intent.fixtures.ts'

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY not set — runner needs the real key')
  process.exit(1)
}

const ANSI = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  dim:    '\x1b[2m',
}

const startMs = Date.now()
let passes  = 0
let fails   = 0
const failures = []

console.log(`Running ${INTENT_FIXTURES.length} intent classifier fixtures...\n`)

for (let i = 0; i < INTENT_FIXTURES.length; i++) {
  const f = INTENT_FIXTURES[i]
  const idx = String(i + 1).padStart(2, '0')
  process.stdout.write(`[${idx}/${INTENT_FIXTURES.length}] ${f.name.padEnd(60)} `)

  let actual
  try {
    actual = await classifyBuildModeIntent({
      academic_notes: f.academic_notes,
      goals_notes:    f.goals_notes,
    })
  } catch (err) {
    process.stdout.write(`${ANSI.red}ERROR${ANSI.reset} ${err.message}\n`)
    fails++
    failures.push({ fixture: f, actual: null, error: err.message })
    continue
  }

  const match =
    actual.academic_intent === f.expected.academic_intent &&
    actual.top_uni_intent  === f.expected.top_uni_intent

  if (match) {
    process.stdout.write(`${ANSI.green}PASS${ANSI.reset} ${ANSI.dim}${actual.academic_intent}/${actual.top_uni_intent}${ANSI.reset}\n`)
    passes++
  } else {
    process.stdout.write(`${ANSI.red}FAIL${ANSI.reset}\n`)
    process.stdout.write(`     expected: ${ANSI.dim}${f.expected.academic_intent}/${f.expected.top_uni_intent}${ANSI.reset}\n`)
    process.stdout.write(`     actual:   ${ANSI.yellow}${actual.academic_intent}/${actual.top_uni_intent}${ANSI.reset}\n`)
    process.stdout.write(`     origin:   ${ANSI.dim}${f.origin}${ANSI.reset}\n`)
    fails++
    failures.push({ fixture: f, actual, error: null })
  }
}

const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1)
console.log('')
console.log(`${ANSI.green}${passes} pass${ANSI.reset} · ${fails > 0 ? ANSI.red : ANSI.dim}${fails} fail${ANSI.reset} · ${elapsedSec}s`)

if (fails > 0) {
  console.log('\nFailure summary by origin:')
  const byOrigin = new Map()
  for (const f of failures) {
    const o = f.fixture.origin
    if (!byOrigin.has(o)) byOrigin.set(o, [])
    byOrigin.get(o).push(f)
  }
  for (const [origin, fs] of byOrigin) {
    console.log(`  ${origin}: ${fs.length} fail`)
    for (const f of fs) {
      console.log(`    - ${f.fixture.name}`)
    }
  }
  process.exit(1)
}

process.exit(0)
