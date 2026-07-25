// seed-rows-notion-fallback.test.mjs — Phase 1 wire-up
// Tests that cell builders fall back to school_notion_backfill.parsed
// per the precedence rules (extractor wins; Notion fills nulls).
//
// Pattern follows seed-rows-builder-fixes.test.mjs: source-level regex
// assertions catch regressions in the pattern, and inline-patch fixtures
// verify the actual behaviour without needing TS compilation.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'seed-rows.ts'), 'utf8')

// ─── Source-level assertions ────────────────────────────────────────────

test('SeedContext threads notion alongside meta + struct', () => {
  assert.match(source, /type SeedContext = \{[\s\S]*?notion:\s*NotionBackfillRow \| null/m)
})

test('ShortlistContext exposes notionMap', () => {
  assert.match(source, /type ShortlistContext = \{[\s\S]*?notionMap:\s*Map<string, NotionBackfillRow>/m)
})

test('loadShortlistContext queries school_notion_backfill alongside struct', () => {
  // Codex r1 P2: SELECT was tightened to omit flagged_review since builders
  // never read it.
  assert.match(source, /supabase\.from\('school_notion_backfill'\)\s*\.select\('school_slug, status, parsed'\)/)
})

test('loadShortlistContext soft-fails on Notion read error (does not throw)', () => {
  // We log + continue with empty map rather than break the comparison page.
  assert.match(source, /\[loadShortlistContext\] notion sidecar read failed/)
  assert.doesNotMatch(
    source,
    /throw new Error\(`loadShortlistContext: notion sidecar read failed/,
  )
})

test('builder spec.build call site threads notion through', () => {
  assert.match(source, /spec\.build\(\{ meta, struct, notion \}\)/)
})

test('all 10 fallback-eligible builders accept notion in their signature', () => {
  // Each of these is wired up to read from Notion when the extractor is empty.
  for (const fn of [
    'buildTotalPupils',
    'buildLowestBoardingEntry',
    'buildBoardingPupils',
    'buildInternationalPupils',
    'buildBoardingRatio',
    'buildClassSize',
    'buildGcsePct',
    'buildALevelPct',
    'buildBoardingFeeTerm',
    'buildAnnualBoardingFee',
  ]) {
    const re = new RegExp(`function ${fn}\\(\\{[^}]*notion[^}]*\\}: SeedContext\\)`)
    assert.match(source, re, `${fn} must destructure notion from SeedContext`)
  }
})

test('Notion fallback uses notion.parsed (never flagged_review)', () => {
  // The sync layer parks unsafe values in flagged_review; the cell builders
  // must never surface those. notionParsed() helper only reads from .parsed.
  assert.match(source, /function notionParsed\(notion: NotionBackfillRow \| null, field: string\)[\s\S]*?notion\.parsed/m)
  // Codex r1 P2 / r2 NIT: catch property-access regressions across all access
  // forms — dot, optional-chain, non-null assertion, bracket subscript, and
  // destructured pull. Comments may still mention flagged_review to explain
  // WHY we don't read it.
  assert.doesNotMatch(source, /notion(?:\?|!)?\.flagged_review/, 'no dot access to notion.flagged_review')
  assert.doesNotMatch(source, /notion(?:\?|!)?\[\s*['"`]flagged_review['"`]/, 'no bracket subscript')
  assert.doesNotMatch(source, /\{[^}]*\bflagged_review\b[^}]*\}\s*=\s*notion/, 'no destructure from notion')
  // Also: the SELECT and the local type must not include flagged_review.
  assert.doesNotMatch(source, /\.select\([^)]*flagged_review/, 'SELECT must not request flagged_review')
  assert.doesNotMatch(source, /flagged_review:\s*Record</, 'NotionBackfillRow type must not declare flagged_review')
})

// ─── Inline-patch behaviour tests ───────────────────────────────────────

// Mirror the helpers from seed-rows.ts so we can exercise them in JS.
function notionParsed(notion, field) {
  if (!notion?.parsed) return null
  const v = notion.parsed[field]
  return v == null ? null : v
}
function notionParsedNumber(notion, field) {
  const v = notionParsed(notion, field)
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function formatGbp(value) {
  if (typeof value === 'number') return `£${Math.round(value).toLocaleString()}`
  const { min, max } = value
  if (min === max) return `£${Math.round(min).toLocaleString()}`
  return `£${Math.round(min).toLocaleString()}–£${Math.round(max).toLocaleString()}`
}
function notionParsedFee(notion, field) {
  const v = notionParsed(notion, field)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v && typeof v === 'object') {
    const o = v
    if (typeof o.min === 'number' && typeof o.max === 'number') return { min: o.min, max: o.max }
  }
  return null
}

test('notionParsed returns null when notion missing or no parsed', () => {
  assert.equal(notionParsed(null, 'gcse_pct'), null)
  assert.equal(notionParsed({ parsed: null }, 'gcse_pct'), null)
  assert.equal(notionParsed({ parsed: {} }, 'gcse_pct'), null)
})

