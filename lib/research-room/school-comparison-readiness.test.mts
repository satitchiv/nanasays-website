import assert from 'node:assert/strict'
import test from 'node:test'
import { partitionComparisonReadySchools } from './school-comparison-readiness.ts'

test('keeps directory-only schools out of the comparison-ready picker results', () => {
  const result = partitionComparisonReadySchools([
    { slug: 'millfield-school', name: 'Millfield School' },
    { slug: 'directory-only-school', name: 'Directory Only School' },
  ], new Set(['millfield-school']))

  assert.deepEqual(result.ready.map(school => school.slug), ['millfield-school'])
  assert.deepEqual(result.unready.map(school => school.slug), ['directory-only-school'])
})
