import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findComparisonCatalogueSuggestions,
  findSupportedComparisonSuggestions,
  isDatabaseOnlyComparison,
  matchComparisonRequest,
  RESEARCH_ONLY_COMPARISONS,
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
    'Boarding fees',
    'Registration fee',
    'Lowest boarding entry',
    'University destinations',
    'Football competitive level and results',
    'Football teams and playing opportunities',
    'Football coaching and elite pathway',
    'Sports opportunities',
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

test('ranks typo-tolerant matches across the complete catalogue', () => {
  assert.equal(findComparisonCatalogueSuggestions('nearset airprot')[0]?.label, 'Airport distance')
  assert.equal(findComparisonCatalogueSuggestions('boardng feees')[0]?.label, 'Boarding fees')
  assert.equal(findComparisonCatalogueSuggestions('musci')[0]?.label, 'Music opportunities and achievements')
  assert.deepEqual(matchComparisonRequest('boardng feees'), {
    kind: 'supported',
    id: 'boarding_fees',
    label: 'Boarding fees',
  })
  assert.deepEqual(matchComparisonRequest('learning suport'), {
    kind: 'research_request',
    canonicalTopic: 'Learning support',
  })
  assert.deepEqual(matchComparisonRequest('musci'), {
    kind: 'research_request',
    canonicalTopic: 'Music opportunities and achievements',
  })
})

test('maps varied football wording into three canonical database topics', () => {
  assert.deepEqual(matchComparisonRequest('football'), {
    kind: 'supported',
    id: 'football_strength',
    label: 'Football competitive level and results',
  })
  assert.deepEqual(matchComparisonRequest('football strength'), {
    kind: 'supported',
    id: 'football_strength',
    label: 'Football competitive level and results',
  })
  assert.deepEqual(matchComparisonRequest('achievements in soccer'), {
    kind: 'supported',
    id: 'football_strength',
    label: 'Football competitive level and results',
  })
  assert.deepEqual(matchComparisonRequest('football opportunity'), {
    kind: 'supported',
    id: 'football_opportunities',
    label: 'Football teams and playing opportunities',
  })
  assert.deepEqual(matchComparisonRequest('football scholarship'), {
    kind: 'supported',
    id: 'football_development',
    label: 'Football coaching and elite pathway',
  })
  assert.deepEqual(matchComparisonRequest('football pathway'), {
    kind: 'supported',
    id: 'football_development',
    label: 'Football coaching and elite pathway',
  })
  assert.equal(
    findComparisonCatalogueSuggestions('how good are the schools in football')[0]?.id,
    'football_strength',
  )
  assert.equal(
    findComparisonCatalogueSuggestions('achievements in soccer')[0]?.id,
    'football_strength',
  )
})

test('offers all three football topics for broad and misspelled searches', () => {
  assert.deepEqual(
    findComparisonCatalogueSuggestions('football').slice(0, 3).map(item => item.id),
    ['football_strength', 'football_opportunities', 'football_development'],
  )
  assert.deepEqual(
    findComparisonCatalogueSuggestions('fotoball').slice(0, 3).map(item => item.id),
    ['football_strength', 'football_opportunities', 'football_development'],
  )
  assert.equal(isDatabaseOnlyComparison('football_strength'), true)
  assert.equal(isDatabaseOnlyComparison('football_opportunities'), true)
  assert.equal(isDatabaseOnlyComparison('football_development'), true)
  assert.equal(isDatabaseOnlyComparison('sports_opportunities'), false)
})

test('keeps previously saved football row labels mapped to the clearer topics', () => {
  assert.equal(matchComparisonRequest('Football strength and achievements').kind, 'supported')
  assert.equal(
    matchComparisonRequest('Football opportunities and programme depth').kind,
    'supported',
  )
  assert.equal(
    matchComparisonRequest('Football coaching and player pathway').kind,
    'supported',
  )
  assert.deepEqual(matchComparisonRequest('Football coaching and player pathway'), {
    kind: 'supported',
    id: 'football_development',
    label: 'Football coaching and elite pathway',
  })
})

test('keeps research-only topics visible and requestable', () => {
  const suggestion = findComparisonCatalogueSuggestions('learning support')[0]
  assert.equal(suggestion?.kind, 'research_only')
  assert.ok(RESEARCH_ONLY_COMPARISONS.some(topic => topic.label === suggestion?.label))
  assert.deepEqual(matchComparisonRequest('Saturday school'), {
    kind: 'research_request',
    canonicalTopic: 'Saturday school',
  })
})
