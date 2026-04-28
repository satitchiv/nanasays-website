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
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    // These routes bypass auth entirely
    if (pathname.startsWith('/portal/demo') || pathname.startsWith('/portal/signin')) {
      setChecking(false)
      return
    }
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/portal/signin')
        return
      }
      const { data: school } = await supabase
        .from('schools')
        .select('name')
        .eq('admin_email', session.user.email)
        .single()
      if (!school) {
        router.replace('/portal/signin')
        return
      }
      setSchoolName(school.name)
      setChecking(false)
    }
    check()
  }, [router, pathname])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const navy = '#1B3252'
  const teal = '#34C3A0'
  const off = '#F6F8FA'

  const navItems = [
    { label: 'Overview', href: '/portal' },
    { label: 'Enquiries', href: '/portal/enquiries' },
    { label: 'Edit Profile', href: '/portal/edit' },
    { label: 'Analytics', href: '/portal/analytics' },
    { label: 'Assistant', href: '/portal/assistant' },
  ]

  // These routes render children directly with no portal nav
  if (pathname.startsWith('/portal/demo') || pathname.startsWith('/portal/signin')) {
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
      </div>
    )
  }

  const signOut = async () => { await supabase.auth.signOut(); router.push('/portal/signin') }

  return (
    <div style={{ minHeight: '100vh', background: off, display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <div style={{
        background: navy, borderBottom: `1px solid rgba(255,255,255,0.08)`,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div className="ns-portal-topbar-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 32, minWidth: 0 }}>
            <Link href="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
              <span style={{
                fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 18,
                color: teal, letterSpacing: '-0.02em',
              }}>
                nana<span style={{ color: '#fff' }}>says</span>
              </span>
            </Link>
            <nav className="ns-portal-nav-desktop">
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
            <span className="ns-portal-school-name">
              {schoolName}
            </span>
            <button
              onClick={signOut}
              className="ns-portal-signout-desktop"
              style={{
                fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7,
                padding: '5px 12px', cursor: 'pointer',
              }}
            >
              Sign out
            </button>
            <button
              className="ns-portal-nav-mobile-btn"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              style={{
                width: 38, height: 38, borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
                alignItems: 'center', justifyContent: 'center',
                padding: 0, cursor: 'pointer',
              }}
            >
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
                <rect y="0" width="18" height="2" rx="1" fill="#fff" />
                <rect y="6" width="18" height="2" rx="1" fill="#fff" />
                <rect y="12" width="18" height="2" rx="1" fill="#fff" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu drawer */}
      <div
        onClick={() => setMenuOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,.5)',
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? 'auto' : 'none',
          transition: 'opacity .25s',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Portal menu"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(320px, 86vw)',
          zIndex: 1000, background: '#fff',
          display: 'flex', flexDirection: 'column',
          transform: menuOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .28s cubic-bezier(0.32,0,0.67,0)',
          boxShadow: '-8px 0 40px rgba(0,0,0,.18)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #E2E8F0', flexShrink: 0,
        }}>
          <span style={{
            fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: 16, color: navy,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {schoolName || 'Portal'}
          </span>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            style={{
              background: 'none', border: '1px solid #E2E8F0', borderRadius: 8,
              width: 34, height: 34, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: navy, lineHeight: 1,
            }}
          >×</button>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {navItems.map(item => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: 'block', padding: '14px 20px',
                  fontSize: 15, fontWeight: 700,
                  color: active ? teal : navy,
                  background: active ? 'rgba(52,195,160,.08)' : 'transparent',
                  textDecoration: 'none',
                  borderLeft: active ? `3px solid ${teal}` : '3px solid transparent',
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid #E2E8F0' }}>
          <button
            onClick={() => { setMenuOpen(false); signOut() }}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10,
              fontSize: 14, fontWeight: 700,
              color: navy, background: off,
              border: '1px solid #E2E8F0', cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  )
}
