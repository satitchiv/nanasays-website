'use client'

import Link from 'next/link'
import { useLang } from './LanguageProvider'

export default function Nav() {
  const { lang, setLang, t } = useLang()

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
      height: 60, display: 'flex', alignItems: 'center', gap: 24, padding: '0 5%',
      background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, textDecoration: 'none' }}>
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


      <div className="ns-nav-right">
        {/* Language selector */}
        <select
          className="ns-nav-lang"
          value={lang}
          onChange={e => setLang(e.target.value as any)}
          style={{
            padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: '1px solid var(--border)', background: 'var(--off)',
            color: 'var(--navy)', cursor: 'pointer', outline: 'none',
            fontFamily: "'Nunito Sans', sans-serif",
          }}
        >
          <option value="en">EN — English</option>
          <option value="th">TH — ภาษาไทย</option>
        </select>

        {/* For Schools */}
        <Link href="/partners" style={{
          padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          color: '#fff', background: 'var(--teal)',
          textDecoration: 'none', display: 'flex', alignItems: 'center',
          whiteSpace: 'nowrap',
        }}>
          For Schools
        </Link>
      </div>
    </nav>
  )
}
