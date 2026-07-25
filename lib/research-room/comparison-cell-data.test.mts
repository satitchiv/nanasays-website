import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasComparisonValueForSchools,
  omitComparisonSchoolCell,
} from './comparison-cell-data.ts'

test('ignores values that belong only to removed schools', () => {
  const cells = {
    removed: { value: 'Old value' },
    current: { value: null },
  }
  assert.equal(hasComparisonValueForSchools(cells, ['current']), false)
  assert.equal(hasComparisonValueForSchools(cells, ['removed', 'current']), true)
})

test('removes only the deleted school cell and preserves the rest', () => {
  const original = {
    removed: { value: 'Old value', source: 'https://example.com' },
    current: { value: 'Current value' },
  }
  assert.deepEqual(omitComparisonSchoolCell(original, 'removed'), {
    changed: true,
    cells: { current: { value: 'Current value' } },
  })
  assert.deepEqual(original.removed.value, 'Old value')
})

test('treats malformed cell data as empty', () => {
  assert.equal(hasComparisonValueForSchools(null, ['school']), false)
  assert.deepEqual(omitComparisonSchoolCell([], 'school'), {
    changed: false,
    cells: {},
  })
})
