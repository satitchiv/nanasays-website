import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPostConfirmTopicLensFill } from './topic-lens-post-confirm-fill.ts'

const BASE_PROJ = {
  competitive_tier: 'national-strong',
  dmt_ranking: { current_rank: 17 },
  socs: { performance: [{ rank: 59, total: 305 }] },
  notable_alumni: [
    { name: 'Player A', known_for: 'England U20' },
    { name: 'Player B', known_for: 'Premiership' },
  ],
  evidence_urls: ['https://example.com/rugby'],
}

type CellData = Record<string, { value: string | number | null; source?: string; note?: string }>
type Row = { id: string; row_name: string; cell_data: any }

interface MockState {
  rows: Row[]
  projectionsBySlug: Record<string, any>
  // Override what re-reads return for an id (latest-cell recheck simulation).
  rereadCellDataById?: Record<string, any>
  // If set, force the update on this id to fail.
  failUpdateOnId?: string
  // If set, force the re-read of this id to return null (vanished row case).
  vanishOnRereadId?: string
  // Captured updates: row_id → final cell_data written.
  updates: Array<{ id: string; cell_data: any }>
  // Capture the .eq filters per query so we can inspect.
  lastReadEqByTable: Record<string, Record<string, string>>
  // Codex r3: which client name received which table calls (for routing test).
  callsByClient?: Record<string, string[]>
}

function makeMockSupabase(state: MockState, clientName: string = 'shared') {
  return {
    from(table: string) {
      if (state.callsByClient) {
        if (!state.callsByClient[clientName]) state.callsByClient[clientName] = []
        state.callsByClient[clientName].push(table)
      }
      const filters: Record<string, string> = {}
      let isUpdate = false
      let updatePayload: any = null
      const chain: any = {
        select(_c: string) { return chain },
        update(payload: any) { isUpdate = true; updatePayload = payload; return chain },
        eq(col: string, val: any) {
          filters[col] = String(val)
          return chain
        },
        is(_c: string, _v: any) { return chain },
        order(_c: string, _o: any) { return chain },
        limit(_n: number) { return chain },
        async maybeSingle() {
          state.lastReadEqByTable[table] = { ...filters }

          if (table === 'comparison_rows' && filters.id) {
            if (state.vanishOnRereadId === filters.id) return { data: null, error: null }
            const overridden = state.rereadCellDataById?.[filters.id]
            if (overridden !== undefined) {
              return { data: { cell_data: overridden }, error: null }
            }
            const row = state.rows.find((r) => r.id === filters.id)
            if (!row) return { data: null, error: null }
            return { data: { cell_data: row.cell_data }, error: null }
          }

          if (table === 'school_fact_projections') {
            const proj = state.projectionsBySlug[filters.school_slug]
            if (!proj) return { data: null, error: null }
            return {
              data: {
                id: 'a', dimension: 'rugby',
                projection_version: 'rugby-projector@1.1.0',
                quality: { projection: proj },
                projected_at: '2026-05-08T12:00:00Z',
              },
              error: null,
            }
          }
          return { data: null, error: null }
        },
        // For non-maybeSingle SELECTs / UPDATEs the caller awaits the
        // chain directly. then() is what the runtime resolves.
        then(onResolve: any) {
          if (isUpdate) {
            if (state.failUpdateOnId === filters.id) {
              return Promise.resolve({ data: null, error: { message: 'simulated update failure' } }).then(onResolve)
            }
            state.updates.push({ id: filters.id, cell_data: updatePayload.cell_data })
            return Promise.resolve({ data: null, error: null }).then(onResolve)
          }
          if (table === 'comparison_rows') {
            const matching = state.rows.filter((r) => true)  // we only filter by created_by_lens_id+undone_at; treat all rows as the lens's rows for the test
            return Promise.resolve({ data: matching, error: null }).then(onResolve)
          }
          return Promise.resolve({ data: null, error: null }).then(onResolve)
        },
      }
      return chain
    },
  } as any
}

function makeState(over: Partial<MockState> = {}): MockState {
  return {
    rows: [],
    projectionsBySlug: {},
    updates: [],
    lastReadEqByTable: {},
    ...over,
  }
}

