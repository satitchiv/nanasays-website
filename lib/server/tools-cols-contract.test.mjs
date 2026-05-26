// Contract tests for the dimension-aware column selection in rankSchools
// + compareSchools (Codex P1.2 2026-05-26).
//
// The wiring bug pattern Codex flagged:
//   subject_strengths.enabled = true   ← dim is live
//   ALL_STRUCTURED_COLS              ← but DOES NOT include 'subject_strengths'
//   → hasRequiredData drops every row, rankSchools returns 0 schools, model
//     cascades into 3-4 getSchoolFacts calls (the 10× slowness root cause).
//
// These tests assert that every enabled SSD-backed dim has its requires_field
// fetched. Fact-loaded dims (data comes from school_facts /
// school_notion_backfill via separate loaders) are excluded — their
// requires_field is folded onto the row by the loader, not the SQL SELECT.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS } from './dimensions.js';
import {
  colsForRankSchools,
  colsForCompareSchools,
  BASE_STRUCTURED_COLS as BASE_COLS,
  BIG_COLS_BY_DIM,
  BIG_COLS,
} from './structured-cols.mjs';

// Dims that load their requires_field via a separate loader (school_facts or
// school_notion_backfill), not via the school_structured_data SELECT. Keep
// this set in sync with FACT_DIM_TO_BUNDLE_KEY + NEW_DIMS_NEEDING_NOTION in
// tools.js — drift here would let a fact-loaded dim slip past the contract
// check, but new fact-loaded dims would also need their bundle loader added
// alongside this entry, so drift is detectable in code review.
const FACT_LOADED_DIMS = new Set([
  'safeguarding_integrity',
  'weekend_life',
  'ethos_match',
  'intl_share',
  'device_policy',
  'inclusive_culture',
  'pastoral_care',
  'teaching_quality_isi',
  'small_class_size',
]);

// ── Core contract ───────────────────────────────────────────────────────

test('contract: every enabled SSD-backed dim has its requires_field root col fetched by rankSchools', () => {
  for (const [name, dim] of Object.entries(DIMENSIONS)) {
    if (dim.enabled === false)      continue;
    if (FACT_LOADED_DIMS.has(name)) continue;
    if (!dim.requires_field)        continue;

    const rootCol = dim.requires_field.split('.')[0];
    const cols    = colsForRankSchools(name);
    assert.ok(
      cols.includes(rootCol),
      `dim "${name}" has enabled=true + requires_field "${dim.requires_field}" ` +
      `but root column "${rootCol}" is NOT in colsForRankSchools("${name}"). ` +
      `Add it to BASE_STRUCTURED_COLS (if always-needed) or BIG_COLS_BY_DIM["${rootCol}"] ` +
      `(if big-JSONB and dim-specific).`,
    );
  }
});

test('contract: compareSchools fetches every required col when ALL enabled SSD dims are requested', () => {
  const allEnabledSsdDims = Object.entries(DIMENSIONS)
    .filter(([n, d]) => d.enabled !== false && !FACT_LOADED_DIMS.has(n))
    .map(([n]) => n);
  const cols = colsForCompareSchools(allEnabledSsdDims);
  for (const name of allEnabledSsdDims) {
    const dim = DIMENSIONS[name];
    if (!dim.requires_field) continue;
    const rootCol = dim.requires_field.split('.')[0];
    assert.ok(cols.includes(rootCol), `compareSchools missing requires_field root "${rootCol}" for "${name}"`);
  }
});

// ── Sanity checks on the col sets ───────────────────────────────────────

test('school_slug is always in the fetch list (needed for row identity)', () => {
  assert.ok(colsForRankSchools('tennis_strength').includes('school_slug'));
  assert.ok(colsForRankSchools('subject_strengths').includes('school_slug'));
  assert.ok(colsForRankSchools('unknown_dim').includes('school_slug'));
  assert.ok(colsForCompareSchools([]).includes('school_slug'));
});

test('subject_strengths is fetched ONLY when subject_strengths dim is requested', () => {
  // The exact wiring-bug regression: pre-P1.2 we always fetched it; post-P1.2
  // it must drop out for non-subject dims.
  assert.ok(colsForRankSchools('subject_strengths').includes('subject_strengths'));
  assert.ok(!colsForRankSchools('academic_strength').includes('subject_strengths'));
  assert.ok(!colsForRankSchools('tennis_strength').includes('subject_strengths'));
  assert.ok(!colsForRankSchools('fees_value').includes('subject_strengths'));
});

test('sports_profile is fetched ONLY for sport dims', () => {
  // Sports profile is the biggest blob (25-30KB) — biggest perf win is
  // keeping it out of non-sport queries.
  for (const sport of ['tennis_strength', 'rugby_standing', 'football_strength', 'cricket_strength', 'hockey_strength']) {
    assert.ok(colsForRankSchools(sport).includes('sports_profile'), `${sport} missing sports_profile`);
  }
  for (const nonSport of ['academic_strength', 'subject_strengths', 'fees_value', 'pastoral_model']) {
    assert.ok(!colsForRankSchools(nonSport).includes('sports_profile'), `${nonSport} should NOT include sports_profile`);
  }
});

test('compareSchools unions cols when sport + subject dims are both requested', () => {
  const cols = colsForCompareSchools(['tennis_strength', 'subject_strengths']);
  assert.ok(cols.includes('sports_profile'));
  assert.ok(cols.includes('subject_strengths'));
});

test('compareSchools with only fact-loaded dims drops all BIG cols', () => {
  // safeguarding_integrity + ethos_match both fact-loaded; no SSD blobs needed.
  const cols = colsForCompareSchools(['safeguarding_integrity', 'ethos_match']);
  for (const big of BIG_COLS) {
    assert.ok(!cols.includes(big), `BIG col "${big}" leaked into fact-only dim compareSchools`);
  }
});

// ── BASE col integrity ──────────────────────────────────────────────────

test('BASE_STRUCTURED_COLS does NOT include any BIG col (else gating is bypassed)', () => {
  for (const big of BIG_COLS) {
    assert.ok(!BASE_COLS.includes(big), `BIG col "${big}" must not appear in BASE_STRUCTURED_COLS`);
  }
});

test('BIG_COLS_BY_DIM keys are real SSD column names (not dim names)', () => {
  // Defensive: a future edit that confuses dim names with col names would
  // silently disable the gating because the dim-set lookup would miss.
  // The col names listed here are the ones used by dim row reads
  // (audited 2026-05-26: only sports_profile + subject_strengths qualify
  // as big JSONB worth gating today).
  const expectedBigCols = new Set(['sports_profile', 'subject_strengths']);
  for (const col of Object.keys(BIG_COLS_BY_DIM)) {
    assert.ok(expectedBigCols.has(col), `unexpected BIG col "${col}" — audit row reads before adding`);
  }
});
