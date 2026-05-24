// Tests for renderNotionBackfillLines (Notion-sidecar chat-wiring slice
// landed 2026-05-24). Covers: null/empty input, individual field rendering,
// extractor-wins precedence on total_pupils, GCSE banded fallback,
// boarding_pct/boarding_ratio alias, class_size senior/sixth/average
// precedence, and end-to-end buildStructuredBlock splicing.
//
// Run via:
//   cd website
//   node --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/nana-brain-notion-renderer.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderNotionBackfillLines,
  buildStructuredBlock,
  projectNotionBackfill,
} from './nana-brain.js';

test('returns [] for null/undefined/non-object input', () => {
  assert.deepEqual(renderNotionBackfillLines(null), []);
  assert.deepEqual(renderNotionBackfillLines(undefined), []);
  assert.deepEqual(renderNotionBackfillLines('string'), []);
  assert.deepEqual(renderNotionBackfillLines(42), []);
});

test('returns [] for empty parsed object', () => {
  assert.deepEqual(renderNotionBackfillLines({}), []);
});

test('emits header + facts when at least one field is present', () => {
  const lines = renderNotionBackfillLines({ total_pupils: 1342 });
  assert.equal(lines.length, 2, 'header + 1 fact = 2 lines');
  assert.match(lines[0], /^\nHAND-CURATED FACTS/);
  // Codex r1 P2: no bracket-cite instruction in the header (existing JSON-schema
  // citation discipline gates on source_url, which these facts don't carry).
  assert.match(lines[1], /^  • Total pupils: 1,342$/);
});

test('renders pupil counts, intl, boarders, boarding share, class size', () => {
  const lines = renderNotionBackfillLines({
    total_pupils: 1500,
    boarder_count: 420,
    intl_count: 87,
    boarding_pct: 28,
    class_size: { senior: 15, sixth: 12, average: 14 },
  });
  const body = lines.slice(1).join('\n');
  assert.match(body, /Total pupils: 1,500/);
  assert.match(body, /Boarders: 420/);
  assert.match(body, /International pupils: 87/);
  assert.match(body, /Boarding share: 28% of pupils/);
  // class_size precedence: senior wins when present
  assert.match(body, /Average class size: 15 \(senior\)/);
  assert.doesNotMatch(body, /sixth form/);
  assert.doesNotMatch(body, /school average/);
});

test('class_size falls back to sixth then average when senior missing', () => {
  const sixthOnly = renderNotionBackfillLines({ class_size: { sixth: 11 } });
  assert.match(sixthOnly.join('\n'), /Average class size: 11 \(sixth form\)/);

  const avgOnly = renderNotionBackfillLines({ class_size: { average: 18 } });
  assert.match(avgOnly.join('\n'), /Average class size: ~18 \(school average\)/);
});

test('boarding_ratio alias works when boarding_pct missing', () => {
  const lines = renderNotionBackfillLines({ boarding_ratio: 42 });
  assert.match(lines.join('\n'), /Boarding share: 42% of pupils/);
});

test('GCSE banded fallback fires when gcse_pct null but gcse_pct_alt_band present', () => {
  const lines = renderNotionBackfillLines({
    gcse_pct: null,
    gcse_pct_alt_band: '66% (9-8)',
  });
  const body = lines.slice(1).join('\n');
  assert.match(body, /GCSE \(school-reported band\): 66% \(9-8\)/);
  assert.doesNotMatch(body, /GCSE 9–7/);
});

test('GCSE 9-7 wins over banded fallback when both present', () => {
  const lines = renderNotionBackfillLines({
    gcse_pct: 82,
    gcse_pct_alt_band: '66% (9-8)',
  });
  const body = lines.slice(1).join('\n');
  assert.match(body, /GCSE 9–7: 82%/);
  assert.doesNotMatch(body, /school-reported band/);
});

test('A-Level percentage renders rounded', () => {
  const lines = renderNotionBackfillLines({ a_level_pct: 78.4 });
  assert.match(lines.join('\n'), /A-Level A\*–A: 78%/);
});

test('lowest_boarding_entry renders as Year N (rejects out-of-range)', () => {
  const ok = renderNotionBackfillLines({ lowest_boarding_entry: 7 });
  assert.match(ok.join('\n'), /Lowest boarding entry: Year 7/);

  const bad = renderNotionBackfillLines({ lowest_boarding_entry: 99 });
  assert.deepEqual(bad, [], 'out-of-range entry year drops the field');

  const nan = renderNotionBackfillLines({ lowest_boarding_entry: 'present' });
  assert.deepEqual(nan, [], 'non-numeric entry year drops the field');
});