const FLAG = 'NANA_TOPIC_LENS_FACTS'

test('returns null when flag is off', async () => {
  delete process.env[FLAG]
  const supabase = makeMockSupabase(makeState())
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Rugby', ['oakham-school'])
  assert.equal(tel, null)
})

test('returns null when topic name has no dimension mapping', async () => {
  process.env[FLAG] = 'on'
  const supabase = makeMockSupabase(makeState())
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Music', ['oakham-school'])
  assert.equal(tel, null)
  delete process.env[FLAG]
})

test('returns null on empty shortlist', async () => {
  process.env[FLAG] = 'on'
  const supabase = makeMockSupabase(makeState())
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Rugby', [])
  assert.equal(tel, null)
  delete process.env[FLAG]
})

test('lens with no topic rows returns telemetry zeros', async () => {
  process.env[FLAG] = 'on'
  const supabase = makeMockSupabase(makeState({ rows: [] }))
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Rugby', ['oakham-school'])
  assert.notEqual(tel, null)
  assert.equal(tel!.rows_examined, 0)
  assert.equal(tel!.cells_filled, 0)
  delete process.env[FLAG]
})

test('happy path: fills missing slugs from projections', async () => {
  process.env[FLAG] = 'on'
  const state = makeState({
    rows: [
      {
        id: 'r1', row_name: 'Rugby tier',
        cell_data: {
          'wellington-college': { value: 'National-elite' },  // already real
          'oakham-school': { value: null },                    // null → should fill
          // sherborne-school missing entirely → should NOT fill (only existing keys with null are "missing")
          //   wait — design says missing key counts too; let me match the implementation
        } satisfies CellData,
      },
    ],
    projectionsBySlug: {
      'oakham-school': BASE_PROJ,
      'sherborne-school': BASE_PROJ,
    },
  })
  const supabase = makeMockSupabase(state)
  const tel = await applyPostConfirmTopicLensFill(
    supabase, supabase, 'user-1', 'lens-1', 'Rugby',
    ['wellington-college', 'oakham-school', 'sherborne-school'],
  )
  assert.notEqual(tel, null)
  assert.equal(tel!.rows_examined, 1)
  // wellington has a real value → not counted in cells_missing
  // oakham has value:null → missing+filled
  // sherborne has no entry → also missing+filled
  assert.equal(tel!.cells_missing, 2)
  assert.equal(tel!.cells_filled, 2)
  assert.equal(tel!.cells_unfilled, 0)
  assert.equal(tel!.rows_updated, 1)
  // Verify the merge preserved Wellington's real value.
  assert.deepEqual(state.updates.length, 1)
  const written = state.updates[0].cell_data
  assert.equal(written['wellington-college'].value, 'National-elite')
  assert.equal(written['oakham-school'].value, 'National-strong')
  assert.equal(written['sherborne-school'].value, 'National-strong')
  delete process.env[FLAG]
})

test('preserves slugs with real non-null values (not in cells_missing)', async () => {
  process.env[FLAG] = 'on'
  const state = makeState({
    rows: [
      {
        id: 'r1', row_name: 'Rugby tier',
        cell_data: {
          'wellington-college': { value: 'National-elite' },
          'oakham-school': { value: 'National-strong' },
        } satisfies CellData,
      },
    ],
    projectionsBySlug: { 'oakham-school': BASE_PROJ },
  })
  const supabase = makeMockSupabase(state)
  const tel = await applyPostConfirmTopicLensFill(
    supabase, supabase, 'user-1', 'lens-1', 'Rugby', ['wellington-college', 'oakham-school'],
  )
  assert.equal(tel!.cells_missing, 0)
  assert.equal(tel!.cells_filled, 0)
  assert.equal(tel!.rows_updated, 0)
  assert.equal(state.updates.length, 0)
  delete process.env[FLAG]
})

