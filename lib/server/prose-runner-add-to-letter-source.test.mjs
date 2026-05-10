import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'prose-runner.js'), 'utf8')

test('prose-runner declares the add-to-letter extractor arm', () => {
  assert.match(src, /Choose ONE of FOUR outputs/)
  assert.match(src, /PRIORITY RULE: choose D only when the parent explicitly asks/)
  assert.match(src, /"kind": "propose_add_to_letter"/)
  assert.match(src, /function validateAddToLetterProposal/)
  assert.match(src, /propose_add_to_letter:\s*validateAddToLetterProposal/)
})
