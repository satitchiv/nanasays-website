// RRV-7 (travel corridor + exam context band) — pure-helper unit tests +
// wiring/cache-stability source-grep guards.
//
// Run via:
//   node --experimental-strip-types --test lib/research-room/rrv7-viz.test.mjs
//
// Layer 1 imports the real helpers (framework-free module, safe outside
// the server bundle). Layer 2 source-greps the server loader for the two
// invariants the whole design rests on: cellFromRaw must never read the
// parallel `minutes` field, and `viz` must be attached in loadLensRows
// only — both protect the verdict cache hash (see the RRV-5 precedent
// comments in lib/research-comparison.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  formatMinutes,
  formatMinutesSpoken,
  parseMinutesFromDisplay,
  parsePctFromDisplay,
  corridorStopPositions,
  bandAxisPos,
  bandLabelSides,
  percentileSorted,
  CORRIDOR_ORIGIN_POS,
} from './rrv7-viz.ts'

// ─── Layer 1: formatters ─────────────────────────────────────────────────

test('formatMinutes — sub-hour, mixed, exact hours', () => {
  assert.equal(formatMinutes(35), '35m')
  assert.equal(formatMinutes(105), '1h 45m')
  assert.equal(formatMinutes(120), '2h')
  assert.equal(formatMinutes(59.6), '1h')     // rounds before splitting
  assert.equal(formatMinutes(295), '4h 55m')  // live max in the 2026-07-20 trace
})

test('formatMinutesSpoken — aria sentences', () => {
  assert.equal(formatMinutesSpoken(35), '35 minutes')
  assert.equal(formatMinutesSpoken(60), '1 hour')
  assert.equal(formatMinutesSpoken(105), '1 hour 45 minutes')
  assert.equal(formatMinutesSpoken(130), '2 hours 10 minutes')
})

test('parseMinutesFromDisplay — matches only the builder display format', () => {
  assert.equal(parseMinutesFromDisplay('54 min'), 54)
  assert.equal(parseMinutesFromDisplay(' 54 min '), 54)
  assert.equal(parseMinutesFromDisplay('54.5 min'), 54.5)
  assert.equal(parseMinutesFromDisplay('about an hour'), null)
  assert.equal(parseMinutesFromDisplay('54'), null)
  assert.equal(parseMinutesFromDisplay('0 min'), null)   // builder requires m > 0
  assert.equal(parseMinutesFromDisplay(54), null)        // non-string
  assert.equal(parseMinutesFromDisplay(null), null)
})

test('parsePctFromDisplay — legacy numeric-less "NN%" cells (live-trace shape)', () => {
  assert.equal(parsePctFromDisplay('77%'), 77)
  assert.equal(parsePctFromDisplay(' 55% '), 55)
  assert.equal(parsePctFromDisplay('99.2%'), 99.2)
  assert.equal(parsePctFromDisplay('66% (9-8)'), null)  // alt-band display shape never parses
  assert.equal(parsePctFromDisplay('120%'), null)
  assert.equal(parsePctFromDisplay(77), null)
  assert.equal(parsePctFromDisplay(null), null)
})

// ─── Layer 1: corridor layout ────────────────────────────────────────────

test('corridorStopPositions — proportional, monotonic, min-gapped, bounded', () => {
  const pos = corridorStopPositions([19, 25, 54, 158])
  assert.equal(pos.length, 4)
  for (let i = 0; i < pos.length; i++) {
    assert.ok(pos[i] > CORRIDOR_ORIGIN_POS, `stop ${i} right of origin`)
    assert.ok(pos[i] <= 94, `stop ${i} within right edge`)
    if (i > 0) assert.ok(pos[i] - pos[i - 1] >= 11 - 1e-9, `min gap between ${i - 1} and ${i}`)
  }
  // The 19-min and 25-min schools are proportionally ~3.5% apart on a
  // 158-min scale — the min-gap pass must separate them.
  assert.ok(pos[1] - pos[0] >= 11 - 1e-9)
  // The slowest school stays at the far end.
  assert.ok(pos[3] > 90)
})

test('corridorStopPositions — near-tied cluster never overflows the right edge', () => {
  const pos = corridorStopPositions([150, 152, 154, 156, 158])
  for (let i = 0; i < pos.length; i++) {
    assert.ok(pos[i] <= 94 + 1e-9, `stop ${i} within edge`)
    if (i > 0) assert.ok(pos[i] > pos[i - 1], 'strictly increasing')
  }
})

test('corridorStopPositions — empty and single-stop inputs', () => {
  assert.deepEqual(corridorStopPositions([]), [])
  const [only] = corridorStopPositions([54])
  assert.ok(only > CORRIDOR_ORIGIN_POS && only <= 94)
})

