import assert from 'node:assert/strict'
import test from 'node:test'
import { comparisonTableMinWidth } from './comparison-table-layout.ts'

test('keeps the normal desktop table floor for short shortlists', () => {
  assert.equal(comparisonTableMinWidth(0), 1100)
  assert.equal(comparisonTableMinWidth(3), 1100)
})

test('expands the sticky containing block for wide shortlists', () => {
  assert.equal(comparisonTableMinWidth(6), 1580)
  assert.equal(comparisonTableMinWidth(8), 2020)
  assert.equal(comparisonTableMinWidth(10), 2460)
})