test('heathrow_distance renders as miles (NOT minutes)', () => {
  const lines = renderNotionBackfillLines({ heathrow_distance: 42.7 });
  assert.match(lines.join('\n'), /Distance from Heathrow: 43 miles/);
});

test('extractor-wins precedence: total_pupils suppressed when SSD has student_community.total_pupils', () => {
  const structured = { student_community: { total_pupils: 1200 } };
  const lines = renderNotionBackfillLines({ total_pupils: 1342 }, structured);
  // total_pupils should NOT render — SSD wins
  const body = lines.join('\n');
  assert.doesNotMatch(body, /Total pupils/);
  // But the function returns [] when nothing else is present
  assert.deepEqual(lines, []);
});

test('extractor-wins precedence: other fields still render when SSD has only total_pupils', () => {
  const structured = { student_community: { total_pupils: 1200 } };
  const lines = renderNotionBackfillLines(
    { total_pupils: 1342, class_size: { senior: 14 } },
    structured,
  );
  const body = lines.join('\n');
  assert.doesNotMatch(body, /Total pupils/);
  assert.match(body, /Average class size: 14/);
});

test('non-numeric numeric fields are dropped (not coerced)', () => {
  const lines = renderNotionBackfillLines({
    total_pupils: 'lots',
    boarder_count: null,
    boarding_pct: 'high',
    a_level_pct: NaN,
  });
  assert.deepEqual(lines, []);
});

test('buildStructuredBlock splices notion lines AFTER structured lines', () => {
  const structured = { languages: ['English', 'French'] };
  const notion = { total_pupils: 1500 };
  const block = buildStructuredBlock(structured, notion);
  assert.match(block, /Languages: English, French/);
  assert.match(block, /HAND-CURATED FACTS/);
  // structured lines should appear before notion header
  const idxLanguages = block.indexOf('Languages:');
  const idxNotion = block.indexOf('HAND-CURATED FACTS');
  assert.ok(idxLanguages < idxNotion, 'structured lines come before notion block');
});

test('buildStructuredBlock works when ONLY notion present (no structured)', () => {
  const block = buildStructuredBlock(null, { total_pupils: 1500 });
  assert.match(block, /HAND-CURATED FACTS/);
  assert.match(block, /Total pupils: 1,500/);
});

test('buildStructuredBlock returns sentinel when both inputs null', () => {
  assert.equal(buildStructuredBlock(null, null), '(no structured data)');
  assert.equal(buildStructuredBlock(undefined), '(no structured data)');
});

test('buildStructuredBlock returns sentinel when inputs present but empty', () => {
  assert.equal(buildStructuredBlock({}, {}), '(no structured data)');
});

// ───────────────────────────────────────────────────────────────────────────
// projectNotionBackfill — projector layer (Codex r1 P1.1 + P1.2 fix).
// Lives at the FETCH BOUNDARY: ensures raw `parsed` (containing fees + raw
// Notion property shapes) never reaches downstream surfaces, and applies
// SSD-wins for every overlapping field.
// ───────────────────────────────────────────────────────────────────────────

test('projector: returns null for null/empty/non-object input', () => {
  assert.equal(projectNotionBackfill(null, null), null);
  assert.equal(projectNotionBackfill(undefined, null), null);
  assert.equal(projectNotionBackfill('string', null), null);
  assert.equal(projectNotionBackfill({}, null), null);
});

test('projector: strips fee fields (boarding_fee_term, boarding_fee_year, unknown keys)', () => {
  const projected = projectNotionBackfill(
    {
      total_pupils: 1342,
      boarding_fee_term: 14000,
      boarding_fee_year: 42000,
      raw_notion_url: 'https://notion.so/secret',
      unknown_future_key: 'leak',
    },
    null,
  );
  assert.equal(projected.total_pupils, 1342, 'whitelisted field survives');
  assert.equal(projected.boarding_fee_term, undefined, 'term fee stripped');
  assert.equal(projected.boarding_fee_year, undefined, 'year fee stripped');
  assert.equal(projected.raw_notion_url, undefined, 'raw Notion key stripped');
  assert.equal(projected.unknown_future_key, undefined, 'unknown key stripped');
});

test('projector: SSD-wins suppresses total_pupils when SSD has student_community.total_pupils', () => {
  const ssd = { student_community: { total_pupils: 1200 } };
  const projected = projectNotionBackfill({ total_pupils: 1342, class_size: { senior: 14 } }, ssd);
  assert.equal(projected.total_pupils, undefined, 'SSD wins on total_pupils');
  assert.deepEqual(projected.class_size, { senior: 14 }, 'non-overlapping fields survive');
});

