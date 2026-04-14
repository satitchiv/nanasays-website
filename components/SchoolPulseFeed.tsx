'use client'
import { useState, useEffect } from 'react'

function decodeHtml(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

const FEED_CAT_COLORS: Record<string, string> = {
  Results:      '#7c3aed',
  Admissions:   '#059669',
  Scholarships: '#059669',
  Sport:        '#ea580c',
  Facilities:   '#0891b2',
  Community:    '#db2877',
  Events:       '#2563eb',
  Curriculum:   '#4f46e5',
  Leadership:   '#888780',
}
const DEFAULT_COLOR = '#0891b2'

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - now.getTime()) / 86400000)
}

interface FeedItem {
  id: string
  title: string
  link: string
  published_at: string | null
  summary: string | null
  source_name: string
  category: string | null
  importance: string | null
  has_date: boolean
  detected_date: string | null
}

interface Props {
  items: FeedItem[]
  schoolName: string
  officialWebsite: string | null
}

export default function SchoolPulseFeed({ items, schoolName, officialWebsite }: Props) {
  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[]
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const filtered = activeFilter ? items.filter(i => i.category === activeFilter) : items

  // Category counts
  const categoryCounts: Record<string, number> = {}
  for (const item of items) {
    if (item.category) categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1
  }

  return (
    <>
      {/* Category filter pills */}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            onClick={() => setActiveFilter(null)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${activeFilter === null ? 'var(--navy)' : 'var(--border)'}`,
              background: activeFilter === null ? 'var(--navy)' : 'transparent',
              color: activeFilter === null ? '#fff' : 'var(--muted)',
            }}
          >
            All <span style={{ opacity: 0.7 }}>{items.length}</span>
          </button>
          {categories.map(cat => {
            const color = FEED_CAT_COLORS[cat] || DEFAULT_COLOR
            const isActive = activeFilter === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveFilter(isActive ? null : cat)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${isActive ? color : 'var(--border)'}`,
                  background: isActive ? `${color}18` : 'transparent',
                  color: isActive ? color : 'var(--muted)',
                }}
              >
                {cat} <span style={{ fontWeight: 500 }}>{categoryCounts[cat]}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Feed cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {filtered.slice(0, 5).map(item => {
          const color = item.category ? (FEED_CAT_COLORS[item.category] || DEFAULT_COLOR) : DEFAULT_COLOR
          const days = mounted && item.has_date && item.detected_date ? daysUntil(item.detected_date) : null
          const showBadge = days !== null && days > 0

          return (
            <a
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                textDecoration: 'none',
                padding: '14px 0 14px 16px',
                borderLeft: `3px solid ${color}`,
                marginBottom: 10,
              }}
            >
              {/* Category + deadline badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                {item.category && (
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color, background: `${color}15`, borderRadius: 10,
                    padding: '2px 10px',
                  }}>
                    {item.category}
                  </span>
                )}
                {showBadge && (
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: '#fff',
                    background: days! <= 7 ? '#dc2626' : '#ea580c',
                    borderRadius: 10, padding: '2px 10px',
                  }}>
                    {days} day{days !== 1 ? 's' : ''} away
                  </span>
                )}
              </div>

              {/* Title + external link icon */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--navy)', lineHeight: 1.4 }}>
                  {decodeHtml(item.title)}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 3 }}>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </div>

              {item.summary && (
                <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.55, marginTop: 6 }}>
                  {(() => { const s = decodeHtml(item.summary); return s.slice(0, 160) + (s.length > 160 ? '…' : '') })()}
                </div>
              )}
              {item.published_at && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                  {new Date(item.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              )}
            </a>
          )
        })}
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {officialWebsite && (
          <a
            href={`${officialWebsite}/news`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 14, color: 'var(--teal-dk)', fontWeight: 600, textDecoration: 'none' }}
          >
            View all updates →
          </a>
        )}
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Source: school website · Updated hourly
        </span>
      </div>
    </>
  )
}
