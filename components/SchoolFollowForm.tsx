'use client'
import { useState, useEffect } from 'react'
import { followSchool } from '@/app/actions/follow'

const OPTIONS = [
  {
    value: 'School news',
    label: 'School news',
    desc: 'Events, open days, results and direct updates from the school',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    value: 'Education news',
    label: 'Education news',
    desc: 'Fees, visas, admissions trends and policy changes that affect this school',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  },
]

interface Props {
  slug: string
  schoolName: string
  initialCount: number
}

type State = 'idle' | 'loading' | 'sent' | 'already' | 'error'

export default function SchoolFollowForm({ slug, schoolName, initialCount }: Props) {
  const [mounted, setMounted] = useState(false)
  const [email, setEmail] = useState('')
  const [interests, setInterests] = useState<string[]>(['School news', 'Education news'])
  const [state, setState] = useState<State>('idle')

  useEffect(() => setMounted(true), [])

  function toggleInterest(val: string) {
    setInterests(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || interests.length === 0) return
    setState('loading')
    const result = await followSchool(slug, email.trim(), interests, schoolName)
    if (result.status === 'confirmation_sent') setState('sent')
    else if (result.status === 'already_following') setState('already')
    else setState('error')
  }

  if (!mounted) return null

  if (state === 'sent') {
    return (
      <div style={{ padding: '20px 24px', background: '#d1fae5', borderRadius: 12, fontSize: 16, fontWeight: 600, color: '#065f46' }}>
        Check your email to confirm your subscription.
      </div>
    )
  }

  if (state === 'already') {
    return (
      <div style={{ padding: '20px 24px', background: '#dbeafe', borderRadius: 12, fontSize: 16, fontWeight: 600, color: '#1e40af' }}>
        You're already following {schoolName}.
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      {/* Two option cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {OPTIONS.map(opt => {
          const on = interests.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleInterest(opt.value)}
              style={{
                padding: '16px 18px',
                borderRadius: 12,
                border: `2px solid ${on ? 'var(--teal)' : 'rgba(52,195,160,.3)'}`,
                background: on ? 'rgba(52,195,160,.1)' : '#fff',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, color: on ? 'var(--teal-dk)' : 'var(--muted)' }}>
                {opt.icon}
                <span style={{ fontSize: 15, fontWeight: 700, color: on ? 'var(--teal-dk)' : 'var(--navy)' }}>
                  {opt.label}
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                {opt.desc}
              </p>
            </button>
          )
        })}
      </div>

      {/* Email + submit row */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            flex: 1,
            padding: '13px 16px',
            borderRadius: 10,
            border: '1px solid rgba(52,195,160,.4)',
            fontSize: 15,
            background: '#fff',
            color: 'var(--navy)',
          }}
        />
        <button
          type="submit"
          disabled={state === 'loading' || interests.length === 0}
          style={{
            padding: '13px 28px',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            background: 'var(--teal)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            opacity: state === 'loading' || interests.length === 0 ? 0.6 : 1,
          }}
        >
          {state === 'loading' ? 'Sending…' : 'Follow school'}
        </button>
      </div>

      {state === 'error' && (
        <p style={{ fontSize: 13, color: '#dc2626', marginTop: 10, margin: 0 }}>
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  )
}
