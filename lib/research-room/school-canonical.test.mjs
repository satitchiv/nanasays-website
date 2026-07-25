// node --experimental-strip-types --test lib/research-room/school-canonical.test.mjs
//
// Pure-function tests for school-canonical.ts. The DB-touching
// canonicalizeSlug() is exercised in a separate integration smoke
// (browser flow + RPC) — these tests cover the in-process logic that
// drives Reed's / CLC / Wellington picking under richness.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normName,
  pickPrimary,
  groupByName,
  loadRichness,
  rankGroups,
  expandApostropheVariants,
  RichnessUnavailableError,
} from './school-canonical.ts'

// Minimal Supabase chain mock: returns whatever the caller scripted for
// each `from(table)` invocation. Each scripted entry shapes the
// `{data, error}` return of the terminal `.in(...)` call. The same
// scripted entry returns on every `.in()` call against the table —
// chunked callers will see it multiple times.
function makeMockSupabase(script) {
  return {
    from(table) {
      const entry = script[table]
      if (!entry) throw new Error(`mock: no script for table ${table}`)
      return {
        select: () => ({
          in: () => Promise.resolve(entry),
        }),
      }
    },
  }
}

// Chunk-aware mock: records the size of every .in() call per table so
// the chunking test can assert the actual batch boundaries instead of
// just trusting the end-state map size (Codex r6 P3 test-gap).
// Returns `{ svc, calls }` where calls[table] is an array of slug-count
// numbers in the order received.
function makeChunkRecordingMockSupabase(perSlugScript) {
  const calls = {}
  return {
    calls,
    svc: {
      from(table) {
        return {
          select: () => ({
            in: (_col, slugs) => {
              if (!calls[table]) calls[table] = []
              calls[table].push(slugs.length)
              const data = []
              for (const slug of slugs) {
                const row = perSlugScript[table]?.[slug]
                if (row !== undefined) data.push(row)
              }
              return Promise.resolve({ data, error: null })
            },
          }),
        }
      },
    },
  }
}

test('normName collapses case, whitespace, apostrophes, ampersands', () => {
  assert.equal(normName('Reed’s School'),    'reeds school')
  assert.equal(normName("Reed's School"),         'reeds school')
  assert.equal(normName('Reeds  School '),        'reeds school')
  assert.equal(normName('King Edward’s, Bath'), 'king edwards bath')
  assert.equal(normName('Sevenoaks & Tonbridge'),  'sevenoaks   tonbridge'.replace(/\s+/g, ' '))
})

test('pickPrimary — single entry returns itself', () => {
  const h = { slug: 'eton', name: 'Eton', region: null, country: 'United Kingdom' }
  assert.equal(pickPrimary([h], new Map()).slug, 'eton')
})

test('pickPrimary — richness dominates -uk slug (Reed\'s case: rich is on -uk)', () => {
  const a = { slug: 'reeds-school',    name: "Reed's School", region: 'Surrey', country: 'United Kingdom' }
  const b = { slug: 'reeds-school-uk', name: "Reed's School", region: null,     country: 'United Kingdom' }
  const richness = new Map([['reeds-school-uk', 6], ['reeds-school', 0]])
  assert.equal(pickPrimary([a, b], richness).slug, 'reeds-school-uk')
})

test('pickPrimary — richness dominates -uk slug (CLC case: rich is on bare slug)', () => {
  const a = { slug: 'cheltenham-ladies-college',    name: 'Cheltenham Ladies\' College', region: 'Gloucestershire', country: 'United Kingdom' }
  const b = { slug: 'cheltenham-ladies-college-uk', name: 'Cheltenham Ladies\' College', region: null,              country: 'United Kingdom' }
  const richness = new Map([['cheltenham-ladies-college', 7], ['cheltenham-ladies-college-uk', 0]])
  assert.equal(pickPrimary([a, b], richness).slug, 'cheltenham-ladies-college')
})

test('pickPrimary — country populated beats null when richness ties', () => {
  const a = { slug: 'foo-a', name: 'Foo School', region: null, country: null              }
  const b = { slug: 'foo-b', name: 'Foo School', region: null, country: 'United Kingdom'  }
  assert.equal(pickPrimary([a, b], new Map()).slug, 'foo-b')
})

