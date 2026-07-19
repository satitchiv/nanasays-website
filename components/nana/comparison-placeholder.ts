// Slice 2 placeholder data. The shape here mirrors what the slice-2 server
// fetch will eventually produce from shortlisted_schools × school_structured_data
// × school_sensitive. Swap the import in ResearchRoom.tsx when real data lands.

export type SchoolColumn = {
  slug: string
  name: string
  meta: string
  // Slice 8 Build 2b (2026-05-18): pre-joined display string of the
  // human-readable reasons stored on shortlisted_schools.match_reasons
  // ("boarding school · strong rugby · offers IB diploma"). Rendered as
  // an "Added because:" line under the school name in the comparison
  // column header. Null/undefined when the school has no match_reasons
  // row (legacy pre-Build-2 shortlist entries, or chat-added schools
  // whose best-effort reasons write failed).
  addedBecause?: string | null
  // Research Room redesign (data side, 2026-07-16): schools.hero_image /
  // schools.logo_url, so the comparison column header can show real school
  // imagery instead of the text-only "slice 2 placeholder" header. Undefined
  // when the school row has no image (older/thin school_slug records).
  heroImage?: string
  logoUrl?: string
}

// RRV-2 (never-blank table, 2026-07-20): rung the cell's value resolved at.
// 'verified' = read straight from a structured DB column. 'derived' = the
// value already carries its own provenance marker (a `~` prefix or a
// `source: 'derived: ...'` tag set by seed-rows.ts builders doing cross-
// column arithmetic, e.g. day pupils = total − boarders) — classified at
// load time, not a new data source. Undefined on legacy/pre-RRV-2 cells is
// treated as 'verified' by the renderer (safe default — most existing
// cells ARE plain verified reads).
export type CellTier = 'verified' | 'derived'

// RRV-6 (evidence chips, 2026-07-20): one quote-backed fact behind a cell's
// claim, sourced from school_facts (dimension-keyed atomic facts table —
// see lib/research-comparison.ts loadEvidenceIndex for the query + ranking
// this is built from). `url`/`hostLabel` are nullable — defensive, not
// currently exercised (every quote-bearing rugby fact today has a clean
// http(s) source_url), for malformed/missing source_url and non-http(s)
// protocols, which loadEvidenceIndex rejects before this type is built.
// `factLabel` is a humanized fact_type (e.g. "Match result"), never an
// invented category like "ISI report" — school_facts has no source_type
// column to ground that in. `older` marks currentness === 'historical' so
// a 2017 result doesn't read as current.
export type EvidenceQuote = {
  quote: string
  url: string | null
  hostLabel: string | null
  factLabel: string
  older: boolean
}

export type RowCell =
  | {
      kind: 'value'
      primary: string
      sub?: string
      // Pre-existing CSS-alignment flag ("is this a number, so right-align
      // it") — unrelated to `numericValue` below. Kept as-is; renamed the
      // new field to avoid colliding with this one.
      numeric?: boolean
      // Research Room redesign (data side, 2026-07-16): the raw numeric
      // value behind `primary` (e.g. 44400 for "£44,400", 62 for "62%"),
      // so the presentation layer can compute a row winner without parsing
      // the display string. Undefined for non-numeric / free-text cells.
      numericValue?: number
      tier?: CellTier
      // RRV-6: present only for rows wired in EVIDENCE_DIMENSION_BY_ROW_SLUG
      // (rugby_strength today) where school_facts had real quote-bearing
      // rows for this school. Undefined/empty means "no chip" — never a
      // fabricated zero-source chip.
      evidence?: EvidenceQuote[]
    }
  | { kind: 'lights'; lights: Array<{ label: string; tone: 'green' | 'amber' | 'red' }> }
  // RRV-2 rung 3: no verified/derived value exists for this school, but
  // enough shortlisted peers report it that a range is honest to show.
  // Never built from 'derived' or other 'cohort' cells — only rung-1
  // verified values count as cohort inputs (no compounding uncertainty).
  | { kind: 'cohort'; note: string }
  // RRV-2 rung 4: the floor of the ladder. No value, no peer range —
  // offer to ask Nana instead of a bare "—". `question` is a ready-to-send
  // prompt for the chat panel.
  | { kind: 'gap'; question: string }
  | { kind: 'empty' }

