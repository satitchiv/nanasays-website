'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Step {
  field: string
  label: string
  question: string
  options: { value: string; label: string }[]
}

const STEPS: Step[] = [
  {
    field: 'child_year',
    label: 'Step 1 of 5',
    question: "What year group is your child entering?",
    options: [
      { value: 'year-7', label: 'Year 7 (age 11–12)' },
      { value: 'year-9', label: 'Year 9 (age 13–14)' },
      { value: 'year-10', label: 'Year 10 (age 14–15)' },
      { value: 'sixth-form', label: 'Sixth Form (age 16–18)' },
      { value: 'not-sure', label: "Not sure yet" },
    ],
  },
  {
    field: 'boarding_pref',
    label: 'Step 2 of 5',
    question: "Boarding or day school?",
    options: [
      { value: 'full', label: 'Full boarding (lives at school)' },
      { value: 'weekly', label: 'Weekly boarding (home at weekends)' },
      { value: 'flexi', label: 'Flexi boarding (a few nights a week)' },
      { value: 'day', label: 'Day only' },
      { value: 'open', label: "Open to either" },
    ],
  },
  {
    field: 'budget_range',
    label: 'Step 3 of 5',
    question: "What's your annual budget for fees?",
    options: [
      { value: 'under-30k', label: 'Under £30,000/yr' },
      { value: '30k-40k', label: '£30,000 – £40,000/yr' },
      { value: '40k-50k', label: '£40,000 – £50,000/yr' },
      { value: 'over-50k', label: 'Over £50,000/yr' },
      { value: 'bursary', label: "Looking for bursary support" },
    ],
  },
  {
    field: 'top_priority',
    label: 'Step 4 of 5',
    question: "What matters most to you in a school?",
    options: [
      { value: 'academic', label: 'Academic results and university placement' },
      { value: 'sport', label: 'Sport and physical development' },
      { value: 'pastoral', label: 'Pastoral care and wellbeing' },
      { value: 'arts', label: 'Arts, music or creative subjects' },
      { value: 'all-round', label: 'A genuine all-rounder' },
    ],
  },
  {
    field: 'home_region',
    label: 'Step 5 of 5',
    question: "Where are you based?",
    options: [
      { value: 'london', label: 'London' },
      { value: 'south-east', label: 'South East England' },
      { value: 'south-west', label: 'South West England' },
      { value: 'midlands', label: 'Midlands' },
      { value: 'north', label: 'North of England' },
      { value: 'scotland-wales', label: 'Scotland or Wales' },
      { value: 'overseas', label: 'Overseas / international family' },
    ],
  },
]

export default function OnboardingForm() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const current = STEPS[step]
  const selected = answers[current?.field]

  function select(value: string) {
    setAnswers(a => ({ ...a, [current.field]: value }))
  }

  async function next() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    } else {
      await save(answers)
    }
  }

  async function skip() {
    await save(answers)
  }

  async function save(data: Record<string, string>) {
    setSaving(true)
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, onboarding_complete: true }),
    })
    setSaving(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="onboarding-done">
        <div className="onboarding-done-icon">✅</div>
        <h2>You&apos;re all set</h2>
        <p>Nana will personalise every answer based on what you&apos;ve told us.</p>
        <button className="onboarding-btn-finish" onClick={() => router.push('/my-reports')}>
          Go to my schools →
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="onboarding-progress">
        {STEPS.map((_, i) => (
          <div key={i} className={`onboarding-progress-dot${i <= step ? ' active' : ''}`} />
        ))}
      </div>

      <div className="onboarding-step-label">{current.label}</div>
      <div className="onboarding-question">{current.question}</div>

      <div className="onboarding-options">
        {current.options.map(opt => (
          <button
            key={opt.value}
            className={`onboarding-option${selected === opt.value ? ' selected' : ''}`}
            onClick={() => select(opt.value)}
          >
            <span className="onboarding-option-check" />
            {opt.label}
          </button>
        ))}
      </div>

      <div className="onboarding-actions">
        {step > 0 ? (
          <button className="onboarding-btn-back" onClick={() => setStep(s => s - 1)}>
            ← Back
          </button>
        ) : (
          <span />
        )}
        <button
          className="onboarding-btn-next"
          onClick={next}
          disabled={!selected || saving}
        >
          {step === STEPS.length - 1 ? (saving ? 'Saving…' : 'Finish') : 'Next →'}
        </button>
      </div>

      <div className="onboarding-skip">
        <button onClick={skip}>Skip for now</button>
      </div>
    </>
  )
}
