// Slice 2 placeholder data. The shape here mirrors what the slice-2 server
// fetch will eventually produce from shortlisted_schools × school_structured_data
// × school_sensitive. Swap the import in ResearchRoom.tsx when real data lands.

export type SchoolColumn = {
  slug: string
  name: string
  meta: string
}

export type RowCell =
  | { kind: 'value'; primary: string; sub?: string; numeric?: boolean }
  | { kind: 'lights'; lights: Array<{ label: string; tone: 'green' | 'amber' | 'red' }> }
  | { kind: 'empty' }

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
    cells: [
      { kind: 'value', primary: '£44,400', numeric: true, sub: 'Lowest in shortlist' },
      { kind: 'value', primary: '£52,260', numeric: true },
      { kind: 'value', primary: '£51,180', numeric: true },
      { kind: 'value', primary: '£46,500', numeric: true },
    ],
  },
  {
    id: 'a-star-a',
    label: 'A*–A',
    emphasis: 'A-level 2024',
    blurb: 'Share of grades at A* or A',
    cells: [
      { kind: 'value', primary: '62%', numeric: true },
      { kind: 'value', primary: '79%', numeric: true, sub: 'Highest in shortlist' },
      { kind: 'value', primary: '71%', numeric: true },
      { kind: 'value', primary: '65%', numeric: true },
    ],
  },
  {
    id: 'oxbridge',
    label: 'Oxbridge',
    emphasis: '3-yr average',
    blurb: 'Leavers placed at Oxford or Cambridge',
    cells: [
      { kind: 'value', primary: '11%', numeric: true },
      { kind: 'value', primary: '26%', numeric: true, sub: 'Highest in shortlist' },
      { kind: 'value', primary: '19%', numeric: true },
      { kind: 'value', primary: '14%', numeric: true },
    ],
  },
  {
    id: 'pastoral',
    label: 'House size',
    emphasis: '+ tutor ratio',
    blurb: 'Average girls per house · pupils per academic tutor',
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