test('corridorStopPositions — pathological 12 near-tied stops: gap compresses, never underflows or inverts', () => {
  const pos = corridorStopPositions(Array.from({ length: 12 }, (_, i) => 150 + i))
  for (let i = 0; i < pos.length; i++) {
    assert.ok(pos[i] > CORRIDOR_ORIGIN_POS, `stop ${i} right of origin (no left-edge underflow)`)
    assert.ok(pos[i] <= 94 + 1e-9, `stop ${i} within right edge`)
    if (i > 0) assert.ok(pos[i] > pos[i - 1], `stop ${i} strictly after ${i - 1}`)
  }
})

// ─── Layer 1: exam band layout ───────────────────────────────────────────

test('bandAxisPos — 20–100 axis mapping with clamping', () => {
  assert.equal(bandAxisPos(20), 0)
  assert.equal(bandAxisPos(100), 100)
  assert.equal(bandAxisPos(60), 50)
  assert.equal(bandAxisPos(10), 0)    // clamped (live min is 29, defensive)
  assert.equal(bandAxisPos(110), 100) // clamped
})

test('bandLabelSides — default below, crowded neighbours alternate', () => {
  // Spread out → all below (mock §8 default).
  assert.deepEqual(bandLabelSides([40, 60, 80]), [true, true, true])
  // 64 vs 66 crowd (< 7 apart) → second flips above.
  assert.deepEqual(bandLabelSides([64, 66]), [true, false])
  // Three-way pileup alternates.
  assert.deepEqual(bandLabelSides([64, 66, 68]), [true, false, true])
})

test('percentileSorted — matches percentile_cont semantics', () => {
  assert.equal(percentileSorted([10], 0.25), 10)
  assert.equal(percentileSorted([10, 20], 0.5), 15)
  assert.equal(percentileSorted([10, 20, 30, 40], 0.25), 17.5)
  assert.equal(percentileSorted([10, 20, 30, 40], 0.75), 32.5)
  assert.equal(percentileSorted([1, 2, 3], 1), 3)
})

// ─── Layer 2: verdict-cache-stability + attach-site wiring guards ────────

const loaderSrc = readFileSync(new URL('../research-comparison.ts', import.meta.url), 'utf8')

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} found in research-comparison.ts`)
  const next = src.indexOf('\nfunction ', start + 1)
  const nextAsync = src.indexOf('\nasync function ', start + 1)
  const candidates = [next, nextAsync].filter(i => i >= 0)
  const end = candidates.length > 0 ? Math.min(...candidates) : src.length
  return src.slice(start, end)
}

test('cellFromRaw never reads the RRV-7 parallel `minutes` field (verdict cache hash)', () => {
  const body = extractFunction(loaderSrc, 'cellFromRaw')
  assert.ok(!/minutes/.test(body),
    'cellFromRaw must not reference `minutes` — it feeds loadVerdictRows, whose output is hashed into the verdict cache key')
  // Same guard for the RRV-5 precedent fields, so a refactor can't quietly
  // start surfacing any parallel field.
  assert.ok(!/\bband\b/.test(body), 'cellFromRaw must not reference band')
  assert.ok(!/\bmix\b/.test(body), 'cellFromRaw must not reference mix')
})

test('viz is assembled in loadLensRows only, never in loadVerdictRows', () => {
  const lens = extractFunction(loaderSrc, 'loadLensRows')
  assert.ok(/buildTravelCorridorViz/.test(lens), 'loadLensRows assembles the corridor')
  assert.ok(/buildExamBandViz/.test(lens), 'loadLensRows assembles the exam band')
  const verdict = extractFunction(loaderSrc, 'loadVerdictRows')
  assert.ok(!/viz/.test(verdict), 'loadVerdictRows must never touch viz')
  assert.ok(!/buildTravelCorridorViz|buildExamBandViz/.test(verdict))
})

test('buildHeathrowMinutes writes the parallel minutes field (seed-rows source)', () => {
  const seedSrc = readFileSync(new URL('./seed-rows.ts', import.meta.url), 'utf8')
  assert.ok(/source: 'location_profile', minutes: m/.test(seedSrc),
    'numeric branch of buildHeathrowMinutes carries `minutes`')
})

test('exam band dots come from numeric / true-9–7 sources only; alt-band cells are named, not plotted', () => {
  const band = extractFunction(loaderSrc, 'buildExamBandViz')
  assert.ok(/typeof raw\?\.numeric === 'number'/.test(band))
  // The display-string fallback must be gated to the two true 9–7 sources.
  assert.ok(/'exam_results\.gcse'/.test(band) && /'notion\.parsed\.gcse_pct'/.test(band),
    'fallback parse is source-gated')
  assert.ok(/gcse_pct_alt_band/.test(band), 'alt-band publishers are classified separately')
})
