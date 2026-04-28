'use client'

import { useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const teal = '#34C3A0'
const tealBg = '#E8FAF6'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    // Listen for Supabase to finish processing the #access_token hash.
    // onAuthStateChange fires exactly when the session is established — no guessing.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        router.replace('/portal')
      } else if (event === 'INITIAL_SESSION' && !session) {
        // Page loaded but no session in hash and none in storage
        router.replace('/portal/signin')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div style={{
      minHeight: '100vh', background: '#F6F8FA',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 44, height: 44, border: `3px solid ${tealBg}`, borderTop: `3px solid ${teal}`,
          borderRadius: '50%', margin: '0 auto 16px',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ fontSize: 14, color: '#6B7280' }}>Signing you in...</p>
      </div>
    </div>
  )
}
