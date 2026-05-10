import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTopicLensProjectorFill } from './topic-lens-projector-fill.ts'

const BASE_PROJ = {
  competitive_tier: 'national-strong',
  dmt_ranking: { current_rank: 17 },
  socs: { performance: [{ rank: 59, total: 305 }] },
  evidence_urls: ['https://example.com/rugby'],
}

function makeMockSupabase(projectionsBySlug: Record<string, any>) {
  return {
    from(_table: string) {
      let filters: Record<string, string> = {}
      const chain: any = {
        select(_c: string) { return chain },
        eq(col: string, val: string) {
          filters[col] = val
          return chain
        },
        order(_c: string, _o: any) { return chain },
        limit(_n: number) { return chain },
        async maybeSingle() {
          const slug = filters.school_slug
          const proj = projectionsBySlug[slug]
          if (!proj) return { data: null, error: null }
          return {
            data: {
              id: 'a',
              dimension: 'rugby',
              projection_version: 'rugby-projector@1.1.0',
              quality: { projection: proj },
              projected_at: '2026-05-08T12:00:00Z',
            },
            error: null,
          }
        },
      }
      return chain
    },
  } as any
}

function makeProposal() {
  return {
    rugby_lens: {
      kind: 'propose_create_topic_lens',
      topic_name: 'Rugby',
      lens_name: 'Rugby',
      base_lens_kind: 'general',
      embedded_rows: [
        {
          row_name: 'Rugby tier',
          group_name: 'Rugby',
          weight: 1,
          cell_data: {
            'wellington-college': { value: 'National-elite' },     // existing LLM cell
            'oakham-school': { value: null },                      // missing → fill
            'sherborne-school': { value: null },                   // no projection → stays null
          },
        },
        {
          row_name: 'DMT rank',
          group_name: 'Rugby',
          weight: 1,
          cell_data: {
            'wellington-college': { value: '4' },
            'oakham-school': { value: null },
            'sherborne-school': { value: null },
          },
        },
        {
          row_name: 'Some random row',  // unmatched by formatter rules
          group_name: 'Rugby',
          weight: 1,
          cell_data: {
            'wellington-college': { value: 'something' },
            'oakham-school': { value: null },
          },
        },
      ],
    },
  }
}

test('flag-off: returns null and mutates nothing', async () => {
  const prevFlag = process.env.NANA_TOPIC_LENS_FACTS
  process.env.NANA_TOPIC_LENS_FACTS = 'off'
  try {
    const supabase = makeMockSupabase({ 'oakham-school': BASE_PROJ })
    const actions = makeProposal()
    const tel = await applyTopicLensProjectorFill(supabase, actions, ['wellington-college', 'oakham-school', 'sherborne-school'])
    assert.equal(tel, null)
    assert.equal(actions.rugby_lens.embedded_rows[0].cell_data['oakham-school'].value, null, 'still null with flag off')
  } finally {
    if (prevFlag === undefined) delete process.env.NANA_TOPIC_LENS_FACTS
    else process.env.NANA_TOPIC_LENS_FACTS = prevFlag
  }
})

