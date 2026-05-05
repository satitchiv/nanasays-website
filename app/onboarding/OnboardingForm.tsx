'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ONBOARDING_FIELDS } from '@/lib/onboarding-fields'

type Props = {
  // Pre-fill values from parent_profiles when the parent revisits
  // /onboarding to edit. Empty object on first onboarding.
  initialAnswers?: Record<string, string>
}

const STEPS = ONBOARDING_FIELDS.map((f, i) => ({
  field: f.field,
  label: `Step ${i + 1} of ${ONBOARDING_FIELDS.length}`,
  question: f.question,
  options: f.options,
}))

export default function OnboardingForm({ initialAnswers = {} }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const isEditing = Object.keys(initialAnswers).length > 0
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
        <h2>{isEditing ? 'Preferences saved' : "You're all set"}</h2>
        <p>
          {isEditing
            ? 'Existing children keep their snapshots — new children will inherit these defaults.'
            : 'Nana will personalise every answer based on what you’ve told us.'}
        </p>
        <button className="onboarding-btn-finish" onClick={() => router.push('/nana/research-room')}>
          {isEditing ? 'Back to Research Room →' : 'See my schools →'}
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
          {step === STEPS.length - 1
            ? (saving ? 'Saving…' : (isEditing ? 'Save changes' : 'Finish'))
            : 'Next →'}
        </button>
      </div>

      <div className="onboarding-skip">
        <button onClick={skip}>{isEditing ? 'Cancel' : 'Skip for now'}</button>
      </div>
    </>
  )
}
