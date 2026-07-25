import assert from 'node:assert/strict'
import test from 'node:test'
import { buildComparisonTopicBatchReport } from './comparison-topic-batch.ts'

test('summarises ready and missing UK comparison cells without accepting web evidence', () => {
  const report = buildComparisonTopicBatchReport({
    schools: [
      { slug: 'alpha-school', name: 'Alpha School' },
      { slug: 'beta-school', name: 'Beta School' },
    ],
    topics: [
      { id: 'fees', label: 'Annual fees' },
      { id: 'football', label: 'Football strength' },
    ],
    requestedCountByTopic: new Map([['football strength', 3]]),
    resolveCell(topic, school) {
      if (topic.id === 'fees') {
        return { value: '£30,000', source: 'school_structured_data.fees' }
      }
      if (school.slug === 'alpha-school') {
        return {
          value: 'County competition',
          evidence_kind: 'nana_database',
          source: 'sports_profile.football',
        }
      }
      return null
    },
  })

  assert.equal(report.schools_evaluated, 2)
  assert.equal(report.topics_evaluated, 2)
  assert.equal(report.cells_evaluated, 4)
  assert.equal(report.ready_cells, 3)
  assert.equal(report.missing_cells, 1)
  assert.equal(report.complete_topics, 1)
  assert.equal(report.partial_topics, 1)
  assert.equal(report.empty_topics, 0)
  assert.equal(report.issues.length, 0)
  assert.deepEqual(report.topics[1], {
    id: 'football',
    label: 'Football strength',
    ready_schools: 1,
    missing_schools: 1,
    coverage_percent: 50,
    requested_count: 3,
    missing_school_slugs: ['beta-school'],
  })
})

test('records resolver failures and rejects web-search cells in a database-only run', () => {
  const report = buildComparisonTopicBatchReport({
    schools: [
      { slug: 'alpha-school', name: 'Alpha School' },
      { slug: 'beta-school', name: 'Beta School' },
    ],
    topics: [{ id: 'topic', label: 'Topic' }],
    resolveCell(_topic, school) {
      if (school.slug === 'alpha-school') throw new Error('bad source shape')
      return {
        value: 'Unverified result',
        evidence_kind: 'web_search',
        source: 'https://example.com',
      }
    },
  })

  assert.equal(report.ready_cells, 0)
  assert.equal(report.missing_cells, 2)
  assert.equal(report.empty_topics, 1)
  assert.deepEqual(report.issues.map(issue => issue.reason), [
    'bad source shape',
    'UK database batch returned web-search evidence',
  ])
})
