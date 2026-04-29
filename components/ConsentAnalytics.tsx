'use client'

import { useEffect } from 'react'
import { getStoredConsent } from './CookieBanner'

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

function loadGA(measurementId: string) {
  if (document.getElementById('ga4-script')) return
  const s = document.createElement('script')
  s.id = 'ga4-script'
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(s)
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', measurementId, { anonymize_ip: true })
}

export default function ConsentAnalytics({ measurementId }: { measurementId: string }) {
  useEffect(() => {
    if (getStoredConsent() === 'accepted') {
      loadGA(measurementId)
    }

    function onConsent(e: Event) {
      if ((e as CustomEvent).detail === 'accepted') loadGA(measurementId)
    }

    window.addEventListener('nanasays:consent', onConsent)
    return () => window.removeEventListener('nanasays:consent', onConsent)
  }, [measurementId])

  return null
}