test('cells_unfilled increments when no projection pack for slug', async () => {
  process.env[FLAG] = 'on'
  const state = makeState({
    rows: [{ id: 'r1', row_name: 'Rugby tier', cell_data: { 'oakham-school': { value: null } } }],
    projectionsBySlug: {},  // no pack
  })
  const supabase = makeMockSupabase(state)
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Rugby', ['oakham-school'])
  assert.equal(tel!.cells_missing, 1)
  assert.equal(tel!.cells_filled, 0)
  assert.equal(tel!.cells_unfilled, 1)
  assert.equal(tel!.rows_updated, 0)
  delete process.env[FLAG]
})

test('cells_unfilled increments when row_name has no formatter rule', async () => {
  process.env[FLAG] = 'on'
  const state = makeState({
    rows: [{ id: 'r1', row_name: 'Pizza topping preference', cell_data: { 'oakham-school': { value: null } } }],
    projectionsBySlug: { 'oakham-school': BASE_PROJ },
  })
  const supabase = makeMockSupabase(state)
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Rugby', ['oakham-school'])
  assert.equal(tel!.cells_missing, 1)
  assert.equal(tel!.cells_filled, 0)
  assert.equal(tel!.cells_unfilled, 1)
  delete process.env[FLAG]
})

test('latest-cell recheck preserves a value written between plan and update', async () => {
  process.env[FLAG] = 'on'
  const state = makeState({
    rows: [{ id: 'r1', row_name: 'Rugby tier', cell_data: { 'oakham-school': { value: null } } }],
    projectionsBySlug: { 'oakham-school': BASE_PROJ },
    // Concurrent confirm wrote a real value before our update lands.
    rereadCellDataById: { r1: { 'oakham-school': { value: 'Concurrent Real Value' } } },
  })
  const supabase = makeMockSupabase(state)
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Rugby', ['oakham-school'])
  assert.equal(tel!.cells_missing, 1)
  assert.equal(tel!.cells_preserved, 1)
  assert.equal(tel!.cells_filled, 0)  // bookkeeping rolled back
  assert.equal(tel!.rows_updated, 0)
  assert.equal(state.updates.length, 0)
  delete process.env[FLAG]
})

test('16 KB cap skips oversized rows', async () => {
  process.env[FLAG] = 'on'
  // Build huge existing cell_data so any merge pushes it over 16 KB.
  const huge: CellData = {}
  for (let i = 0; i < 200; i++) {
    huge[`big-school-${i}`] = { value: 'x'.repeat(70), source: 'https://example.com/' + 'p'.repeat(60) }
  }
  huge['oakham-school'] = { value: null }
  const state = makeState({
    rows: [{ id: 'r1', row_name: 'Rugby tier', cell_data: huge }],
    projectionsBySlug: { 'oakham-school': BASE_PROJ },
  })
  const supabase = makeMockSupabase(state)
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Rugby', ['oakham-school'])
  assert.equal(tel!.cells_missing, 1)
  assert.equal(tel!.rows_oversized_skipped, 1)
  assert.equal(tel!.cells_filled, 0)  // rolled back
  assert.equal(tel!.cells_unfilled, 1)  // accounted as unfilled
  assert.equal(state.updates.length, 0)
  delete process.env[FLAG]
})

test('malformed cell_data (non-object) treated as empty object', async () => {
  process.env[FLAG] = 'on'
  const state = makeState({
    rows: [{ id: 'r1', row_name: 'Rugby tier', cell_data: 'not an object' as any }],
    projectionsBySlug: { 'oakham-school': BASE_PROJ },
  })
  const supabase = makeMockSupabase(state)
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Rugby', ['oakham-school'])
  // Treated as empty → all shortlist slugs are missing.
  assert.equal(tel!.cells_missing, 1)
  assert.equal(tel!.cells_filled, 1)
  delete process.env[FLAG]
})

