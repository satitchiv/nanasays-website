'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const RegisterModal = dynamic(() => import('./RegisterModal'), { ssr: false })

const NAV_LINKS = [
  { label: 'How it works', href: '#how-it-works', id: 'how-it-works' },
  { label: 'Pricing', href: '#pricing', id: 'pricing' },
  { label: 'Our Audience', href: '#audience', id: 'audience' },
  { label: 'Insights & Resources', href: '#insights', id: 'insights' },
]

export default function PartnerNav() {
  const [active, setActive] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    const ids = NAV_LINKS.map(l => l.id).concat(['register'])

    function onScroll() {
      let current = ''
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.top <= 100) current = id
      }
      setActive(current)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
        height: 64, display: 'flex', alignItems: 'center', gap: 0, padding: '0 5%',
        background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, textDecoration: 'none', marginRight: 36 }}>
          <svg width="36" height="36">
            <use href="#ic-nana" />
          </svg>
          <span style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            fontSize: 20, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.4px',
          }}>
            nana<span style={{ color: 'var(--teal)' }}>says</span>
          </span>
        </Link>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--border)', marginRight: 36, flexShrink: 0 }} />

        {/* Nav links */}
        <ul className="ns-pp-nav-links">
          {NAV_LINKS.map(link => (
            <li key={link.id}>
              <a
                href={link.href}
                style={{
                  padding: '6px 14px', borderRadius: 7, fontSize: 13,
                  fontWeight: active === link.id ? 700 : 500,
                  color: active === link.id ? 'var(--navy)' : 'var(--muted)',
                  textDecoration: 'none', display: 'block',
                  transition: 'color 0.15s',
                }}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          onClick={() => setModalOpen(true)}
          style={{
            padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 800,
            color: '#fff', background: 'var(--teal)', border: 'none', cursor: 'pointer',
            flexShrink: 0, fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            letterSpacing: '0.01em',
          }}
        >
          Register your school
        </button>
      </nav>

      {modalOpen && <RegisterModal onClose={() => setModalOpen(false)} />}
    </>
  )
}
