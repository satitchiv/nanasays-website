import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAnswerAgainstPack, buildAllowlist } from './citation-validator.ts'

const baselinePack: any = {
  parent: { user_id: 'u', region: null, budget_band: null, top_priority: null, boarding_pref: null, child_year: null },
  child: null,
  session: { id: 's', title: '', rolling_summary: null, turn_count: 0 },
  recent_messages: [],
  shortlist: ['eton-college', 'harrow-school'],
  comparison: {
    lens_id: null,
    lens_kind: 'general',
    lens_question: null,
    weights: {},
    visible_rows: [],
    rows: [
      {
        row_name: 'Fees',
        group_name: 'Costs',
        weight: 1,
        cells: {
          'eton-college': { value: '£50k', score: 80, sources: ['https://etoncollege.com/fees'] },
          'harrow-school': { value: '£48k', score: 85, sources: ['https://harrowschool.org.uk/fees'] },
        },
      },
    ],
  },
  intent: null,
  schools: {
    'eton-college': {
      slug: 'eton-college',
      meta: { name: 'Eton College', country: 'United Kingdom', boarding_type: 'full', gender_split: 'boys', fees_min_gbp: 50000, fees_max_gbp: 60000, is_uk: true },
      structured: null,
      source: 'structured',
      citations: [
        { url: 'https://etoncollege.com/about', school_slug: 'eton-college', table: 'school_structured_data', field: 'curriculum', row_id: null, dimension: null, confidence: 1 },
      ],
      missing_dims: [],
    },
    'harrow-school': {
      slug: 'harrow-school',
      meta: { name: 'Harrow School', country: 'United Kingdom', boarding_type: 'full', gender_split: 'boys', fees_min_gbp: 48000, fees_max_gbp: 60000, is_uk: true },
      structured: null,
      source: 'structured',
      citations: [],
      missing_dims: [],
    },
  },
  meta: {
    pack_version: '1.0.0',
    assembled_at: new Date().toISOString(),
    elapsed_ms: 0,
    bytes: 0,
    estimated_tokens: 0,
    flags: { mode: 'authenticated', share_justifications: false },
    overflow_actions: [],
  },
}

test('validateAnswerAgainstPack: clean answer with allowed URLs passes', () => {
  const answer = 'Eton charges £50k (https://etoncollege.com/fees), Harrow £48k (https://harrowschool.org.uk/fees).'
  const r = validateAnswerAgainstPack(answer, baselinePack)
  assert.equal(r.ok, true)
  assert.equal(r.hallucinated_urls.length, 0)
  assert.equal(r.out_of_scope_slugs.length, 0)
})

test('validateAnswerAgainstPack: hallucinated URL is flagged', () => {
  const answer = 'See more at https://made-up-source.example.com/fees'
  const r = validateAnswerAgainstPack(answer, baselinePack)
  assert.equal(r.ok, false)
  assert.equal(r.hallucinated_urls.length, 1)
  assert.ok(r.hallucinated_urls[0].includes('made-up-source.example.com'))
})

test('validateAnswerAgainstPack: out-of-scope slug citation is flagged', () => {
  const answer = 'You should look at westminster-school instead.'
  const r = validateAnswerAgainstPack(answer, baselinePack)
  assert.equal(r.ok, false)
  assert.deepEqual(r.out_of_scope_slugs, ['westminster-school'])
})

test('validateAnswerAgainstPack: empty pack rejects every URL as hallucinated', () => {
  const r = validateAnswerAgainstPack('see https://anything.example.com', null)
  assert.equal(r.ok, false)
  assert.equal(r.hallucinated_urls.length, 1)
})

test('validateAnswerAgainstPack: trailing punctuation and case differences canonicalise', () => {
  const answer = 'See HTTPS://EtonCollege.com/Fees, or https://etoncollege.com/fees/.'
  const r = validateAnswerAgainstPack(answer, baselinePack)
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('buildAllowlist: collects URLs from school citations + comparison cell sources', () => {
  const al = buildAllowlist(baselinePack)
  assert.ok(al.urls.has('https://etoncollege.com/about'))
  assert.ok(al.urls.has('https://etoncollege.com/fees'))
  assert.ok(al.urls.has('https://harrowschool.org.uk/fees'))
  assert.ok(al.slugs.has('eton-college'))
  assert.ok(al.slugs.has('harrow-school'))
})

test('validateAnswerAgainstPack: only kebab patterns containing school-words are flagged', () => {
  // 'long-running-task-name' is kebab but not school-shaped → must NOT trigger.
  const answer = "We don't recommend any other schools — see this background-check-process for context."
  const r = validateAnswerAgainstPack(answer, baselinePack)
  assert.equal(r.ok, true, `unexpected: ${JSON.stringify(r)}`)
})
