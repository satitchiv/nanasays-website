'use client'

import Image from 'next/image'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CountryPageMeta } from '@/lib/countryMeta'
import type { SchoolListItem } from '@/lib/types'
import FilterDrawer, { type FilterState, EMPTY_FILTERS, countActiveFilters } from './FilterDrawer'

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  meta: CountryPageMeta
  schools: SchoolListItem[]
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CountryPageClient({ meta, schools }: Props) {
  const router = useRouter()
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [compareList, setCompareList] = useState<SchoolListItem[]>([])
  const [compareError, setCompareError] = useState(false)
  const [hoveredSchoolId, setHoveredSchoolId] = useState<string | null>(null)
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)
  const [feeTableOpen, setFeeTableOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list')
  const [mobileMapMounted, setMobileMapMounted] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const leftColRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Map pin clicked → scroll list to that school and highlight it
  const handleSchoolClick = useCallback((id: string) => {
    setSelectedSchoolId(id)
    const card = leftColRef.current?.querySelector(`[data-school-id="${CSS.escape(id)}"]`) as HTMLElement | null
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  // Scroll reveal
  useEffect(() => {
    // Cards already in viewport on mount should appear instantly (no animation)
    const allCards = listRef.current?.querySelectorAll('.ns-reveal')
    allCards?.forEach(card => {
      const rect = card.getBoundingClientRect()
      if (rect.top < window.innerHeight) {
        ;(card as HTMLElement).style.transition = 'none'
        card.classList.add('ns-visible')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            ;(card as HTMLElement).style.transition = ''
          })
        })
      }
    })

    // Observer animates cards that scroll into view later
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

    allCards?.forEach(card => {
      if (!card.classList.contains('ns-visible')) observer.observe(card)
    })

    return () => observer.disconnect()
  }, [schools, filters, searchQuery])

  // Filter logic
  const filtered = useMemo(() => {
    return schools.filter(school => {
      // Search
      if (searchQuery.trim() && !school.name.toLowerCase().includes(searchQuery.toLowerCase())) return false

      // Stage (OR logic — any selected stage must match)
      if (filters.stage.size > 0) {
        const ageMin = school.age_min ?? 99
        const ageMax = school.age_max ?? 0
        const matchesStage =
          (filters.stage.has('early_years') && ageMin <= 5) ||
          (filters.stage.has('primary') && ageMin <= 7 && ageMax >= 11) ||
          (filters.stage.has('secondary') && ageMax >= 16) ||
          (filters.stage.has('all_through') && ageMin <= 5 && ageMax >= 16)
        if (!matchesStage) return false
      }

      // Curriculum (OR logic)
      if (filters.curriculum.size > 0) {
        const c = (school.curriculum ?? []).join(' ').toLowerCase()
        const matchesCurriculum =
          (filters.curriculum.has('ib') && c.includes('ib')) ||
          (filters.curriculum.has('british') && (c.includes('british') || c.includes('igcse') || c.includes('a-level') || c.includes('a level'))) ||
          (filters.curriculum.has('american') && (c.includes('american') || c.includes(' ap '))) ||
          (filters.curriculum.has('cambridge') && c.includes('cambridge')) ||
          (filters.curriculum.has('montessori') && c.includes('montessori'))
        if (!matchesCurriculum) return false
      }

      // Budget
      if (filters.budget !== 'all' && school.fees_usd_min != null) {
        if (filters.budget === 'under_10k' && school.fees_usd_min >= 10000) return false
        if (filters.budget === '10_25k' && (school.fees_usd_min < 10000 || school.fees_usd_min > 25000)) return false
        if (filters.budget === 'over_25k' && school.fees_usd_min <= 25000) return false
      }

      // Toggles
      if (filters.boarding && !school.boarding) return false
      if (filters.scholarship && !school.scholarship_available) return false
      if (filters.sen && !school.sen_support) return false
      if (filters.eal && !school.eal_support) return false

      return true
    })
  }, [schools, filters, searchQuery])

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
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onChange={setFilters}
        matchCount={filtered.length}
      />
      <div className="ns-country-layout" style={{ marginTop: 60 }}>
        {/* LEFT COLUMN */}
        <div ref={leftColRef} className="ns-country-left-col">

          {/* Country Header Band */}
          <div style={{
            background: 'var(--navy)',
            borderRadius: 14,
            padding: '22px 24px',
            marginBottom: 14,
            marginTop: 24,
          }}>
            <div className="ns-country-header">
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
                  <Image
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
              <div className="ns-country-chips">
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

          {/* Country Intro Copy — collapsible */}
          {meta.countryIntro && (
            <div style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 14,
              marginBottom: 14,
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setIntroOpen(o => !o)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderBottom: introOpen ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--navy)',
                  letterSpacing: '-0.2px',
                }}>
                  About International Schools in {meta.name}
                </span>
                <span style={{
                  fontSize: 16,
                  color: 'var(--muted)',
                  transform: introOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  flexShrink: 0,
                  marginLeft: 8,
                }}>
                  ↓
                </span>
              </button>
              {introOpen && (
                <div style={{ padding: '16px 20px' }}>
                  {meta.countryIntro.split('\n\n').filter(Boolean).map((para, i) => (
                    <p key={i} style={{
                      fontSize: 13,
                      color: 'var(--body)',
                      lineHeight: 1.7,
                      fontFamily: "'Nunito Sans', sans-serif",
                      fontWeight: 400,
                      marginBottom: i === 0 ? 10 : 0,
                    }}>
                      {para.trim()}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fee Comparison Table — collapsible */}
          {meta.feeTableSchools && meta.feeTableSchools.length > 0 && (
            <div style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 14,
              marginBottom: 14,
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setFeeTableOpen(o => !o)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderBottom: feeTableOpen ? '1px solid var(--border)' : 'none',
                  borderRadius: feeTableOpen ? '14px 14px 0 0' : 14,
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--navy)',
                  letterSpacing: '-0.2px',
                }}>
                  International School Fees in {meta.name}
                </span>
                <span style={{
                  fontSize: 16,
                  color: 'var(--muted)',
                  transform: feeTableOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  flexShrink: 0,
                  marginLeft: 8,
                }}>
                  ↓
                </span>
              </button>
              {feeTableOpen && (
                <div style={{ padding: '16px 20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'Nunito Sans', sans-serif", tableLayout: 'fixed' }}>
                    <colgroup>
                      {isMobile ? (
                        <>
                          <col style={{ width: '48%' }} />
                          <col style={{ width: '27%' }} />
                          <col style={{ width: '25%' }} />
                        </>
                      ) : (
                        <>
                          <col style={{ width: '35%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '15%' }} />
                          <col style={{ width: '10%' }} />
                        </>
                      )}
                    </colgroup>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 700, color: 'var(--navy)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>School</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 700, color: 'var(--navy)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>Curriculum</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 700, color: 'var(--navy)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>Fees (USD)</th>
                        {!isMobile && <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 700, color: 'var(--navy)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>City</th>}
                        {!isMobile && <th style={{ textAlign: 'left', padding: '6px 8px 8px', fontWeight: 700, color: 'var(--navy)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px' }}>Ages</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {meta.feeTableSchools.map((s, i) => (
                        <tr key={s.slug} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : 'var(--off)' }}>
                          <td style={{ padding: '9px 8px' }}>
                            <Link href={`/schools/${s.slug}`} style={{ color: 'var(--navy)', fontWeight: 600, textDecoration: 'none', lineHeight: 1.3 }}>
                              {s.name}
                            </Link>
                          </td>
                          <td style={{ padding: '9px 8px', color: 'var(--body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.curriculum ? s.curriculum.split(' ')[0] : '—'}
                          </td>
                          <td style={{ padding: '9px 8px', color: 'var(--body)' }}>
                            {s.fees_usd_min
                              ? `$${Math.round(s.fees_usd_min / 1000)}k${s.fees_usd_max && s.fees_usd_max !== s.fees_usd_min ? `–$${Math.round(s.fees_usd_max / 1000)}k` : '+'}`
                              : '—'}
                          </td>
                          {!isMobile && <td style={{ padding: '9px 8px', color: 'var(--body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.city ?? '—'}</td>}
                          {!isMobile && <td style={{ padding: '9px 8px', color: 'var(--body)', whiteSpace: 'nowrap' }}>{s.age_min != null && s.age_max != null ? `${s.age_min}–${s.age_max}` : '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, fontFamily: "'Nunito Sans', sans-serif" }}>
                    Data verified by NanaSays as of April 2026. Fees shown in USD per year.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Sticky wrapper — toolbar + mobile toggle stick together */}
          <div style={{
            position: 'sticky',
            top: 60,
            zIndex: 20,
            background: 'var(--off)',
            marginBottom: 14,
            // Extend edge-to-edge to match the toolbar's negative-margin reach
            marginLeft: isMobile ? -16 : -24,
            marginRight: isMobile ? -16 : -24,
          }}>

          {/* Toolbar */}
          <div className="ns-country-toolbar" style={{
            background: 'var(--off)',
            borderBottom: '1px solid var(--border)',
            marginBottom: 0,
            // Cancel the class's negative margin — wrapper handles edge-to-edge now
            margin: 0,
          }}>
            {/* Compare button */}
            <button
              onClick={() => {
                if (compareList.length < 2) return
                const slugs = compareList.slice(0, 2).map(s => s.slug)
                router.push(`/compare/${slugs[0]}-vs-${slugs[1]}`)
              }}
              disabled={compareList.length < 2}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px',
                background: compareList.length >= 2 ? 'var(--navy)' : 'white',
                color: compareList.length >= 2 ? '#fff' : 'var(--muted)',
                border: `1.5px solid ${compareList.length >= 2 ? 'var(--navy)' : 'var(--border)'}`,
                borderRadius: 10, cursor: compareList.length >= 2 ? 'pointer' : 'default',
                fontFamily: "'Nunito Sans', sans-serif",
                fontWeight: 700, fontSize: 12,
                flexShrink: 0,
                transition: 'all .15s',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
              </svg>
              Compare
              {compareList.length > 0 && (
                <span style={{
                  background: compareList.length >= 2 ? '#34C3A0' : '#D1D5DB',
                  color: '#fff', fontSize: 10, fontWeight: 800,
                  borderRadius: '50%', width: 17, height: 17,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {compareList.length}
                </span>
              )}
            </button>

            {compareError && (
              <span style={{ fontSize: 11, color: '#e53e3e', fontFamily: "'Nunito Sans', sans-serif", fontWeight: 600, flexShrink: 0 }}>
                Max 3
              </span>
            )}

            {/* Filter button */}
            <button
              onClick={() => setDrawerOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px',
                background: countActiveFilters(filters) > 0 ? 'var(--teal)' : 'white',
                color: countActiveFilters(filters) > 0 ? '#fff' : 'var(--navy)',
                border: `1.5px solid ${countActiveFilters(filters) > 0 ? 'var(--teal)' : 'var(--border)'}`,
                borderRadius: 10, cursor: 'pointer',
                fontFamily: "'Nunito Sans', sans-serif",
                fontWeight: 700, fontSize: 12,
                flexShrink: 0,
                transition: 'all .15s',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
              </svg>
              Filters
              {countActiveFilters(filters) > 0 && (
                <span style={{
                  background: 'rgba(255,255,255,.3)', color: '#fff',
                  fontSize: 10, fontWeight: 800,
                  borderRadius: '50%', width: 17, height: 17,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {countActiveFilters(filters)}
                </span>
              )}
            </button>

            {/* Search — flexible */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0,
              background: 'white',
              border: `1.5px solid ${searchFocused ? 'var(--teal)' : 'var(--border)'}`,
              borderRadius: 10, padding: '8px 12px',
              boxShadow: searchFocused ? '0 0 0 3px rgba(52,195,160,.12)' : 'none',
              transition: 'border-color .15s, box-shadow .15s',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
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
                  flex: 1, minWidth: 0,
                  border: 'none', outline: 'none',
                  fontSize: 12, fontFamily: "'Nunito Sans', sans-serif",
                  color: 'var(--body)', background: 'transparent',
                }}
              />
            </div>

            {/* Count */}
            <span style={{
              fontSize: 11, color: 'var(--muted)',
              fontFamily: "'Nunito Sans', sans-serif",
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {filtered.length} school{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Mobile: List / Map toggle row — inside sticky wrapper */}
          {isMobile && (
            <div style={{
              display: 'flex',
              background: 'var(--off)',
              borderBottom: '1px solid var(--border)',
              padding: '8px 16px',
              gap: 8,
            }}>
              {(['list', 'map'] as const).map(view => (
                <button
                  key={view}
                  onClick={() => {
                    if (view === 'map') setMobileMapMounted(true)
                    setMobileView(view)
                  }}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    borderRadius: 8,
                    border: `1.5px solid ${mobileView === view ? 'var(--navy)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    fontFamily: "'Nunito Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 13,
                    background: mobileView === view ? 'var(--navy)' : '#fff',
                    color: mobileView === view ? '#fff' : 'var(--muted)',
                    transition: 'background .15s, color .15s, border-color .15s',
                  }}
                >
                  {view === 'list' ? 'List' : 'Map'}
                </button>
              ))}
            </div>
          )}

          </div>{/* end sticky wrapper */}

          {/* Mobile map view */}
          {isMobile && mobileMapMounted && (
            <div style={{
              display: mobileView === 'map' ? 'block' : 'none',
              height: 'calc(100svh - 180px)',
              minHeight: 400,
              borderRadius: 14,
              overflow: 'hidden',
              marginBottom: 14,
              border: '1px solid var(--border)',
            }}>
              <CountryMap
                schools={schools}
                center={meta.mapCenter}
                zoom={meta.mapZoom}
                hoveredSchoolId={hoveredSchoolId}
                selectedSchoolId={selectedSchoolId}
                onSchoolClick={(id) => {
                  handleSchoolClick(id)
                  setMobileView('list')
                }}
              />
            </div>
          )}

          {/* Schools List */}
          <div ref={listRef} style={{ display: isMobile && mobileView === 'map' ? 'none' : 'flex', flexDirection: 'column', gap: 12 }}>
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
                  onHover={setHoveredSchoolId}
                  onSelect={(id) => {
                    setSelectedSchoolId(id)
                    if (isMobile) {
                      setMobileMapMounted(true)
                      setMobileView('map')
                    }
                  }}
                  highlighted={selectedSchoolId === school.id}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — Map (desktop only, mobile uses inline toggle) */}
        <div className="ns-country-map-col">
          {!isMobile && (
            <CountryMap
              schools={schools}
              center={meta.mapCenter}
              zoom={meta.mapZoom}
              hoveredSchoolId={hoveredSchoolId}
              selectedSchoolId={selectedSchoolId}
              onSchoolClick={handleSchoolClick}
            />
          )}
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
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
  highlighted: boolean
}

function SchoolCard({ school, idx, country, isInCompare, onCompare, onHover, onSelect, highlighted }: CardProps) {
  const isFeatured = idx === 0
  const imgSrc = getSchoolImage(school, idx, country)

  // Left badge logic — partner badge always wins
  let leftBadge: { text: string; bg: string; color: string } | null = null
  if (school.is_partner) {
    leftBadge = { text: 'Verified Partner', bg: 'var(--teal)', color: '#fff' }
  } else if (isFeatured) {
    leftBadge = { text: "Nana's Pick", bg: 'var(--navy)', color: '#fff' }
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
      data-school-id={school.id}
      onMouseEnter={() => onHover(school.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(school.id)}
      style={{
        cursor: 'default',
        outline: highlighted ? '2.5px solid var(--teal)' : undefined,
        transition: 'outline 0.2s',
      }}
    >
      {/* LEFT: Image */}
      <div className="sc-left">
        <Image src={imgSrc} alt={school.name} fill loading="lazy" className="sc-img" style={{ objectFit: 'cover' }} />

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

        {/* Partner indicator + Location */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {school.is_partner && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 9, fontWeight: 800, color: 'var(--teal-dk)',
              background: 'var(--teal-bg)', border: '1px solid rgba(52,195,160,0.3)',
              borderRadius: 100, padding: '2px 7px',
              fontFamily: "'Nunito Sans', sans-serif", whiteSpace: 'nowrap',
            }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              Partner
            </span>
          )}
          <span style={{ fontSize: 11, color: '#6B7280', fontFamily: "'Nunito Sans', sans-serif" }}>
            {[school.city, school.country].filter(Boolean).join(', ')}
          </span>
        </div>

        {/* Stats row */}
        <div className="sc-stats-row" style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
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

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 7, marginTop: 'auto' }}>
          <Link
            href={`/schools/${school.slug}`}
            className="view-profile-btn"
            style={{ flex: 1, textDecoration: 'none', display: 'block', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            View profile →
          </Link>
          <button
            className={`compare-btn${isInCompare ? ' compare-btn-added' : ''}`}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onCompare() }}
          >
            {isInCompare ? '✓ Added' : '+ Compare'}
          </button>
        </div>
      </div>
    </div>
  )
}
