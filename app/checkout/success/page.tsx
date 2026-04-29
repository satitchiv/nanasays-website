'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const navy = '#0b1f3a'
const teal = '#1bb5a1'
const tealBg = '#f0faf9'

export default function CheckoutSuccessPage() {
  const router = useRouter()
  const [attempts, setAttempts] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const MAX_ATTEMPTS = 15 // 30 seconds at 2s intervals

  useEffect(() => {
    if (timedOut) return

    const poll = async () => {
      try {
        const res = await fetch('/api/purchase-status')
        const { purchased } = await res.json()
        if (purchased) {
          router.replace('/my-reports?just_unlocked=true')
          return
        }
      } catch {
        // network error — keep polling
      }

      const next = attempts + 1
      setAttempts(next)
      if (next >= MAX_ATTEMPTS) {
        setTimedOut(true)
      }
    }

    const timer = setTimeout(poll, 2000)
    return () => clearTimeout(timer)
  }, [attempts, timedOut, router])

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
    }}>
      <Link href="/" style={{ textDecoration: 'none', marginBottom: 40 }}>
        <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: teal, letterSpacing: '-0.02em' }}>
          nana<span style={{ color: navy }}>says</span>
        </span>
      </Link>

      <div style={{
        width: '100%', maxWidth: 420, background: '#fff',
        border: '1px solid #e2e8f0', borderRadius: 16,
        padding: '48px 40px', textAlign: 'center',
        boxShadow: '0 2px 24px rgba(0,0,0,0.06)',
      }}>
        {timedOut ? (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#fef3c7',
              border: '2px solid #fcd34d',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: 24,
            }}>
              ⏳
            </div>
            <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, margin: '0 0 12px' }}>
              Payment received
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: '0 0 24px' }}>
              Your payment went through — access may take a moment to activate.
              Try going to your reports now, or email us if it&apos;s not working.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link href="/my-reports" style={{
                display: 'block', padding: '12px 24px', borderRadius: 10,
                background: teal, color: '#fff', textDecoration: 'none',
                fontWeight: 800, fontFamily: 'Nunito, sans-serif', fontSize: 14,
              }}>
                Go to my reports →
              </Link>
              <a href="mailto:hello@nanasays.com" style={{
                display: 'block', padding: '12px 24px', borderRadius: 10,
                border: '1px solid #e2e8f0', color: navy, textDecoration: 'none',
                fontWeight: 700, fontSize: 14,
              }}>
                Email support
              </a>
            </div>
          </>
        ) : (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: tealBg,
              border: '2px solid rgba(27,181,161,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <div style={{
                width: 28, height: 28, border: `3px solid ${tealBg}`,
                borderTop: `3px solid ${teal}`,
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }} />
            </div>
            <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, margin: '0 0 12px' }}>
              Activating your access…
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
              Payment confirmed. Setting up your account — this takes a few seconds.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
