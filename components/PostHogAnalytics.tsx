'use client'

import { useEffect } from 'react'
import { getStoredConsent } from './CookieBanner'

function loadPostHog(key: string) {
  import('posthog-js').then(({ default: posthog }) => {
    if (posthog.__loaded) return
    posthog.init(key, {
      api_host: 'https://us.i.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      session_recording: {},
      persistence: 'localStorage+cookie',
    })
  })
}

export default function PostHogAnalytics({ apiKey }: { apiKey: string }) {
  useEffect(() => {
    if (getStoredConsent() === 'accepted') {
      loadPostHog(apiKey)
    }

    function onConsent(e: Event) {
      if ((e as CustomEvent).detail === 'accepted') loadPostHog(apiKey)
    }

    window.addEventListener('nanasays:consent', onConsent)
    return () => window.removeEventListener('nanasays:consent', onConsent)
  }, [apiKey])

  return null
}