test('duplicate shortlist slugs deduped', async () => {
  process.env[FLAG] = 'on'
  const state = makeState({
    rows: [{ id: 'r1', row_name: 'Rugby tier', cell_data: { 'oakham-school': { value: null } } }],
    projectionsBySlug: { 'oakham-school': BASE_PROJ },
  })
  const supabase = makeMockSupabase(state)
  const tel = await applyPostConfirmTopicLensFill(
    supabase, supabase, 'user-1', 'lens-1', 'Rugby',
    ['oakham-school', 'oakham-school', 'oakham-school'],  // 3× same
  )
  assert.equal(tel!.cells_missing, 1)  // counted once
  assert.equal(tel!.cells_filled, 1)
  delete process.env[FLAG]
})

test('update error increments rows_update_failed and rolls back cells_filled', async () => {
  process.env[FLAG] = 'on'
  const state = makeState({
    rows: [{ id: 'r1', row_name: 'Rugby tier', cell_data: { 'oakham-school': { value: null } } }],
    projectionsBySlug: { 'oakham-school': BASE_PROJ },
    failUpdateOnId: 'r1',
  })
  const supabase = makeMockSupabase(state)
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Rugby', ['oakham-school'])
  assert.equal(tel!.cells_missing, 1)
  assert.equal(tel!.rows_update_failed, 1)
  assert.equal(tel!.cells_filled, 0)
  assert.equal(tel!.cells_unfilled, 1)
  delete process.env[FLAG]
})

test('re-read returns null rolls back cells_filled', async () => {
  process.env[FLAG] = 'on'
  const state = makeState({
    rows: [{ id: 'r1', row_name: 'Rugby tier', cell_data: { 'oakham-school': { value: null } } }],
    projectionsBySlug: { 'oakham-school': BASE_PROJ },
    vanishOnRereadId: 'r1',
  })
  const supabase = makeMockSupabase(state)
  const tel = await applyPostConfirmTopicLensFill(supabase, supabase, 'user-1', 'lens-1', 'Rugby', ['oakham-school'])
  assert.equal(tel!.rows_update_failed, 1)
  assert.equal(tel!.rows_updated, 0)
  // Codex r2 Q7: planning incremented cells_filled, re-read failure must roll back.
  assert.equal(tel!.cells_filled, 0)
  assert.equal(tel!.cells_unfilled, 1)
  delete process.env[FLAG]
})

// Codex r3: assert table-to-client routing — comparison_rows must go through
// the user-bound client, school_fact_projections through the service client.
// This is the exact gap that bit us live (RLS on projections silently
// returned schools_with_pack=0 when the user client tried to read).
test('routes comparison_rows to supabaseUser and school_fact_projections to supabaseService', async () => {
  process.env[FLAG] = 'on'
  const sharedState = makeState({
    rows: [{ id: 'r1', row_name: 'Rugby tier', cell_data: { 'oakham-school': { value: null } } }],
    projectionsBySlug: { 'oakham-school': BASE_PROJ },
    callsByClient: {},
  })
  const supabaseUser = makeMockSupabase(sharedState, 'user')
  const supabaseService = makeMockSupabase(sharedState, 'service')
  const tel = await applyPostConfirmTopicLensFill(
    supabaseUser, supabaseService, 'user-1', 'lens-1', 'Rugby', ['oakham-school'],
  )
  assert.notEqual(tel, null)
  const userCalls = sharedState.callsByClient!.user ?? []
  const serviceCalls = sharedState.callsByClient!.service ?? []
  // User client must touch comparison_rows (read + recheck + update).
  assert.ok(userCalls.includes('comparison_rows'),
    `expected user client to call comparison_rows; got: ${userCalls.join(',')}`)
  // User client must NOT touch school_fact_projections — that's the RLS-locked one.
  assert.ok(!userCalls.includes('school_fact_projections'),
    `user client must NOT call school_fact_projections; got: ${userCalls.join(',')}`)
  // Service client must touch school_fact_projections at least once per shortlist slug.
  assert.ok(serviceCalls.includes('school_fact_projections'),
    `expected service client to call school_fact_projections; got: ${serviceCalls.join(',')}`)
  // Service client must NOT touch comparison_rows — that's the user-RLS table.
  assert.ok(!serviceCalls.includes('comparison_rows'),
    `service client must NOT call comparison_rows; got: ${serviceCalls.join(',')}`)
  delete process.env[FLAG]
})
