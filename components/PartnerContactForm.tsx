'use client'

import { useState, useRef, useEffect } from 'react'
import ReCAPTCHA from 'react-google-recaptcha'

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 9,
  border: '1.5px solid #dce3ec',
  fontSize: 14,
  color: '#1B3252',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: '#1B3252',
  marginBottom: 6,
  letterSpacing: '0.03em',
}

export default function PartnerContactForm() {
  const [form, setForm] = useState({
    firstName: '', email: '', jobTitle: '', school: '', country: '', message: '', interest: '',
  })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const recaptchaRef = useRef<ReCAPTCHA>(null)

  useEffect(() => {
    setMounted(true)
    // Pre-select interest from URL param (?interest=demo|chat|register|other)
    const params = new URLSearchParams(window.location.search)
    const interest = params.get('interest')
    const map: Record<string, string> = {
      demo: "View demo",
      chat: "Let's chat",
      register: "Register school",
      other: "Others",
    }
    if (interest && map[interest]) {
      setForm(f => ({ ...f, interest: map[interest] }))
    }
  }, [])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    const recaptchaToken = recaptchaRef.current?.getValue()
    if (!recaptchaToken) {
      setStatus('error')
      setErrorMsg('Please complete the reCAPTCHA check.')
      return
    }

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, interest: form.interest || undefined, recaptchaToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unknown error')
      setStatus('sent')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      recaptchaRef.current?.reset()
    }
  }

  const focusStyle = (field: string): React.CSSProperties => ({
    ...inputStyle,
    borderColor: focusedField === field ? '#34C3A0' : '#dce3ec',
  })

  if (status === 'sent') {
    return (
      <div style={{
        background: 'var(--teal-bg)', border: '1.5px solid rgba(52,195,160,0.4)',
        borderRadius: 14, padding: '48px 40px', textAlign: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%', background: 'var(--teal)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 style={{
          fontFamily: 'var(--font-nunito), Nunito, sans-serif',
          fontSize: 22, fontWeight: 900, color: 'var(--navy)', marginBottom: 10,
        }}>
          Message sent
        </h3>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
          Thank you, {form.firstName}. We will be in touch shortly.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>I am interested in <span style={{ color: '#E53E3E' }}>*</span></label>
        <select
          required
          value={form.interest}
          onChange={e => setForm(f => ({ ...f, interest: e.target.value }))}
          onFocus={() => setFocusedField('interest')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...focusStyle('interest'),
            appearance: 'none' as const,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 14px center',
            paddingRight: 36,
            cursor: 'pointer',
            color: form.interest ? '#1B3252' : '#9CA3AF',
          }}
        >
          <option value="" disabled>Select an option...</option>
          <option value="View demo">View demo</option>
          <option value="Let's chat">Let&apos;s chat</option>
          <option value="Register school">Register school</option>
          <option value="Others">Others</option>
        </select>
      </div>

      <div className="ns-pp-form-row">
        <div>
          <label style={labelStyle}>First name <span style={{ color: '#E53E3E' }}>*</span></label>
          <input
            type="text"
            required
            value={form.firstName}
            onChange={set('firstName')}
            onFocus={() => setFocusedField('firstName')}
            onBlur={() => setFocusedField(null)}
            style={focusStyle('firstName')}
            placeholder="Jane"
          />
        </div>
        <div>
          <label style={labelStyle}>Email <span style={{ color: '#E53E3E' }}>*</span></label>
          <input
            type="email"
            required
            value={form.email}
            onChange={set('email')}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            style={focusStyle('email')}
            placeholder="jane@school.edu"
          />
        </div>
      </div>

      <div className="ns-pp-form-row">
        <div>
          <label style={labelStyle}>Job title</label>
          <input
            type="text"
            value={form.jobTitle}
            onChange={set('jobTitle')}
            onFocus={() => setFocusedField('jobTitle')}
            onBlur={() => setFocusedField(null)}
            style={focusStyle('jobTitle')}
            placeholder="Admissions Director"
          />
        </div>
        <div>
          <label style={labelStyle}>School <span style={{ color: '#E53E3E' }}>*</span></label>
          <input
            type="text"
            required
            value={form.school}
            onChange={set('school')}
            onFocus={() => setFocusedField('school')}
            onBlur={() => setFocusedField(null)}
            style={focusStyle('school')}
            placeholder="School name"
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Country</label>
        <input
          type="text"
          value={form.country}
          onChange={set('country')}
          onFocus={() => setFocusedField('country')}
          onBlur={() => setFocusedField(null)}
          style={focusStyle('country')}
          placeholder="e.g. Thailand, United Kingdom"
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Want to tell us anything else?</label>
        <textarea
          value={form.message}
          onChange={set('message')}
          onFocus={() => setFocusedField('message')}
          onBlur={() => setFocusedField(null)}
          style={{
            ...focusStyle('message'),
            minHeight: 100,
            resize: 'vertical',
          } as React.CSSProperties}
          placeholder="Tell us about your school, what you are looking for, or any questions you have..."
        />
      </div>

      <div style={{ marginBottom: 24, overflow: 'hidden' }}>
        {mounted && <ReCAPTCHA ref={recaptchaRef} sitekey={SITE_KEY} />}
      </div>

      {status === 'error' && (
        <div style={{
          background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8,
          padding: '12px 16px', fontSize: 13, color: '#c53030', marginBottom: 16,
        }}>
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        style={{
          padding: '14px 36px', borderRadius: 9, fontSize: 14, fontWeight: 800,
          background: status === 'sending' ? '#93c5c8' : 'var(--teal)',
          color: '#fff', border: 'none', cursor: status === 'sending' ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-nunito), Nunito, sans-serif', letterSpacing: '0.03em',
          transition: 'background 0.15s',
        }}
      >
        {status === 'sending' ? 'Sending...' : 'Send message'}
      </button>
    </form>
  )
}
