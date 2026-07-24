export type SupportedComparison = {
  id: string
  label: string
  searchTerms: string[]
  patterns: RegExp[]
}

type ResearchTopic = {
  label: string
  patterns: RegExp[]
}

export type ComparisonRequestMatch =
  | {
      kind: 'supported'
      id: string
      label: string
    }
  | {
      kind: 'research_request'
      canonicalTopic: string
    }

export const SUPPORTED_COMPARISONS: SupportedComparison[] = [
  {
    id: 'airport_distance',
    label: 'Airport distance',
    searchTerms: ['nearest airport', 'airport travel time', 'Heathrow', 'Gatwick', 'LHR'],
    patterns: [
      /\bairport\b/,
      /\b(heathrow|gatwick|lhr)\b/,
    ],
  },
  {
    id: 'annual_fees',
    label: 'Annual fees',
    searchTerms: ['school fees', 'boarding fees', 'tuition', 'school cost'],
    patterns: [
      /\bannual (fee|fees|cost)\b/,
      /\bschool (fee|fees|cost|costs)\b/,
      /\btuition\b/,
      /\bboarding (fee|fees|cost|costs)\b/,
      /^(fee|fees|cost|costs)$/,
    ],
  },
  {
    id: 'bursaries',
    label: 'Bursaries',
    searchTerms: ['financial aid', 'financial help', 'means-tested support', 'fee assistance'],
    patterns: [
      /\bbursar(y|ies)\b/,
      /\bfinancial aid\b/,
      /\bmeans tested\b/,
      /\bfee assistance\b/,
    ],
  },
  {
    id: 'a_level_results',
    label: 'A-level results',
    searchTerms: ['A levels', 'sixth form results', 'A star to A grades'],
    patterns: [
      /\ba level(s)?\b/,
      /\balevel(s)?\b/,
      /\ba star to a\b/,
      /\bsixth form results\b/,
    ],
  },
  {
    id: 'gcse_results',
    label: 'GCSE results',
    searchTerms: ['GCSE grades', 'grades 9 to 7', 'academic results'],
    patterns: [
      /\bgcse(s)?\b/,
      /\bgrades? 9 to 7\b/,
      /\b9 to 7 grades?\b/,
    ],
  },
  {
    id: 'total_pupils',
    label: 'Total pupils',
    searchTerms: ['school size', 'number of pupils', 'pupil count'],
    patterns: [
      /\btotal pupils\b/,
      /\bnumber of pupils\b/,
      /\bpupil count\b/,
      /\bschool size\b/,
      /\bhow (big|large|small) is (the )?school\b/,
    ],
  },
  {
    id: 'school_location',
    label: 'School location',
    searchTerms: ['where is the school', 'city', 'region'],
    patterns: [
      /\bschool location\b/,
      /\b(location|city|region) of (the )?school\b/,
      /\bwhere is (the )?school\b/,
      /^(location|city|region)$/,
    ],
  },
  {
    id: 'school_type',
    label: 'School type',
    searchTerms: ['day or boarding', 'boarding type', 'girls school', 'boys school', 'co-ed'],
    patterns: [
      /\bschool type\b/,
      /\bboarding type\b/,
      /\bday or boarding\b/,
      /\b(full|weekly|flexi) boarding\b/,
      /\b(co ed|coed|girls school|boys school)\b/,
    ],
  },
]

const RESEARCH_TOPICS: ResearchTopic[] = [
  {
    label: 'Music opportunities and achievements',
    patterns: [/\b(music|musical|orchestra|choir|instrument|concert)\b/],
  },
  {
    label: 'Sports opportunities and achievements',
    patterns: [/\b(sport|sports|rugby|football|tennis|hockey|cricket|swimming|athletics)\b/],
  },
  {
    label: 'Learning support',
    patterns: [/\b(learning support|sen|send|dyslexia|neurodiversity|neurodiverse)\b/],
  },
  {
    label: 'University destinations',
    patterns: [/\b(university destinations?|leavers destinations?|oxbridge placements?)\b/],
  },
  {
    label: 'Saturday school',
    patterns: [/\b(saturday school|weekend lessons?|weekend school)\b/],
  },
  {
    label: 'Pastoral care and wellbeing',
    patterns: [/\b(pastoral|wellbeing|well being|mental health|pupil support)\b/],
  },
  {
    label: 'Class sizes',
    patterns: [/\b(class size|class sizes|pupils per class|teacher ratio)\b/],
  },
  {
    label: 'Scholarships',
    patterns: [/\b(scholarship|scholarships)\b/],
  },
  {
    label: 'Clubs and extracurricular activities',
    patterns: [/\b(clubs?|activities|extracurricular|extra curricular)\b/],
  },
  {
    label: 'Academic performance',
    patterns: [/\b(academic performance|academic results|how academic|academically strong)\b/],
  },
]

export const SUPPORTED_COMPARISON_LABELS = SUPPORTED_COMPARISONS.map(item => item.label)

function normalizeComparisonText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/a\*/g, 'a star ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanUnknownTopic(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ').slice(0, 60)
  if (!cleaned) return 'Other comparison request'
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`
}

export function findSupportedComparisonSuggestions(
  value: string,
  allowedLabels: string[] = SUPPORTED_COMPARISON_LABELS,
): SupportedComparison[] {
  const allowed = new Set(allowedLabels)
  const available = SUPPORTED_COMPARISONS.filter(item => allowed.has(item.label))
  const normalized = normalizeComparisonText(value)
  if (!normalized) return available

  const words = normalized.split(' ')
  return available.filter(item => {
    const haystack = normalizeComparisonText([item.label, ...item.searchTerms].join(' '))
    return haystack.includes(normalized)
      || words.every(word => haystack.includes(word))
      || item.patterns.some(pattern => pattern.test(normalized))
  })
}

export function matchComparisonRequest(value: string): ComparisonRequestMatch {
  const normalized = normalizeComparisonText(value)

  for (const item of SUPPORTED_COMPARISONS) {
    if (normalizeComparisonText(item.label) === normalized) {
      return { kind: 'supported', id: item.id, label: item.label }
    }
  }

  for (const item of SUPPORTED_COMPARISONS) {
    if (item.patterns.some(pattern => pattern.test(normalized))) {
      return { kind: 'supported', id: item.id, label: item.label }
    }
  }

  for (const topic of RESEARCH_TOPICS) {
    if (topic.patterns.some(pattern => pattern.test(normalized))) {
      return { kind: 'research_request', canonicalTopic: topic.label }
    }
  }

  return {
    kind: 'research_request',
    canonicalTopic: cleanUnknownTopic(value),
  }
}