test('projector: SSD-wins suppresses boarder_count + intl_count when SSD has them', () => {
  const ssd = { student_community: { boarder_count: 380, intl_count: 60 } };
  const projected = projectNotionBackfill({ boarder_count: 412, intl_count: 87, heathrow_distance: 25 }, ssd);
  assert.equal(projected.boarder_count, undefined);
  assert.equal(projected.intl_count, undefined);
  assert.equal(projected.heathrow_distance, 25, 'heathrow survives — no SSD overlap');
});

test('projector: SSD-wins on GCSE + A-Level + entry-points', () => {
  const ssd = {
    exam_results: { gcse: { pct_7_to_9: 82 }, a_level: { pct_a_star_a: 78 } },
    admissions_format: { entry_points: ['11+', '13+'] },
  };
  const projected = projectNotionBackfill(
    {
      gcse_pct: 70,
      gcse_pct_alt_band: '66% (9-8)',
      a_level_pct: 65,
      lowest_boarding_entry: 7,
      class_size: { senior: 14 }, // unrelated; survives
    },
    ssd,
  );
  assert.equal(projected.gcse_pct, undefined, 'SSD wins on gcse_pct');
  assert.equal(projected.gcse_pct_alt_band, undefined, 'banded fallback also suppressed when SSD has gcse');
  assert.equal(projected.a_level_pct, undefined, 'SSD wins on a_level_pct');
  assert.equal(projected.lowest_boarding_entry, undefined, 'SSD wins on entry year when entry_points present');
  assert.deepEqual(projected.class_size, { senior: 14 });
});

test('projector: SSD-wins on boarding_pct via boarding_ratio alias too', () => {
  const ssd = { student_community: { boarding_ratio: 30 } };
  const projected = projectNotionBackfill({ boarding_pct: 28 }, ssd);
  assert.equal(projected, null, 'no fields survive when only boarding_pct was present + SSD has it');
});

test('projector: decimal boarding_pct (0.28) normalised to 28', () => {
  const projected = projectNotionBackfill({ boarding_pct: 0.28 }, null);
  assert.equal(projected.boarding_pct, 28, 'fraction normalised to percent');
});

test('projector: integer boarding_pct passes through unchanged', () => {
  const projected = projectNotionBackfill({ boarding_pct: 42 }, null);
  assert.equal(projected.boarding_pct, 42);
});

test('projector: integer-only entry year (rejects 7.5)', () => {
  const fractional = projectNotionBackfill({ lowest_boarding_entry: 7.5 }, null);
  assert.equal(fractional, null, 'non-integer entry year dropped → no surviving fields');

  const integer = projectNotionBackfill({ lowest_boarding_entry: 7 }, null);
  assert.equal(integer.lowest_boarding_entry, 7);

  const oob = projectNotionBackfill({ lowest_boarding_entry: 14 }, null);
  assert.equal(oob, null, 'out-of-range entry year dropped');
});

test('projector: NaN / non-finite / wrong-type numeric fields dropped', () => {
  const projected = projectNotionBackfill(
    {
      total_pupils: 'lots',
      boarder_count: NaN,
      intl_count: Infinity,
      a_level_pct: null,
      heathrow_distance: undefined,
    },
    null,
  );
  assert.equal(projected, null);
});

test('projector: class_size sub-fields filtered (only senior/sixth/average kept)', () => {
  const projected = projectNotionBackfill(
    {
      class_size: {
        senior: 15,
        sixth: 12,
        average: 14,
        unknown_band: 99,
        nested: { junk: true },
      },
    },
    null,
  );
  assert.deepEqual(projected.class_size, { senior: 15, sixth: 12, average: 14 });
});

test('projector: returns null when class_size has no valid sub-fields', () => {
  const projected = projectNotionBackfill({ class_size: { unknown: 99 } }, null);
  assert.equal(projected, null);
});

test('projector: GCSE banded fallback fires only when gcse_pct missing AND SSD has no gcse', () => {
  const onlyBand = projectNotionBackfill(
    { gcse_pct: null, gcse_pct_alt_band: '66% (9-8)' },
    null,
  );
  assert.equal(onlyBand.gcse_pct_alt_band, '66% (9-8)');
  assert.equal(onlyBand.gcse_pct, undefined);

  const bothPresent = projectNotionBackfill(
    { gcse_pct: 82, gcse_pct_alt_band: '66% (9-8)' },
    null,
  );
  assert.equal(bothPresent.gcse_pct, 82);
  assert.equal(bothPresent.gcse_pct_alt_band, undefined, 'numeric gcse_pct wins over banded');
});