test('notionParsedNumber rejects non-finite values', () => {
  assert.equal(notionParsedNumber({ parsed: { x: 75.6 } }, 'x'), 75.6)
  assert.equal(notionParsedNumber({ parsed: { x: NaN } }, 'x'), null)
  assert.equal(notionParsedNumber({ parsed: { x: '75' } }, 'x'), null)
})

test('formatGbp scalar', () => {
  assert.equal(formatGbp(55056), '£55,056')
  assert.equal(formatGbp(18352.5), '£18,353') // rounded
})

test('formatGbp range', () => {
  assert.equal(formatGbp({ min: 55350, max: 61470 }), '£55,350–£61,470')
})

test('formatGbp range collapses when min === max', () => {
  assert.equal(formatGbp({ min: 55056, max: 55056 }), '£55,056')
})

test('notionParsedFee handles scalar and {min,max}', () => {
  assert.equal(notionParsedFee({ parsed: { boarding_fee_term: 18352 } }, 'boarding_fee_term'), 18352)
  assert.deepEqual(
    notionParsedFee({ parsed: { boarding_fee_year: { min: 55350, max: 61470 } } }, 'boarding_fee_year'),
    { min: 55350, max: 61470 },
  )
  assert.equal(notionParsedFee({ parsed: { x: 'not a number' } }, 'x'), null)
  assert.equal(notionParsedFee({ parsed: { x: { min: 1 } } }, 'x'), null) // missing max
})

// ─── Precedence behaviour ────────────────────────────────────────────────

// Patched versions of the 4 simplest builders for behavioural testing.
function patchedBuildBoardingPupils(struct, notion) {
  const sc = struct?.student_community
  const ext = typeof sc?.boarder_count === 'number' ? sc.boarder_count : null
  if (ext != null) return { value: `~${ext.toLocaleString()}`, source: 'student_community.boarder_count' }
  const n = notionParsedNumber(notion, 'boarder_count')
  if (n != null) return { value: `~${n.toLocaleString()}`, source: 'notion.parsed.boarder_count' }
  return null
}

function patchedBuildBoardingRatio(struct, notion) {
  // Mirrors the Codex r1 P1 fix: extractor key is boarding_pct (not boarding_ratio);
  // legacy fallback to boarding_ratio kept; defensive 0-1 → 0-100 rescale.
  const sc = struct?.student_community
  let ext = null
  for (const k of ['boarding_pct', 'boarding_ratio']) {
    const v = sc?.[k]
    if (typeof v === 'number' && Number.isFinite(v)) { ext = v; break }
  }
  if (ext != null) {
    const pct = ext > 0 && ext <= 1 ? ext * 100 : ext
    const source = ext === sc?.boarding_pct ? 'student_community.boarding_pct' : 'student_community.boarding_ratio'
    return { value: `${Math.round(pct)}%`, source }
  }
  const n = notionParsedNumber(notion, 'boarding_ratio')
  if (n != null) return { value: `${Math.round(n)}%`, source: 'notion.parsed.boarding_ratio' }
  return null
}

function patchedBuildLowestBoardingEntry(struct, notion) {
  const af = struct?.admissions_format
  const ep = af?.entry_points
  if (!Array.isArray(ep) || ep.length === 0) {
    const n = notionParsedNumber(notion, 'lowest_boarding_entry')
    if (n != null && n >= 1 && n <= 13) {
      return { value: `Year ${n}`, source: 'notion.parsed.lowest_boarding_entry' }
    }
    return null
  }
  // Simplified: pretend we extract Year 9 if the array has any string entry.
  const first = ep[0]
  if (typeof first === 'object' && typeof first.entry_point === 'string') {
    return { value: 'Year 9', source: 'admissions_format.entry_points' }
  }
  // Extractor entries existed but nothing parsed cleanly — try Notion.
  const n = notionParsedNumber(notion, 'lowest_boarding_entry')
  if (n != null && n >= 1 && n <= 13) {
    return { value: `Year ${n}`, source: 'notion.parsed.lowest_boarding_entry' }
  }
  return null
}

function patchedBuildGcsePct(struct, notion) {
  // Mirrors seed-rows.ts:buildGcsePct. Banded fallback added 2026-05-18 after
  // Notion promote: Wellington / Harrow only publish 9-8, so the parser put
  // that into a separate slot (gcse_pct_alt_band) instead of poisoning the
  // 9-7 invariant on parsed.gcse_pct.
  const pct = struct?.exam_results?.gcse?.pct_7_to_9
  if (typeof pct === 'number') return { value: `${Math.round(pct)}%`, source: 'exam_results.gcse' }
  const n = notionParsedNumber(notion, 'gcse_pct')
  if (n != null) return { value: `${Math.round(n)}%`, source: 'notion.parsed.gcse_pct' }
  const alt = notionParsed(notion, 'gcse_pct_alt_band')
  if (typeof alt === 'string' && alt.length > 0) {
    return { value: alt, source: 'notion.parsed.gcse_pct_alt_band' }
  }
  return null
}

