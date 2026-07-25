export type SupportedComparison = {
  id: string
  label: string
  searchTerms: string[]
  patterns: RegExp[]
}

export type ResearchOnlyComparison = {
  id: string
  label: string
  searchTerms: string[]
  patterns: RegExp[]
}

export type ComparisonCatalogueEntry =
  | ({ kind: 'supported' } & SupportedComparison)
  | ({ kind: 'research_only' } & ResearchOnlyComparison)

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

// These are the parent-facing, data-backed comparison topics. The list is
// intentionally complete before shortlist coverage is applied: the client
// uses the same catalogue to explain what is ready, what needs checking, and
// what can be requested for future research.
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
    searchTerms: ['school fees', 'tuition', 'school cost', 'annual cost'],
    patterns: [
      /\bannual (fee|fees|cost)\b/,
      /\bschool (fee|fees|cost|costs)\b/,
      /\btuition\b/,
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
    searchTerms: ['A levels', 'sixth form results', 'A star to A grades', 'A* to A'],
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
    searchTerms: ['school size', 'number of pupils', 'pupil count', 'how big is the school'],
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
    searchTerms: ['where is the school', 'city', 'region', 'address'],
    patterns: [
      /\bschool location\b/,
      /\b(location|city|region|address) of (the )?school\b/,
      /\bwhere is (the )?school\b/,
      /^(location|city|region|address)$/,
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
  {
    id: 'boarding_fees',
    label: 'Boarding fees',
    searchTerms: ['boarding cost', 'residential fees', 'boarding tuition'],
    patterns: [
      /\bboarding (fee|fees|cost|costs)\b/,
      /\bresidential fees?\b/,
      /\bboarding tuition\b/,
    ],
  },
  {
    id: 'registration_fee',
    label: 'Registration fee',
    searchTerms: ['application fee', 'registration cost', 'joining fee'],
    patterns: [
      /\b(application|registration|joining) fee\b/,
      /\b(application|registration|joining) cost\b/,
    ],
  },
  {
    id: 'boarding_entry',
    label: 'Lowest boarding entry',
    searchTerms: ['earliest boarding entry', 'youngest boarding year', 'when can boarding start'],
    patterns: [
      /\blowest boarding entry\b/,
      /\bearliest boarding entry\b/,
      /\byoungest boarding (year|age)\b/,
      /\bwhen can boarding start\b/,
    ],
  },
  {
    id: 'university_destinations',
    label: 'University destinations',
    searchTerms: ['where leavers go', 'leavers destinations', 'university placements', 'Oxbridge'],
    patterns: [
      /\buniversity destinations?\b/,
      /\bleavers destinations?\b/,
      /\b(university|oxbridge) placements?\b/,
      /\bwhere (do|did) (pupils|students|leavers) go\b/,
    ],
  },
  {
    id: 'football_strength',
    label: 'Football competitive level and results',
    searchTerms: [
      'football',
      'soccer',
      'football strength',
      'strong football',
      'best football school',
      'football achievements',
      'soccer results',
      'football ranking',
      'how good is the football',
    ],
    patterns: [
      /\b(football|soccer)\b.*\b(strength|strong|stronger|best|good|success|achievements?|results?|rankings?|rank|cups?|troph(?:y|ies))\b/,
      /\b(strength|strong|stronger|best|good|success|achievements?|results?|rankings?|rank|cups?|troph(?:y|ies))\b.*\b(football|soccer)\b/,
    ],
  },
  {
    id: 'football_opportunities',
    label: 'Football teams and playing opportunities',
    searchTerms: [
      'football opportunities',
      'soccer opportunities',
      'football programme',
      'football teams',
      'football team count',
      'football on offer',
      'playing football',
    ],
    patterns: [
      /\b(football|soccer)\b.*\b(opportunit(?:y|ies)|programme|program|teams?|playing|offer|available|participation)\b/,
      /\b(opportunit(?:y|ies)|programme|program|teams?|playing|offer|available|participation)\b.*\b(football|soccer)\b/,
    ],
  },
  {
    id: 'football_development',
    label: 'Football coaching and elite pathway',
    searchTerms: [
      'football coaching',
      'football coach',
      'soccer coaching',
      'football academy',
      'football scholarship',
      'football pathway',
      'player development',
      'professional football pathway',
    ],
    patterns: [
      /\b(football|soccer)\b.*\b(coach|coaching|academy|scholarship|pathway|development|develop|professional|pro)\b/,
      /\b(coach|coaching|academy|scholarship|pathway|development|develop|professional|pro)\b.*\b(football|soccer)\b/,
    ],
  },
  {
    id: 'sports_opportunities',
    label: 'Sports opportunities',
    searchTerms: ['sports programme', 'sports facilities', 'sports achievements', 'sports results', 'teams and activities', 'athletics'],
    patterns: [
      /\bsports? (opportunities?|achievements?|results?)\b/,
      /\bsports? programme\b/,
      /\bsports? facilities\b/,
      /\bteams and activities\b/,
    ],
  },
  {
    id: 'curriculum_qualifications',
    label: 'Curriculum and qualifications',
    searchTerms: ['curriculum', 'qualifications offered', 'GCSE A Level IB', 'what pupils study'],
    patterns: [
      /\bcurriculum\b/,
      /\bqualifications? (offered|available)\b/,
      /\bwhat (do|can) (pupils|students|children) study\b/,
    ],
  },
  {
    id: 'admissions_assessment',
    label: 'Admissions tests and interviews',
    searchTerms: ['admissions process', 'entrance exam', 'entrance test', 'assessment', 'interview', 'UKiset', 'ISEB'],
    patterns: [
      /\badmissions? (process|assessment|assessments|test|tests|interview|interviews)\b/,
      /\bentrance (exam|exams|test|tests|assessment|assessments)\b/,
      /\b(application|entry) process\b/,
      /\b(ukiset|iseb|common pre test|common pretest)\b/,
    ],
  },
  {
    id: 'pastoral_wellbeing',
    label: 'Pastoral care model',
    searchTerms: ['pastoral care', 'house system', 'pupil care', 'pastoral structure', 'how pupils are supported'],
    patterns: [
      /\bpastoral (care|model|structure|system)\b/,
      /\bhouse system\b/,
      /\bhow (are|does) (pupils|students|the school).*\b(supported|care)\b/,
    ],
  },
  {
    id: 'wellbeing_team',
    label: 'Wellbeing and pupil support team',
    searchTerms: ['wellbeing team', 'mental health support', 'counsellors', 'counselling', 'pupil support staff'],
    patterns: [
      /\bwell ?being (team|staff|support)\b/,
      /\bmental health (team|staff|support|provision)\b/,
      /\b(counsellors?|counselling|pupil support staff)\b/,
    ],
  },
  {
    id: 'boarding_life',
    label: 'Boarding life',
    searchTerms: ['boarding experience', 'boarding houses', 'life as a boarder', 'residential life', 'dorm life'],
    patterns: [
      /\bboarding (life|experience|houses?|community)\b/,
      /\blife as a boarder\b/,
      /\b(residential|dorm) life\b/,
    ],
  },
  {
    id: 'music',
    label: 'Music and performing arts',
    searchTerms: ['music', 'musical', 'orchestra', 'choir', 'instrument', 'concert', 'drama', 'theatre', 'performing arts'],
    patterns: [
      /\b(music|musical|orchestra|choir|instrument|concert)\b/,
      /\b(performing arts|drama|theatre)\b/,
    ],
  },
  {
    id: 'clubs',
    label: 'Clubs and extracurricular activities',
    searchTerms: ['clubs', 'activities', 'extracurricular', 'extra curricular', 'co-curricular', 'after school activities'],
    patterns: [
      /\b(clubs?|extracurricular|extra curricular|co curricular|cocurricular)\b/,
      /\b(after school|school) activities\b/,
    ],
  },
  {
    id: 'facilities',
    label: 'School facilities',
    searchTerms: ['facilities', 'campus facilities', 'school buildings', 'pool', 'theatre facilities', 'music facilities', 'arts facilities', 'science facilities', 'laboratories'],
    patterns: [
      /\b(school|campus) facilities\b/,
      /\b(theatre|music|arts?|science|laborator(?:y|ies)) facilities\b/,
      /^facilities$/,
      /\bwhat facilities\b/,
    ],
  },
  {
    id: 'languages',
    label: 'Languages offered',
    searchTerms: ['languages', 'languages taught', 'French', 'Spanish', 'Mandarin', 'German', 'Latin'],
    patterns: [
      /\blanguages? (offered|available|taught)\b/,
      /\bwhat languages?\b/,
      /^languages?$/,
    ],
  },
  {
    id: 'scholarships',
    label: 'Scholarships',
    searchTerms: ['merit awards', 'scholarship programme', 'fee scholarships', 'academic scholarship', 'sports scholarship', 'music scholarship', 'drama scholarship'],
    patterns: [
      /\bscholarship (programme|programmes|program|programs|options|awards?)\b/,
      /\b(academic|sport|sports|art|arts|music|drama) scholarships?\b/,
      /^scholarships?$/,
    ],
  },
]

// These topics are deliberately visible in the same search surface, but are
// never presented as ready-to-add promises. They create a research request.
export const RESEARCH_ONLY_COMPARISONS: ResearchOnlyComparison[] = [
  {
    id: 'learning_support',
    label: 'Learning support',
    searchTerms: ['SEN', 'SEND', 'dyslexia', 'neurodiversity', 'additional learning needs'],
    patterns: [/\b(learning support|sen|send|dyslexia|neurodiversity|neurodiverse)\b/],
  },
  {
    id: 'saturday_school',
    label: 'Saturday school',
    searchTerms: ['weekend lessons', 'weekend school', 'Saturday lessons'],
    patterns: [/\b(saturday school|weekend lessons?|weekend school)\b/],
  },
  {
    id: 'class_sizes',
    label: 'Class sizes',
    searchTerms: ['class size', 'pupils per class', 'teacher ratio'],
    patterns: [/\b(class size|class sizes|pupils per class|teacher ratio)\b/],
  },
  {
    id: 'academic_performance',
    label: 'Academic performance',
    searchTerms: ['how academic', 'academically strong', 'academic culture'],
    patterns: [/\b(academic performance|how academic|academically strong|academic culture)\b/],
  },
]

export const COMPARISON_CATALOGUE: ComparisonCatalogueEntry[] = [
  ...SUPPORTED_COMPARISONS.map(item => ({ ...item, kind: 'supported' as const })),
  ...RESEARCH_ONLY_COMPARISONS.map(item => ({ ...item, kind: 'research_only' as const })),
]

export const SUPPORTED_COMPARISON_LABELS = SUPPORTED_COMPARISONS.map(item => item.label)
export const SUPPORTED_COMPARISON_IDS = SUPPORTED_COMPARISONS.map(item => item.id)
export const RESEARCH_ONLY_COMPARISON_LABELS = RESEARCH_ONLY_COMPARISONS.map(item => item.label)

const DATABASE_ONLY_COMPARISON_IDS = new Set([
  'football_strength',
  'football_opportunities',
  'football_development',
  'curriculum_qualifications',
  'admissions_assessment',
  'pastoral_wellbeing',
  'wellbeing_team',
  'boarding_life',
  'music',
  'clubs',
  'facilities',
  'languages',
  'scholarships',
])

/**
 * These topics deliberately use Nana's existing structured evidence first.
 * A partially covered shortlist can add a non-empty comparison row and queue
 * only the missing schools; the direct-research route must not crawl the web.
 */
export function isDatabaseOnlyComparison(id: string): boolean {
  return DATABASE_ONLY_COMPARISON_IDS.has(id)
}

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

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column]
      const cost = left[row - 1] === right[column - 1] ? 0 : 1
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + cost,
      )
      diagonal = above
    }
  }
  return previous[right.length]
}

