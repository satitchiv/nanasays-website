'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [schoolName, setSchoolName] = useState('')

  useEffect(() => {
    // Demo routes bypass auth entirely
    if (pathname.startsWith('/portal/demo')) {
      setChecking(false)
      return
    }
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/claim')
        return
      }
      const { data: school } = await supabase
        .from('schools')
        .select('name')
        .eq('admin_email', session.user.email)
        .single()
      if (!school) {
        router.replace('/claim')
        return
      }
      setSchoolName(school.name)
      setChecking(false)
    }
    check()
  }, [router, pathname])

  const navy = '#1B3252'
  const teal = '#34C3A0'
  const tealDk = '#239C80'
  const border = '#E2E8F0'
  const muted = '#6B7280'
  const off = '#F6F8FA'

  const navItems = [
    { label: 'Overview', href: '/portal' },
    { label: 'Enquiries', href: '/portal/enquiries' },
    { label: 'Edit Profile', href: '/portal/edit' },
    { label: 'Analytics', href: '/portal/analytics' },
  ]

  // Demo routes: render children directly, demo has its own layout
  if (pathname.startsWith('/portal/demo')) {
    return <>{children}</>
  }

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: off,
      }}>
        <div style={{
          width: 40, height: 40, border: `3px solid #E8FAF6`, borderTop: `3px solid ${teal}`,
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: off, display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <div style={{
        background: navy, borderBottom: `1px solid rgba(255,255,255,0.08)`,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: '0 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span style={{
                fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 18,
                color: teal, letterSpacing: '-0.02em',
              }}>
                nana<span style={{ color: '#fff' }}>says</span>
              </span>
            </Link>
            <nav style={{ display: 'flex', gap: 4 }}>
              {navItems.map(item => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      textDecoration: 'none',
                      color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                      background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                    }}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {schoolName}
            </span>
            <button
              onClick={async () => { await supabase.auth.signOut(); router.push('/claim') }}
              style={{
                fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7,
                padding: '5px 12px', cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  )
}
