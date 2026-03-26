'use client'

import { useState } from 'react'

export default function RegisterModal({ onClose }: { onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    firstName: '', email: '', jobTitle: '', school: '', country: '', message: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Send via mailto as fallback — replace with API endpoint post-launch
    const subject = encodeURIComponent('Register My School — NanaSays')
    const body = encodeURIComponent(
      `First name: ${form.firstName}\nEmail: ${form.email}\nJob title: ${form.jobTitle}\nSchool: ${form.school}\nCountry: ${form.country}\n\nMessage:\n${form.message}`
    )
    window.location.href = `mailto:satit@nanasays.school?subject=${subject}&body=${body}`
    setSubmitted(true)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(10,21,32,.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520,
          padding: '40px 40px 36px', position: 'relative',
          boxShadow: '0 24px 64px rgba(10,21,32,.22)',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)',
            background: 'var(--off)', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--muted)',
          }}
        >
          ×
        </button>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', background: 'var(--teal-bg)',
              border: '2px solid var(--teal)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 20px',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 20, fontWeight: 900, color: 'var(--navy)', marginBottom: 8 }}>
              Message sent
            </div>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, fontWeight: 300 }}>
              Thank you. Our School Partnerships Team will be in touch shortly.
            </p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 22, fontWeight: 900, color: 'var(--navy)', marginBottom: 8 }}>
                Book a chat with our team
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, fontWeight: 300 }}>
                Complete the form below and our School Partnerships Team will get back to you shortly.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>First name <span style={{ color: 'var(--teal)' }}>*</span></label>
                  <input name="firstName" required value={form.firstName} onChange={handleChange} style={inputStyle} placeholder="Jane" />
                </div>
                <div>
                  <label style={labelStyle}>Email <span style={{ color: 'var(--teal)' }}>*</span></label>
                  <input name="email" type="email" required value={form.email} onChange={handleChange} style={inputStyle} placeholder="jane@school.com" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Job title</label>
                <input name="jobTitle" value={form.jobTitle} onChange={handleChange} style={inputStyle} placeholder="Head of Admissions" />
              </div>
              <div>
                <label style={labelStyle}>School <span style={{ color: 'var(--teal)' }}>*</span></label>
                <input name="school" required value={form.school} onChange={handleChange} style={inputStyle} placeholder="School name" />
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <input name="country" value={form.country} onChange={handleChange} style={inputStyle} placeholder="e.g. United Kingdom" />
              </div>
              <div>
                <label style={labelStyle}>Want to tell us anything else?</label>
                <textarea
                  name="message" value={form.message} onChange={handleChange}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: "'Nunito Sans', sans-serif" }}
                  placeholder="Anything you'd like us to know before the call..."
                />
              </div>
              <button
                type="submit"
                style={{
                  marginTop: 4, padding: '13px 24px', borderRadius: 10,
                  background: 'var(--teal)', color: '#fff', border: 'none',
                  fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                  boxShadow: '0 4px 16px rgba(52,195,160,.25)',
                }}
              >
                Submit
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--navy)', marginBottom: 5,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 13px', borderRadius: 8,
  border: '1.5px solid var(--border)', fontSize: 13,
  color: 'var(--navy)', background: '#fff', outline: 'none',
  fontFamily: "'Nunito Sans', sans-serif",
  boxSizing: 'border-box',
}
