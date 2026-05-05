// Shared schema for the 9 onboarding fields. The OnboardingForm reads
// this to render its step-by-step UI; the Research Room Brief tab uses
// the same data to display + format saved values. Keeping it in one
// place means Adding/renaming a field updates both surfaces.

export type OnboardingField = {
  field:    string
  short:    string  // 1-3 words for compact summaries (Brief tab)
  question: string  // full question text (form step)
  level:    'family' | 'child'  // family = one set per parent_profiles
                                 // child = one set per child (in child_profile JSONB)
  options:  { value: string; label: string }[]
}

export const ONBOARDING_FIELDS: OnboardingField[] = [
  {
    field: 'home_region',
    short: 'Where',
    question: 'Where are you based?',
    level: 'family',
    options: [
      { value: 'london',         label: 'London' },
      { value: 'south-east',     label: 'South East England' },
      { value: 'south-west',     label: 'South West England' },
      { value: 'midlands',       label: 'Midlands' },
      { value: 'north',          label: 'North of England' },
      { value: 'scotland-wales', label: 'Scotland or Wales' },
      { value: 'overseas',       label: 'Overseas / international family' },
    ],
  },
  {
    field: 'child_gender',
    short: 'Child',
    question: 'Is this for a son or a daughter?',
    level: 'child',
    options: [
      { value: 'boy',    label: 'A son — show boys-only and co-ed schools' },
      { value: 'girl',   label: 'A daughter — show girls-only and co-ed schools' },
      { value: 'either', label: 'Show me everything (co-ed only is fine)' },
    ],
  },
  {
    field: 'child_year',
    short: 'Year',
    question: 'What year group is your child entering?',
    level: 'child',
    options: [
      { value: 'year-7',     label: 'Year 7 (age 11–12)' },
      { value: 'year-9',     label: 'Year 9 (age 13–14)' },
      { value: 'year-10',    label: 'Year 10 (age 14–15)' },
      { value: 'sixth-form', label: 'Sixth Form (age 16–18)' },
      { value: 'not-sure',   label: 'Not sure yet' },
    ],
  },
  {
    field: 'boarding_pref',
    short: 'Boarding',
    question: 'Boarding or day school?',
    level: 'family',
    options: [
      { value: 'full',   label: 'Full boarding (lives at school)' },
      { value: 'weekly', label: 'Weekly boarding (home at weekends)' },
      { value: 'flexi',  label: 'Flexi boarding (a few nights a week)' },
      { value: 'day',    label: 'Day only' },
      { value: 'open',   label: 'Open to either' },
    ],
  },
  {
    field: 'budget_range',
    short: 'Budget',
    question: "What's your annual budget for fees?",
    level: 'family',
    options: [
      { value: 'under-30k', label: 'Under £30,000/yr' },
      { value: '30k-40k',   label: '£30,000 – £40,000/yr' },
      { value: '40k-50k',   label: '£40,000 – £50,000/yr' },
      { value: 'over-50k',  label: 'Over £50,000/yr' },
      { value: 'bursary',   label: 'Looking for bursary support' },
    ],
  },
  {
    field: 'curriculum_pref',
    short: 'Curriculum',
    question: 'Any curriculum preference?',
    level: 'family',
    options: [
      { value: 'a-level',       label: 'A-Level (the traditional UK route)' },
      { value: 'ib',            label: 'International Baccalaureate (IB)' },
      { value: 'either',        label: 'Either A-Level or IB is fine' },
      { value: 'no-preference', label: 'No preference — show me all' },
    ],
  },
  {
    field: 'top_priority',
    short: 'Priority',
    question: 'What matters most to you in a school?',
    level: 'child',
    options: [
      { value: 'academic',  label: 'Academic results and university placement' },
      { value: 'sport',     label: 'Sport and physical development' },
      { value: 'pastoral',  label: 'Pastoral care and wellbeing' },
      { value: 'arts',      label: 'Arts, music or creative subjects' },
      { value: 'all-round', label: 'A genuine all-rounder' },
    ],
  },
  {
    field: 'class_size_pref',
    short: 'Class size',
    question: 'How important is small class size?',
    level: 'child',
    options: [
      { value: 'very-important', label: 'Very important — smaller is better' },
      { value: 'nice-to-have',   label: 'Nice to have, not a dealbreaker' },
      { value: 'no-preference',  label: "Doesn't matter to me" },
    ],
  },
  {
    field: 'sen_need',
    short: 'SEN',
    question: 'Does your child have special learning needs?',
    level: 'child',
    options: [
      { value: 'yes-priority', label: 'Yes — I need schools with strong SEN support' },
      { value: 'no-concern',   label: "No, this doesn't apply" },
    ],
  },
]

export const FAMILY_FIELDS = ONBOARDING_FIELDS.filter(f => f.level === 'family')
export const CHILD_FIELDS  = ONBOARDING_FIELDS.filter(f => f.level === 'child')
export const CHILD_FIELD_NAMES = CHILD_FIELDS.map(f => f.field)

export function getOptionLabel(fieldName: string, value: string | null | undefined): string {
  if (!value) return '—'
  const field = ONBOARDING_FIELDS.find(f => f.field === fieldName)
  if (!field) return value
  const opt = field.options.find(o => o.value === value)
  return opt?.label ?? value
}

// Compact label for the Brief tab summary card. Strips parenthetical
// hints from the long form labels so the card stays tight.
export function getOptionShortLabel(fieldName: string, value: string | null | undefined): string {
  const full = getOptionLabel(fieldName, value)
  if (full === '—' || full === value) return full
  // 'Year 9 (age 13–14)' → 'Year 9'; 'A son — show boys-only…' → 'A son'
  return full.split(/\s[–—\(]/)[0].trim()
}
