'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'

const navy = '#1B3252'
const teal = '#34C3A0'
const tealDk = '#239C80'
const tealBg = '#E8FAF6'
const border = '#E2E8F0'
const muted = '#6B7280'
const off = '#F6F8FA'

const DEMO_PIN = process.env.NEXT_PUBLIC_DEMO_PIN ?? '2025'
const STORAGE_KEY = 'ns_demo_unlocked'

const STEPS = [
  {
    number: '01',
    title: 'School directory listing',
    desc: 'How your school appears to parents browsing NanaSays — search results, profile page, and comparison view.',
    href: '/schools/demo-international-school-bangkok',
    cta: 'View public listing',
    external: true,
  },
  {
    number: '02',
    title: 'Claim your school',
    desc: 'The flow a real school admin follows to claim their listing — search, select, verify email, access portal.',
    href: '/claim',
    cta: 'See claim flow',
    external: true,
  },
  {
    number: '03',
    title: 'School portal — dashboard',
    desc: 'Overview: 7-day impressions, profile views, enquiries, Content Booster status, Growth Advisor AI recommendation.',
    href: '/portal/demo',
    cta: 'Enter portal',
    external: false,
  },
  {
    number: '04',
    title: 'School portal — enquiries',
    desc: '8 real parent messages from families relocating to Bangkok. Click to expand, see email, child age and entry year.',
    href: '/portal/demo/enquiries',
    cta: 'View enquiries',
    external: false,
  },
  {
    number: '05',
    title: 'School portal — analytics',
    desc: '45 days of impressions, profile views and enquiry data. Toggle 7d / 30d / 90d. Peak day, click-through rate.',
    href: '/portal/demo/analytics',
    cta: 'View analytics',
    external: false,
  },
  {
    number: '06',
    title: 'School portal — edit profile',
    desc: 'Partner schools can update their description, fees, hero image, key facts, and more directly in the portal.',
    href: '/portal/demo/edit',
    cta: 'Edit profile',
    external: false,
  },
  {
    number: '07',
    title: 'For schools — pricing page',
    desc: 'The public-facing partner page schools see before signing up: tiers, benefits, content boosters, contact form.',
    href: '/partners',
    cta: 'View pricing',
    external: true,
  },
]

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState(['', '', '', ''])
  const [shake, setShake] = useState(false)
  const [error, setError] = useState(false)
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  useEffect(() => {
    inputRefs[0].current?.focus()
  }, [])

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError(false)

    if (digit && index < 3) {
      inputRefs[index + 1].current?.focus()
    }

    if (digit && index === 3) {
      const entered = [...next.slice(0, 3), digit].join('')
      if (entered === DEMO_PIN) {
        localStorage.setItem(STORAGE_KEY, '1')
        onUnlock()
      } else {
        setShake(true)
        setError(true)
        setTimeout(() => {
          setShake(false)
          setDigits(['', '', '', ''])
          inputRefs[0].current?.focus()
        }, 600)
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs[index - 1].current?.focus()
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: navy,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
    }}>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>

      {/* Logo */}
      <div style={{ marginBottom: 48, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 28, letterSpacing: '-0.02em', marginBottom: 8 }}>
          <span style={{ color: teal }}>nana</span><span style={{ color: '#fff' }}>says</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          School Partner Demo
        </div>
      </div>

      {/* Card */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 18, padding: '40px 48px', textAlign: 'center', maxWidth: 380, width: '100%',
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'Nunito, sans-serif', marginBottom: 8 }}>
          Enter access code
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 32, lineHeight: 1.6 }}>
          This demo is shared with prospective partners.
          Contact us if you need your access code.
        </div>

        {/* PIN boxes */}
        <div
          style={{
            display: 'flex', gap: 12, justifyContent: 'center',
            animation: shake ? 'shake 0.5s ease-in-out' : 'none',
          }}
        >
          {digits.map((d, i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              style={{
                width: 56, height: 64, textAlign: 'center',
                fontSize: 24, fontWeight: 900, fontFamily: 'Nunito, sans-serif',
                background: 'rgba(255,255,255,0.07)',
                border: `2px solid ${error ? '#e53e3e' : d ? teal : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 12, color: '#fff', outline: 'none',
                transition: 'border-color 0.15s',
                caretColor: 'transparent',
              }}
            />
          ))}
        </div>

        {error && (
          <div style={{ marginTop: 16, fontSize: 12, color: '#fc8181', fontWeight: 600 }}>
            Incorrect code. Please try again.
          </div>
        )}
      </div>

      <div style={{ marginTop: 32, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
        <Link href="/" style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>
          Back to nanasays.school
        </Link>
      </div>
    </div>
  )
}

export default function DemoPage() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setUnlocked(stored === '1')
  }, [])

  // Avoid flash — wait for localStorage check
  if (unlocked === null) return null

  if (!unlocked) {
    return <PinGate onUnlock={() => setUnlocked(true)} />
  }

  return (
    <div style={{ minHeight: '100vh', background: off }}>

      {/* Top bar */}
      <div style={{
        background: navy, height: 56, display: 'flex', alignItems: 'center',
        padding: '0 32px', justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: teal, letterSpacing: '-0.02em' }}>
            nana<span style={{ color: '#fff' }}>says</span>
          </span>
        </Link>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          School Partner Demo
        </div>
        <Link href="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
          Back to site
        </Link>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '56px 32px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 52 }}>
          <div style={{
            display: 'inline-block', background: tealBg, border: `1px solid rgba(52,195,160,0.3)`,
            color: tealDk, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', padding: '5px 16px', borderRadius: 100, marginBottom: 18,
          }}>
            Interactive Walkthrough
          </div>
          <h1 style={{
            fontFamily: 'Nunito, sans-serif', fontWeight: 900,
            fontSize: 'clamp(28px, 4vw, 44px)', color: navy,
            letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 14,
          }}>
            NanaSays — School Partner Experience
          </h1>
          <p style={{ fontSize: 15, color: muted, lineHeight: 1.75, maxWidth: 580 }}>
            A full walkthrough of what a school sees — from the public directory listing through to the partner portal, analytics, and AI growth tools.
            Steps 3–6 use a pre-loaded demo account with real sample data.
          </p>
        </div>

        {/* Demo account info box */}
        <div style={{
          background: navy, borderRadius: 14, padding: '24px 28px', marginBottom: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: teal, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
              Demo school account
            </div>
            <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 18, color: '#fff', marginBottom: 4 }}>
              Demo International School Bangkok
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              Partner plan · 45 days of data · 8 parent enquiries loaded
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '14px 20px', fontSize: 12, lineHeight: 1.8,
          }}>
            <div style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>Access</div>
            <div style={{ color: teal, fontWeight: 800, fontSize: 13 }}>No login required</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>Click any step below to enter</div>
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STEPS.map((step, i) => (
            <div
              key={i}
              style={{
                background: '#fff', border: `1px solid ${border}`,
                borderRadius: 14, padding: '24px 28px',
                display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
              }}
            >
              {/* Number */}
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: off, border: `1px solid ${border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{
                  fontFamily: 'Nunito, sans-serif', fontWeight: 900,
                  fontSize: 13, color: tealDk, letterSpacing: '-0.01em',
                }}>
                  {step.number}
                </span>
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif', marginBottom: 4 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>
                  {step.desc}
                </div>
              </div>

              {/* CTA */}
              <Link
                href={step.href}
                style={{
                  padding: '10px 22px', borderRadius: 9, fontSize: 13, fontWeight: 800,
                  background: i <= 1 || i >= 6 ? 'transparent' : i === 2 ? teal : 'transparent',
                  color: i === 2 ? '#fff' : i <= 1 || i >= 6 ? muted : navy,
                  border: i === 2 ? 'none' : i <= 1 || i >= 6 ? `1.5px solid ${border}` : `1.5px solid ${navy}`,
                  textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                  fontFamily: 'Nunito, sans-serif',
                }}
              >
                {step.cta} {i <= 1 || i >= 6 ? '→' : ''}
              </Link>
            </div>
          ))}
        </div>

        {/* Note */}
        <div style={{ marginTop: 44, padding: '16px 20px', background: '#fff', border: `1px solid ${border}`, borderRadius: 10, fontSize: 12, color: muted, lineHeight: 1.7 }}>
          <strong style={{ color: navy }}>Note:</strong> Steps 1, 2, and 7 open the live public site in a new tab. Steps 3–6 open the demo portal — no login required, data loads directly.
          The demo school is Partner-tier with 45 days of analytics and 8 sample parent enquiries pre-loaded.
        </div>
      </div>
    </div>
  )
}
