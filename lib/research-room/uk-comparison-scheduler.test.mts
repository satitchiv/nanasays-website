import assert from 'node:assert/strict'
import test from 'node:test'
import {
  manualRunKey,
  planSchedulerRowUpdate,
  scheduledRunKey,
} from './uk-comparison-scheduler.ts'

const CHECKED_AT = '2026-07-25T08:00:00.000Z'

test('fills only missing cells with database evidence', () => {
  const plan = planSchedulerRowUpdate({
    row: {
      id: 'row-1',
      row_name: 'Annual fees',
      cell_data: {
        'alpha-school': { value: null },
      },
    },
    schoolSlugs: ['alpha-school', 'beta-school'],
    checkedAt: CHECKED_AT,
    resolveCell: (_rowName, slug) => slug === 'beta-school'
      ? { value: '£30,000', source: 'school_structured_data.fees' }
      : null,
  })

  assert.equal(plan.changed, true)
  assert.equal(plan.cells_filled, 1)
  assert.equal(plan.cells_unfilled, 1)
  assert.deepEqual(plan.cell_data['beta-school'], {
    value: '£30,000',
    source: 'school_structured_data.fees',
    checked_at: CHECKED_AT,
    evidence_kind: 'nana_database',
  })
})

test('preserves populated stronger values and is a no-op on retry', () => {
  const row = {
    id: 'row-1',
    row_name: 'Football strength',
    cell_data: {
      'alpha-school': {
        value: 'National cup finalist',
        source: 'https://authoritative.example/result',
        evidence_kind: 'web_search' as const,
      },
    },
  }
  const resolveCell = () => ({ value: 'Database summary', evidence_kind: 'nana_database' as const })

  const first = planSchedulerRowUpdate({
    row,
    schoolSlugs: ['alpha-school'],
    checkedAt: CHECKED_AT,
    resolveCell,
  })
  const second = planSchedulerRowUpdate({
    row: { ...row, cell_data: first.cell_data },
    schoolSlugs: ['alpha-school'],
    checkedAt: CHECKED_AT,
    resolveCell,
  })

  assert.equal(first.changed, false)
  assert.equal(first.cells_preserved, 1)
  assert.deepEqual(first.cell_data, row.cell_data)
  assert.equal(second.changed, false)
  assert.equal(second.cells_filled, 0)
})

test('rejects web-search candidates and does not mutate malformed rows', () => {
  const rejected = planSchedulerRowUpdate({
    row: { id: 'row-1', row_name: 'Topic', cell_data: { 'alpha-school': { value: null } } },
    schoolSlugs: ['alpha-school'],
    checkedAt: CHECKED_AT,
    resolveCell: () => ({
      value: 'Unverified',
      source: 'https://example.com',
      evidence_kind: 'web_search',
    }),
  })
  const malformed = planSchedulerRowUpdate({
    row: { id: 'row-2', row_name: 'Topic', cell_data: null },
    schoolSlugs: ['alpha-school'],
    checkedAt: CHECKED_AT,
    resolveCell: () => ({ value: 'should not be called' }),
  })

  assert.equal(rejected.rejected_candidates, 1)
  assert.equal(rejected.changed, false)
  assert.equal(malformed.changed, false)
  assert.deepEqual(malformed.issues, ['comparison row cell_data is not an object'])
})

test('uses stable twice-daily UTC slots and unique manual keys', () => {
  assert.equal(scheduledRunKey(new Date('2026-07-25T11:59:59.000Z')), 'slot:2026-07-25T00:00:00.000Z')
  assert.equal(scheduledRunKey(new Date('2026-07-25T12:00:00.000Z')), 'slot:2026-07-25T12:00:00.000Z')
  assert.equal(manualRunKey(new Date('2026-07-25T12:00:00.000Z'), 'test'), 'manual:2026-07-25T12:00:00.000Z:test')
})
