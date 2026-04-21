'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const navy  = '#1B3252'
const teal  = '#34C3A0'
const tealDk = '#239C80'
const tealBg = '#E8FAF6'
const border = '#E2E8F0'
const muted  = '#6B7280'
const off    = '#F6F8FA'

export default function SignInPage() {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('sending')
    setError('')

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/portal`,
        shouldCreateUser: false, // only allow already-approved emails
      },
    })

    if (err) {
      // Supabase returns success even for unknown emails (security), but
      // if shouldCreateUser=false and email doesn't exist, it still returns ok.
      // We show sent regardless — don't leak whether email is registered.
      setStatus('sent')
    } else {
      setStatus('sent')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: off,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
    }}>

      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none', marginBottom: 32 }}>
        <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: teal, letterSpacing: '-0.02em' }}>
          nana<span style={{ color: navy }}>says</span>
        </span>
      </Link>

      <div style={{
        width: '100%', maxWidth: 400, background: '#fff',
        border: `1px solid ${border}`, borderRadius: 16,
        padding: '40px 36px',
        boxShadow: '0 2px 24px rgba(0,0,0,0.06)',
      }}>

        {status === 'sent' ? (
          /* ── Sent state ── */
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: tealBg,
              border: `2px solid rgba(52,195,160,0.3)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={tealDk} strokeWidth="2.5">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, margin: '0 0 10px' }}>
              Check your email
            </h2>
            <p style={{ fontSize: 14, color: muted, lineHeight: 1.7, margin: '0 0 8px' }}>
              We sent a sign-in link to
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, color: navy, margin: '0 0 20px' }}>
              {email}
            </p>
            <p style={{ fontSize: 13, color: muted, lineHeight: 1.7 }}>
              Click the link in that email to access your portal. The link expires in 24 hours.
            </p>
            <button
              onClick={() => { setStatus('idle'); setEmail('') }}
              style={{
                marginTop: 24, background: 'none', border: 'none',
                fontSize: 13, color: teal, cursor: 'pointer', fontWeight: 600,
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, margin: '0 0 8px' }}>
              Sign in to your portal
            </h2>
            <p style={{ fontSize: 13, color: muted, margin: '0 0 28px', lineHeight: 1.6 }}>
              Enter the email address you used when claiming your school. We'll send you a sign-in link.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                  Work email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@school.ac.th"
                  required
                  style={{
                    width: '100%', padding: '11px 13px', borderRadius: 9,
                    border: `1px solid ${border}`, fontSize: 14,
                    color: navy, outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {error && (
                <p style={{ fontSize: 13, color: '#c0392b', margin: 0 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={status === 'sending' || !email.trim()}
                style={{
                  padding: '13px', borderRadius: 10, border: 'none',
                  background: status === 'sending' || !email.trim() ? border : teal,
                  color: status === 'sending' || !email.trim() ? muted : '#fff',
                  fontSize: 14, fontWeight: 800, cursor: status === 'sending' ? 'wait' : 'pointer',
                  fontFamily: 'Nunito, sans-serif',
                  transition: 'background 0.15s',
                }}
              >
                {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>

            <p style={{ marginTop: 24, fontSize: 12, color: muted, textAlign: 'center', lineHeight: 1.6 }}>
              Don't have access yet?{' '}
              <Link href="/claim" style={{ color: teal, fontWeight: 600, textDecoration: 'none' }}>
                Claim your school
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
