import assert from 'node:assert/strict'
import test from 'node:test'
import {
  planSeedRowReconciliation,
  type GeneratedSeedRow,
} from './seed-row-reconciliation.ts'

function generated(
  key: string,
  cellData: Record<string, unknown>,
): GeneratedSeedRow {
  return {
    idempotency_key: key,
    group_name: 'About',
    weight: 1,
    sort_order: 100,
    cell_data: cellData,
  }
}

test('refreshes active managed seed rows from the generated snapshot', () => {
  const plan = planSeedRowReconciliation(
    [{ id: 'row-1', idempotency_key: 'seed:v1:general:location' }],
    [generated('seed:v1:general:location', { rossall: { value: 'Fleetwood' } })],
  )

  assert.equal(plan.updates.length, 1)
  assert.deepEqual(plan.updates[0]?.values.cell_data, {
    rossall: { value: 'Fleetwood' },
  })
  assert.deepEqual(plan.hideIds, [])
})

test('hides deprecated and newly empty rows without touching absent deleted rows', () => {
  const plan = planSeedRowReconciliation(
    [
      { id: 'school-view', idempotency_key: 'seed:v1:general:school_view' },
      { id: 'empty', idempotency_key: 'seed:v1:general:class_size' },
    ],
    [generated('seed:v1:general:class_size', {})],
  )

  assert.deepEqual(plan.hideIds, ['school-view', 'empty'])
  assert.deepEqual(plan.updates, [])
})

test('does not alter unknown seed versions', () => {
  const plan = planSeedRowReconciliation(
    [{ id: 'future', idempotency_key: 'seed:v2:general:location' }],
    [generated('seed:v1:general:location', { rossall: { value: 'Fleetwood' } })],
  )

  assert.deepEqual(plan, { updates: [], hideIds: [] })
})

test('does not write an unchanged managed row again', () => {
  const row = generated('seed:v1:general:location', {
    rossall: { value: 'Fleetwood' },
  })
  const plan = planSeedRowReconciliation(
    [{
      id: 'row-1',
      idempotency_key: row.idempotency_key,
      group_name: row.group_name,
      weight: row.weight,
      sort_order: row.sort_order,
      cell_data: row.cell_data,
    }],
    [row],
  )

  assert.deepEqual(plan, { updates: [], hideIds: [] })
})
