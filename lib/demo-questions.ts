export interface DemoQuestion {
  id: string
  emoji: string
  label: string
  question: string
  isComparison?: boolean
  comparisonSlugs?: string[]
}

export interface DemoAnswerSection {
  short_answer?: string
  confirmed_facts?: string
  what_this_means?: string
  tradeoff?: string
  what_we_dont_know?: string
}

export interface DemoComparisonTable {
  /* Single-school table format */
  headers?: string[]
  rows?: Array<{ label: string; values: string[] } | string[]>
  /* Multi-school comparison format */
  title?: string
  columns?: string[]
  footer?: string | null
}

export interface DemoAnswer {
  sections: DemoAnswerSection
  confidence: 'high' | 'medium' | 'low' | 'none'
  comparison_table?: DemoComparisonTable | null
  follow_ups?: string[]
  tour_question?: string | null
  tour_target?: string | null
}

export interface DemoAnswerFile {
  school_slug: string
  school_name: string
  generated_at: string
  answers: Record<string, DemoAnswer>
}

export const DEMO_QUESTIONS: Record<string, DemoQuestion[]> = {
  'queen-ethelburgas-collegiate': [
    {
      id: 'fees',
      emoji: '💷',
      label: 'Fees & funding',
      question: "What are the total annual fees at Queen Ethelburga's including boarding — and what financial support is available?",
    },
    {
      id: 'academic',
      emoji: '🎓',
      label: 'A-levels & university',
      question: "How strong are the A-level results at QE, and where do students typically go to university?",
    },
    {
      id: 'verdict',
      emoji: '⭐',
      label: 'Overall verdict',
      question: "Give me your honest overall verdict on Queen Ethelburga's — what kind of student genuinely thrives here?",
    },
    {
      id: 'compare',
      emoji: '⚖️',
      label: 'Compare 3 schools',
      question: "Compare Queen Ethelburga's, Repton School and Uppingham School for a sporty, well-rounded child — which is the better fit?",
      isComparison: true,
      comparisonSlugs: ['repton-school', 'uppingham-school'],
    },
    {
      id: 'trust',
      emoji: '🔍',
      label: 'ISI & financials',
      question: "What did the ISI inspection actually find at Queen Ethelburga's, and are there any financial red flags parents should know about?",
    },
  ],
}

export function getDemoQuestions(slug: string): DemoQuestion[] {
  return DEMO_QUESTIONS[slug] ?? []
}