// Research Room redesign (data side, 2026-07-16): row-level "does a higher
// or lower value win" hint. Additive metadata on the row (NOT a new RowCell
// variant — widening the RowCell union risks breaking exhaustive switches
// in the Verdict tab / verdict generator that share these types). Explicit
// founder decision: fees/price rows are 'neutral' — cheapest isn't always
// "best" for every family. Free text / descriptive rows are 'neutral' too.
// Defaults to 'neutral' when unset (safer than guessing a direction wrong).
export type WinnerRule = 'higher-is-better' | 'lower-is-better' | 'neutral'

export type ComparisonRow = {
  id: string
  label: string
  emphasis?: string
  blurb?: string
  cells: RowCell[]
  // Slice 5.5: only chat-added rows are user-removable. Seeded General /
  // child_fit rows are part of the base comparison (a "Restore hidden rows"
  // affordance — slice 5.5f-bis — would be needed before making them
  // user-removable). Defaults to false.
  removable?: boolean
  // Slice 8 Step 0.6: optional group_name lets ComparisonView render
  // section headers (e.g. "For your child") between groups of rows.
  group_name?: string | null
  // R7-MUST-5 (verdict v3): when loaded for the Verdict tab, each school
  // column carries the underlying comparison_rows.id whose cell currently
  // wins after merge. Used by v3 path overlay narrative to attribute the
  // exact origin row when citing evidence. UI render tables ignore it.
  selectedCellOriginIdBySchool?: (string | undefined)[]
  // Research Room redesign (data side, 2026-07-16): see WinnerRule above.
  // Resolved by the loader (lib/research-comparison.ts) from the seeded
  // row's semantic meaning; defaults to 'neutral' when the row has no
  // known rule (e.g. a chat-added row).
  winnerRule?: WinnerRule
}

export type ComparisonData = {
  schools: SchoolColumn[]
  rows: ComparisonRow[]
}

const SCHOOLS: SchoolColumn[] = [
  { slug: 'st-marys-ascot', name: "St Mary's Ascot", meta: 'Berks · 6 houses' },
  { slug: 'wycombe-abbey', name: 'Wycombe Abbey', meta: 'Bucks · 11 houses' },
  { slug: 'cheltenham-ladies', name: "Cheltenham Ladies'", meta: 'Glos · 9 houses' },
  { slug: 'benenden-school', name: 'Benenden School', meta: 'Kent · 7 houses' },
]