test('renderer: integer-only entry year (rejects 7.5 at render boundary too)', () => {
  // Defensive: even if a caller bypasses the projector and passes
  // {lowest_boarding_entry: 7.5} directly, the renderer should reject it.
  const lines = renderNotionBackfillLines({ lowest_boarding_entry: 7.5 });
  const body = lines.join('\n');
  assert.doesNotMatch(body, /Year 7\.5/);
  assert.doesNotMatch(body, /Lowest boarding entry/);
});

test('renderer: decimal boarding_pct (0.28) renders as 28% via projector pass-through', () => {
  // The renderer re-projects belt-and-braces; decimal-as-fraction should be
  // normalised even if input arrives raw.
  const lines = renderNotionBackfillLines({ boarding_pct: 0.28 });
  assert.match(lines.join('\n'), /Boarding share: 28% of pupils/);
});

test('renderer: header omits [notion-curated] bracket-cite (Codex r1 P2 fix)', () => {
  const lines = renderNotionBackfillLines({ total_pupils: 1342 });
  assert.doesNotMatch(lines[0], /\[notion-curated\]/);
  assert.match(lines[0], /HAND-CURATED FACTS/);
});

// ───────────────────────────────────────────────────────────────────────────
// Codex r2 fixes — Heathrow SSD-wins, boundary leak via retrieve.js,
// boarding `<= 1` → `< 1` boundary, class_size range documentation.
// ───────────────────────────────────────────────────────────────────────────

test('projector r2: heathrow_distance suppressed when SSD has location_profile.heathrow_miles', () => {
  const ssd = { location_profile: { heathrow_miles: 22 } };
  const projected = projectNotionBackfill({ heathrow_distance: 25 }, ssd);
  assert.equal(projected, null);
});

test('projector r2: heathrow_distance suppressed when SSD airports[] has Heathrow by name + distance_km', () => {
  const ssd = {
    location_profile: {
      airports: [{ name: 'London Heathrow Airport', distance_km: 35 }],
    },
  };
  const projected = projectNotionBackfill({ heathrow_distance: 22 }, ssd);
  assert.equal(projected, null);
});

test('projector r2: heathrow_distance suppressed when SSD airports[] has LHR code + distance_miles', () => {
  const ssd = {
    location_profile: {
      airports: [{ code: 'LHR', distance_miles: 18 }],
    },
  };
  const projected = projectNotionBackfill({ heathrow_distance: 20 }, ssd);
  assert.equal(projected, null);
});

test('projector r2: heathrow_distance survives when SSD airports[] has Heathrow but only drive-time (no miles/km)', () => {
  // load-verdict-school-facts treats drive-time as complementary, not primary.
  const ssd = {
    location_profile: {
      airports: [{ name: 'Heathrow', drive_time_min_estimate: 45 }],
    },
  };
  const projected = projectNotionBackfill({ heathrow_distance: 30 }, ssd);
  assert.equal(projected.heathrow_distance, 30);
});

test('projector r2: heathrow_distance survives when SSD airports[] has Gatwick but no Heathrow', () => {
  const ssd = {
    location_profile: {
      airports: [{ name: 'Gatwick Airport', distance_miles: 12 }],
    },
  };
  const projected = projectNotionBackfill({ heathrow_distance: 45 }, ssd);
  assert.equal(projected.heathrow_distance, 45);
});

test('projector r2: boarding_pct=1 is NOT normalised (literal 1% stays 1%)', () => {
  // Codex r2 P2: strict `< 1` so literal 1 for "1%" stays 1%, not 100%.
  const projected = projectNotionBackfill({ boarding_pct: 1 }, null);
  assert.equal(projected.boarding_pct, 1);
});

test('projector r2: class_size range objects {min, max} are dropped (chat is scalar-only)', () => {
  // Codex r2 P2: documents the intentional limit. The Research Room seed
  // path supports range objects, but chat prose deliberately renders only
  // scalar senior/sixth/average values to avoid confusing the LLM with
  // ambiguous "class size ~{min}–{max}" phrasings.
  const projected = projectNotionBackfill(
    {
      class_size: {
        senior: { min: 12, max: 18 },
        sixth: { min: 8, max: 10 },
        average: { min: 14, max: 16 },
      },
    },
    null,
  );
  assert.equal(projected, null, 'range objects dropped → no surviving fields');
});

test('projector r2: class_size with mixed scalar + range keeps scalars only', () => {
  const projected = projectNotionBackfill(
    {
      class_size: {
        senior: 15,
        sixth: { min: 8, max: 10 },  // range — dropped
        average: 14,
      },
    },
    null,
  );
  assert.deepEqual(projected.class_size, { senior: 15, average: 14 });
});
