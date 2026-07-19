// Shared mock data for the three B-variant verdict mocks (b1, b2, b3).
// All three layouts import this so the data stays in sync — variants
// differ only in how the same content is arranged.
//
// NOT live data. Numbers are realistic placeholders for layout review.

import type { ReactNode } from 'react'

export type PathKey = 'A' | 'B' | 'C'

export type EvidenceItem = {
  row:         string
  value:       ReactNode
  sourceUrl?:  string
  sourceLabel: string
}

export type CostItem = {
  label:  string
  detail: ReactNode
}

export type PathFacts = {
  letter:        PathKey
  framing:       string                // "If sport is the priority"
  framingLong:   string                // tagline below framing
  schoolName:    string
  meta:          string                // "Worcestershire · co-ed · full boarding · A-level"

  // Quick-facts
  grades: {
    aLevelAStar:    string             // "61%"
    gcseTopGrades?: string             // "GCSE 9-7"
    ibAvg?:         string
    sourceUrl?:     string
  }
  location: {
    town:          string              // "Bromsgrove, Worcestershire"
    region:        string              // "Midlands"
    insideFilter:  boolean             // true if inside south-west
    mapsEmbed:     string              // iframe URL
    mapsExternal:  string              // user-facing maps link
    heathrowMiles: number
    heathrowDrive: string              // "~2h 5m drive"
  }
  students: {
    total:         string              // "~1,700"
    intlPct:       string              // "30%"
    boardersPct:   string              // "55%"
    dayPct:        string              // "45%"
    sourceUrl?:    string
  }
  safety: {
    headline: string                   // "Quiet town · low overall crime"
    detail:   string                   // 1-2 sentences of neutral context
    sourceUrl: string                  // police.uk link or similar
  }
  coed:        string                  // "Co-ed" / "Girls only" / "Boys only"
  curriculum:  string                  // "A-level" / "A-level + IB"
  fees: {
    annual:        string              // "£11,754–£54,342"
    registration?: string              // "£120"
    inBudget:      'fits' | 'partial' | 'over'  // for status pill
    note?:         string              // extra context
  }

  // Narrative + evidence
  reasoning:      ReactNode[]
  evidence:       EvidenceItem[]
  costs:          CostItem[]
  considerations: ReactNode[]          // "things to consider"
}

export const TILE_TAGLINE: Record<PathKey, string> = {
  A: 'Most decorated rugby school in your shortlist. National-strong programme. Trade-off: outside south-west, weaker academic base.',
  B: 'Only school scoring well on academics + sport + boarding together. Trade-off: Worcestershire, not south-west.',
  C: 'Closest of the ranked schools to your location filter. Trade-off: weaker academics; King’s Taunton may be the real Path C.',
}

