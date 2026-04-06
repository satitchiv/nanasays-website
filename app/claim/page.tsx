'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface SchoolResult {
  id: string
  slug: string
  name: string
  city: string | null
  country: string | null
  is_partner: boolean | null
  is_claimed: boolean
}

type Step = 'search' | 'form' | 'sent'

export default function ClaimPage() {
  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SchoolResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(null)
  const [form, setForm] = useState({ firstName: '', email: '', jobTitle: '', country: '', message: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [contactOpen, setContactOpen] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' })
  const [contactSending, setContactSending] = useState(false)
  const [contactSent, setContactSent] = useState(false)
  const [contactError, setContactError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('schools')
        .select('id,slug,name,city,country,is_partner,is_claimed:admin_email')
        .ilike('name', `%${query.trim()}%`)
        .order('confidence_score', { ascending: false })
        .limit(8)
      setResults((data ?? []) as SchoolResult[])
      setSearching(false)
    }, 300)
  }, [query])

  function selectSchool(school: SchoolResult) {
    setSelectedSchool(school)
    setResults([])
    setQuery('')
    setError('')
    setStep('form')
  }

  async function submitForm() {
    if (!selectedSchool || !form.firstName.trim() || !form.email.trim()) {
      setError('Please fill in your name and email.')
      return
    }
    setSending(true)
    setError('')
    const res = await fetch('/api/claim-enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: form.firstName.trim(),
        email: form.email.trim(),
        job_title: form.jobTitle.trim() || null,
        school_name: selectedSchool.name,
        country: form.country.trim() || null,
        message: form.message.trim() || null,
      }),
    })
    setSending(false)
    if (res.ok) {
      setStep('sent')
    } else {
      setError('Could not send your request. Please try again.')
    }
  }

  async function submitContact() {
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      setContactError('Please fill in all fields.')
      return
    }
    setContactSending(true)
    setContactError('')
    const res = await fetch('/api/general-enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_name: contactForm.name.trim(),
        parent_email: contactForm.email.trim(),
        school_name: 'Not listed — school addition request',
        message: contactForm.message.trim(),
      }),
    })
    setContactSending(false)
    if (res.ok) {
      setContactSent(true)
    } else {
      setContactError('Could not send. Please try again.')
    }
  }

  const navy = '#1B3252'
  const teal = '#34C3A0'
  const tealDk = '#239C80'
  const tealBg = '#E8FAF6'
  const off = '#F6F8FA'
  const border = '#E2E8F0'
  const muted = '#6B7280'

  return (
    <>
      <Nav />
      <div style={{ marginTop: 64, minHeight: 'calc(100vh - 64px)', background: off, padding: '72px 5% 80px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{
              display: 'inline-block', background: tealBg, border: `1px solid rgba(52,195,160,0.3)`,
              color: tealDk, fontSize: 11, letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '5px 16px', borderRadius: 100, marginBottom: 20,
            }}>
              For Schools
            </div>
            <h1 style={{
              fontFamily: 'Nunito, sans-serif', fontSize: 'clamp(28px, 5vw, 40px)',
              fontWeight: 900, color: navy, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 14,
            }}>
              Claim your school
            </h1>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.7, maxWidth: 440, margin: '0 auto' }}>
              Find your school in the NanaSays directory, verify your email, and access your school portal in under 5 minutes.
            </p>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 36 }}>
            {(['search', 'form', 'sent'] as Step[]).map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: step === s ? navy : ((['search', 'form', 'sent'] as Step[]).indexOf(step) > i ? teal : border),
                  color: step === s ? '#fff' : ((['search', 'form', 'sent'] as Step[]).indexOf(step) > i ? '#fff' : muted),
                  fontSize: 11, fontWeight: 800,
                }}>
                  {(['search', 'form', 'sent'] as Step[]).indexOf(step) > i
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    : i + 1}
                </div>
                {i < 2 && <div style={{ width: 32, height: 1, background: border }} />}
              </div>
            ))}
          </div>

          {/* Card */}
          <div style={{
            background: '#fff', border: `1px solid ${border}`, borderRadius: 16,
            padding: '36px 36px', boxShadow: '0 2px 24px rgba(0,0,0,0.06)',
          }}>

            {/* STEP: search */}
            {step === 'search' && (
              <>
                <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, marginBottom: 8 }}>
                  Find your school
                </h2>
                <p style={{ fontSize: 13, color: muted, marginBottom: 24, lineHeight: 1.6 }}>
                  Search by school name. We have 4,200+ international schools listed.
                </p>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="e.g. Bangkok Patana School"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      border: `1.5px solid ${border}`, borderRadius: 10,
                      padding: '12px 16px', fontSize: 14, color: navy,
                      outline: 'none', fontFamily: "'Nunito Sans', sans-serif",
                    }}
                  />
                  {searching && (
                    <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: muted, fontSize: 12 }}>
                      Searching...
                    </div>
                  )}
                </div>

                {results.length > 0 && (
                  <div style={{
                    marginTop: 8, border: `1px solid ${border}`, borderRadius: 10,
                    overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                  }}>
                    {results.map(school => (
                      <button
                        key={school.id}
                        onClick={() => selectSchool(school)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '14px 16px',
                          background: '#fff',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 12, border: 'none', borderBottom: `1px solid ${border}`,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: navy, fontFamily: 'Nunito, sans-serif' }}>
                            {school.name}
                          </div>
                          <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
                            {[school.city, school.country].filter(Boolean).join(', ')}
                          </div>
                        </div>
                        {school.is_partner && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, color: tealDk, background: tealBg,
                            border: `1px solid rgba(52,195,160,0.3)`, borderRadius: 100,
                            padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0,
                          }}>
                            Partner
                          </span>
                        )}
                        {school.is_claimed && !school.is_partner && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, color: muted, background: off,
                            border: `1px solid ${border}`, borderRadius: 100,
                            padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0,
                          }}>
                            Claimed
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {query.length >= 2 && !searching && results.length === 0 && (
                  <div style={{ marginTop: 12, fontSize: 13, color: muted, textAlign: 'center' }}>
                    No schools found for &ldquo;{query}&rdquo;.{' '}
                    <button
                      onClick={() => { setContactOpen(true); setContactSent(false); setContactError('') }}
                      style={{ background: 'none', border: 'none', color: tealDk, cursor: 'pointer', fontSize: 13, textDecoration: 'underline', padding: 0 }}
                    >
                      Contact us
                    </button>
                    {' '}to add your school.
                  </div>
                )}
              </>
            )}

            {/* STEP: form */}
            {step === 'form' && selectedSchool && (
              <>
                {/* Selected school chip */}
                <div style={{
                  background: tealBg, border: `1px solid rgba(52,195,160,0.3)`,
                  borderRadius: 10, padding: '12px 16px', marginBottom: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif' }}>{selectedSchool.name}</div>
                    <div style={{ fontSize: 11, color: tealDk, marginTop: 2 }}>{[selectedSchool.city, selectedSchool.country].filter(Boolean).join(', ')}</div>
                  </div>
                  <button
                    onClick={() => { setStep('search'); setSelectedSchool(null); setError('') }}
                    style={{ fontSize: 11, color: muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}
                  >
                    Change
                  </button>
                </div>

                <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, marginBottom: 8 }}>
                  Your details
                </h2>
                <p style={{ fontSize: 13, color: muted, marginBottom: 24, lineHeight: 1.6 }}>
                  Tell us a bit about yourself. We will be in touch within one working day.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Name + Email row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                        First name <span style={{ color: teal }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Jane"
                        value={form.firstName}
                        onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                        autoFocus
                        style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${border}`, borderRadius: 9, padding: '10px 14px', fontSize: 14, color: navy, outline: 'none', fontFamily: "'Nunito Sans', sans-serif" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                        Email <span style={{ color: teal }}>*</span>
                      </label>
                      <input
                        type="email"
                        placeholder="jane@school.edu"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${border}`, borderRadius: 9, padding: '10px 14px', fontSize: 14, color: navy, outline: 'none', fontFamily: "'Nunito Sans', sans-serif" }}
                      />
                    </div>
                  </div>

                  {/* Job title + Country row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>Job title</label>
                      <input
                        type="text"
                        placeholder="Admissions Director"
                        value={form.jobTitle}
                        onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                        style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${border}`, borderRadius: 9, padding: '10px 14px', fontSize: 14, color: navy, outline: 'none', fontFamily: "'Nunito Sans', sans-serif" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>Country</label>
                      <input
                        type="text"
                        placeholder="e.g. Thailand"
                        value={form.country}
                        onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                        style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${border}`, borderRadius: 9, padding: '10px 14px', fontSize: 14, color: navy, outline: 'none', fontFamily: "'Nunito Sans', sans-serif" }}
                      />
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                      Anything you want us to know? <span style={{ color: muted, fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      placeholder="Tell us about your school or any questions you have..."
                      value={form.message}
                      onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                      rows={3}
                      style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${border}`, borderRadius: 9, padding: '10px 14px', fontSize: 14, color: navy, outline: 'none', resize: 'vertical', fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.6 }}
                    />
                  </div>

                  {error && <div style={{ fontSize: 12, color: '#c0392b' }}>{error}</div>}

                  <button
                    onClick={submitForm}
                    disabled={sending}
                    style={{
                      width: '100%', padding: '13px 20px', borderRadius: 10,
                      background: sending ? border : teal,
                      color: sending ? muted : '#fff',
                      border: 'none', fontSize: 14, fontWeight: 800, cursor: sending ? 'default' : 'pointer',
                      fontFamily: 'Nunito, sans-serif',
                    }}
                  >
                    {sending ? 'Sending...' : 'Submit claim request'}
                  </button>
                </div>
              </>
            )}

            {/* STEP: sent */}
            {step === 'sent' && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', background: tealBg,
                  border: `2px solid rgba(52,195,160,0.4)`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 20px',
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tealDk} strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: navy, marginBottom: 12 }}>
                  Request received
                </h2>
                <p style={{ fontSize: 14, color: muted, lineHeight: 1.75, maxWidth: 380, margin: '0 auto 8px' }}>
                  We will be in touch shortly at {form.email}.
                </p>
                <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
                  Our team typically responds within one working day.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
      <Footer />

      {/* Contact modal — school not found */}
      {contactOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setContactOpen(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
            padding: '36px 32px', position: 'relative',
            boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <button
              onClick={() => setContactOpen(false)}
              style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 4 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>

            {contactSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%', background: tealBg,
                  border: `2px solid rgba(52,195,160,0.4)`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tealDk} strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <h3 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, marginBottom: 10 }}>
                  Message sent
                </h3>
                <p style={{ fontSize: 14, color: muted, lineHeight: 1.7 }}>
                  We will be in touch at {contactForm.email}.
                </p>
              </div>
            ) : (
              <>
                <h3 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, marginBottom: 4 }}>
                  Can&apos;t find your school?
                </h3>
                <p style={{ fontSize: 13, color: muted, marginBottom: 24, lineHeight: 1.6 }}>
                  Tell us the school name and we will add it to the directory.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                      Your name <span style={{ color: teal }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Jane Smith"
                      value={contactForm.name}
                      onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                      autoFocus
                      style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${border}`, borderRadius: 9, padding: '10px 14px', fontSize: 14, color: navy, outline: 'none', fontFamily: "'Nunito Sans', sans-serif" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                      Email <span style={{ color: teal }}>*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="jane@school.edu"
                      value={contactForm.email}
                      onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                      style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${border}`, borderRadius: 9, padding: '10px 14px', fontSize: 14, color: navy, outline: 'none', fontFamily: "'Nunito Sans', sans-serif" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                      Message <span style={{ color: teal }}>*</span>
                    </label>
                    <textarea
                      placeholder="School name, location, and any other details..."
                      value={contactForm.message}
                      onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))}
                      rows={4}
                      style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${border}`, borderRadius: 9, padding: '10px 14px', fontSize: 14, color: navy, outline: 'none', resize: 'vertical', fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.6 }}
                    />
                  </div>
                  {contactError && <div style={{ fontSize: 12, color: '#c0392b' }}>{contactError}</div>}
                  <button
                    onClick={submitContact}
                    disabled={contactSending}
                    style={{
                      padding: '13px 20px', borderRadius: 10,
                      background: contactSending ? border : teal,
                      color: contactSending ? muted : '#fff',
                      border: 'none', fontSize: 14, fontWeight: 800,
                      cursor: contactSending ? 'default' : 'pointer',
                      fontFamily: 'Nunito, sans-serif',
                    }}
                  >
                    {contactSending ? 'Sending...' : 'Send message'}
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