test('flag-on: fills null cells from projection, leaves existing values alone', async () => {
  const prevFlag = process.env.NANA_TOPIC_LENS_FACTS
  process.env.NANA_TOPIC_LENS_FACTS = 'on'
  try {
    const supabase = makeMockSupabase({ 'oakham-school': BASE_PROJ })
    const actions = makeProposal()
    const tel = await applyTopicLensProjectorFill(supabase, actions, ['wellington-college', 'oakham-school', 'sherborne-school'])
    assert.notEqual(tel, null)

    // Row 1: tier
    const row1 = actions.rugby_lens.embedded_rows[0].cell_data
    assert.equal(row1['wellington-college'].value, 'National-elite', 'existing LLM value preserved')
    assert.equal(row1['oakham-school'].value, 'National-strong', 'oakham filled from projection')
    assert.equal(row1['oakham-school'].source, 'https://example.com/rugby', 'source attached from evidence_urls')
    assert.equal(row1['sherborne-school'].value, null, 'sherborne has no projection → stays null')

    // Row 2: DMT rank
    const row2 = actions.rugby_lens.embedded_rows[1].cell_data
    assert.equal(row2['wellington-college'].value, '4', 'existing LLM value preserved')
    assert.equal(row2['oakham-school'].value, '17', 'oakham DMT filled from projection')

    // Row 3: unmatched row_name → no fill
    const row3 = actions.rugby_lens.embedded_rows[2].cell_data
    assert.equal(row3['oakham-school'].value, null, 'unmatched row_name → cell stays null')

    // Telemetry
    assert.equal(tel?.filled, 2, 'filled 2 cells (tier + DMT for oakham)')
    assert.equal(tel?.matched, 2)
    assert.ok(tel != null && tel.no_match >= 1, 'at least 1 no_match for the random row')
    assert.equal(tel?.schools_with_pack, 1, 'oakham has pack')
    assert.equal(tel?.schools_without_pack, 2, 'wellington and sherborne have no pack in stub')
  } finally {
    if (prevFlag === undefined) delete process.env.NANA_TOPIC_LENS_FACTS
    else process.env.NANA_TOPIC_LENS_FACTS = prevFlag
  }
})

test('non-rugby topic_name → returns null (unsupported dimension)', async () => {
  const prevFlag = process.env.NANA_TOPIC_LENS_FACTS
  process.env.NANA_TOPIC_LENS_FACTS = 'on'
  try {
    const supabase = makeMockSupabase({})
    const actions = {
      music_lens: {
        kind: 'propose_create_topic_lens',
        topic_name: 'Music',
        lens_name: 'Music',
        base_lens_kind: 'general',
        embedded_rows: [
          { row_name: 'Music programme', group_name: 'Music', cell_data: { 'a': { value: null } } },
        ],
      },
    }
    const tel = await applyTopicLensProjectorFill(supabase, actions, ['a'])
    // tel may be the empty default since topicProposals.length > 0 but topicToDimension returned null;
    // accept either null or zero-filled telemetry.
    if (tel) {
      assert.equal(tel.filled, 0)
    }
    assert.equal(actions.music_lens.embedded_rows[0].cell_data['a'].value, null, 'non-rugby cell unchanged')
  } finally {
    if (prevFlag === undefined) delete process.env.NANA_TOPIC_LENS_FACTS
    else process.env.NANA_TOPIC_LENS_FACTS = prevFlag
  }
})

test('null actions: safe no-op', async () => {
  const prevFlag = process.env.NANA_TOPIC_LENS_FACTS
  process.env.NANA_TOPIC_LENS_FACTS = 'on'
  try {
    const supabase = makeMockSupabase({})
    const tel = await applyTopicLensProjectorFill(supabase, null, ['a'])
    assert.equal(tel, null)
  } finally {
    if (prevFlag === undefined) delete process.env.NANA_TOPIC_LENS_FACTS
    else process.env.NANA_TOPIC_LENS_FACTS = prevFlag
  }
})

test('actions with no propose_create_topic_lens: safe no-op', async () => {
  const prevFlag = process.env.NANA_TOPIC_LENS_FACTS
  process.env.NANA_TOPIC_LENS_FACTS = 'on'
  try {
    const supabase = makeMockSupabase({})
    const actions = {
      add_row: { kind: 'propose_add_row', row_name: 'CCF', cell_data: {} },
    }
    const tel = await applyTopicLensProjectorFill(supabase, actions, ['a'])
    assert.equal(tel, null)
  } finally {
    if (prevFlag === undefined) delete process.env.NANA_TOPIC_LENS_FACTS
    else process.env.NANA_TOPIC_LENS_FACTS = prevFlag
  }
})
