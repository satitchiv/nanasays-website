'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { CountryPageMeta } from '@/lib/countryMeta'
import type { SchoolListItem } from '@/lib/types'

const CountryMap = dynamic(() => import('./CountryMap'), { ssr: false })

// ─── Image Fallbacks ──────────────────────────────────────────────────────────

const UK_FALLBACKS = [
  'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1588072432836-e10032774350?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1562774053-701939374585?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1535982330050-f1c2fb79ff78?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1571260899304-425eee4c7efc?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1548690312-e3b507d8c110?w=900&q=85&auto=format&fit=crop',
]

const GENERIC_FALLBACKS = [
  'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=900&q=85&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1588072432836-e10032774350?w=900&q=85&auto=format&fit=crop',
]

function getSchoolImage(school: SchoolListItem, idx: number, country: string): string {
  if (school.hero_image) return school.hero_image
  const pool = country === 'United Kingdom' ? UK_FALLBACKS : GENERIC_FALLBACKS
  return pool[idx % pool.length]
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatFee(school: SchoolListItem): string {
  if (school.fees_original) {
    const parts = school.fees_original.split(' - ')
    return parts[0] + (parts.length > 1 ? '+' : '')
  }
  if (school.fees_usd_min) return `$${Math.round(school.fees_usd_min / 1000)}k+`
  return 'Contact'
}

function formatAges(school: SchoolListItem): string {
  if (school.age_min != null && school.age_max != null) return `${school.age_min}–${school.age_max}`
  return '—'
}

function formatCurriculum(school: SchoolListItem): string {
  const c = school.curriculum
  if (!c?.length) return school.boarding ? 'Boarding' : "Int'l"
  const first = c[0]
  if (first.length > 12) return first.split(' ')[0]
  return first
}

function formatSchoolType(t: string | null): string {
  if (t === 'boarding') return 'Boarding'
  if (t === 'day') return 'Day School'
  if (t === 'mixed') return 'Day & Boarding'
  return 'International'
}

function getNanaQuote(school: SchoolListItem): string | null {
  const text = school.unique_selling_points
  if (!text) return null
  if (text.length <= 150) return text
  const cut = text.lastIndexOf(' ', 148)
  return text.slice(0, cut > 0 ? cut : 148) + '…'
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  meta: CountryPageMeta
  schools: SchoolListItem[]
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CountryPageClient({ meta, schools }: Props) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'boarding' | 'day' | 'mixed'>('all')
  const [focusFilter, setFocusFilter] = useState<'all' | 'ib' | 'scholarship' | 'stem'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [compareList, setCompareList] = useState<SchoolListItem[]>([])
  const [compareError, setCompareError] = useState(false)
  const [hoveredCity, setHoveredCity] = useState<string | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll reveal
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('ns-visible')
          }
        })
      },
      { threshold: 0.06 }
    )

    const cards = listRef.current?.querySelectorAll('.ns-reveal')
    cards?.forEach(card => observer.observe(card))

    return () => observer.disconnect()
  }, [schools, typeFilter, focusFilter, searchQuery])

  // Filter logic
  const filtered = useMemo(() => {
    return schools.filter(school => {
      if (typeFilter !== 'all' && school.school_type !== typeFilter) return false
      if (focusFilter === 'ib' && !school.curriculum?.some(c => c.toLowerCase().includes('ib'))) return false
      if (focusFilter === 'scholarship' && !school.scholarship_available) return false
      if (focusFilter === 'stem' && !school.strengths?.includes('STEM')) return false
      if (searchQuery.trim() && !school.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [schools, typeFilter, focusFilter, searchQuery])

  const addToCompare = useCallback((school: SchoolListItem) => {
    if (compareList.find(s => s.id === school.id)) {
      setCompareList(prev => prev.filter(s => s.id !== school.id))
      return
    }
    if (compareList.length >= 3) {
      setCompareError(true)
      setTimeout(() => setCompareError(false), 2000)
      return
    }
    setCompareList(prev => [...prev, school])
  }, [compareList])

  const isInCompare = useCallback((id: string) => compareList.some(s => s.id === id), [compareList])

  return (
    <>
      <style>{`
        .ns-reveal { opacity: 0; transform: translateY(16px); transition: opacity .5s ease, transform .5s ease; }
        .ns-reveal.ns-visible { opacity: 1; transform: none; }
        @keyframes chipIn { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
        .filter-pill { border: 1.5px solid var(--bmd); background: white; color: var(--muted); border-radius: 100px; padding: 6px 13px; font-size: 11px; font-weight: 600; cursor: pointer; transition: border-color .15s, color .15s, background .15s; font-family: 'Nunito Sans', sans-serif; }
        .filter-pill:hover { border-color: var(--navy); color: var(--navy); }
        .filter-pill.on { background: var(--navy); color: #fff; border-color: var(--navy); }
        .school-card { border-radius: 14px; overflow: hidden; border: 1px solid var(--border); cursor: pointer; background: white; transition: border-color .2s, box-shadow .2s; display: flex; flex-direction: row; height: 200px; }
        .school-card:hover { border-color: var(--teal); box-shadow: 0 8px 28px rgba(0,0,0,.14); }
        .school-card:hover .sc-img { transform: scale(1.03); }
        .school-card.featured { border: 1.5px solid var(--teal); }
        .sc-left { width: 45%; flex-shrink: 0; position: relative; overflow: hidden; }
        .sc-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .4s; }
        .sc-right { flex: 1; display: flex; flex-direction: column; padding: 14px 16px; background: white; overflow: hidden; min-width: 0; }
        .compare-btn-added { background: rgba(52,195,160,.18) !important; border-color: var(--teal) !important; color: var(--teal-dk) !important; font-weight: 700 !important; }
        .view-profile-btn { flex: 1; padding: 9px 14px; border-radius: 9px; font-size: 12px; font-weight: 700; background: var(--navy); color: #fff; border: none; cursor: pointer; font-family: 'Nunito Sans', sans-serif; transition: background .15s; }
        .view-profile-btn:hover { background: #243f65; }
        .compare-btn { padding: 9px 14px; border-radius: 9px; font-size: 12px; font-weight: 600; background: white; color: var(--navy); border: 1.5px solid var(--bmd); cursor: pointer; font-family: 'Nunito Sans', sans-serif; transition: background .15s, border-color .15s, color .15s; }
        .compare-btn:hover { background: var(--off); border-color: var(--navy); }
      `}</style>

      <div style={{
        marginTop: 60,
        display: 'flex',
        alignItems: 'flex-start',
        minHeight: 'calc(100vh - 60px)',
      }}>
        {/* LEFT COLUMN */}
        <div style={{
          flex: 1,
          minWidth: 0,
          padding: '24px 24px 48px',
          background: 'var(--off)',
          overflowY: 'auto',
        }}>

          {/* Country Header Band */}
          <div style={{
            background: 'var(--navy)',
            borderRadius: 14,
            padding: '22px 24px',
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              {/* Left side */}
              <div>
                {/* Breadcrumb */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Link href="/" style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', textDecoration: 'none', fontFamily: "'Nunito Sans', sans-serif" }}>
                    Home
                  </Link>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>›</span>
                  <Link href={`/regions/${meta.regionSlug}`} style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', textDecoration: 'none', fontFamily: "'Nunito Sans', sans-serif" }}>
                    {meta.regionName}
                  </Link>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>›</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.8)', fontFamily: "'Nunito Sans', sans-serif" }}>
                    {meta.name}
                  </span>
                </div>

                {/* Country name + flag */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <img
                    src={`https://flagcdn.com/20x15/${meta.flagCode}.png`}
                    alt={meta.name}
                    width={20}
                    height={15}
                    style={{ borderRadius: 2, flexShrink: 0 }}
                  />
                  <h1 style={{
                    fontFamily: 'Nunito, sans-serif',
                    fontWeight: 900,
                    fontSize: 26,
                    color: '#fff',
                    margin: 0,
                    letterSpacing: '-0.4px',
                    lineHeight: 1.1,
                  }}>
                    {meta.name} International Schools
                  </h1>
                </div>

                {/* Nana note */}
                <p style={{
                  fontFamily: "'Nunito Sans', sans-serif",
                  fontSize: 13,
                  color: 'rgba(255,255,255,.72)',
                  margin: 0,
                  lineHeight: 1.5,
                  maxWidth: 480,
                }}>
                  {meta.nanaNote}
                </p>
              </div>

              {/* Right: stat chips */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{
                  background: 'rgba(255,255,255,.1)',
                  border: '1px solid rgba(255,255,255,.18)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  textAlign: 'center',
                  minWidth: 72,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>
                    {schools.length}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', fontFamily: "'Nunito Sans', sans-serif", marginTop: 3 }}>
                    Schools
                  </div>
                </div>
                <div style={{
                  background: 'rgba(255,255,255,.1)',
                  border: '1px solid rgba(255,255,255,.18)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  textAlign: 'center',
                  minWidth: 72,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--teal)', fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>
                    Contact
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', fontFamily: "'Nunito Sans', sans-serif", marginTop: 3 }}>
                    School
                  </div>
                </div>
                <div style={{
                  background: 'rgba(52,195,160,.18)',
                  border: '1px solid rgba(52,195,160,.35)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  textAlign: 'center',
                  minWidth: 72,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--teal)', fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>
                    Free
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', fontFamily: "'Nunito Sans', sans-serif", marginTop: 3 }}>
                    nanasays
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Compare Bar */}
          <div style={{
            background: compareList.length > 0 ? 'var(--teal-bg)' : 'white',
            border: `1.5px solid ${compareList.length > 0 ? 'var(--teal)' : 'var(--border)'}`,
            borderRadius: 12,
            padding: '11px 16px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            transition: 'border-color .2s, background .2s',
          }}>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--navy)',
              fontFamily: "'Nunito Sans', sans-serif",
              flexShrink: 0,
            }}>
              Compare schools:
            </span>

            {/* Chips */}
            <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
              {compareList.length === 0 && (
                <span style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  fontFamily: "'Nunito Sans', sans-serif",
                  fontStyle: 'italic',
                }}>
                  Add up to 3 schools to compare side by side
                </span>
              )}
              {compareList.map(school => (
                <div key={school.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'rgba(27,50,82,.08)',
                  border: '1px solid rgba(27,50,82,.12)',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--navy)',
                  fontFamily: "'Nunito Sans', sans-serif",
                  animation: 'chipIn .18s ease',
                }}>
                  {school.name}
                  <button
                    onClick={() => setCompareList(prev => prev.filter(s => s.id !== school.id))}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: 'var(--muted)',
                      fontSize: 13,
                      lineHeight: 1,
                      marginLeft: 2,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {compareError && (
                <span style={{
                  fontSize: 11,
                  color: '#e53e3e',
                  fontFamily: "'Nunito Sans', sans-serif",
                  fontWeight: 600,
                  animation: 'chipIn .18s ease',
                }}>
                  Max 3 schools
                </span>
              )}
            </div>

            <button
              disabled={compareList.length < 2}
              style={{
                padding: '8px 16px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 700,
                background: compareList.length >= 2 ? 'var(--navy)' : 'var(--bmd)',
                color: '#fff',
                border: 'none',
                cursor: compareList.length >= 2 ? 'pointer' : 'not-allowed',
                fontFamily: "'Nunito Sans', sans-serif",
                flexShrink: 0,
                transition: 'background .2s',
              }}
            >
              Compare now →
            </button>
          </div>

          {/* Filter Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            {/* Filter pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* Type filters */}
              <button
                className={`filter-pill${typeFilter === 'all' ? ' on' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                All
              </button>
              <button
                className={`filter-pill${typeFilter === 'boarding' ? ' on' : ''}`}
                onClick={() => setTypeFilter('boarding')}
              >
                Boarding
              </button>
              <button
                className={`filter-pill${typeFilter === 'day' ? ' on' : ''}`}
                onClick={() => setTypeFilter('day')}
              >
                Day
              </button>
              <button
                className={`filter-pill${typeFilter === 'mixed' ? ' on' : ''}`}
                onClick={() => setTypeFilter('mixed')}
              >
                Mixed
              </button>

              {/* Divider */}
              <div style={{ width: 1, height: 18, background: 'var(--bmd)', flexShrink: 0 }} />

              {/* Focus filters */}
              <button
                className={`filter-pill${focusFilter === 'ib' ? ' on' : ''}`}
                onClick={() => setFocusFilter(focusFilter === 'ib' ? 'all' : 'ib')}
              >
                IB
              </button>
              <button
                className={`filter-pill${focusFilter === 'scholarship' ? ' on' : ''}`}
                onClick={() => setFocusFilter(focusFilter === 'scholarship' ? 'all' : 'scholarship')}
              >
                Scholarship
              </button>
              <button
                className={`filter-pill${focusFilter === 'stem' ? ' on' : ''}`}
                onClick={() => setFocusFilter(focusFilter === 'stem' ? 'all' : 'stem')}
              >
                STEM
              </button>
            </div>

            {/* Search + count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'white',
                border: `1.5px solid ${searchFocused ? 'var(--teal)' : 'var(--border)'}`,
                borderRadius: 9,
                padding: '8px 13px',
                boxShadow: searchFocused ? '0 0 0 3px rgba(52,195,160,.15)' : 'none',
                transition: 'border-color .15s, box-shadow .15s',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="var(--muted)" strokeWidth="2"/>
                  <path d="M21 21l-4.35-4.35" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search schools..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  style={{
                    width: 180,
                    border: 'none',
                    outline: 'none',
                    fontSize: 12,
                    fontFamily: "'Nunito Sans', sans-serif",
                    color: 'var(--body)',
                    background: 'transparent',
                  }}
                />
              </div>
              <span style={{
                fontSize: 11,
                color: 'var(--muted)',
                fontFamily: "'Nunito Sans', sans-serif",
                whiteSpace: 'nowrap',
              }}>
                Showing {filtered.length} school{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Schools List */}
          <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 24px',
                background: 'white',
                borderRadius: 14,
                border: '1px solid var(--border)',
              }}>
                <div style={{
                  fontFamily: 'Nunito, sans-serif',
                  fontWeight: 900,
                  fontSize: 18,
                  color: 'var(--navy)',
                  marginBottom: 8,
                }}>
                  No schools match
                </div>
                <p style={{
                  fontFamily: "'Nunito Sans', sans-serif",
                  fontSize: 13,
                  color: 'var(--muted)',
                  margin: 0,
                }}>
                  Try adjusting your filters or search query.
                </p>
              </div>
            ) : (
              filtered.map((school, idx) => (
                <SchoolCard
                  key={school.id}
                  school={school}
                  idx={idx}
                  country={meta.name}
                  isInCompare={isInCompare(school.id)}
                  onCompare={() => addToCompare(school)}
                  onHoverCity={setHoveredCity}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — Map */}
        <div style={{
          width: 380,
          flexShrink: 0,
          position: 'sticky',
          top: 60,
          height: 'calc(100vh - 60px)',
          borderLeft: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <CountryMap
            schools={schools}
            center={meta.mapCenter}
            zoom={meta.mapZoom}
            hoveredCity={hoveredCity}
          />
        </div>
      </div>
    </>
  )
}

// ─── School Card ──────────────────────────────────────────────────────────────

interface CardProps {
  school: SchoolListItem
  idx: number
  country: string
  isInCompare: boolean
  onCompare: () => void
  onHoverCity: (city: string | null) => void
}

function SchoolCard({ school, idx, country, isInCompare, onCompare, onHoverCity }: CardProps) {
  const isFeatured = idx === 0
  const imgSrc = getSchoolImage(school, idx, country)
  const nanaQuote = getNanaQuote(school)

  // Left badge logic
  let leftBadge: { text: string; bg: string; color: string } | null = null
  if (isFeatured) {
    leftBadge = { text: "Nana's Pick", bg: 'var(--teal)', color: '#fff' }
  } else if (school.scholarship_available) {
    leftBadge = { text: 'Scholarships', bg: 'var(--blue-bg)', color: 'var(--blue)' }
  } else if (school.strengths?.includes('STEM')) {
    leftBadge = { text: 'STEM', bg: 'var(--blue-bg)', color: 'var(--blue)' }
  } else if (school.curriculum?.some(c => c.toLowerCase().includes('ib'))) {
    leftBadge = { text: 'IB World School', bg: 'var(--teal-bg)', color: 'var(--teal-dk)' }
  }

  // Stat cells
  const stats = [
    { label: 'Fee', value: formatFee(school) },
    { label: 'Ages', value: formatAges(school) },
    { label: 'Curriculum', value: formatCurriculum(school) },
    { label: school.nationalities_count ? 'Nationalities' : (school.boarding ? 'Type' : 'Students'), value: school.nationalities_count ? `${school.nationalities_count}+` : (school.boarding ? 'Boarding' : 'Day') },
  ]

  return (
    <div
      className={`school-card ns-reveal${isFeatured ? ' featured' : ''}`}
      onMouseEnter={() => school.city && onHoverCity(school.city)}
      onMouseLeave={() => onHoverCity(null)}
    >
      {/* LEFT: Image */}
      <div className="sc-left">
        <img src={imgSrc} alt={school.name} className="sc-img" />

        {/* Left badge */}
        {leftBadge && (
          <div style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 3,
            fontSize: 9,
            fontWeight: 800,
            padding: '3px 10px',
            borderRadius: 100,
            whiteSpace: 'nowrap',
            background: leftBadge.bg,
            color: leftBadge.color,
            fontFamily: "'Nunito Sans', sans-serif",
          }}>
            {leftBadge.text}
          </div>
        )}

        {/* Type badge */}
        <div style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          zIndex: 3,
          background: 'rgba(11,20,38,.72)',
          color: '#fff',
          fontSize: 9,
          fontWeight: 800,
          padding: '3px 10px',
          borderRadius: 100,
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,.12)',
          fontFamily: "'Nunito Sans', sans-serif",
          whiteSpace: 'nowrap',
        }}>
          {formatSchoolType(school.school_type)}
        </div>
      </div>

      {/* RIGHT: Info */}
      <div className="sc-right">
        {/* Name */}
        <div style={{
          fontFamily: 'Nunito, sans-serif',
          fontWeight: 900,
          color: 'var(--navy)',
          fontSize: 16,
          letterSpacing: '-0.3px',
          lineHeight: 1.2,
          marginBottom: 2,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        } as React.CSSProperties}>
          {school.name}
        </div>

        {/* Location */}
        <div style={{
          fontSize: 11,
          color: '#6B7280',
          marginBottom: 8,
          fontFamily: "'Nunito Sans', sans-serif",
        }}>
          {[school.city, school.country].filter(Boolean).join(', ')}
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          {stats.map(stat => (
            <div key={stat.label} style={{
              flex: 1,
              background: 'var(--off)',
              border: '1px solid var(--border)',
              borderRadius: 7,
              padding: '5px 7px',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: 8,
                color: 'var(--muted)',
                marginBottom: 2,
                fontWeight: 500,
                fontFamily: "'Nunito Sans', sans-serif",
              }}>
                {stat.label}
              </div>
              <div style={{
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--navy)',
                lineHeight: 1,
                fontFamily: "'Nunito Sans', sans-serif",
              }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Nana quote */}
        {nanaQuote && (
          <div style={{
            fontSize: 10,
            fontStyle: 'italic',
            color: '#4B5563',
            lineHeight: 1.5,
            borderLeft: '2.5px solid var(--teal)',
            padding: '6px 10px',
            borderRadius: '0 6px 6px 0',
            background: 'var(--teal-bg)',
            marginBottom: 8,
            fontFamily: "'Nunito Sans', sans-serif",
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          } as React.CSSProperties}>
            {nanaQuote}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 7, marginTop: 'auto' }}>
          <Link href={`/schools/${school.slug}`} style={{ flex: 1, textDecoration: 'none' }}>
            <button className="view-profile-btn" style={{ width: '100%' }}>
              View profile →
            </button>
          </Link>
          <button
            className={`compare-btn${isInCompare ? ' compare-btn-added' : ''}`}
            onClick={e => { e.preventDefault(); onCompare() }}
          >
            {isInCompare ? '✓ Added' : '+ Compare'}
          </button>
        </div>
      </div>
    </div>
  )
}