function fuzzyTokenScore(query: string, candidate: string): number {
  if (query === candidate) return 1
  if (query.length > 2 && candidate.length < 3) return 0
  if (candidate.includes(query) || query.includes(candidate)) return 0.86
  const distance = editDistance(query, candidate)
  const threshold = query.length <= 4 ? 1 : Math.max(1, Math.floor(query.length * 0.4))
  if (distance > threshold) return 0
  return 1 - distance / Math.max(query.length, candidate.length)
}

const FUZZY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'can',
  'do',
  'does',
  'for',
  'how',
  'in',
  'is',
  'of',
  'or',
  'the',
  'to',
  'what',
  'where',
  'with',
])

function scoreCatalogueEntry(value: string, entry: ComparisonCatalogueEntry): number {
  const normalized = normalizeComparisonText(value)
  if (!normalized) return 0

  const queryWords = normalized.split(' ').filter(word => !FUZZY_STOP_WORDS.has(word))
  const phrases = [entry.label, ...entry.searchTerms].map(normalizeComparisonText)
  const exactLabel = normalizeComparisonText(entry.label)
  if (normalized === exactLabel) return 10_000

  let best = entry.patterns.some(pattern => pattern.test(normalized)) ? 8_500 : 0
  if (
    entry.id === 'scholarships'
    && /\bscholarships?\b/.test(normalized)
    && !/\b(football|soccer)\b/.test(normalized)
  ) {
    best = Math.max(best, 8_800)
  }
  if (
    entry.id === 'facilities'
    && /\bfacilit(y|ies)\b/.test(normalized)
    && !/\bsports?\b/.test(normalized)
  ) {
    best = Math.max(best, 8_800)
  }
  for (const phrase of phrases) {
    if (phrase === normalized) best = Math.max(best, 9_000)
    else if (phrase.startsWith(normalized)) best = Math.max(best, 8_000 - phrase.length)
    else if (phrase.includes(normalized)) best = Math.max(best, 7_000 - phrase.length)

    const candidateWords = phrase.split(' ').filter(word => !FUZZY_STOP_WORDS.has(word))
    if (queryWords.length === 0 || candidateWords.length === 0) continue
    const tokenScores = queryWords.map(word => Math.max(
      ...candidateWords.map(candidate => fuzzyTokenScore(word, candidate)),
    ))
    if (tokenScores.every(score => score > 0)) {
      const average = tokenScores.reduce((sum, score) => sum + score, 0) / tokenScores.length
      best = Math.max(best, 5_000 + average * 500 - Math.max(0, phrase.length - normalized.length))
    }
  }

  return best
}

