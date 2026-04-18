'use client'

import { useState } from 'react'

interface Props {
  schoolId: string
  schoolName: string
  schoolEmail: string
}

export default function RequestProspectusModal({ schoolId, schoolName, schoolEmail }: Props) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const navy  = '#1B3252'
  const teal  = '#34C3A0'
  const tealDk = '#239C80'
  const tealBg = '#E8FAF6'
  const border = '#E2E8F0'
  const muted  = '#6B7280'

  async function submit() {
    if (!form.name || !form.email) {
      setError('Please fill in your name and email.')
      return
    }
    setSending(true)
    setError('')
    const res = await fetch('/api/request-prospectus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        school_name: schoolName,
        school_email: schoolEmail,
        parent_name: form.name,
        parent_email: form.email,
      }),
    })
    setSending(false)
    if (res.ok) {
      setSent(true)
    } else {
      setError('Could not send your request. Please try again.')
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--off)', color: 'var(--navy)',
          border: '1px solid var(--border)',
          padding: '12px 22px', borderRadius: 8, fontSize: 14,
          fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        Request Prospectus
      </button>

      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div className="ns-modal-card" style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
            padding: '36px', position: 'relative',
            boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
          }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                position: 'absolute', top: 16, right: 16, background: 'none',
                border: 'none', cursor: 'pointer', color: muted, padding: 4,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>

            {sent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', background: tealBg,
                  border: '2px solid rgba(52,195,160,0.4)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={tealDk} strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h3 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: navy, marginBottom: 12 }}>
                  Request sent
                </h3>
                <p style={{ fontSize: 14, color: muted, lineHeight: 1.7 }}>
                  {schoolName} has been notified and will send their prospectus to {form.email} directly.
                </p>
              </div>
            ) : (
              <>
                <h3 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, marginBottom: 4 }}>
                  Request the {schoolName} Prospectus
                </h3>
                <p style={{ fontSize: 13, color: muted, marginBottom: 24, lineHeight: 1.6 }}>
                  Enter your details and we will notify the school to send their prospectus directly to you.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                      Your name <span style={{ color: teal }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Sarah Chen"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      style={{
                        width: '100%', boxSizing: 'border-box' as const,
                        border: `1.5px solid ${border}`, borderRadius: 9,
                        padding: '10px 14px', fontSize: 14, color: navy,
                        outline: 'none', fontFamily: "'Nunito Sans', sans-serif",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                      Email address <span style={{ color: teal }}>*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="sarah@example.com"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      style={{
                        width: '100%', boxSizing: 'border-box' as const,
                        border: `1.5px solid ${border}`, borderRadius: 9,
                        padding: '10px 14px', fontSize: 14, color: navy,
                        outline: 'none', fontFamily: "'Nunito Sans', sans-serif",
                      }}
                    />
                  </div>

                  {error && <div style={{ fontSize: 12, color: '#c0392b' }}>{error}</div>}

                  <button
                    onClick={submit}
                    disabled={sending}
                    style={{
                      padding: '13px 20px', borderRadius: 10,
                      background: sending ? border : teal, color: sending ? muted : '#fff',
                      border: 'none', fontSize: 14, fontWeight: 800,
                      cursor: sending ? 'default' : 'pointer',
                      fontFamily: 'Nunito, sans-serif',
                    }}
                  >
                    {sending ? 'Sending...' : 'Send request'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
