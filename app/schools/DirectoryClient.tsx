'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

export type SchoolCard = {
  slug: string
  name: string
  city: string | null
  boarding: string | null
  gender_split: string | null
  age_min: number | null
  age_max: number | null
  fees_min: number | null
  sports: string[]
  has_rugby: boolean
  has_cricket: boolean
  has_hockey: boolean
  has_football: boolean
  has_tennis: boolean
  pct_complete: number
}

const SPORT_FILTERS = [
  { key: 'rugby',    label: 'Rugby',    field: 'has_rugby' as const },
  { key: 'cricket',  label: 'Cricket',  field: 'has_cricket' as const },
  { key: 'hockey',   label: 'Hockey',   field: 'has_hockey' as const },
  { key: 'football', label: 'Football', field: 'has_football' as const },
  { key: 'tennis',   label: 'Tennis',   field: 'has_tennis' as const },
]

const BOARDING_FILTERS = [
  { key: 'boarding', label: 'Boarding' },
  { key: 'day',      label: 'Day' },
]

function fmtFees(min: number | null) {
  if (!min) return null
  // fees_min is in USD — convert rough to GBP (approx 0.79) for display
  const gbp = Math.round((min * 0.79) / 1000) * 1000
  return `from £${(gbp / 1000).toFixed(0)}k/yr`
}

function boardingLabel(b: string | null) {
  if (!b) return null
  const l = b.toLowerCase()
  if (l.includes('full boarding') || l === 'boarding') return 'Full boarding'
  if (l.includes('weekly')) return 'Weekly boarding'
  if (l.includes('flexi')) return 'Flexi boarding'
  if (l.includes('day and boarding') || l.includes('boarding and day')) return 'Boarding'
  if (l === 'day') return 'Day'
  return null
}

function genderLabel(g: string | null) {
  if (!g) return null
  if (g === 'boys') return 'Boys'
  if (g === 'girls') return 'Girls'
  if (g === 'co-ed' || g === 'mixed') return 'Co-ed'
  return null
}

export default function DirectoryClient({ schools }: { schools: SchoolCard[] }) {
  const [query, setQuery] = useState('')
  const [boardingFilter, setBoardingFilter] = useState<string | null>(null)
  const [sportFilter, setSportFilter] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return schools.filter(s => {
      if (q && !s.name.toLowerCase().includes(q) && !s.city?.toLowerCase().includes(q)) return false
      if (boardingFilter === 'boarding') {
        const b = (s.boarding ?? '').toLowerCase()
        if (!b || b === 'day') return false
      }
      if (boardingFilter === 'day') {
        const b = (s.boarding ?? '').toLowerCase()
        if (b && b !== 'day' && !b.includes('day')) return false
      }
      if (sportFilter) {
        const sf = SPORT_FILTERS.find(f => f.key === sportFilter)
        if (sf && !s[sf.field]) return false
      }
      return true
    })
  }, [schools, query, boardingFilter, sportFilter])

  return (
    <>
      {/* Controls bar — navy bg, visually attached to header */}
      <div className="dir-controls-bar">
      <div className="dir-controls">
        <input
          className="dir-search"
          placeholder="Search school or town…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search schools"
        />
        <div className="dir-filters">
          {BOARDING_FILTERS.map(f => (
            <button
              key={f.key}
              className={`dir-pill${boardingFilter === f.key ? ' active' : ''}`}
              onClick={() => setBoardingFilter(boardingFilter === f.key ? null : f.key)}
            >
              {f.label}
            </button>
          ))}
          {SPORT_FILTERS.map(f => (
            <button
              key={f.key}
              className={`dir-pill${sportFilter === f.key ? ' active' : ''}`}
              onClick={() => setSportFilter(sportFilter === f.key ? null : f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* Results count */}
      <div className="dir-results-bar">
        {filtered.length} school{filtered.length !== 1 ? 's' : ''}
        {query || boardingFilter || sportFilter ? ' match your filters' : ' in the directory'}
      </div>

      {/* Grid */}
      <div className="dir-grid">
        {filtered.length === 0 && (
          <div className="dir-empty">
            <div style={{ fontSize: 32 }}>🔍</div>
            <p>No schools match those filters. Try broadening your search.</p>
          </div>
        )}
        {filtered.map(s => {
          const bl = boardingLabel(s.boarding)
          const gl = genderLabel(s.gender_split)
          const fees = fmtFees(s.fees_min)
          const topSports = s.sports.slice(0, 3)

          return (
            <Link key={s.slug} href={`/schools/${s.slug}`} className="dir-card">
              <div className="dir-card-name">{s.name}</div>
              {s.city && <div className="dir-card-city">{s.city}</div>}
              <div className="dir-card-tags">
                {gl && <span className="dir-tag">{gl}</span>}
                {bl && <span className="dir-tag">{bl}</span>}
                {s.age_min != null && s.age_max != null && (
                  <span className="dir-tag">Ages {s.age_min}–{s.age_max}</span>
                )}
                {topSports.map(sp => (
                  <span key={sp} className="dir-tag sport">{sp}</span>
                ))}
              </div>
              {fees && (
                <div className="dir-card-fees"><strong>{fees}</strong></div>
              )}
              <div className="dir-card-cta">View full report →</div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