export function findComparisonCatalogueSuggestions(
  value: string,
  allowedLabels?: string[],
): ComparisonCatalogueEntry[] {
  const allowed = allowedLabels ? new Set(allowedLabels) : null
  return COMPARISON_CATALOGUE
    .map((entry, index) => ({ entry, index, score: scoreCatalogueEntry(value, entry) }))
    .filter(item => (allowed ? allowed.has(item.entry.label) : true) && (!value.trim() || item.score > 0))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(item => item.entry)
}

export function findSupportedComparisonSuggestions(
  value: string,
  allowedLabels: string[] = SUPPORTED_COMPARISON_LABELS,
): SupportedComparison[] {
  return findComparisonCatalogueSuggestions(value, allowedLabels)
    .filter((entry): entry is SupportedComparison & { kind: 'supported' } => entry.kind === 'supported')
    .map(({ kind: _kind, ...entry }) => entry)
}

export function matchComparisonRequest(value: string): ComparisonRequestMatch {
  const normalized = normalizeComparisonText(value)
  if (!normalized) return { kind: 'research_request', canonicalTopic: 'Other comparison request' }

  if (
    /\b(music|instrument|piano|violin)\b.*\blessons?\b.*\b(fees?|costs?)\b/.test(normalized)
    || /\b(fees?|costs?)\b.*\b(music|instrument|piano|violin)\b.*\blessons?\b/.test(normalized)
  ) {
    return { kind: 'research_request', canonicalTopic: 'Music lesson fees' }
  }

  const exact = COMPARISON_CATALOGUE.find(entry => normalizeComparisonText(entry.label) === normalized)
  if (exact) {
    return exact.kind === 'supported'
      ? { kind: 'supported', id: exact.id, label: exact.label }
      : { kind: 'research_request', canonicalTopic: exact.label }
  }

  if (/\bscholarships?\b/.test(normalized) && !/\b(football|soccer)\b/.test(normalized)) {
    const scholarships = SUPPORTED_COMPARISONS.find(entry => entry.id === 'scholarships')
    if (scholarships) {
      return { kind: 'supported', id: scholarships.id, label: scholarships.label }
    }
  }
  if (/\bfacilit(y|ies)\b/.test(normalized) && !/\bsports?\b/.test(normalized)) {
    const facilities = SUPPORTED_COMPARISONS.find(entry => entry.id === 'facilities')
    if (facilities) {
      return { kind: 'supported', id: facilities.id, label: facilities.label }
    }
  }

  const patternSupported = SUPPORTED_COMPARISONS.find(entry =>
    entry.patterns.some(pattern => pattern.test(normalized)))
  if (patternSupported) {
    return { kind: 'supported', id: patternSupported.id, label: patternSupported.label }
  }

  const patternResearch = RESEARCH_ONLY_COMPARISONS.find(entry =>
    entry.patterns.some(pattern => pattern.test(normalized)))
  if (patternResearch) {
    return { kind: 'research_request', canonicalTopic: patternResearch.label }
  }

  const fuzzyMatch = findComparisonCatalogueSuggestions(value)[0]
  if (fuzzyMatch && scoreCatalogueEntry(value, fuzzyMatch) >= 5_000) {
    return fuzzyMatch.kind === 'supported'
      ? { kind: 'supported', id: fuzzyMatch.id, label: fuzzyMatch.label }
      : { kind: 'research_request', canonicalTopic: fuzzyMatch.label }
  }

  return {
    kind: 'research_request',
    canonicalTopic: cleanUnknownTopic(value),
  }
}
