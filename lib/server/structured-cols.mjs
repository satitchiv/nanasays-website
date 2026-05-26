// Dimension-aware column selection for school_structured_data queries
// (Codex P1.2 2026-05-26).
//
// Extracted into a pure .mjs module so the contract test can import these
// helpers without dragging tools.js's transitive .ts dependencies (which
// node --test can't resolve). tools.js re-exports + uses these.
//
// See tools.js header for the design rationale; the short version:
// rankSchools / compareSchools used to fetch a 17-column ALL_STRUCTURED_COLS
// blob on every call, paying 25-30KB/school for sports_profile and up to
// ~30KB for subject_strengths regardless of which dim was being scored.
// Under unlocked Build Mode this was 3-5MB egress per call. Conservative
// fix: keep all SMALL columns in the always-fetched base set; gate the
// big JSONB columns behind dim-specific opt-in.

// Base columns — always fetched. Low collective bytes, low risk of
// regression because dims often read multiple small cols for citations /
// format / multi-signal scoring (e.g. fees_value reads fees_min,
// fees_max, fees_by_grade, scholarships_available, bursary_note).
//
// DO NOT prune this into per-dim sets without re-auditing every dim's
// row.* reads — the bandwidth saving is in the low-kB range vs. real
// risk of breaking dim.format() / dim.citations() that read fields not
// declared in `requires_field`. The big-JSONB columns gated by
// BIG_COLS_BY_DIM are where the actual ~3-5MB savings live (Codex r1
// P1.2 note 2026-05-26).
export const BASE_STRUCTURED_COLS = [
  'school_slug', 'exam_results', 'university_destinations',
  'fees_min', 'fees_max', 'fees_currency', 'fees_by_grade',
  'scholarships_available', 'bursary_note',
  'pastoral_model', 'pastoral_care', 'wellbeing_staffing',
  'policies_summary', 'student_community',
  // 2026-05-25 (proximity_to_heathrow): rankSchools needs location_profile
  // to score the new proximity_to_heathrow dimension (reads airports[]).
  'location_profile',
];

// Big JSONB columns — fetched only when a dim that reads them is requested.
// Keep the dim sets here in lockstep with which dims' rank() / format() /
// citations() actually read row.<col>; the contract test in
// tools-cols-contract.test.mjs catches drift.
export const BIG_COLS_BY_DIM = {
  sports_profile:    new Set(['tennis_strength', 'rugby_standing', 'football_strength', 'cricket_strength', 'hockey_strength']),
  subject_strengths: new Set(['subject_strengths']),
};

// Set of every column in BIG_COLS_BY_DIM — used by the contract test to
// answer "is this requires_field's root segment a big col?"
export const BIG_COLS = new Set(Object.keys(BIG_COLS_BY_DIM));

// Returns the SSD columns rankSchools should fetch for `dimensionName`.
// Always includes BASE_STRUCTURED_COLS; adds big cols only when the
// dimension reads them. Unknown / fact-loaded dims get base only.
export function colsForRankSchools(dimensionName) {
  const cols = [...BASE_STRUCTURED_COLS];
  for (const [col, dimSet] of Object.entries(BIG_COLS_BY_DIM)) {
    if (dimSet.has(dimensionName)) cols.push(col);
  }
  return cols;
}

// Returns the SSD columns compareSchools should fetch for a set of dims
// (union of each dim's needs). Multi-dim comparisons may pull both
// sports_profile + subject_strengths if both are in the dims list.
export function colsForCompareSchools(dimensionNames) {
  const cols = new Set(BASE_STRUCTURED_COLS);
  for (const name of dimensionNames || []) {
    for (const [col, dimSet] of Object.entries(BIG_COLS_BY_DIM)) {
      if (dimSet.has(name)) cols.add(col);
    }
  }
  return [...cols];
}
