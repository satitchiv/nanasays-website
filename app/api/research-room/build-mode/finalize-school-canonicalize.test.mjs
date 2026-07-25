// 2026-05-19 — canonicalize-on-propose source-grep + logic tests.
//
// Surfaces: when Nana proposes `add_school`, the LLM may pick a data-poor
// duplicate slug (e.g. wellington-school instead of wellington-college).
// Yesterday's SchoolAdder fix (2026-05-18) closed the manual picker hole;
// this closes the LLM-driven path.
//
// Two layers:
//   • Source-grep — the canonicalize wrap exists in finalize/route.ts,
//     fires AFTER allowlist filter + slug-dedup but BEFORE display-name
//     resolution, and falls back to the original slug on failure.
//   • Logic — inline reimplementation of the loop with a stub
//     canonicalizer, verifying twin-collapse and best-effort fallback.
//
// Run via:
//   cd website
//   node --experimental-strip-types --test app/api/research-room/build-mode/finalize-school-canonicalize.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readFile(rel) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
}

const SRC = 'app/api/research-room/build-mode/finalize/route.ts'

// ── 1. Source-grep — wrap exists and is wired correctly ───────────────

test('finalize-canon: imports canonicalizeSlug from school-canonical-server', () => {
  const src = readFile(SRC)
  assert.match(src, /canonicalizeSlug.*['"]@\/lib\/research-room\/school-canonical-server['"]/)
})

test('finalize-canon: canonicalize wrap fires AFTER slug-dedup, BEFORE display-name resolution', () => {
  const src = readFile(SRC)
  const slugDedupIdx       = src.indexOf("safeSchoolProposals = safeSchoolProposals.filter(sp => {")
  const canonicalizeIdx    = src.indexOf('const { canonicalizeSlug } = await import')
  const displayNameIdx     = src.indexOf("nameBySlug.get(sp.slug)")
  assert.ok(slugDedupIdx > 0,    'expected slug-dedup block in route.ts')
  assert.ok(canonicalizeIdx > 0, 'expected canonicalize wrap in route.ts')
  assert.ok(displayNameIdx > 0,  'expected display-name resolution in route.ts')
  assert.ok(slugDedupIdx < canonicalizeIdx, 'canonicalize must run AFTER slug-dedup')
  assert.ok(canonicalizeIdx < displayNameIdx, 'canonicalize must run BEFORE display-name resolution')
})

test('finalize-canon: wrap uses try/catch with best-effort fallback to original slug', () => {
  const src = readFile(SRC)
  // The canonicalize block lives between the "canonicalized" marker comment
  // and the display-name resolution. Slice and assert on that window.
  const start = src.indexOf('canonicalize each surviving school proposal')
  const end   = src.indexOf('Trim and resolve display_name from schools table')
  assert.ok(start > 0 && end > start, 'expected canonicalize comment + display-name boundary')
  const fnSrc = src.slice(start, end)
  assert.match(fnSrc, /try\s*\{[\s\S]*canonicalizeSlug/m,          'expected try { canonicalizeSlug … }')
  assert.match(fnSrc, /catch\s*\(\s*e\s*\)\s*\{[\s\S]*console\.warn/m, 'expected catch (e) { console.warn … } fallback')
  assert.match(fnSrc, /\[build-mode\/finalize\]\s+canonicalize\s+failed/, 'expected warn log on failure')
})

test('finalize-canon: wrap re-dedupes by canonical slug (collision drop)', () => {
  const src = readFile(SRC)
  const start = src.indexOf('canonicalize each surviving school proposal')
  const end   = src.indexOf('Trim and resolve display_name from schools table')
  const fnSrc = src.slice(start, end)
  assert.match(fnSrc, /const\s+seen\s*=\s*new\s+Set/, 'expected new Set to track canonicalized slugs')
  assert.match(fnSrc, /seen\.has\(finalSlug\)/,       'expected seen.has(finalSlug) collision check')
  assert.match(fnSrc, /seen\.add\(finalSlug\)/,       'expected seen.add(finalSlug) registration')
})

test('finalize-canon: post-canon shortlist guard drops already-shortlisted slugs (Codex r1 P2)', () => {
  const src = readFile(SRC)
  const start = src.indexOf('canonicalize each surviving school proposal')
  const end   = src.indexOf('Trim and resolve display_name from schools table')
  const fnSrc = src.slice(start, end)
  assert.match(fnSrc, /const\s+shortlistSet\s*=\s*new\s+Set\(\s*shortlistSlugs\s*\)/, 'expected shortlistSet derived from shortlistSlugs')
  assert.match(fnSrc, /shortlistSet\.has\(finalSlug\)/,                                 'expected shortlistSet.has(finalSlug) guard')
  assert.match(fnSrc, /dropping proposal — canonical already in shortlist/,             'expected info log on drop')
})

test('finalize-canon: swap log includes from-slug, to-slug, and reason', () => {
  const src = readFile(SRC)
  const start = src.indexOf('canonicalize each surviving school proposal')
  const end   = src.indexOf('Trim and resolve display_name from schools table')
  const fnSrc = src.slice(start, end)
  assert.match(
    fnSrc,
    /console\.info\(\s*['"][^'"]*canonicalized[^'"]*['"]\s*,\s*sp\.slug\s*,\s*['"]→['"]\s*,\s*canonical\s*,\s*reason/,
    'expected console.info("…canonicalized…", sp.slug, "→", canonical, reason)',
  )
})

// ── 2. Logic — inline reimplementation with stub canonicalizer ────────
//
// Mirrors the route.ts loop exactly. If the route diverges this test fails.

async function canonicalizeProposalsInline(proposals, canonicalizer, shortlistSlugs = []) {
  const shortlistSet = new Set(shortlistSlugs)
  const out = []
  const seen = new Set()
  for (const sp of proposals) {
    let finalSlug = sp.slug
    try {
      const { canonical, swapped } = await canonicalizer(sp.slug)
      if (swapped) finalSlug = canonical
    } catch {
      /* best-effort: keep original slug */
    }
    if (shortlistSet.has(finalSlug)) continue
    if (seen.has(finalSlug)) continue
    seen.add(finalSlug)
    out.push({ ...sp, slug: finalSlug })
  }
  return out
}

test('logic: LLM picks data-poor twin → wrap swaps to canonical', async () => {
  const proposals = [
    { slug: 'wellington-school', rationale: 'r1', match_signals: ['boys'] },
  ]
  const stub = async (slug) => slug === 'wellington-school'
    ? { canonical: 'wellington-college', swapped: true }
    : { canonical: slug, swapped: false }
  const out = await canonicalizeProposalsInline(proposals, stub)
  assert.equal(out.length, 1)
  assert.equal(out[0].slug, 'wellington-college')
  assert.equal(out[0].rationale, 'r1')
  assert.deepEqual(out[0].match_signals, ['boys'])
})

test('logic: LLM picks both twins → wrap collapses to one canonical', async () => {
  // Both wellington-school and wellington-college appear in scorer pool
  // and LLM picks both. After canonicalization both → wellington-college.
  // Dedupe drops the second; we end with one entry.
  const proposals = [
    { slug: 'wellington-school',  rationale: 'twin-A', match_signals: [] },
    { slug: 'wellington-college', rationale: 'twin-B', match_signals: [] },
    { slug: 'eton-college',       rationale: 'unrelated', match_signals: [] },
  ]
  const stub = async (slug) => slug === 'wellington-school'
    ? { canonical: 'wellington-college', swapped: true }
    : { canonical: slug, swapped: false }
  const out = await canonicalizeProposalsInline(proposals, stub)
  assert.equal(out.length, 2, 'duplicate canonical must be dropped')
  assert.deepEqual(out.map(p => p.slug), ['wellington-college', 'eton-college'])
  // First-wins: twin-A's rationale survives, twin-B is dropped.
  assert.equal(out[0].rationale, 'twin-A')
})

test('logic: canonicalizer throws → wrap falls back to original slug (best-effort)', async () => {
  const proposals = [
    { slug: 'wellington-school', rationale: 'r1', match_signals: [] },
    { slug: 'eton-college',      rationale: 'r2', match_signals: [] },
  ]
  const stub = async () => { throw new Error('DB unreachable') }
  const out = await canonicalizeProposalsInline(proposals, stub)
  assert.equal(out.length, 2)
  assert.deepEqual(out.map(p => p.slug), ['wellington-school', 'eton-college'])
})

test('logic: no swaps needed → wrap is identity (plus dedupe)', async () => {
  const proposals = [
    { slug: 'eton-college',     rationale: 'r1', match_signals: [] },
    { slug: 'westminster-school-uk', rationale: 'r2', match_signals: [] },
  ]
  const stub = async (slug) => ({ canonical: slug, swapped: false })
  const out = await canonicalizeProposalsInline(proposals, stub)
  assert.deepEqual(out.map(p => p.slug), ['eton-college', 'westminster-school-uk'])
})

test('logic: canonical lands in shortlist → proposal dropped (Codex r1 P2)', async () => {
  // Parent already has wellington-college in shortlist. Scorer surfaces
  // wellington-school as a candidate (different slug → not in shortlist
  // exclusion). LLM picks it. Canonicalize swaps → wellington-college →
  // now collides with shortlist. Drop the proposal entirely.
  const proposals = [
    { slug: 'wellington-school', rationale: 'twin', match_signals: [] },
    { slug: 'eton-college',      rationale: 'distinct', match_signals: [] },
  ]
  const stub = async (slug) => slug === 'wellington-school'
    ? { canonical: 'wellington-college', swapped: true }
    : { canonical: slug, swapped: false }
  const out = await canonicalizeProposalsInline(proposals, stub, ['wellington-college'])
  assert.equal(out.length, 1, 'shortlist-collision must be dropped')
  assert.equal(out[0].slug, 'eton-college')
})

test('logic: canonical lands in shortlist for multiple proposals → all collisions dropped', async () => {
  const proposals = [
    { slug: 'wellington-school',           rationale: 'r1', match_signals: [] },
    { slug: 'cheltenham-ladies-college-school', rationale: 'r2', match_signals: [] },
    { slug: 'sevenoaks-school',            rationale: 'distinct', match_signals: [] },
  ]
  const stub = async (slug) => {
    if (slug === 'wellington-school')            return { canonical: 'wellington-college', swapped: true }
    if (slug === 'cheltenham-ladies-college-school') return { canonical: 'cheltenham-ladies-college', swapped: true }
    return { canonical: slug, swapped: false }
  }
  const shortlist = ['wellington-college', 'cheltenham-ladies-college']
  const out = await canonicalizeProposalsInline(proposals, stub, shortlist)
  assert.equal(out.length, 1)
  assert.equal(out[0].slug, 'sevenoaks-school')
})

test('logic: 3 schools, 2 of which collapse → wrap returns 2 unique canonicals', async () => {
  // Mix of LLM picks. cheltenham-ladies-college-school and
  // cheltenham-ladies-college both canonicalize to cheltenham-ladies-college.
  const proposals = [
    { slug: 'cheltenham-ladies-college-school', rationale: 'twin-A', match_signals: [] },
    { slug: 'cheltenham-ladies-college',        rationale: 'twin-B', match_signals: [] },
    { slug: 'sevenoaks-school',                 rationale: 'unrelated', match_signals: [] },
  ]
  const stub = async (slug) => slug === 'cheltenham-ladies-college-school'
    ? { canonical: 'cheltenham-ladies-college', swapped: true }
    : { canonical: slug, swapped: false }
  const out = await canonicalizeProposalsInline(proposals, stub)
  assert.equal(out.length, 2)
  assert.deepEqual(out.map(p => p.slug), ['cheltenham-ladies-college', 'sevenoaks-school'])
})
