import assert from 'node:assert/strict'
import test from 'node:test'
import { demandTopicId, planTopicDemandPromotions } from './topic-demand-creator.ts'

const request = (id: string, userId: string, label: string) => ({
  id,
  request_key: id,
  user_id: userId,
  topic_label: label,
  normalized_topic: label.toLowerCase().replace(/\s+/g, ' ').trim(),
  requested_at: '2026-07-25T00:00:00.000Z',
  status: 'open' as const,
  promoted_topic_id: null,
})

test('promotes repeated parent demand only after conservative thresholds', () => {
  const plan = planTopicDemandPromotions({
    requests: [
      request('1', 'parent-a', 'Most professional football players'),
      request('2', 'parent-b', 'Most professional football players'),
      request('3', 'parent-a', 'Most professional football players'),
    ],
    existingCatalog: [],
    coverageByTopic: new Map([['most professional football players', {
      verified_school_count: 12,
      verified_coverage_percent: 7.5,
    }]]),
  })
  assert.deepEqual(plan.promotions, [{
    id: demandTopicId('most professional football players'),
    label: 'Most professional football players',
    normalized_topic: 'most professional football players',
    demand_count: 3,
    unique_parent_count: 2,
    verified_school_count: 12,
    verified_coverage_percent: 7.5,
  }])
  assert.deepEqual(plan.requestsToPromote, ['1', '2', '3'])
})

test('does not promote a one-off request and is idempotent for approved topics', () => {
  const oneOff = planTopicDemandPromotions({
    requests: [request('1', 'parent-a', 'Saturday transport')],
    existingCatalog: [],
    coverageByTopic: new Map(),
  })
  assert.equal(oneOff.promotions.length, 0)
  assert.equal(oneOff.requestsBelowThreshold, 1)

  const existing = planTopicDemandPromotions({
    requests: [
      request('1', 'parent-a', 'Most professional football players'),
      request('2', 'parent-b', 'Most professional football players'),
      request('3', 'parent-a', 'Most professional football players'),
    ],
    existingCatalog: [{
      id: demandTopicId('most professional football players'),
      label: 'Most professional football players',
      normalized_topic: 'most professional football players',
      demand_count: 3,
      unique_parent_count: 2,
      verified_school_count: 12,
      verified_coverage_percent: 7.5,
      status: 'approved',
    }],
    coverageByTopic: new Map([['most professional football players', {
      verified_school_count: 12,
      verified_coverage_percent: 7.5,
    }]]),
  })
  assert.equal(existing.promotions.length, 0)
  assert.equal(existing.requestsAlreadyPromoted, 3)
})

test('does not promote repeated demand without verified database coverage', () => {
  const plan = planTopicDemandPromotions({
    requests: [
      request('1', 'parent-a', 'Special transport options'),
      request('2', 'parent-b', 'Special transport options'),
      request('3', 'parent-a', 'Special transport options'),
    ],
    existingCatalog: [],
    coverageByTopic: new Map([['special transport options', {
      verified_school_count: 2,
      verified_coverage_percent: 1.2,
    }]]),
  })
  assert.equal(plan.promotions.length, 0)
  assert.equal(plan.candidatesWithoutVerifiedCoverage, 3)
})
