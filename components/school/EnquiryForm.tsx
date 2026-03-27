'use client'

import { useState } from 'react'

interface Props {
  schoolId: string
  schoolName: string
}

const CHILD_AGES = [
  'Under 3', '3', '4', '5', '6', '7', '8', '9', '10', '11',
  '12', '13', '14', '15', '16', '17', '18',
]

const ENTRY_YEARS = ['2025', '2026', '2027', '2028', '2029', 'Not yet decided']

export default function EnquiryForm({ schoolId, schoolName }: Props) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', childAge: '', entryYear: '', message: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const navy = '#1B3252'
  const teal = '#34C3A0'
  const tealDk = '#239C80'
  const tealBg = '#E8FAF6'
  const border = '#E2E8F0'
  const muted = '#6B7280'
  const off = '#F6F8FA'

  async function submit() {
    if (!form.name || !form.email || !form.message) {
      setError('Please fill in your name, email and message.')
      return
    }
    setSending(true)
    setError('')
    const res = await fetch('/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        parent_name: form.name,
        parent_email: form.email,
        child_age: form.childAge || null,
        entry_year: form.entryYear || null,
        message: form.message,
      }),
    })
    setSending(false)
    if (res.ok) {
      setSent(true)
    } else {
      setError('Could not send your enquiry. Please try again.')
    }
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '13px 20px', borderRadius: 10,
          background: teal, color: '#fff', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Send enquiry
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520,
            padding: '36px 36px', position: 'relative',
            boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            {/* Close */}
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
                  Enquiry sent
                </h3>
                <p style={{ fontSize: 14, color: muted, lineHeight: 1.7 }}>
                  Your message has been sent to the admissions team at {schoolName}.
                  They will be in touch at {form.email}.
                </p>
              </div>
            ) : (
              <>
                <h3 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, marginBottom: 4 }}>
                  Enquire about {schoolName}
                </h3>
                <p style={{ fontSize: 13, color: muted, marginBottom: 24, lineHeight: 1.6 }}>
                  Your message goes directly to the school&apos;s admissions team.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Name */}
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
                        width: '100%', boxSizing: 'border-box',
                        border: `1.5px solid ${border}`, borderRadius: 9,
                        padding: '10px 14px', fontSize: 14, color: navy,
                        outline: 'none', fontFamily: "'Nunito Sans', sans-serif",
                      }}
                    />
                  </div>

                  {/* Email */}
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
                        width: '100%', boxSizing: 'border-box',
                        border: `1.5px solid ${border}`, borderRadius: 9,
                        padding: '10px 14px', fontSize: 14, color: navy,
                        outline: 'none', fontFamily: "'Nunito Sans', sans-serif",
                      }}
                    />
                  </div>

                  {/* Child age + entry year */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                        Child&apos;s current age
                      </label>
                      <select
                        value={form.childAge}
                        onChange={e => setForm(f => ({ ...f, childAge: e.target.value }))}
                        style={{
                          width: '100%', border: `1.5px solid ${border}`, borderRadius: 9,
                          padding: '10px 14px', fontSize: 13, color: form.childAge ? navy : muted,
                          outline: 'none', background: '#fff', fontFamily: "'Nunito Sans', sans-serif",
                        }}
                      >
                        <option value="">Select age</option>
                        {CHILD_AGES.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                        Target entry year
                      </label>
                      <select
                        value={form.entryYear}
                        onChange={e => setForm(f => ({ ...f, entryYear: e.target.value }))}
                        style={{
                          width: '100%', border: `1.5px solid ${border}`, borderRadius: 9,
                          padding: '10px 14px', fontSize: 13, color: form.entryYear ? navy : muted,
                          outline: 'none', background: '#fff', fontFamily: "'Nunito Sans', sans-serif",
                        }}
                      >
                        <option value="">Select year</option>
                        {ENTRY_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                      Your message <span style={{ color: teal }}>*</span>
                    </label>
                    <textarea
                      placeholder="We are relocating to Thailand in August and are looking for an IB school for our daughter..."
                      value={form.message}
                      onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                      rows={4}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        border: `1.5px solid ${border}`, borderRadius: 9,
                        padding: '10px 14px', fontSize: 14, color: navy, lineHeight: 1.6,
                        outline: 'none', resize: 'vertical', fontFamily: "'Nunito Sans', sans-serif",
                      }}
                    />
                  </div>

                  {error && (
                    <div style={{ fontSize: 12, color: '#c0392b' }}>{error}</div>
                  )}

                  <button
                    onClick={submit}
                    disabled={sending}
                    style={{
                      padding: '13px 20px', borderRadius: 10,
                      background: sending ? border : teal, color: sending ? muted : '#fff',
                      border: 'none', fontSize: 14, fontWeight: 800, cursor: sending ? 'default' : 'pointer',
                      fontFamily: 'Nunito, sans-serif',
                    }}
                  >
                    {sending ? 'Sending...' : 'Send enquiry'}
                  </button>
                  <p style={{ fontSize: 11, color: muted, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                    Your contact details are shared only with {schoolName}&apos;s admissions team.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
