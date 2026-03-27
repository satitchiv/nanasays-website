'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { REGIONS_DATA } from '@/lib/regionData'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Result {
  type: 'region' | 'country' | 'school'
  label: string
  sub: string
  href: string
}

function highlight(text: string, query: string) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    text.slice(0, idx) +
    '<mark>' +
    text.slice(idx, idx + query.length) +
    '</mark>' +
    text.slice(idx + query.length)
  )
}

export default function NavSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    const lower = q.toLowerCase()
    const found: Result[] = []

    // Regions — client side
    for (const r of REGIONS_DATA) {
      if (r.name.toLowerCase().includes(lower)) {
        found.push({ type: 'region', label: r.name, sub: `${r.stats.countries} countries`, href: `/regions/${r.slug}` })
      }
    }

    // Countries — client side
    for (const r of REGIONS_DATA) {
      for (const c of r.countries) {
        if (c.name.toLowerCase().includes(lower)) {
          found.push({ type: 'country', label: c.name, sub: r.name, href: `/countries/${c.slug}` })
        }
      }
    }

    // Schools — Supabase
    setLoading(true)
    const { data } = await supabase
      .from('schools')
      .select('name, slug, country, city')
      .ilike('name', `%${q}%`)
      .order('confidence_score', { ascending: false })
      .limit(6)
    setLoading(false)

    if (data) {
      for (const s of data) {
        found.push({
          type: 'school',
          label: s.name,
          sub: [s.city, s.country].filter(Boolean).join(', '),
          href: `/schools/${s.slug}`,
        })
      }
    }

    setResults(found)
    setActive(-1)
  }, [])

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 220)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, -1)) }
    if (e.key === 'Enter' && active >= 0 && results[active]) {
      router.push(results[active].href)
      setOpen(false); setQuery('')
    }
  }

  function navigate(href: string) {
    router.push(href)
    setOpen(false)
    setQuery('')
  }

  const grouped = {
    region: results.filter(r => r.type === 'region'),
    country: results.filter(r => r.type === 'country'),
    school: results.filter(r => r.type === 'school'),
  }

  const typeLabel: Record<string, string> = { region: 'Regions', country: 'Countries', school: 'Schools' }

  let cursor = -1

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Search input */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: open ? '#fff' : 'var(--off)',
          border: `1px solid ${open ? 'var(--teal)' : 'var(--border)'}`,
          borderRadius: 9, padding: '7px 12px',
          boxShadow: open ? '0 0 0 3px rgba(52,195,160,.12)' : 'none',
          width: open ? 240 : 190,
          transition: 'width .2s, border-color .15s, background .15s',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0, color: open ? 'var(--teal)' : '#94a3b8' }}>
          <circle cx="13.5" cy="13.5" r="8" stroke="currentColor" strokeWidth="2.5"/>
          <line x1="19.5" y1="19.5" x2="28" y2="28" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/>
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          placeholder="Search regions, countries, schools…"
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: 12, fontWeight: 500, color: 'var(--navy)',
            width: '100%', fontFamily: "'Nunito Sans', -apple-system, sans-serif",
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8', lineHeight: 1, flexShrink: 0, fontSize: 15 }}
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && query.trim() && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 300, background: '#fff',
          borderRadius: 12, border: '1px solid var(--border)',
          boxShadow: '0 8px 32px rgba(27,50,82,.14)',
          zIndex: 600, overflow: 'hidden',
          maxHeight: 420, overflowY: 'auto',
        }}>
          {results.length === 0 && !loading && (
            <div style={{ padding: '18px 16px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {loading && results.filter(r => r.type !== 'school').length === 0 && (
            <div style={{ padding: '18px 16px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
              Searching…
            </div>
          )}

          {(['region', 'country', 'school'] as const).map(type => {
            const group = grouped[type]
            if (!group.length) return null
            return (
              <div key={type}>
                <div style={{
                  padding: '8px 14px 4px',
                  fontSize: 10, fontWeight: 800, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  background: '#fafafa', borderBottom: '1px solid #f1f5f9',
                }}>
                  {typeLabel[type]}
                </div>
                {group.map(r => {
                  cursor++
                  const idx = cursor
                  return (
                    <button
                      key={r.href}
                      onMouseDown={() => navigate(r.href)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '9px 14px',
                        background: active === idx ? '#f0fdfb' : 'transparent',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        borderBottom: '1px solid #f8fafc',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={() => setActive(idx)}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                        background: type === 'region' ? 'rgba(27,50,82,.08)' : type === 'country' ? 'rgba(52,195,160,.10)' : 'rgba(45,125,210,.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {type === 'region' && (
                          <svg width="13" height="13" viewBox="0 0 32 32" fill="none">
                            <circle cx="16" cy="16" r="13" stroke="var(--navy)" strokeWidth="2"/>
                            <ellipse cx="16" cy="16" rx="5" ry="13" stroke="var(--navy)" strokeWidth="1.5" fill="none"/>
                            <line x1="3" y1="16" x2="29" y2="16" stroke="var(--navy)" strokeWidth="1.5"/>
                          </svg>
                        )}
                        {type === 'country' && (
                          <svg width="12" height="12" viewBox="0 0 32 32" fill="none">
                            <path d="M16 3 C10 3 4 8 4 15 C4 22 16 30 16 30 C16 30 28 22 28 15 C28 8 22 3 16 3Z" stroke="var(--teal-dk)" strokeWidth="2" fill="none"/>
                            <circle cx="16" cy="15" r="3" fill="var(--teal-dk)"/>
                          </svg>
                        )}
                        {type === 'school' && (
                          <svg width="12" height="12" viewBox="0 0 32 32" fill="none">
                            <path d="M4 28 L4 14 L16 5 L28 14 L28 28" stroke="#2d7dd2" strokeWidth="2" strokeLinecap="round"/>
                            <rect x="11" y="18" width="10" height="10" rx="1.5" stroke="#2d7dd2" strokeWidth="1.8" fill="none"/>
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', lineHeight: 1.3 }}
                          dangerouslySetInnerHTML={{ __html: highlight(r.label, query) }}
                        />
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{r.sub}</div>
                      </div>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#cbd5e1' }}>
                        <polyline points="9 18 15 12 9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {loading && grouped.school.length === 0 && results.length > 0 && (
            <div style={{ padding: '8px 14px 10px', fontSize: 11, color: '#94a3b8' }}>
              Searching schools…
            </div>
          )}
        </div>
      )}

      <style>{`
        mark { background: rgba(52,195,160,.18); color: var(--teal-dk); border-radius: 2px; padding: 0 1px; font-style: normal; }
      `}</style>
    </div>
  )
}
