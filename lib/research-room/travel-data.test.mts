import assert from 'node:assert/strict'
import test from 'node:test'
import {
  heathrowTravelFromAirports,
  heathrowTravelFromText,
  resolveHeathrowTravel,
} from './travel-data.ts'

test('reads Heathrow only and labels stored drive-time estimates honestly', () => {
  assert.deepEqual(heathrowTravelFromAirports([
    { name: 'Gatwick', drive_time_min_estimate: 58 },
    { name: 'Heathrow', drive_time_min_estimate: 109 },
  ]), {
    value: '~109 min',
    note: 'Estimated drive time',
  })
  assert.deepEqual(heathrowTravelFromAirports([
    { name: 'LHR', minutes: 75 },
  ]), {
    value: '75 min',
  })
})

test('extracts only the Heathrow segment from a mixed airport summary', () => {
  assert.equal(
    heathrowTravelFromText('28 minutes to Bristol Airport; 2 hours to London Heathrow'),
    '2 hours',
  )
  assert.equal(heathrowTravelFromText('45 mins to LHR'), '45 minutes')
  assert.equal(heathrowTravelFromText('37 minutes to Gatwick'), null)
})

test('prefers explicit Heathrow text over a computed drive-time estimate', () => {
  assert.deepEqual(resolveHeathrowTravel([
    { name: 'Heathrow', drive_time_min_estimate: 212 },
  ], '28 minutes to Bristol Airport; 2 hours to London Heathrow'), {
    value: '2 hours',
    source: 'schools.distance_airport',
  })
})