test('gcse_pct: extractor 9-7 wins over Notion alt_band', () => {
  const r = patchedBuildGcsePct(
    { exam_results: { gcse: { pct_7_to_9: 77 } } },
    { parsed: { gcse_pct_alt_band: '70% (9-8)' } },
  )
  assert.equal(r.value, '77%')
  assert.match(r.source, /exam_results/)
})

test('gcse_pct: Notion number fills when extractor null (9-7 band)', () => {
  const r = patchedBuildGcsePct(null, { parsed: { gcse_pct: 75.5 } })
  assert.equal(r.value, '76%')
  assert.match(r.source, /notion\.parsed\.gcse_pct$/)
})

test('gcse_pct: banded alt_band renders inline when 9-7 unavailable', () => {
  // Wellington / Harrow case — Notion only publishes 9-8.
  const r = patchedBuildGcsePct(null, { parsed: { gcse_pct_alt_band: '66% (9-8)' } })
  assert.equal(r.value, '66% (9-8)')
  assert.match(r.source, /gcse_pct_alt_band$/)
})

test('gcse_pct: returns null when extractor, gcse_pct, and alt_band all empty', () => {
  assert.equal(patchedBuildGcsePct(null, null), null)
  assert.equal(patchedBuildGcsePct({ exam_results: {} }, { parsed: {} }), null)
})

test('source: buildGcsePct branches to gcse_pct_alt_band as last fallback', () => {
  // Catches regressions where someone deletes the banded branch without realising
  // it's the only path for Wellington / Harrow.
  assert.match(source, /notionParsed\(notion,\s*'gcse_pct_alt_band'\)/)
  assert.match(source, /source:\s*'notion\.parsed\.gcse_pct_alt_band'/)
})

test('boarder_count: extractor wins when present', () => {
  const r = patchedBuildBoardingPupils({ student_community: { boarder_count: 654 } }, { parsed: { boarder_count: 700 } })
  assert.equal(r.value, '~654')
  assert.match(r.source, /student_community/)
})

test('boarder_count: Notion fills when extractor null', () => {
  const r = patchedBuildBoardingPupils({ student_community: {} }, { parsed: { boarder_count: 654 } })
  assert.equal(r.value, '~654')
  assert.match(r.source, /notion/)
})

test('boarder_count: returns null when both empty', () => {
  assert.equal(patchedBuildBoardingPupils(null, null), null)
  assert.equal(patchedBuildBoardingPupils({ student_community: {} }, { parsed: {} }), null)
})

test('boarding_ratio: rounds Notion 75.6 → 76%', () => {
  const r = patchedBuildBoardingRatio(null, { parsed: { boarding_ratio: 75.6 } })
  assert.equal(r.value, '76%')
})

test('boarding_ratio: extractor.boarding_pct wins over Notion (Codex r1 P1)', () => {
  const r = patchedBuildBoardingRatio(
    { student_community: { boarding_pct: 80 } },
    { parsed: { boarding_ratio: 60 } },
  )
  assert.equal(r.value, '80%')
  assert.match(r.source, /boarding_pct/)
})

test('boarding_ratio: legacy boarding_ratio key still honoured if boarding_pct absent', () => {
  const r = patchedBuildBoardingRatio(
    { student_community: { boarding_ratio: 65 } },
    null,
  )
  assert.equal(r.value, '65%')
  assert.match(r.source, /\.boarding_ratio$/)
})

test('boarding_ratio: defensive 0-1 fraction normalised to %', () => {
  // If a stale extractor stored 0.756 instead of 75.6, treat as fraction.
  const r = patchedBuildBoardingRatio(
    { student_community: { boarding_pct: 0.756 } },
    null,
  )
  assert.equal(r.value, '76%')
})

test('boarding_ratio: boarding_pct === boarding_ratio resolves source unambiguously', () => {
  // Edge case from Codex r2 question — if both are populated and equal, the
  // boarding_pct branch is taken first and source label reflects that.
  const r = patchedBuildBoardingRatio(
    { student_community: { boarding_pct: 75, boarding_ratio: 75 } },
    null,
  )
  assert.equal(r.value, '75%')
  assert.match(r.source, /boarding_pct/)
})

test('lowest_boarding_entry: Notion fallback when extractor entry_points is empty array', () => {
  const r = patchedBuildLowestBoardingEntry(
    { admissions_format: { entry_points: [] } },
    { parsed: { lowest_boarding_entry: 9 } },
  )
  assert.equal(r.value, 'Year 9')
  assert.match(r.source, /notion/)
})

test('lowest_boarding_entry: Notion year out of 1-13 range is rejected', () => {
  const r = patchedBuildLowestBoardingEntry(null, { parsed: { lowest_boarding_entry: 99 } })
  assert.equal(r, null)
})

test('lowest_boarding_entry: extractor entry_points wins when populated', () => {
  const r = patchedBuildLowestBoardingEntry(
    { admissions_format: { entry_points: [{ entry_point: 'Year 9 (13+)' }] } },
    { parsed: { lowest_boarding_entry: 7 } },
  )
  assert.equal(r.value, 'Year 9')
  assert.match(r.source, /admissions_format/)
})
