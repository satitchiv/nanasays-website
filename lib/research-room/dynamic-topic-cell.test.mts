import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveDatabaseTopicCell } from './dynamic-topic-cell.ts'

const school = {
  slug: 'example-school',
  name: 'Example School',
  city: 'London',
  region: 'London',
  boarding: true,
  gender_split: 'co-ed',
  structured: {
    school_life: {
      community_service: 'Pupils volunteer with local food banks and care homes.',
    },
    sports_profile: {
      cricket: { extracted_at: '2026-07-25T00:00:00Z' },
    },
  },
}

test('resolves a dynamic database topic without treating metadata as evidence', () => {
  const cell = resolveDatabaseTopicCell(
    { id: 'database-community_service', label: 'Community service', evidence_paths: ['school_life.community_service'] },
    school,
  )
  assert.equal(cell?.value, 'Pupils volunteer with local food banks and care homes.')
  assert.equal(cell?.evidence_kind, 'nana_database')
})

test('returns no cell for metadata-only dynamic evidence', () => {
  const cell = resolveDatabaseTopicCell(
    { id: 'database-cricket', label: 'Cricket opportunities', evidence_paths: ['sports_profile.cricket'] },
    school,
  )
  assert.equal(cell, null)
})
