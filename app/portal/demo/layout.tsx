'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
// Note: Back/Exit demo use <a> not <Link> to force full page nav out of portal subtree

const navy = '#1B3252'
const teal = '#34C3A0'
const tealDk = '#239C80'
const border = '#E2E8F0'
const muted = '#6B7280'
const off = '#F6F8FA'

const navItems = [
  { label: 'Overview', href: '/portal/demo' },
  { label: 'Enquiries', href: '/portal/demo/enquiries' },
  { label: 'Analytics', href: '/portal/demo/analytics' },
  { label: 'Assistant', href: '/portal/demo/assistant' },
  { label: 'Edit Profile', href: '/portal/demo/edit' },
]

export default function DemoPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{ minHeight: '100vh', background: off, display: 'flex', flexDirection: 'column' }}>

      {/* Demo banner */}
      <div style={{
        background: teal, color: '#fff', textAlign: 'center',
        padding: '8px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
      }}>
        Demo Mode — Demo International School Bangkok
        <a href="/demo" style={{ marginLeft: 16, color: 'rgba(255,255,255,0.8)', fontSize: 11, textDecoration: 'underline' }}>
          Back to walkthrough
        </a>
      </div>

      {/* Top nav */}
      <div style={{
        background: navy, borderBottom: '1px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: '0 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 18, color: teal, letterSpacing: '-0.02em' }}>
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
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              demo@nanasays.school
            </span>
            <a
              href="/demo"
              style={{
                fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7,
                padding: '5px 12px', textDecoration: 'none',
              }}
            >
              Exit demo
            </a>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  )
}
