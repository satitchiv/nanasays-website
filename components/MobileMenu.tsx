'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useLang } from './LanguageProvider'
import { useCurrency } from './CurrencyProvider'

const TOP_CURRENCIES = ['USD', 'THB', 'GBP', 'EUR', 'SGD', 'HKD', 'CHF', 'AUD', 'JPY', 'CNY']

interface Props {
  open: boolean
  onClose: () => void
}

export default function MobileMenu({ open, onClose }: Props) {
  const { lang, setLang } = useLang()
  const { currency, setCurrency } = useCurrency()

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,.4)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .25s',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(320px, 86vw)',
          zIndex: 1000, background: '#fff',
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .28s cubic-bezier(0.32,0,0.67,0)',
          boxShadow: '-8px 0 40px rgba(0,0,0,.18)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            fontWeight: 800, fontSize: 18, color: 'var(--navy)',
          }}>
            Menu
          </span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 8,
              width: 34, height: 34, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: 'var(--navy)', lineHeight: 1,
            }}
          >×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0 16px' }}>
          <div style={{ padding: '14px 20px 6px' }}>
            <label style={{
              display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--muted)',
              letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8,
            }}>
              Currency
            </label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              aria-label="Display currency"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                fontSize: 14, fontWeight: 600,
                border: '1px solid var(--border)', background: 'var(--off)',
                color: 'var(--navy)', outline: 'none',
                fontFamily: "'Nunito Sans', sans-serif",
              }}
            >
              {TOP_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ padding: '10px 20px 14px' }}>
            <label style={{
              display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--muted)',
              letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8,
            }}>
              Language
            </label>
            <select
              value={lang}
              onChange={e => setLang(e.target.value as any)}
              aria-label="Language"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                fontSize: 14, fontWeight: 600,
                border: '1px solid var(--border)', background: 'var(--off)',
                color: 'var(--navy)', outline: 'none',
                fontFamily: "'Nunito Sans', sans-serif",
              }}
            >
              <option value="en">EN — English</option>
              <option value="th">TH — ภาษาไทย</option>
            </select>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '6px 20px 10px' }} />

          <nav style={{ display: 'flex', flexDirection: 'column' }}>
            <DrawerLink href="/" onClose={onClose}>Home</DrawerLink>
            <DrawerLink href="/ask" onClose={onClose}>Ask Nana</DrawerLink>
            <DrawerLink href="/blog" onClose={onClose}>Blog</DrawerLink>
            <DrawerLink href="/news" onClose={onClose}>News</DrawerLink>
            <DrawerLink href="/about" onClose={onClose}>About</DrawerLink>
            <DrawerLink href="/methodology" onClose={onClose}>Methodology</DrawerLink>
          </nav>

          <div style={{ padding: '16px 20px 0' }}>
            <Link
              href="/partners"
              onClick={onClose}
              style={{
                display: 'block', textAlign: 'center',
                padding: '12px 16px', borderRadius: 10,
                fontSize: 14, fontWeight: 700,
                color: '#fff', background: 'var(--teal)',
                textDecoration: 'none',
              }}
            >
              For Schools
            </Link>
            <Link
              href="/portal/signin"
              onClick={onClose}
              style={{
                display: 'block', textAlign: 'center',
                padding: '10px 16px', marginTop: 10, borderRadius: 10,
                fontSize: 13, fontWeight: 600,
                color: 'var(--navy)', background: 'var(--off)',
                textDecoration: 'none', border: '1px solid var(--border)',
              }}
            >
              School Portal Sign-in
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

function DrawerLink({ href, onClose, children }: { href: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClose}
      style={{
        display: 'block',
        padding: '12px 20px',
        fontSize: 15, fontWeight: 600,
        color: 'var(--navy)',
        textDecoration: 'none',
        fontFamily: "'Nunito Sans', sans-serif",
      }}
    >
      {children}
    </Link>
  )
}
