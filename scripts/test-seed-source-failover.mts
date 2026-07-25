import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { seedResearchSession } from '../lib/research-room/seed-rows.ts'

let comparisonRowReads = 0
let rpcCalls = 0
const fakeSupabase = {
  from() {
    comparisonRowReads += 1
    throw new Error('active rows must not be reconciled from an incomplete source snapshot')
  },
  async rpc(name: string, args: Record<string, unknown>) {
    rpcCalls += 1
    assert.equal(name, 'seed_research_session_rows')
    assert.ok(Array.isArray(args.p_specs))
    return { data: { inserted_count: 0 }, error: null }
  },
} as unknown as SupabaseClient

const result = await seedResearchSession(
  fakeSupabase,
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  {
    slugs: ['test-school'],
    schoolMap: new Map([[
      'test-school',
      {
        slug: 'test-school',
        name: 'Test School',
        city: 'Test City',
        region: null,
        boarding: true,
        gender_split: 'Co-ed',
        distance_airport: null,
      },
    ]]),
    structMap: new Map(),
    notionMap: new Map(),
    notionAvailable: false,
  },
)

assert.deepEqual(result, { inserted: 0 })
assert.equal(comparisonRowReads, 0)
assert.equal(rpcCalls, 1)
console.log('Notion-mirror outage preserves active verified comparison rows')
