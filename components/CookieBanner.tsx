'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const CONSENT_KEY = 'nanasays-consent'

export type ConsentValue = 'accepted' | 'declined'

export function getStoredConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null
  return (localStorage.getItem(CONSENT_KEY) as ConsentValue) ?? null
}

function setConsent(value: ConsentValue) {
  localStorage.setItem(CONSENT_KEY, value)
  window.dispatchEvent(new CustomEvent('nanasays:consent', { detail: value }))
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!getStoredConsent()) setVisible(true)
  }, [])

  if (!visible) return null

  function accept() {
    setConsent('accepted')
    setVisible(false)
  }

  function decline() {
    setConsent('declined')
    setVisible(false)
  }

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, width: 'min(560px, calc(100vw - 32px))',
      background: '#1B3252', borderRadius: 14,
      padding: '16px 20px', boxShadow: '0 8px 32px rgba(0,0,0,.28)',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <p style={{
        flex: 1, margin: 0, fontSize: 13, color: 'rgba(255,255,255,.8)',
        fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.5, minWidth: 200,
      }}>
        We use cookies for login and, with your consent, analytics.{' '}
        <Link href="/privacy" style={{ color: '#34C3A0', fontWeight: 600, textDecoration: 'none' }}>
          Privacy policy
        </Link>
      </p>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={decline}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,.25)',
            background: 'transparent', color: 'rgba(255,255,255,.65)', cursor: 'pointer',
            fontFamily: "'Nunito Sans', sans-serif", fontSize: 13, fontWeight: 700,
          }}
        >
          Decline
        </button>
        <button
          onClick={accept}
          style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#34C3A0', color: '#1B3252', cursor: 'pointer',
            fontFamily: "'Nunito Sans', sans-serif", fontSize: 13, fontWeight: 800,
          }}
        >
          Accept
        </button>
      </div>
    </div>
  )
}
