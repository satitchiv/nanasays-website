import assert from 'node:assert/strict'
import test from 'node:test'
import {
  comparisonDisplayLabel,
  removeComparisonRowDuplicates,
} from './comparison-row-identity.ts'

test('keeps precise seeded fee labels instead of collapsing both to Boarding fees', () => {
  assert.equal(
    comparisonDisplayLabel('Boarding fee · per term', 'general'),
    'Boarding fee · per term',
  )
  assert.equal(
    comparisonDisplayLabel('Boarding fee · per year', 'general'),
    'Boarding fee · per year',
  )
  assert.equal(comparisonDisplayLabel('boarding cost', 'chat'), 'Boarding fees')
})

test('base rows win over semantically equivalent chat rows', () => {
  const rows = removeComparisonRowDuplicates([
    { row_name: 'Travel from Heathrow', lens_kind: 'general', id: 'base-airport' },
    { row_name: 'Airport distance', lens_kind: 'chat', id: 'chat-airport' },
    { row_name: 'Pastoral care model', lens_kind: 'chat', id: 'chat-pastoral-1' },
    { row_name: 'pastoral structure', lens_kind: 'chat', id: 'chat-pastoral-2' },
  ], 'general')

  assert.deepEqual(rows.map(row => row.id), [
    'base-airport',
    'chat-pastoral-1',
  ])
})

test('does not collapse two distinct base rows in one broad catalogue topic', () => {
  const rows = removeComparisonRowDuplicates([
    { row_name: 'Boarding fee · per term', lens_kind: 'general', id: 'term' },
    { row_name: 'Boarding fee · per year', lens_kind: 'general', id: 'year' },
  ], 'general')
  assert.deepEqual(rows.map(row => row.id), ['term', 'year'])
})

test('active topic row wins an exact base-row collision', () => {
  const rows = removeComparisonRowDuplicates([
    {
      row_name: 'Rugby strength',
      lens_kind: 'general',
      created_by_lens_id: null,
      id: 'base',
    },
    {
      row_name: 'Rugby strength',
      lens_kind: 'general',
      created_by_lens_id: 'rugby-lens',
      id: 'topic',
    },
  ], 'general', 'rugby-lens')

  assert.deepEqual(rows.map(row => row.id), ['topic'])
})