const ROWS: ComparisonRow[] = [
  {
    id: 'fees-y9',
    label: 'Fees',
    emphasis: 'Year 9',
    blurb: 'Annual boarding rate, 2024–25',
    // Explicit founder decision: fees/price is 'neutral' — cheapest isn't
    // always "best" for every family, so no winner is marked on this row.
    winnerRule: 'neutral',
    cells: [
      { kind: 'value', primary: '£44,400', numeric: true, numericValue: 44400, sub: 'Lowest in shortlist' },
      { kind: 'value', primary: '£52,260', numeric: true, numericValue: 52260 },
      { kind: 'value', primary: '£51,180', numeric: true, numericValue: 51180 },
      { kind: 'value', primary: '£46,500', numeric: true, numericValue: 46500 },
    ],
  },
  {
    id: 'a-star-a',
    label: 'A*–A',
    emphasis: 'A-level 2024',
    blurb: 'Share of grades at A* or A',
    winnerRule: 'higher-is-better',
    cells: [
      { kind: 'value', primary: '62%', numeric: true, numericValue: 62 },
      { kind: 'value', primary: '79%', numeric: true, numericValue: 79, sub: 'Highest in shortlist' },
      { kind: 'value', primary: '71%', numeric: true, numericValue: 71 },
      { kind: 'value', primary: '65%', numeric: true, numericValue: 65 },
    ],
  },
  {
    id: 'oxbridge',
    label: 'Oxbridge',
    emphasis: '3-yr average',
    blurb: 'Leavers placed at Oxford or Cambridge',
    winnerRule: 'higher-is-better',
    cells: [
      { kind: 'value', primary: '11%', numeric: true, numericValue: 11 },
      { kind: 'value', primary: '26%', numeric: true, numericValue: 26, sub: 'Highest in shortlist' },
      { kind: 'value', primary: '19%', numeric: true, numericValue: 19 },
      { kind: 'value', primary: '14%', numeric: true, numericValue: 14 },
    ],
  },
  {
    id: 'pastoral',
    label: 'House size',
    emphasis: '+ tutor ratio',
    blurb: 'Average girls per house · pupils per academic tutor',
    // Mixed "count · ratio" free text, not a single comparable number —
    // default to neutral per the "if genuinely unsure" rule.
    winnerRule: 'neutral',
    cells: [
      { kind: 'value', primary: '~32 · 1:6', sub: 'Smallest houses' },
      { kind: 'value', primary: '~58 · 1:8' },
      { kind: 'value', primary: '~70 · 1:10' },
      { kind: 'value', primary: '~80 · 1:9' },
    ],
  },
  {
    id: 'sport',
    label: 'Sport intensity',
    blurb: 'Programme weight in week + weekend rhythm',
    winnerRule: 'neutral',
    cells: [
      { kind: 'value', primary: 'Participation' },
      { kind: 'value', primary: 'Strong but balanced' },
      { kind: 'value', primary: 'High · Saturday matches' },
      { kind: 'value', primary: 'All-round' },
    ],
  },
  {
    id: 'isi',
    label: 'ISI inspection',
    blurb: 'Most recent overall outcome',
    // Text tiers ("Excellent"/"Good"), not numerically scaled in this
    // placeholder set — neutral per the ISI guidance (only numerically
    // scaled inspection ratings get a direction).
    winnerRule: 'neutral',
    cells: [
      { kind: 'value', primary: 'Excellent', sub: '2023' },
      { kind: 'value', primary: 'Excellent', sub: '2022' },
      { kind: 'value', primary: 'Excellent', sub: '2024' },
      { kind: 'value', primary: 'Good', sub: '2023' },
    ],
  },
  {
    id: 'y9-entry',
    label: 'Y9 entry window',
    blurb: 'Application deadline for September 2027 entry',
    winnerRule: 'neutral',
    cells: [
      { kind: 'value', primary: "Open · Jan '27" },
      { kind: 'value', primary: "Open · Oct '26", sub: 'Earliest deadline' },
      { kind: 'value', primary: 'Rolling' },
      { kind: 'value', primary: "Open · Oct '26" },
    ],
  },
  {
    id: 'bursary',
    label: 'Bursary',
    blurb: 'Maximum means-tested fee remission',
    winnerRule: 'neutral',
    cells: [
      { kind: 'value', primary: 'Up to 50%', sub: 'Means-tested' },
      { kind: 'value', primary: 'Up to 100%' },
      { kind: 'value', primary: 'Up to 90%' },
      { kind: 'value', primary: 'Up to 100%' },
    ],
  },
  // four-light verdict row dropped after Codex review — its thresholds
  // were product opinions (small school = good pastoral, no bursary =
  // poor value, etc.), not neutral facts. Real fit-score lands in slice 4.
  {
    id: 'boarding',
    label: 'Boarding',
    blurb: 'Type · gender mix at Y9',
    winnerRule: 'neutral',
    cells: [
      { kind: 'value', primary: 'Full', sub: 'All girls' },
      { kind: 'value', primary: 'Full', sub: 'All girls' },
      { kind: 'value', primary: 'Full + day', sub: 'All girls' },
      { kind: 'value', primary: 'Full + day', sub: 'All girls' },
    ],
  },
]

export const PLACEHOLDER_DATA: ComparisonData = {
  schools: SCHOOLS,
  rows: ROWS,
}

export const EMPTY_DATA: ComparisonData = {
  schools: [],
  rows: [],
}
