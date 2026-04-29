'use client'

import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import Link from 'next/link'

const navy  = '#0b1f3a'
const teal  = '#1bb5a1'
const tealDk = '#159e8c'
const tealBg = '#f0faf9'
const border = '#e2e8f0'
const muted  = '#64748b'
const off    = '#f8fafc'

export default function SignupPage() {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('sending')

    const supabase = createSupabaseBrowser()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${siteUrl}/auth/parent-callback?next=/unlock`,
        shouldCreateUser: true,
      },
    })

    // Always show sent — don't leak whether email is registered
    setStatus('sent')
  }

  return (
    <div style={{
      minHeight: '100vh', background: off,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
    }}>
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
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: tealBg,
              border: `2px solid rgba(27,181,161,0.3)`,
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
              We sent a sign-up link to
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, color: navy, margin: '0 0 20px' }}>
              {email}
            </p>
            <p style={{ fontSize: 13, color: muted, lineHeight: 1.7 }}>
              Click the link in the email to create your account. It expires in 24 hours.
            </p>
            <button
              onClick={() => { setStatus('idle'); setEmail('') }}
              style={{ marginTop: 24, background: 'none', border: 'none', fontSize: 13, color: teal, cursor: 'pointer', fontWeight: 600 }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: tealBg, border: `1px solid rgba(27,181,161,0.25)`,
              borderRadius: 100, padding: '4px 12px', marginBottom: 20,
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: tealDk, letterSpacing: '0.06em' }}>
                FREE ACCOUNT
              </span>
            </div>

            <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, margin: '0 0 8px' }}>
              Start researching schools
            </h2>
            <p style={{ fontSize: 13, color: muted, margin: '0 0 28px', lineHeight: 1.6 }}>
              Create a free account to access 140 UK independent school reports and chat with Nana.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div suppressHydrationWarning>
                <label style={{ fontSize: 12, fontWeight: 700, color: navy, display: 'block', marginBottom: 6 }}>
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  suppressHydrationWarning
                  style={{
                    width: '100%', padding: '11px 13px', borderRadius: 9,
                    border: `1px solid ${border}`, fontSize: 14,
                    color: navy, outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={status === 'sending' || !email.trim()}
                style={{
                  padding: '13px', borderRadius: 10, border: 'none',
                  background: status === 'sending' || !email.trim() ? border : teal,
                  color: status === 'sending' || !email.trim() ? muted : '#fff',
                  fontSize: 14, fontWeight: 800, cursor: status === 'sending' ? 'wait' : 'pointer',
                  fontFamily: 'Nunito, sans-serif', transition: 'background 0.15s',
                }}
              >
                {status === 'sending' ? 'Sending…' : 'Create free account'}
              </button>
            </form>

            <p style={{ marginTop: 16, fontSize: 11, color: muted, textAlign: 'center', lineHeight: 1.6 }}>
              By signing up you agree to our{' '}
              <Link href="/terms" style={{ color: teal, textDecoration: 'none' }}>Terms</Link>
              {' '}and{' '}
              <Link href="/privacy" style={{ color: teal, textDecoration: 'none' }}>Privacy Policy</Link>.
            </p>

            <p style={{ marginTop: 12, fontSize: 12, color: muted, textAlign: 'center', lineHeight: 1.6 }}>
              Already have an account?{' '}
              <Link href="/login" style={{ color: teal, fontWeight: 700, textDecoration: 'none' }}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
