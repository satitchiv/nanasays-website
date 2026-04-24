'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const NAVY = '#1B3252'
const TEAL = '#34C3A0'
const OFF = '#F6F8FA'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [displayName, setDisplayName] = useState<string>('')

  useEffect(() => {
    // Sign-in page has no auth requirement and no chrome.
    if (pathname === '/admin/signin') {
      setChecking(false)
      return
    }
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/admin/signin')
        return
      }
      const { data: reviewer } = await supabase
        .from('social_reviewers')
        .select('role, display_name')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (!reviewer || reviewer.role !== 'admin') {
        await supabase.auth.signOut()
        router.replace('/admin/signin?error=not_admin')
        return
      }
      setDisplayName(reviewer.display_name || session.user.email || 'admin')
      setChecking(false)
    }
    check()
  }, [router, pathname])

  // Render sign-in page without the admin chrome (header/nav).
  if (pathname === '/admin/signin') {
    return <>{children}</>
  }

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: OFF,
      }}>
        <div style={{
          width: 40, height: 40, border: `3px solid #E8FAF6`, borderTop: `3px solid ${TEAL}`,
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // `soon: true` tabs route to stub pages — kept visible so the roadmap is
  // always in sight, but rendered with a muted style + "SOON" pill so we
  // don't click into them by reflex.
  const tabs = [
    { label: 'Queue',    href: '/admin/content',          soon: false },
    { label: 'Plan',     href: '/admin/content/plan',     soon: false },
    { label: 'Schedule', href: '/admin/content/schedule', soon: true  },
    { label: 'Design',   href: '/admin/content/design',   soon: true  },
    { label: 'Layout',   href: '/admin/content/layout',   soon: true  },
  ]

  return (
    <div style={{ background: OFF, minHeight: '100vh' }}>
      <header style={{
        background: NAVY, color: '#fff',
        padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>
            nana<span style={{ color: TEAL }}>says</span>
            <span style={{ marginLeft: 12, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>
              admin · social planner
            </span>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          {displayName}
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace('/portal/signin') }}
            style={{
              marginLeft: 16, background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
            }}
          >Sign out</button>
        </div>
      </header>

      <nav style={{
        background: '#fff', borderBottom: '1px solid #E2E8F0',
        padding: '0 32px', display: 'flex', gap: 2,
      }}>
        {tabs.map(t => {
          // Queue is active for /admin/content and any child route that isn't
          // one of the other known tabs. The simpler `pathname === t.href`
          // works for the explicit ones (Plan, Schedule, Design, Layout).
          const isQueueCatchAll =
            t.href === '/admin/content' &&
            pathname.startsWith('/admin/content/') &&
            !pathname.startsWith('/admin/content/plan') &&
            !pathname.startsWith('/admin/content/schedule') &&
            !pathname.startsWith('/admin/content/design') &&
            !pathname.startsWith('/admin/content/layout')
          const active = pathname === t.href || isQueueCatchAll
          return (
            <Link key={t.href} href={t.href} style={{
              padding: '14px 20px', fontSize: 14,
              fontWeight: t.soon ? 500 : 600,
              color: active ? NAVY : (t.soon ? '#94A3B8' : '#6B7280'),
              borderBottom: `3px solid ${active ? TEAL : 'transparent'}`,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}>
              {t.label}
              {t.soon && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#94A3B8',
                  background: '#F1F5F9',
                  padding: '2px 6px',
                  borderRadius: 10,
                  letterSpacing: 0.3,
                }}>SOON</span>
              )}
            </Link>
          )
        })}
      </nav>

      <main style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}