test('pickPrimary — lexical slug is the final tiebreaker (deterministic)', () => {
  const a = { slug: 'zebra-school', name: 'Same Name', region: null, country: 'United Kingdom' }
  const b = { slug: 'apple-school', name: 'Same Name', region: null, country: 'United Kingdom' }
  // Both richness 0, both country populated → lexical wins → 'apple-school'
  assert.equal(pickPrimary([a, b], new Map()).slug, 'apple-school')
})

test('pickPrimary — no -uk heuristic: equal richness, equal country, lexical decides (not suffix)', () => {
  const a = { slug: 'foo-school',    name: 'Foo', region: null, country: 'United Kingdom' }
  const b = { slug: 'foo-school-uk', name: 'Foo', region: null, country: 'United Kingdom' }
  // foo-school < foo-school-uk lexically → primary is the bare slug
  assert.equal(pickPrimary([a, b], new Map()).slug, 'foo-school')
})

test('groupByName — single-record groups have no alternates', () => {
  const hits = [
    { slug: 'eton',  name: 'Eton College',  region: 'Berkshire', country: 'United Kingdom' },
    { slug: 'harrow', name: 'Harrow School', region: 'London',    country: 'United Kingdom' },
  ]
  const out = groupByName(hits, new Map())
  assert.equal(out.length, 2)
  assert.equal(out[0].alternates.length, 0)
  assert.equal(out[1].alternates.length, 0)
})

test('groupByName — duplicate-name group collapses into primary + alternates', () => {
  const hits = [
    { slug: 'wellington-college',    name: 'Wellington College', region: 'Berkshire', country: 'United Kingdom' },
    { slug: 'wellington-college-uk', name: 'Wellington College', region: null,        country: 'United Kingdom' },
  ]
  const richness = new Map([['wellington-college', 6]])
  const out = groupByName(hits, richness)
  assert.equal(out.length, 1)
  assert.equal(out[0].primary.slug,         'wellington-college')
  assert.equal(out[0].alternates.length,    1)
  assert.equal(out[0].alternates[0].slug,   'wellington-college-uk')
})

// ─── loadRichness fail-closed (Codex r2 P1 + r3 P1 #1 regression) ───

test('loadRichness — both queries succeed → returns map of scores', async () => {
  const svc = makeMockSupabase({
    school_structured_data: {
      data: [
        { school_slug: 'eton', sports_profile: { rugby: 1 }, fees_min: 50000, fees_max: null, fees_by_grade: null, facilities: ['pool'], university_destinations: ['Oxford'], exam_results: { gcse: 90 }, curriculum: ['IB'], admissions_format: { test: 'CE13' }, student_community: { boarding_pct: 100 }, location_profile: { region: 'Berks' } },
      ],
      error: null,
    },
    school_notion_backfill: {
      data: [{ school_slug: 'eton', parsed: { fee_per_year: 50000 } }],
      error: null,
    },
  })
  const m = await loadRichness(svc, ['eton'])
  // 9 structured signals + 1 notion = 10 max
  assert.equal(m.get('eton'), 10)
})

test('loadRichness — structured errors + notion returns parsed:null → throws (the r2 P1 escape hatch)', async () => {
  // This is the EXACT bypass Codex r2 P1 flagged: structured query
  // fails, notion returns rows but with null parsed. Pre-fix, m.size=0
  // but notion.length > 0, so the gate didn't throw and search route
  // silently fell back to an empty richness map → original picker bug.
  const svc = makeMockSupabase({
    school_structured_data: {
      data: null,
      error: { message: 'permission denied for table school_structured_data', code: '42501' },
    },
    school_notion_backfill: {
      data: [
        { school_slug: 'cheltenham-ladies-college', parsed: null },
        { school_slug: 'cheltenham-ladies-college-uk', parsed: null },
      ],
      error: null,
    },
  })
  await assert.rejects(
    () => loadRichness(svc, ['cheltenham-ladies-college', 'cheltenham-ladies-college-uk']),
    RichnessUnavailableError,
  )
})

