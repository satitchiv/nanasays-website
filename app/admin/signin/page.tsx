'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const NAVY = '#1B3252'
const TEAL = '#34C3A0'
const TEAL_DK = '#239C80'
const TEAL_BG = '#E8FAF6'
const BORDER = '#E2E8F0'
const MUTED = '#6B7280'
const OFF = '#F6F8FA'

export default function AdminSignInPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('sending')
    await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/admin/content`,
        shouldCreateUser: false,
      },
    })
    setStatus('sent')
  }

  return (
    <div style={{
      minHeight: '100vh', background: OFF,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
    }}>
      <Link href="/" style={{ textDecoration: 'none', marginBottom: 32 }}>
        <span style={{ fontWeight: 900, fontSize: 22, color: TEAL, letterSpacing: '-0.02em' }}>
          nana<span style={{ color: NAVY }}>says</span>
          <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 500, color: MUTED }}>admin</span>
        </span>
      </Link>

      <div style={{
        width: '100%', maxWidth: 400, background: '#fff',
        border: `1px solid ${BORDER}`, borderRadius: 16,
        padding: '40px 36px', boxShadow: '0 2px 24px rgba(0,0,0,0.06)',
      }}>
        {status === 'sent' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: TEAL_BG,
              border: `2px solid rgba(52,195,160,0.3)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEAL_DK} strokeWidth="2.5">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h2 style={{ fontWeight: 900, fontSize: 20, color: NAVY, margin: '0 0 10px' }}>
              Check your email
            </h2>
            <p style={{ fontSize: 14, color: MUTED, margin: '0 0 8px' }}>
              We sent an admin sign-in link to
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 20px' }}>
              {email}
            </p>
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
              Click the link in that email to access the social planner admin. The link expires in 24 hours.
            </p>
            <button
              onClick={() => { setStatus('idle'); setEmail('') }}
              style={{
                marginTop: 24, background: 'none', border: 'none',
                fontSize: 13, color: TEAL, cursor: 'pointer', fontWeight: 600,
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontWeight: 900, fontSize: 20, color: NAVY, margin: '0 0 8px' }}>
              Admin sign in
            </h2>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 28px', lineHeight: 1.6 }}>
              Social media planner — for NanaSays admins only. Enter your email and we'll send a sign-in link.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: NAVY, display: 'block', marginBottom: 6 }}>
                  Admin email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  style={{
                    width: '100%', padding: '11px 13px', borderRadius: 9,
                    border: `1px solid ${BORDER}`, fontSize: 14,
                    color: NAVY, outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={status === 'sending' || !email.trim()}
                style={{
                  padding: '13px', borderRadius: 10, border: 'none',
                  background: status === 'sending' || !email.trim() ? BORDER : TEAL,
                  color: status === 'sending' || !email.trim() ? MUTED : '#fff',
                  fontSize: 14, fontWeight: 800, cursor: status === 'sending' ? 'wait' : 'pointer',
                }}
              >
                {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
