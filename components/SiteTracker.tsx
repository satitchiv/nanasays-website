'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function getSessionId() {
  try {
    let id = sessionStorage.getItem('ns_sid')
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      sessionStorage.setItem('ns_sid', id)
    }
    return id
  } catch {
    return undefined
  }
}

function parsePathname(pathname: string) {
  if (pathname === '/') return { event_type: 'homepage', school_slug: undefined, country_slug: undefined }
  const schoolMatch = pathname.match(/^\/schools\/([^/]+)/)
  if (schoolMatch) return { event_type: 'school_view', school_slug: schoolMatch[1], country_slug: undefined }
  const countryMatch = pathname.match(/^\/countries\/([^/]+)/)
  if (countryMatch) return { event_type: 'country_view', school_slug: undefined, country_slug: countryMatch[1] }
  if (pathname.startsWith('/blog/')) return { event_type: 'blog_view', school_slug: undefined, country_slug: undefined }
  if (pathname.startsWith('/regions/')) return { event_type: 'region_view', school_slug: undefined, country_slug: undefined }
  return { event_type: 'page_view', school_slug: undefined, country_slug: undefined }
}

export default function SiteTracker() {
  const pathname = usePathname()

  useEffect(() => {
    const { event_type, school_slug, country_slug } = parsePathname(pathname)
    const session_id = getSessionId()
    const referrer = typeof document !== 'undefined' ? (document.referrer || undefined) : undefined

    supabase.from('site_events').insert({
      event_type,
      school_slug: school_slug ?? null,
      country_slug: country_slug ?? null,
      page_path: pathname,
      referrer: referrer ?? null,
      session_id: session_id ?? null,
    }).then()
  }, [pathname])

  return null
}

// Call this from anywhere to log a search query
export function trackSearch(query: string) {
  if (!query.trim()) return
  const session_id = (() => {
    try { return sessionStorage.getItem('ns_sid') ?? undefined } catch { return undefined }
  })()
  supabase.from('site_events').insert({
    event_type: 'search',
    search_query: query.trim().toLowerCase(),
    page_path: typeof window !== 'undefined' ? window.location.pathname : null,
    session_id: session_id ?? null,
  }).then()
}