test('loadRichness — structured errors but notion has real parsed → returns partial map (no throw)', async () => {
  const svc = makeMockSupabase({
    school_structured_data: {
      data: null,
      error: { message: 'connection reset', code: 'XX000' },
    },
    school_notion_backfill: {
      data: [{ school_slug: 'eton', parsed: { fee_per_year: 50000 } }],
      error: null,
    },
  })
  const m = await loadRichness(svc, ['eton'])
  assert.equal(m.get('eton'), 1) // notion alone
})

test('loadRichness — chunks slugs into 100-batch groups (Codex r5 P2/P3 URL length, r6 P3 test gap)', async () => {
  // 250 slugs as a single .in() would be ~10KB URL — past 8KB cap.
  // Chunked it becomes three calls of [100, 100, 50] per table.
  // The mock records every .in() size so we can assert the chunk
  // boundaries directly, not just trust the final map size.
  const slugs = Array.from({ length: 250 }, (_, i) => `school-${i}`)
  const structuredScript = {}
  for (const slug of slugs) {
    structuredScript[slug] = { school_slug: slug, sports_profile: null, fees_min: 50000, fees_max: null, fees_by_grade: null, facilities: null, university_destinations: null, exam_results: null, curriculum: null, admissions_format: null, student_community: null, location_profile: null }
  }
  const { svc, calls } = makeChunkRecordingMockSupabase({
    school_structured_data: structuredScript,
    school_notion_backfill: {},
  })
  const m = await loadRichness(svc, slugs)
  // Verify chunk boundaries directly:
  assert.deepEqual(calls.school_structured_data, [100, 100, 50])
  assert.deepEqual(calls.school_notion_backfill, [100, 100, 50])
  // And verify all 250 still scored (no slug dropped):
  assert.equal(m.size, 250)
  assert.equal(m.get('school-0'),   1)
  assert.equal(m.get('school-100'), 1)  // second chunk
  assert.equal(m.get('school-200'), 1)  // third chunk
  assert.equal(m.get('school-249'), 1)
})

test('loadRichness — empty slug list → returns empty map (no DB call)', async () => {
  // Mock not even invoked — function short-circuits.
  const svc = { from() { throw new Error('should not query') } }
  const m = await loadRichness(svc, [])
  assert.equal(m.size, 0)
})

// ─── rankGroups (Codex r5 / 2026-05-18 search-ranking) ───

function mkGroup(name, primarySlug, altSlugs = []) {
  const primary = { slug: primarySlug, name, region: null, country: 'United Kingdom' }
  const alternates = altSlugs.map(s => ({ slug: s, name, region: null, country: 'United Kingdom' }))
  return { name, primary, alternates }
}

test('rankGroups — prefix match floats above substring match (the eton bug)', () => {
  // Real production failure: typing "eton" returned Alfreton/Appleton/...
  // alphabetically and Eton College never reached the top-8 group slots.
  const groups = [
    mkGroup('Alfreton Nursery School', 'alfreton-nursery-school-uk'),
    mkGroup('Appleton Academy',         'appleton-academy-uk'),
    mkGroup('Carleton High School',     'carleton-high-school-uk'),
    mkGroup('Eton College',             'eton-college'),
    mkGroup('Middleton School',         'middleton-school-uk'),
  ]
  // Eton College is the only one with a real richness signal.
  const richness = new Map([['eton-college', 9]])
  const ranked = rankGroups(groups, 'eton', richness)
  assert.equal(ranked[0].primary.slug, 'eton-college')
})

test('rankGroups — within prefix-match tier, richness DESC wins', () => {
  // Both "Eton College" and "Eton Academy" prefix-match "eton".
  // Eton College has richer data → floats first.
  const groups = [
    mkGroup('Eton Academy', 'eton-academy-uk'),
    mkGroup('Eton College', 'eton-college'),
  ]
  const richness = new Map([
    ['eton-college', 9],
    ['eton-academy-uk', 0],
  ])
  const ranked = rankGroups(groups, 'eton', richness)
  assert.equal(ranked[0].primary.slug, 'eton-college')
  assert.equal(ranked[1].primary.slug, 'eton-academy-uk')
})

