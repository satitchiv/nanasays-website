'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Link from 'next/link'

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
  admin_email: string | null
}

type Step = 'search' | 'email' | 'sent'

export default function ClaimPage() {
  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SchoolResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(null)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [transferMode, setTransferMode] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('schools')
        .select('id,slug,name,city,country,is_partner,admin_email')
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
    setTransferMode(false)
    setError('')
    setStep('email')
  }

  async function sendMagicLink() {
    if (!selectedSchool || !email.trim()) return
    setSending(true)
    setError('')

    // Check if already claimed by a different email
    if (selectedSchool.admin_email && selectedSchool.admin_email !== email.trim()) {
      if (!transferMode) {
        setTransferMode(true)
        setSending(false)
        return
      }
      // Transfer request — insert into claim_requests table
      await supabase.from('school_claim_requests').insert({
        school_id: selectedSchool.id,
        requester_email: email.trim(),
        status: 'pending',
      })
      setSending(false)
      setStep('sent')
      return
    }

    const redirectTo = `${window.location.origin}/claim/verify?school_id=${selectedSchool.id}`
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })

    if (authError) {
      setError('Could not send link. Please try again.')
      setSending(false)
      return
    }

    setSending(false)
    setStep('sent')
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
            {(['search', 'email', 'sent'] as Step[]).map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: step === s ? navy : ((['search', 'email', 'sent'] as Step[]).indexOf(step) > i ? teal : border),
                  color: step === s ? '#fff' : ((['search', 'email', 'sent'] as Step[]).indexOf(step) > i ? '#fff' : muted),
                  fontSize: 11, fontWeight: 800,
                }}>
                  {(['search', 'email', 'sent'] as Step[]).indexOf(step) > i
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
                        {school.admin_email && !school.is_partner && (
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
                    <a href="mailto:hello@nanasays.school" style={{ color: tealDk }}>Contact us</a> to add your school.
                  </div>
                )}
              </>
            )}

            {/* STEP: email */}
            {step === 'email' && selectedSchool && (
              <>
                {/* Selected school */}
                <div style={{
                  background: tealBg, border: `1px solid rgba(52,195,160,0.3)`,
                  borderRadius: 10, padding: '14px 16px', marginBottom: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif' }}>
                      {selectedSchool.name}
                    </div>
                    <div style={{ fontSize: 11, color: tealDk, marginTop: 2 }}>
                      {[selectedSchool.city, selectedSchool.country].filter(Boolean).join(', ')}
                    </div>
                  </div>
                  <button
                    onClick={() => { setStep('search'); setSelectedSchool(null); setTransferMode(false); setError('') }}
                    style={{ fontSize: 11, color: muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Change
                  </button>
                </div>

                {/* Transfer mode: already claimed by someone else */}
                {transferMode ? (
                  <>
                    <div style={{
                      background: '#FFF8E1', border: '1px solid #F6CC5B',
                      borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#7A5C00', lineHeight: 1.6,
                    }}>
                      This school is already claimed. We will send a transfer request to the current admin and to you. Once they approve (or after 30 days), access will transfer to your email.
                    </div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: navy, display: 'block', marginBottom: 8 }}>
                      Your school email address
                    </label>
                    <input
                      type="email"
                      placeholder="admissions@yourschool.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        border: `1.5px solid ${border}`, borderRadius: 10,
                        padding: '12px 16px', fontSize: 14, color: navy, outline: 'none',
                        fontFamily: "'Nunito Sans', sans-serif", marginBottom: 20,
                      }}
                    />
                    {error && <div style={{ fontSize: 12, color: '#c0392b', marginBottom: 12 }}>{error}</div>}
                    <button
                      onClick={sendMagicLink}
                      disabled={sending || !email.trim()}
                      style={{
                        width: '100%', padding: '13px 20px', borderRadius: 10,
                        background: sending || !email.trim() ? border : navy,
                        color: sending || !email.trim() ? muted : '#fff',
                        border: 'none', fontSize: 14, fontWeight: 800, cursor: sending || !email.trim() ? 'default' : 'pointer',
                        fontFamily: 'Nunito, sans-serif',
                      }}
                    >
                      {sending ? 'Sending request...' : 'Request ownership transfer'}
                    </button>
                  </>
                ) : (
                  <>
                    <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, marginBottom: 8 }}>
                      Verify your email
                    </h2>
                    <p style={{ fontSize: 13, color: muted, marginBottom: 24, lineHeight: 1.6 }}>
                      Enter your school email address. We will send you a magic link — no password needed.
                    </p>
                    <label style={{ fontSize: 13, fontWeight: 700, color: navy, display: 'block', marginBottom: 8 }}>
                      Your school email address
                    </label>
                    <input
                      type="email"
                      placeholder="admissions@yourschool.com"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      onKeyDown={e => { if (e.key === 'Enter') sendMagicLink() }}
                      autoFocus
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        border: `1.5px solid ${border}`, borderRadius: 10,
                        padding: '12px 16px', fontSize: 14, color: navy, outline: 'none',
                        fontFamily: "'Nunito Sans', sans-serif", marginBottom: 8,
                      }}
                    />
                    {error && <div style={{ fontSize: 12, color: '#c0392b', marginBottom: 8 }}>{error}</div>}
                    <p style={{ fontSize: 11, color: muted, marginBottom: 20, lineHeight: 1.5 }}>
                      By claiming this listing you confirm you are an authorised representative of this school.
                    </p>
                    <button
                      onClick={sendMagicLink}
                      disabled={sending || !email.trim()}
                      style={{
                        width: '100%', padding: '13px 20px', borderRadius: 10,
                        background: sending || !email.trim() ? border : teal,
                        color: sending || !email.trim() ? muted : '#fff',
                        border: 'none', fontSize: 14, fontWeight: 800, cursor: sending || !email.trim() ? 'default' : 'pointer',
                        fontFamily: 'Nunito, sans-serif',
                      }}
                    >
                      {sending ? 'Sending...' : 'Send verification link'}
                    </button>
                  </>
                )}
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
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: navy, marginBottom: 12 }}>
                  {transferMode ? 'Transfer request sent' : 'Check your email'}
                </h2>
                <p style={{ fontSize: 14, color: muted, lineHeight: 1.75, maxWidth: 380, margin: '0 auto 28px' }}>
                  {transferMode
                    ? `We have sent a transfer request to both the current admin and to ${email}. We will be in touch within 1–2 working days.`
                    : `We sent a verification link to ${email}. Click the link in that email to complete your claim and access your school portal.`}
                </p>
                <div style={{ fontSize: 12, color: muted }}>
                  Wrong email?{' '}
                  <button
                    onClick={() => { setStep('email'); setEmail(''); setError(''); setTransferMode(false) }}
                    style={{ background: 'none', border: 'none', color: tealDk, cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
                  >
                    Go back
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer link */}
          <div style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: muted }}>
            Already have an account?{' '}
            <Link href="/portal" style={{ color: tealDk, fontWeight: 700 }}>Go to portal</Link>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
