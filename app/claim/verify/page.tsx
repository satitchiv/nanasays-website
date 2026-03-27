'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useSearchParams } from 'next/navigation'
import Nav from '@/components/Nav'
import { Suspense } from 'react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function VerifyInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const schoolId = searchParams.get('school_id')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Verifying your email...')

  useEffect(() => {
    async function complete() {
      // Supabase sets the session from the magic link hash automatically
      // Give it a moment to process
      await new Promise(r => setTimeout(r, 800))

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setStatus('error')
        setMessage('Verification link may have expired. Please request a new one.')
        return
      }

      if (!schoolId) {
        setStatus('error')
        setMessage('Invalid verification link — school not specified.')
        return
      }

      const userEmail = session.user.email

      // Fetch the school to check current claim state
      const { data: school, error: fetchError } = await supabase
        .from('schools')
        .select('id,name,admin_email,claimed_at')
        .eq('id', schoolId)
        .single()

      if (fetchError || !school) {
        setStatus('error')
        setMessage('School not found. Please try claiming again.')
        return
      }

      // Already claimed by a different email
      if (school.admin_email && school.admin_email !== userEmail) {
        setStatus('error')
        setMessage(`This school is already claimed. If you need access, please use the transfer request option on the claim page.`)
        return
      }

      // Claim it — update admin_email and claimed_at
      const { error: updateError } = await supabase
        .from('schools')
        .update({
          admin_email: userEmail,
          claimed_at: new Date().toISOString(),
          partner_tier: school.admin_email ? undefined : 'starter', // only set tier if first claim
        })
        .eq('id', schoolId)

      if (updateError) {
        setStatus('error')
        setMessage('Could not complete claim. Please contact hello@nanasays.school.')
        return
      }

      setStatus('success')
      setMessage(`${school.name} claimed successfully. Taking you to your portal...`)

      setTimeout(() => {
        router.push('/portal')
      }, 1500)
    }

    complete()
  }, [schoolId, router])

  const navy = '#1B3252'
  const teal = '#34C3A0'
  const tealDk = '#239C80'
  const tealBg = '#E8FAF6'
  const muted = '#6B7280'
  const off = '#F6F8FA'

  return (
    <>
      <Nav />
      <div style={{
        marginTop: 64, minHeight: 'calc(100vh - 64px)',
        background: off, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 5%',
      }}>
        <div style={{
          maxWidth: 440, width: '100%', background: '#fff',
          border: '1px solid #E2E8F0', borderRadius: 16,
          padding: '48px 36px', textAlign: 'center',
          boxShadow: '0 2px 24px rgba(0,0,0,0.06)',
        }}>
          {status === 'loading' && (
            <>
              <div style={{
                width: 48, height: 48, border: `3px solid ${tealBg}`, borderTop: `3px solid ${teal}`,
                borderRadius: '50%', margin: '0 auto 24px',
                animation: 'spin 0.8s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ fontSize: 15, color: muted }}>{message}</p>
            </>
          )}
          {status === 'success' && (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: tealBg,
                border: `2px solid rgba(52,195,160,0.4)`, display: 'flex',
                alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={tealDk} strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: navy, marginBottom: 12 }}>
                Verified
              </h2>
              <p style={{ fontSize: 14, color: muted, lineHeight: 1.7 }}>{message}</p>
            </>
          )}
          {status === 'error' && (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: '#fdecea',
                border: '2px solid #f5c0bb', display: 'flex',
                alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </div>
              <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 22, color: navy, marginBottom: 12 }}>
                Verification failed
              </h2>
              <p style={{ fontSize: 14, color: muted, lineHeight: 1.7, marginBottom: 24 }}>{message}</p>
              <a
                href="/claim"
                style={{
                  display: 'inline-block', padding: '12px 28px', borderRadius: 10,
                  background: navy, color: '#fff', textDecoration: 'none',
                  fontSize: 13, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
                }}
              >
                Try again
              </a>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  )
}