test('rankGroups — substring tier ordered by richness then name', () => {
  // Query "school" matches all; none prefix-match (apart from any
  // school literally named "School *"). Falls back to richness then name.
  const groups = [
    mkGroup('Boring Primary School', 'boring-primary-school-uk'),
    mkGroup('Aardvark Independent School', 'aardvark-independent-school'),
    mkGroup('Camford School',     'camford-school'),
  ]
  const richness = new Map([
    ['aardvark-independent-school', 5],
    ['camford-school',              7],
  ])
  const ranked = rankGroups(groups, 'school', richness)
  assert.equal(ranked[0].primary.slug, 'camford-school')               // richness 7
  assert.equal(ranked[1].primary.slug, 'aardvark-independent-school')  // richness 5
  assert.equal(ranked[2].primary.slug, 'boring-primary-school-uk')     // richness 0
})

test('rankGroups — group alternates contribute to maxRichness', () => {
  // The primary may be data-poor but an alternate rich. The group as
  // a whole still surfaces because the user can expand and pick the
  // rich twin — same intent as "this name has a real school behind it".
  const groups = [
    mkGroup('Alfreton Nursery', 'alfreton-nursery-uk'),
    {
      name: 'Eton College',
      primary:    { slug: 'eton-college-empty', name: 'Eton College', region: null, country: 'United Kingdom' },
      alternates: [{ slug: 'eton-college',      name: 'Eton College', region: null, country: 'United Kingdom' }],
    },
  ]
  const richness = new Map([['eton-college', 9]])  // alternate, NOT primary
  const ranked = rankGroups(groups, 'al', richness)  // prefix-match Alfreton, NOT Eton
  // Alfreton wins because it's the prefix match — but if we search "et":
  const rankedEton = rankGroups(groups, 'et', richness)
  assert.equal(rankedEton[0].name, 'Eton College')
})

test('rankGroups — apostrophe in name does not block prefix match (Codex r7 P1 — the kings regression)', () => {
  // Codex r7 ran exactly this: with the OLD `g.name.toLowerCase().startsWith(q)`,
  // "King's College" was demoted to substring tier and lost to richness-0
  // Kingswood/Kings Ash. With normName on both sides, the apostrophe is
  // stripped and King's College joins the prefix tier — richness then wins.
  const groups = [
    mkGroup('Kingswood School',                'kingswood'),
    mkGroup('Kings Ash Academy',               'kings-ash'),
    mkGroup("King's College School Wimbledon", 'kcsw'),
  ]
  const richness = new Map([['kcsw', 10], ['kingswood', 0], ['kings-ash', 0]])
  const ranked = rankGroups(groups, 'kings', richness)
  assert.equal(ranked[0].primary.slug, 'kcsw')  // richness 10 wins inside prefix tier
})

test('rankGroups — control bytes in query do not block prefix match (Codex r5 #4)', () => {
  // Defensive: rankGroups strips controls internally so callers that
  // forget to sanitise (or get the raw post-strip-pre-escape pattern)
  // still get correct prefix-match semantics.
  const groups = [
    mkGroup('Alfreton Nursery', 'alfreton-nursery-uk'),
    mkGroup('Eton College',     'eton-college'),
  ]
  const richness = new Map([['eton-college', 9]])
  const ranked = rankGroups(groups, '\x01\x02eton', richness)
  assert.equal(ranked[0].primary.slug, 'eton-college')
})

test('rankGroups — empty query / blank query is harmless', () => {
  const groups = [
    mkGroup('Beta School',  'beta'),
    mkGroup('Alpha School', 'alpha'),
  ]
  // No prefix match (lowercase '' is prefix of everything → all tier 1).
  // Richness tied at 0 → falls through to name asc.
  const ranked = rankGroups(groups, '', new Map())
  assert.equal(ranked[0].primary.slug, 'alpha')
  assert.equal(ranked[1].primary.slug, 'beta')
})