export const PATHS: Record<PathKey, PathFacts> = {

  A: {
    letter:      'A',
    framing:     'If sport is the priority',
    framingLong: '…even though the parent note says the 5-year picture is academic',
    schoolName:  'Oakham School',
    meta:        'Rutland · co-ed · full boarding · A-level',
    grades: {
      aLevelAStar:   '38%',
      gcseTopGrades: '55% at 9-7',
      sourceUrl:     'https://www.oakham.rutland.sch.uk/academic/examination-results/',
    },
    location: {
      town:          'Oakham, Rutland',
      region:        'East Midlands · outside south-west filter',
      insideFilter:  false,
      mapsEmbed:     'https://maps.google.com/maps?q=Oakham%20School%2C%20Rutland&t=&z=13&ie=UTF8&iwloc=&output=embed',
      mapsExternal:  'https://maps.google.com/?q=Oakham%20School%2C%20Rutland',
      heathrowMiles: 110,
      heathrowDrive: '~2h 5m drive · no direct rail',
    },
    students: {
      total:        '~1,050',
      intlPct:      '15%',
      boardersPct:  '70%',
      dayPct:       '30%',
    },
    safety: {
      headline:  'Quiet market town · low overall crime',
      detail:    'Rutland consistently ranks among the lowest counties in England for total crime per 1,000 residents. Most incidents are anti-social behaviour, not violent crime. Safe environment for boarders.',
      sourceUrl: 'https://www.police.uk/pu/your-area/leicestershire-police/oakham/',
    },
    coed:        'Co-ed',
    curriculum:  'A-level',
    fees: {
      annual:        '£28,314 – £58,446 / year',
      registration:  '£180',
      inBudget:      'partial',
      note:          'Lower band inside budget, upper band well above £40k cap',
    },
    reasoning: [
      <>
        Oakham is the most decorated rugby school in your shortlist, by a clear margin. They were
        the <strong>U18 Schools Cup 2024 winner</strong> and <strong>U18 National Cup 2025
        finalist</strong> — back-to-back championship-level outcomes. Three teams reached national
        finals across other sports the same year.
      </>,
      <>
        A-level pathway + full boarding fit the brief structurally. Live-in pastoral staff, regular
        tutor contact. For a child whose top-priority box is ticked &quot;sport&quot; — even at
        recreational level — this is the most active sports environment in your list.
      </>,
    ],
    evidence: [
      {
        row: 'Rugby strength',
        value: <>&quot;National-strong&quot; — U18 Schools Cup 2024 winner, U18 National Cup 2025 finalist, three teams in national finals.</>,
        sourceUrl: 'https://www.oakham.rutland.sch.uk/news/three-oakham-school-teams-reach-national-finals/',
        sourceLabel: 'oakham.rutland.sch.uk · three-teams-national-finals',
      },
      {
        row: 'Recent cup record',
        value: <>U18 Schools Cup 2024 winner; 2025 finalist; U15 finalist.</>,
        sourceUrl: 'https://www.oakham.rutland.sch.uk/news/tigers-academy-continue-winning-streak-at-oakham/',
        sourceLabel: 'oakham.rutland.sch.uk · tigers-academy',
      },
      {
        row: 'Boarding house structure',
        value: <>Pastoral care + integrated houses, full boarding accepted.</>,
        sourceUrl: 'https://www.oakham.rutland.sch.uk/boarding-day/pastoral-care/',
        sourceLabel: 'oakham.rutland.sch.uk · pastoral-care',
      },
      {
        row: 'Registration fee',
        value: <>£180 — lowest in your shortlist.</>,
        sourceLabel: 'school-extracted fees data',
      },
    ],
    costs: [
      { label: 'Location',      detail: <>Rutland — outside your south-west location filter. 110 miles from Heathrow.</> },
      { label: 'Academic base', detail: <>GCSE 9-7 grades sit at 55%; A-level A*-A at 38%. Below Bromsgrove&apos;s 61%.</> },
      { label: 'Fees',          detail: <>£28,314 – £58,446 annual range. Upper band above £40k cap.</> },
    ],
    considerations: [
      <>If your location filter is firm, Path A fails it — Oakham is in the East Midlands.</>,
      <>Theo&apos;s rugby is described as &quot;recreational.&quot; A school whose identity is rugby pathway may push toward a level Theo doesn&apos;t want.</>,
      <>Travel from boarding home is unverified — confirm before half-term/exeats become a logistics issue.</>,
    ],
  },

  B: {
    letter:      'B',
    framing:     'If you want both, equal weight',
    framingLong: '…the balance the brief actually describes',
    schoolName:  'Bromsgrove School',
    meta:        'Worcestershire · co-ed · full boarding · A-level',
    grades: {
      aLevelAStar:   '61%',
      gcseTopGrades: '78% at 9-7',
      sourceUrl:     'https://www.bromsgrove-school.co.uk/academic-results',
    },
    location: {
      town:          'Bromsgrove, Worcestershire',
      region:        'West Midlands · outside south-west filter',
      insideFilter:  false,
      mapsEmbed:     'https://maps.google.com/maps?q=Bromsgrove%20School%2C%20Worcestershire&t=&z=13&ie=UTF8&iwloc=&output=embed',
      mapsExternal:  'https://maps.google.com/?q=Bromsgrove%20School%2C%20Worcestershire',
      heathrowMiles: 110,
      heathrowDrive: '~2h drive · direct rail Birmingham → Reading then car',
    },
    students: {
      total:        '~1,700',
      intlPct:      '30%',
      boardersPct:  '55%',
      dayPct:       '45%',
    },
    safety: {
      headline:  'Small market town · crime well below national average',
      detail:    'Bromsgrove sits comfortably below the national average across crime categories on police.uk data. Most reported incidents are minor property/anti-social. Calm boarding environment.',
      sourceUrl: 'https://www.police.uk/pu/your-area/west-mercia-police/bromsgrove/',
    },
    coed:        'Co-ed',
    curriculum:  'A-level',
    fees: {
      annual:        '£11,754 – £54,342 / year',
      registration:  '£120',
      inBudget:      'fits',
      note:          'Mid-range comfortably inside £30-40k budget',
    },
    reasoning: [
      <>
        Bromsgrove is the only school in your shortlist that scores well across{' '}
        <strong>academics, sport, and full boarding at the same time</strong>. Where Oakham wins on
        sport at the cost of academic ceiling, and where Bryanston wins on location at the cost of
        both, Bromsgrove is the school that asks Theo to compromise least on what the brief
        actually says — except for one thing.
      </>,
      <>
        Academically, <strong>61% of A-level grades are A*-A</strong> — strongest in your list by a
        clear margin (Bryanston 33%, Oakham 38%). For a &quot;strong academic university pathway,&quot;
        this is the school that materially supports the goal. On sport, Bromsgrove&apos;s rugby reads
        as national-strong — a genuine fit for recreational rugby at strong club-feeder level.
      </>,
      <>
        Full boarding offered with live-in houseparents and house-tutor teams; weekly tutor meetings
        standard. Fees sit mid-range within your £30-40k budget at boarding entry, upper band
        reaching senior years. Workable for Year 10 entry.
      </>,
    ],
    evidence: [
      {
        row: 'A-level A*–A',
        value: <>61% — the strongest in your shortlist.</>,
        sourceUrl: 'https://www.bromsgrove-school.co.uk/academic-results',
        sourceLabel: 'bromsgrove-school.co.uk · academic-results',
      },
      {
        row: 'Rugby strength',
        value: <>&quot;National-strong&quot; rugby programme.</>,
        sourceUrl: 'https://www.bromsgrove-school.co.uk/sports-centre',
        sourceLabel: 'bromsgrove-school.co.uk · sports-centre',
      },
      {
        row: 'Boarding house structure',
        value: <>Live-in houseparents, housemothers, and tutors; weekly tutor meetings.</>,
        sourceUrl: 'https://www.bromsgrove-school.co.uk/prep-school',
        sourceLabel: 'bromsgrove-school.co.uk · boarding',
      },
      {
        row: 'Annual boarding fee',
        value: <>£11,754 – £54,342 (year-aware mid-range inside £30-40k budget).</>,
        sourceLabel: 'school-extracted fees data',
      },
      {
        row: 'Registration fee',
        value: <>£120 — second-lowest in your shortlist.</>,
        sourceLabel: 'school-extracted fees data',
      },
    ],
    costs: [
      { label: 'Location', detail: <>Worcestershire — Midlands, not south-west. 110 miles from Heathrow. If your filter is firm, Path B doesn&apos;t win.</> },
    ],
    considerations: [
      <>If the south-west filter is firm, Bromsgrove fails it despite winning every other anchor.</>,
      <>30% international student body is the highest in your shortlist — could be a fit-positive (diverse network) or fit-negative (specific cultural feel). Worth a visit.</>,
      <>Day pupil ratio at 45% is meaningful for a boarder — confirm weekend culture before deciding.</>,
    ],
  },

  C: {
    letter:      'C',
    framing:     'If south-west is firm',
    framingLong: '…location outranks the other anchors',
    schoolName:  'Bryanston School',
    meta:        'Dorset · co-ed · full boarding · A-level + IB',
    grades: {
      aLevelAStar:   '33%',
      gcseTopGrades: '62% at 9-7',
      ibAvg:         '64% at 40+',
      sourceUrl:     'https://www.bryanston.co.uk/blog/pupils-achieve-excellent-a-level-results/',
    },
    location: {
      town:          'Blandford Forum, Dorset',
      region:        'South West England · inside filter',
      insideFilter:  true,
      mapsEmbed:     'https://maps.google.com/maps?q=Bryanston%20School%2C%20Blandford%20Forum&t=&z=13&ie=UTF8&iwloc=&output=embed',
      mapsExternal:  'https://maps.google.com/?q=Bryanston%20School%2C%20Blandford%20Forum',
      heathrowMiles: 120,
      heathrowDrive: '~2h 15m drive · no direct rail to Heathrow',
    },
    students: {
      total:        '~700',
      intlPct:      '20%',
      boardersPct:  '85%',
      dayPct:       '15%',
    },
    safety: {
      headline:  'Rural · very low crime for the region',
      detail:    'Blandford Forum is a small Dorset market town. Crime well below national average; most incidents are minor and rural. Very calm boarding setting, but limited urban amenities nearby.',
      sourceUrl: 'https://www.police.uk/pu/your-area/dorset-police/blandford-forum/',
    },
    coed:        'Co-ed',
    curriculum:  'A-level + IB',
    fees: {
      annual:        '£11,112 – £56,523 / year',
      registration:  '£300',
      inBudget:      'fits',
      note:          'Entry floor very accessible; upper band reaches senior years',
    },
    reasoning: [
      <>
        Bryanston is in Dorset, which is inside the south-west region. Among the
        comparison-ranked schools, it&apos;s the closest to your location filter. All pupils are
        fully integrated into boarding houses (every Bryanston pupil sits inside the boarding house
        system, including day pupils) — one of the strongest pastoral structures in your list on paper.
      </>,
      <>
        <strong>The important warning for Path C.</strong> The only school in your shortlist that&apos;s
        actually inside the south-west as understood literally is <strong>King&apos;s College Taunton</strong>.
        We&apos;ve parked it below because the comparison table has only 4 cells filled out of 52 — we
        can&apos;t compare it fairly yet. If Path C is your direction, research King&apos;s Taunton properly
        before locking Bryanston in.
      </>,
    ],
    evidence: [
      {
        row: 'Location',
        value: <>Blandford Forum, Dorset — inside south-west.</>,
        sourceLabel: 'school-extracted location data',
      },
      {
        row: 'Boarding house structure',
        value: <>&quot;All pupils integrated into boarding houses.&quot;</>,
        sourceUrl: 'https://www.bryanston.co.uk/staff-group/bryanston-school/',
        sourceLabel: 'bryanston.co.uk · staff-group',
      },
      {
        row: 'A-level + IB',
        value: <>33% A*–A at A-level; 64% IB 40+.</>,
        sourceUrl: 'https://www.bryanston.co.uk/blog/pupils-achieve-excellent-a-level-results/',
        sourceLabel: 'bryanston.co.uk · A-level results',
      },
      {
        row: 'Annual boarding fee',
        value: <>£11,112 – £56,523 (entry floor very accessible).</>,
        sourceLabel: 'school-extracted fees data',
      },
      {
        row: 'Rugby strength',
        value: <>SOCS rank 294/305 — well below national-strong tier.</>,
        sourceUrl: 'https://www.bryanstonsport.co.uk/Fixtures_Teams.asp?Id=61',
        sourceLabel: 'bryanstonsport.co.uk · fixtures',
      },
    ],
    costs: [
      { label: 'Academic ceiling', detail: <>33% A*-A at A-level vs Bromsgrove&apos;s 61%. IB route competitive (64% at 40+) but only if Theo takes IB instead of A-level.</> },
      { label: 'Rugby intensity',  detail: <>SOCS rank 294/305 — well outside what &quot;recreational&quot; expects in fixture quality.</> },
      { label: 'King’s Taunton',  detail: <>Bryanston wins Path C by default. The literal south-west school in your list isn&apos;t ranked yet.</> },
    ],
    considerations: [
      <>Research King&apos;s Taunton first — it might be the real Path C answer.</>,
      <>85% boarder ratio is the highest in your shortlist. Strong boarder culture; weekend community is rich.</>,
      <>Rural setting means limited urban amenities — fine for some families, isolating for others.</>,
    ],
  },

}
