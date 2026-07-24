import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findSupportedComparisonSuggestions,
  matchComparisonRequest,
  SUPPORTED_COMPARISON_LABELS,
} from './comparison-catalog.ts'

test('maps ordinary parent wording to a supported comparison', () => {
  assert.deepEqual(matchComparisonRequest('How far is the nearest airport?'), {
    kind: 'supported',
    id: 'airport_distance',
    label: 'Airport distance',
  })
  assert.deepEqual(matchComparisonRequest('financial aid'), {
    kind: 'supported',
    id: 'bursaries',
    label: 'Bursaries',
  })
  assert.deepEqual(matchComparisonRequest('How big is the school?'), {
    kind: 'supported',
    id: 'total_pupils',
    label: 'Total pupils',
  })
  assert.deepEqual(matchComparisonRequest('GCSE academic results'), {
    kind: 'supported',
    id: 'gcse_results',
    label: 'GCSE results',
  })
})

test('groups known unsupported wording into a future research topic', () => {
  assert.deepEqual(matchComparisonRequest('music accomplishments'), {
    kind: 'research_request',
    canonicalTopic: 'Music opportunities and achievements',
  })
  assert.deepEqual(matchComparisonRequest('music awards'), {
    kind: 'research_request',
    canonicalTopic: 'Music opportunities and achievements',
  })
  assert.deepEqual(matchComparisonRequest('support for dyslexia'), {
    kind: 'research_request',
    canonicalTopic: 'Learning support',
  })
})

test('does not misclassify a subject-specific cost request as annual fees', () => {
  assert.deepEqual(matchComparisonRequest('music lesson fees'), {
    kind: 'research_request',
    canonicalTopic: 'Music opportunities and achievements',
  })
})

test('keeps unknown questions as a clean research topic', () => {
  assert.deepEqual(matchComparisonRequest('  Distance from grandmother’s house  '), {
    kind: 'research_request',
    canonicalTopic: 'Distance from grandmother’s house',
  })
})

test('publishes a concise supported catalogue for the interface', () => {
  assert.deepEqual(SUPPORTED_COMPARISON_LABELS, [
    'Airport distance',
    'Annual fees',
    'Bursaries',
    'A-level results',
    'GCSE results',
    'Total pupils',
    'School location',
    'School type',
  ])
})

test('filters Google-style suggestions using parent wording', () => {
  assert.deepEqual(
    findSupportedComparisonSuggestions('nearest').map(item => item.label),
    ['Airport distance'],
  )
  assert.deepEqual(
    findSupportedComparisonSuggestions('financial help').map(item => item.label),
    ['Bursaries'],
  )
  assert.deepEqual(
    findSupportedComparisonSuggestions('', ['Airport distance', 'Annual fees'])
      .map(item => item.label),
    ['Airport distance', 'Annual fees'],
  )
})