// ─── expandApostropheVariants (Codex r7 / 2026-05-18 apostrophe smoke) ───

test('expandApostropheVariants — "kings" → ["kings", "king\'s"]', () => {
  // Real bug: typing "kings" doesn't find "King's College School Wimbledon"
  // because the SQL ilike "%kings%" misses "King's" (apostrophe inside).
  assert.deepEqual(expandApostropheVariants('kings'), ['kings', "king's"])
})

test('expandApostropheVariants — "marys" → ["marys", "mary\'s"]', () => {
  assert.deepEqual(expandApostropheVariants('marys'), ['marys', "mary's"])
})

test('expandApostropheVariants — "queens" → ["queens", "queen\'s"]', () => {
  assert.deepEqual(expandApostropheVariants('queens'), ['queens', "queen's"])
})

test('expandApostropheVariants — "eton" (no trailing s) → ["eton"] only', () => {
  assert.deepEqual(expandApostropheVariants('eton'), ['eton'])
})

test('expandApostropheVariants — "king\'s" (already has apostrophe) → unchanged', () => {
  assert.deepEqual(expandApostropheVariants("king's"), ["king's"])
})

test('expandApostropheVariants — too short to be possessive ("is", "as") → unchanged', () => {
  assert.deepEqual(expandApostropheVariants('is'), ['is'])
  assert.deepEqual(expandApostropheVariants('as'), ['as'])
})

test('expandApostropheVariants — curly apostrophe also blocks expansion', () => {
  // Notion sometimes uses curly apostrophes. expandApostropheVariants
  // detects both straight and curly and doesn't double-expand.
  assert.deepEqual(expandApostropheVariants('king’s'), ['king’s'])
})

// ─── Codex r7 P2 multi-token expansion ───

test('expandApostropheVariants — "kings college" → ["kings college", "king\'s college"]', () => {
  // The r7 P2 case: typing more chars after "kings" lost the variant
  // because the OLD impl required the whole query to end in s.
  assert.deepEqual(
    expandApostropheVariants('kings college'),
    ['kings college', "king's college"],
  )
})

test('expandApostropheVariants — "saint marys school" → expands the marys token', () => {
  assert.deepEqual(
    expandApostropheVariants('saint marys school'),
    ['saint marys school', "saint mary's school"],
  )
})

test('expandApostropheVariants — "kings c" → still expands kings token', () => {
  // As the user types "kings c" (typing toward "kings college"),
  // the variant for kings stays alive.
  assert.deepEqual(
    expandApostropheVariants('kings c'),
    ['kings c', "king's c"],
  )
})

test('expandApostropheVariants — multi-token already-apostrophic stays single variant', () => {
  // "king's college school" already has the apostrophe; no expansion.
  assert.deepEqual(
    expandApostropheVariants("king's college"),
    ["king's college"],
  )
})

test('expandApostropheVariants — first possessive token wins (no combinatorial blow-up)', () => {
  // "kings boys" has two tokens ending in s. We only expand the FIRST
  // possessive token to keep variant count at ≤ 2. The richness-driven
  // ranking handles the rest; the apostrophe-expansion is just enough
  // to bring the candidate into the set.
  assert.deepEqual(
    expandApostropheVariants('kings boys'),
    ['kings boys', "king's boys"],
  )
})

test('groupByName — alternates within a group sort by richness desc', () => {
  const hits = [
    { slug: 'st-josephs',   name: "St Joseph's", region: 'A', country: 'United Kingdom' },
    { slug: 'st-josephs-b', name: "St Joseph's", region: 'B', country: 'United Kingdom' },
    { slug: 'st-josephs-c', name: "St Joseph's", region: 'C', country: 'United Kingdom' },
  ]
  const richness = new Map([
    ['st-josephs',   5],
    ['st-josephs-b', 3],
    ['st-josephs-c', 1],
  ])
  const out = groupByName(hits, richness)
  assert.equal(out[0].primary.slug,       'st-josephs')
  assert.equal(out[0].alternates[0].slug, 'st-josephs-b')   // richer
  assert.equal(out[0].alternates[1].slug, 'st-josephs-c')   // less rich
})
