import test from 'node:test'
import assert from 'node:assert/strict'
import { COMPARISON_CATALOGUE } from './comparison-catalog.ts'
import { DATABASE_TOPIC_CANDIDATES } from './database-topic-candidates.ts'
import { hasMeaningfulEvidenceValue } from './topic-evidence.ts'

function normalizeTopic(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

test('does not treat extraction metadata as topic evidence', () => {
  assert.equal(hasMeaningfulEvidenceValue({ extracted_at: '2026-07-25T00:00:00Z' }), false)
  assert.equal(hasMeaningfulEvidenceValue({ evidence_urls: [], source_urls: [] }), false)
})

test('accepts narrative, numeric, boolean, and nested evidence values', () => {
  assert.equal(hasMeaningfulEvidenceValue('No organised rugby programme identified.'), true)
  assert.equal(hasMeaningfulEvidenceValue(0), true)
  assert.equal(hasMeaningfulEvidenceValue(false), true)
  assert.equal(hasMeaningfulEvidenceValue({ notes: 'Regional fixtures', extracted_at: '2026-07-25' }), true)
})

test('rejects empty evidence markers', () => {
  assert.equal(hasMeaningfulEvidenceValue('unknown'), false)
  assert.equal(hasMeaningfulEvidenceValue('N/A'), false)
  assert.equal(hasMeaningfulEvidenceValue(['unknown', 'no data']), false)
})

test('database candidates do not duplicate the existing comparison catalogue', () => {
  const catalogueTopics = new Set(COMPARISON_CATALOGUE.map(topic => normalizeTopic(topic.label)))
  const candidateTopics = DATABASE_TOPIC_CANDIDATES.map(candidate => normalizeTopic(candidate.label))
  assert.equal(new Set(candidateTopics).size, candidateTopics.length)
  for (const topic of candidateTopics) assert.equal(catalogueTopics.has(topic), false)
})
