import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadDimensionEvidencePack, KNOWN_PROJECTION_VERSIONS } from './dimension-evidence-pack.ts'

type CannedRow = {
  id: string
  dimension: string
  projection_version: string
  quality: Record<string, unknown> | null
  projected_at: string
}

// Records what filters got applied so tests can assert the version filter
// reaches the supabase query layer.
function makeStub(canned: { data: CannedRow | null; error: any | null }) {
  const filters: Record<string, string> = {}
  const chain = {
    select: (_cols: string) => chain,
    eq: (col: string, val: string) => {
      filters[col] = val
      return chain
    },
    order: (_col: string, _opts: any) => chain,
    limit: (_n: number) => chain,
    maybeSingle: async () => canned,
  }
  return {
    client: { from: (_table: string) => chain } as any,
    filters,
  }
}

test('returns null when dimension is not in KNOWN_PROJECTION_VERSIONS', async () => {
  const stub = makeStub({ data: null, error: null })
  const result = await loadDimensionEvidencePack(stub.client, 'epsom-college', 'medicine')
  assert.equal(result, null)
  // Should not have queried at all.
  assert.equal(Object.keys(stub.filters).length, 0)
})

test('returns null when no row matches at the trusted version', async () => {
  const stub = makeStub({ data: null, error: null })
  const result = await loadDimensionEvidencePack(stub.client, 'epsom-college', 'rugby')
  assert.equal(result, null)
  // Confirm the version filter was applied.
  assert.equal(stub.filters.projection_version, KNOWN_PROJECTION_VERSIONS.rugby)
  assert.equal(stub.filters.school_slug, 'epsom-college')
  assert.equal(stub.filters.dimension, 'rugby')
  assert.equal(stub.filters.status, 'success')
})

test('returns null when row exists but quality is null', async () => {
  const stub = makeStub({
    data: {
      id: 'a',
      dimension: 'rugby',
      projection_version: 'rugby-projector@1.1.0',
      quality: null,
      projected_at: '2026-05-08T12:00:00Z',
    },
    error: null,
  })
  const result = await loadDimensionEvidencePack(stub.client, 'epsom-college', 'rugby')
  assert.equal(result, null)
})

test('returns null when quality.projection is missing or empty', async () => {
  const stub1 = makeStub({
    data: {
      id: 'a',
      dimension: 'rugby',
      projection_version: 'rugby-projector@1.1.0',
      quality: {},
      projected_at: '2026-05-08T12:00:00Z',
    },
    error: null,
  })
  assert.equal(await loadDimensionEvidencePack(stub1.client, 'x', 'rugby'), null)

  const stub2 = makeStub({
    data: {
      id: 'a',
      dimension: 'rugby',
      projection_version: 'rugby-projector@1.1.0',
      quality: { projection: {} },
      projected_at: '2026-05-08T12:00:00Z',
    },
    error: null,
  })
  assert.equal(await loadDimensionEvidencePack(stub2.client, 'x', 'rugby'), null)
})

test('returns the projection when a v1.1.0 row exists', async () => {
  const stub = makeStub({
    data: {
      id: 'a',
      dimension: 'rugby',
      projection_version: 'rugby-projector@1.1.0',
      quality: {
        projection: { tier: 'national-elite', dmt_rank: 4, team_count: 22 },
        evidence_urls: ['https://example.com/rugby'],
      },
      projected_at: '2026-05-08T12:00:00Z',
    },
    error: null,
  })
  const result = await loadDimensionEvidencePack(stub.client, 'wellington-college', 'rugby')
  assert.notEqual(result, null)
  assert.equal(result!.slug, 'wellington-college')
  assert.equal(result!.dimension, 'rugby')
  assert.equal(result!.projection_version, 'rugby-projector@1.1.0')
  assert.deepEqual(result!.projection, { tier: 'national-elite', dmt_rank: 4, team_count: 22 })
  assert.deepEqual(result!.quality.evidence_urls, ['https://example.com/rugby'])
  assert.equal(result!.projected_at, '2026-05-08T12:00:00Z')
})

test('returns null on supabase error', async () => {
  const stub = makeStub({ data: null, error: { message: 'connection lost' } })
  const result = await loadDimensionEvidencePack(stub.client, 'x', 'rugby')
  assert.equal(result, null)
})
