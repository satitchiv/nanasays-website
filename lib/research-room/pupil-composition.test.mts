import assert from 'node:assert/strict'
import test from 'node:test'
import {
  approvedNotionBoardingEntry,
  approvedNotionFee,
  approvedNotionNumber,
  formatGbp,
  resolveNotionClassSize,
  resolvePupilComposition,
  type NotionBackfillRow,
} from './pupil-composition.ts'

const notion = (
  school_slug: string,
  parsed: Record<string, unknown>,
): NotionBackfillRow => ({ school_slug, status: 'clean', parsed })

test('uses coherent structured percentages before Notion', () => {
  const result = resolvePupilComposition({
    student_community: {
      total_pupils: 783,
      boarding_pct: 32,
      day_pct: 68,
      pct_international: 21,
      notes: 'Approximately two-thirds of 247 boarders are from overseas.',
    },
    school_life: {
      boarding_life: 'The school has 247 boarders (out of 783 pupils).',
    },
  }, notion('wells-cathedral-school', {
    total_pupils: 999,
    boarder_count: 700,
    boarding_ratio: 70,
  }))

  assert.equal(result.status, 'ready')
  assert.deepEqual(result.status === 'ready' ? result.composition : null, {
    total: 783,
    boarding: 247,
    day: 536,
    international: 164,
    boardingPct: 32,
    dayPct: 68,
    internationalPct: 21,
    source: 'school_structured_data',
  })
})

test('uses a coherent Notion record when structured composition is incomplete', () => {
  const result = resolvePupilComposition({
    student_community: { total_pupils: 1283 },
  }, notion('millfield-school', {
    total_pupils: 1312,
    boarder_count: 975,
    intl_count: 62,
    boarding_ratio: 74.31,
  }))

  assert.equal(result.status, 'ready')
  assert.deepEqual(result.status === 'ready' ? result.composition : null, {
    total: 1312,
    boarding: 975,
    day: 337,
    international: 62,
    boardingPct: 74,
    dayPct: 26,
    internationalPct: 5,
    source: 'school_notion_backfill',
  })
})

test('keeps Notion count rows coherent when a stored percentage is stale', () => {
  const result = resolvePupilComposition({
    student_community: { total_pupils: 920 },
  }, notion('rossall-school', {
    total_pupils: 710,
    boarder_count: 290,
    intl_count: 180,
    boarding_ratio: 38.17,
  }))

  assert.equal(result.status, 'ready')
  assert.deepEqual(result.reasons, [
    'Stored Notion boarding ratio differs from pupil counts; using count-derived ratio',
  ])
  assert.deepEqual(result.status === 'ready' ? result.composition : null, {
    total: 710,
    boarding: 290,
    day: 420,
    international: 180,
    boardingPct: 41,
    dayPct: 59,
    internationalPct: 25,
    source: 'school_notion_backfill',
  })
})

test('does not surface flagged or incomplete sidecar records', () => {
  assert.equal(resolvePupilComposition(null, {
    school_slug: 'review-school',
    status: 'partial_with_review',
    parsed: { total_pupils: 500, boarder_count: 300, boarding_ratio: 60 },
  }).status, 'insufficient')
})

test('formats clean Notion class-size buckets', () => {
  assert.deepEqual(resolveNotionClassSize(notion('rossall-school', {
    class_size: { senior: 15, sixth: 11 },
  })), {
    value: 'Senior 15 · Sixth 11',
    source: 'school_notion_backfill.parsed.class_size',
  })
  assert.deepEqual(resolveNotionClassSize(notion('range-school', {
    class_size: { average: { min: 12, max: 15 } },
  }))?.value, '~12–15 avg')
})

test('reads only approved scalar and ranged Notion values', () => {
  const clean = notion('fee-school', {
    total_pupils: 720,
    boarding_fee_term: { min: 18_000, max: 19_500 },
  })
  assert.equal(approvedNotionNumber(clean, 'total_pupils'), 720)
  assert.deepEqual(approvedNotionFee(clean, 'boarding_fee_term'), {
    min: 18_000,
    max: 19_500,
  })
  assert.equal(
    formatGbp(approvedNotionFee(clean, 'boarding_fee_term')!),
    '£18,000–£19,500',
  )
  assert.equal(approvedNotionNumber({ ...clean, status: 'partial_with_review' }, 'total_pupils'), null)
})

test('strictly normalizes lowest boarding entry from an approved Notion row', () => {
  assert.deepEqual(approvedNotionBoardingEntry({
    school_slug: 'rossall-school',
    status: 'clean',
    parsed: {},
    raw_properties: { 'Lowest Boarding Entry Year': 'Year 3' },
  }), {
    year: 3,
    source: 'school_notion_backfill.raw_properties.Lowest Boarding Entry Year',
  })
  assert.equal(approvedNotionBoardingEntry({
    school_slug: 'unsafe-school',
    status: 'partial_with_review',
    parsed: {},
    raw_properties: { 'Lowest Boarding Entry Year': 'Year 3' },
  }), null)
  assert.equal(approvedNotionBoardingEntry({
    school_slug: 'vague-school',
    status: 'clean',
    parsed: {},
    raw_properties: { 'Lowest Boarding Entry Year': 'Around Year 3' },
  }), null)
})
