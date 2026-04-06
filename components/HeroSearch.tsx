'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { REGIONS_DATA } from '@/lib/regionData'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type ResultType = 'region' | 'country' | 'school'

interface Result {
  type: ResultType
  label: string
  sub: string
  href: string
}

const TYPE_LABELS: Record<ResultType, string> = {
  region: 'Region',
  country: 'Country',
  school: 'School',
}

const TYPE_COLORS: Record<ResultType, string> = {
  region: '#2d7dd2',
  country: '#34c3a0',
  school: '#7c9ec8',
}

export default function HeroSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  // Run search whenever query changes (debounced for schools)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!query.trim()) { setResults([]); return }

    const q = query.toLowerCase()
    const found: Result[] = []

    // Regions — instant, client-side
    for (const r of REGIONS_DATA) {
      if (r.name.toLowerCase().includes(q)) {
        found.push({ type: 'region', label: r.name, sub: `${r.stats.countries} countries`, href: `/regions/${r.slug}` })
      }
    }

    // Countries — instant, client-side
    for (const r of REGIONS_DATA) {
      for (const c of r.countries) {
        if (c.name.toLowerCase().includes(q)) {
          found.push({ type: 'country', label: c.name, sub: r.name, href: `/countries/${c.slug}` })
        }
      }
    }

    setResults(found)
    setActiveIdx(-1)

    // Schools — debounced Supabase query
    timer.current = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('schools')
        .select('name, slug, country, city')
        .ilike('name', `%${query}%`)
        .eq('is_international', true)
        .order('confidence_score', { ascending: false })
        .limit(6)
      setLoading(false)
      if (data && data.length > 0) {
        const schoolResults: Result[] = data.map(s => ({
          type: 'school' as const,
          label: s.name,
          sub: [s.city, s.country].filter(Boolean).join(', '),
          href: `/schools/${s.slug}`,
        }))
        setResults(prev => {
          // Remove any stale school results then add fresh ones
          const nonSchool = prev.filter(r => r.type !== 'school')
          return [...nonSchool, ...schoolResults]
        })
      }
    }, 250)
  }, [query])

  function navigate(href: string) {
    router.push(href)
    setQuery('')
    setResults([])
    setFocused(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setFocused(false); setQuery('') }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) {
      navigate(results[activeIdx].href)
    }
  }

  const showDropdown = focused && query.trim().length > 0

  return (
    <div style={{ width: '100%', maxWidth: 460 }}>

      {/* Card */}
      <div style={{
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 20,
        padding: 28,
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
            Search the Directory
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
            Find a region, country,<br />or school by name.
          </div>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: focused ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)',
            border: `1.5px solid ${focused ? 'rgba(52,195,160,0.7)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: showDropdown ? '12px 12px 0 0' : 12,
            padding: '13px 16px',
            transition: 'border-color .15s, background .15s',
            boxShadow: focused ? '0 0 0 4px rgba(52,195,160,0.1)' : 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0, opacity: focused ? 1 : 0.5 }}>
              <circle cx="13.5" cy="13.5" r="8" stroke={focused ? '#34c3a0' : '#fff'} strokeWidth="2.5"/>
              <line x1="19.5" y1="19.5" x2="28" y2="28" stroke={focused ? '#34c3a0' : '#fff'} strokeWidth="2.8" strokeLinecap="round"/>
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={onKeyDown}
              placeholder="e.g. Thailand, Europe, UWCSEA…"
              style={{
                flex: 1, border: 'none', outline: 'none',
                background: 'transparent', color: '#fff',
                fontSize: 14, fontWeight: 500,
                fontFamily: "'Nunito Sans', -apple-system, sans-serif",
              }}
            />
            {query && (
              <button
                onMouseDown={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'rgba(255,255,255,0.5)', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
              >×</button>
            )}
          </div>

          {/* Results dropdown — absolute so it floats without expanding the card */}
          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 100,
              background: '#0f2035',
              border: '1.5px solid rgba(52,195,160,0.4)',
              borderTop: 'none',
              borderRadius: '0 0 12px 12px',
              overflow: 'hidden',
              maxHeight: 340,
              overflowY: 'auto',
            }}>
              {results.length === 0 && !loading && (
                <div style={{ padding: '16px', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}
              {loading && results.filter(r => r.type === 'school').length === 0 && results.length === 0 && (
                <div style={{ padding: '16px', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  Searching…
                </div>
              )}

              {results.map((r, i) => (
                <button
                  key={r.href}
                  onMouseDown={() => navigate(r.href)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '10px 14px',
                    background: activeIdx === i ? 'rgba(52,195,160,0.1)' : 'transparent',
                    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  {/* Type badge */}
                  <div style={{
                    fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: TYPE_COLORS[r.type],
                    background: `${TYPE_COLORS[r.type]}22`,
                    padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                    minWidth: 48, textAlign: 'center',
                  }}>
                    {TYPE_LABELS[r.type]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>
                      {r.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                      {r.sub}
                    </div>
                  </div>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
                    <polyline points="9 18 15 12 9 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </button>
              ))}

              {loading && (
                <div style={{ padding: '8px 14px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                  Searching schools…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hint chips — always rendered to preserve card height; hidden when focused */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, visibility: focused ? 'hidden' : 'visible', pointerEvents: focused ? 'none' : 'auto' }}>
          {['Thailand', 'Switzerland', 'Middle East', 'UWCSEA'].map(hint => (
            <button
              key={hint}
              onClick={() => { setQuery(hint); setFocused(true); inputRef.current?.focus() }}
              style={{
                fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 100, padding: '4px 11px', cursor: 'pointer',
                fontFamily: "'Nunito Sans', -apple-system, sans-serif",
                transition: 'background .15s, color .15s',
              }}
            >
              {hint}
            </button>
          ))}
        </div>

        {/* Footer stat */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500, letterSpacing: '0.04em' }}>
          Regions &nbsp;·&nbsp; Countries &nbsp;·&nbsp; Schools
        </div>
      </div>
    </div>
  )
}
