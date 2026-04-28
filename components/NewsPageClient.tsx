'use client'

import './NewsPageClient.css'
import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import ArticleCard from './ArticleCard'
import type { SchoolDimensionCounts, SchoolPoolEntry } from '@/lib/eduworld'

// ─── Color maps ───────────────────────────────────────────────────────────────

const CAT_BG: Record<string, string> = {
  'Admissions': '#dcfce7', 'Scholarships': '#dcfce7',
  'Visa': '#dbeafe', 'Visa & Immigration': '#dbeafe',
  'Fees': '#fee2e2', 'Fees & Funding': '#fee2e2',
  'Rankings': '#ede9fe', 'Rankings & Results': '#ede9fe',
  'Policy': '#ffedd5', 'Education Policy': '#ffedd5',
  'School News': '#cffafe', 'Curriculum': '#cffafe',
  'University News': '#e0e7ff',
  'Student Life': '#fce7f3', 'Community': '#fce7f3',
}

const CAT_TEXT: Record<string, string> = {
  'Admissions': '#166534', 'Scholarships': '#166534',
  'Visa': '#1d4ed8', 'Visa & Immigration': '#1d4ed8',
  'Fees': '#b91c1c', 'Fees & Funding': '#b91c1c',
  'Rankings': '#5b21b6', 'Rankings & Results': '#5b21b6',
  'Policy': '#9a3412', 'Education Policy': '#9a3412',
  'School News': '#0e7490', 'Curriculum': '#0e7490',
  'University News': '#3730a3',
  'Student Life': '#9d174d', 'Community': '#9d174d',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugToName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatAge(published_at?: string): string {
  if (!published_at) return ''
  const diff = Date.now() - new Date(published_at).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? '1w ago' : `${weeks}w ago`
}

function generateSubtitle(articles: Article[]): string {
  const sources = Array.from(new Set(
    articles.map(a => a.bullets_json?.source_name || a.source_name).filter(Boolean)
  )) as string[]
  if (sources.length === 0) return 'From education news sources'
  if (sources.length <= 3) return `From ${sources.join(', ')}`
  return `From ${sources.slice(0, 3).join(', ')} and other education sources`
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Deadline {
  nanasays_slug: string
  source_name?: string
  title: string
  detected_date: string
  category?: string
  link?: string
}

interface MentionedSchool {
  nanasays_slug: string
  school_name: string
  mention_count: number
}

interface Article {
  id: string
  english_headline?: string | null
  source_title?: string | null
  english_summary?: string
  category?: string
  published_at?: string
  schools_mentioned?: string[]
  featured_image_url?: string
  source_name?: string
  source_url?: string
  urgency?: string
  who_affected?: string
  action_needed?: string
  bullets_json?: { bullets?: string[]; source_name?: string; who_affected?: string; action_needed?: string }
  content_tier?: string
  is_featured?: boolean
  is_breaking?: boolean
  curriculum_relevant?: string[]
  countries_affected?: string[]
}

interface Props {
  articles: Article[]
  deadlines: Deadline[]
  mentionedSchools: MentionedSchool[]
  schoolCounts?: SchoolDimensionCounts
  schoolsPool?: SchoolPoolEntry[]
  mode?: 'feed' | 'school'
  currentSchoolSlug?: string
}

// ─── Country name map (article labels → school DB values) ────────────────────

const ARTICLE_TO_DB_COUNTRY: Record<string, string> = {
  'USA': 'United States',
  'US': 'United States',
  'UK': 'United Kingdom',
  'UAE': 'United Arab Emirates',
}

// Curriculum keyword matching: article label → keywords to look for in school.curriculum[]
const CURRICULUM_KEYWORDS: Record<string, string[]> = {
  'IB':        ['ib'],
  'Cambridge':  ['cambridge', 'igcse', 'a-level', 'a level'],
  'American':   ['american', 'ap ', 'common core', 'us curriculum'],
  'British':    ['british', 'gcse', 'a-level', 'a level', 'national curriculum'],
  'French':     ['french', 'baccalauréat', 'baccalaureat'],
  'German':     ['german'],
}

function schoolMatchesCurriculum(curriculum: string[], articleCurr: string): boolean {
  const keywords = CURRICULUM_KEYWORDS[articleCurr]
  if (!keywords) return false
  return curriculum.some(c => keywords.some(k => c.toLowerCase().includes(k)))
}

// Pick `count` random items from array using a seed offset (for shuffle button)
function pickRandom<T>(arr: T[], count: number, seed: number): T[] {
  if (arr.length <= count) return arr
  // Deterministic-ish shuffle using seed so useMemo can depend on it
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (i * 2654435761 + seed * 1234567) % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

// ─── RelevantSchoolsSection ───────────────────────────────────────────────────

function RelevantSchoolsSection({ article, pool, schoolCounts }: {
  article: Article
  pool: SchoolPoolEntry[]
  schoolCounts?: SchoolDimensionCounts
}) {
  const [seed, setSeed] = useState(0)

  const countries = (article.countries_affected || []).filter(c => c !== 'Global')
  const curricula = (article.curriculum_relevant || []).filter(c => c !== 'All')
  const isGlobal  = countries.length === 0
  const dbCountries = countries.map(c => ARTICLE_TO_DB_COUNTRY[c] || c)

  // Filter pool by country then optionally by curriculum
  const filtered = useMemo(() => {
    if (pool.length === 0) return []
    let result = isGlobal ? pool : pool.filter(s => dbCountries.includes(s.country))
    if (curricula.length > 0 && result.length > 4) {
      const currFiltered = result.filter(s =>
        curricula.some(c => schoolMatchesCurriculum(s.curriculum || [], c))
      )
      if (currFiltered.length >= 4) result = currFiltered
    }
    return result
  }, [pool, article.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => pickRandom(filtered, 4, seed), [filtered, seed])

  const scopeLabel = isGlobal
    ? 'worldwide'
    : dbCountries.length === 1 ? dbCountries[0] : dbCountries.join(', ')

  const hasAnything = isGlobal || countries.length > 0 || curricula.length > 0 || shown.length > 0

  if (!hasAnything && pool.length === 0) {
    return <p style={{ fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>No scope data for this article.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>

      {/* ── Country tags ── */}
      {(isGlobal || countries.length > 0) && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 7 }}>
            Countries affected
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {isGlobal ? (
              <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: '#f0fdf9', color: '#065f46', border: '1.5px solid #6ee7b7' }}>
                Worldwide
                {schoolCounts && Object.keys(schoolCounts.country).length > 0 && (
                  <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 6 }}>
                    {Object.values(schoolCounts.country).reduce((a, b) => a + b, 0).toLocaleString()} schools
                  </span>
                )}
              </span>
            ) : dbCountries.map(country => {
              const count = schoolCounts?.country[country]
              return (
                <span key={country} style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: '#f0fdf9', color: '#065f46', border: '1.5px solid #6ee7b7' }}>
                  {country}
                  {count ? <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 6 }}>{count.toLocaleString()} schools</span> : null}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Curriculum tags ── */}
      {curricula.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 7 }}>
            Curriculum
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {curricula.map(curr => {
              const count = schoolCounts?.curriculum[curr]
              return (
                <span key={curr} style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: '#f5f3ff', color: '#5b21b6', border: '1.5px solid #c4b5fd' }}>
                  {curr}
                  {count ? <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 6 }}>{count.toLocaleString()} schools</span> : null}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ── School pills ── */}
      {shown.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 7 }}>
            Example schools
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 8 }}>
            {shown.map(s => (
              <Link key={s.slug} href={`/schools/${s.slug}`}
                style={{ fontSize: 12, fontWeight: 700, background: '#f0f9ff', color: '#0369a1', border: '1.5px solid #bae6fd', padding: '4px 12px', borderRadius: 20, textDecoration: 'none', whiteSpace: 'nowrap' as const, display: 'inline-block' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#e0f2fe' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#f0f9ff' }}
              >
                {s.name}
              </Link>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#bbb' }}>
              {filtered.length.toLocaleString()} {scopeLabel} schools in directory
            </span>
            <button onClick={() => setSeed(s => s + 1)}
              style={{ fontSize: 11, color: '#34c3a0', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0' }}
            >
              show others
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── SCHOOL MODE (unchanged list view used on school profile pages) ───────────

function SchoolModeView({ articles, mentionedSchools, schoolCounts, currentSchoolSlug, activeCategory, setActiveCategory, categoryCounts, categories, subtitle }: {
  articles: Article[]
  mentionedSchools: MentionedSchool[]
  schoolCounts?: SchoolDimensionCounts
  currentSchoolSlug?: string
  activeCategory: string | null
  setActiveCategory: (c: string | null) => void
  categoryCounts: Record<string, number>
  categories: string[]
  subtitle: string
}) {
  const schoolFiltered = activeCategory ? articles.filter(a => a.category === activeCategory) : articles
  const visible = schoolFiltered.slice(0, 5)

  return (
    <div>
      <h2 style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
        color: 'var(--teal-dk)', marginBottom: 6, paddingBottom: 10,
        borderBottom: '2px solid var(--border)', fontWeight: 800,
        fontFamily: 'var(--font-nunito), Nunito, sans-serif', margin: '0 0 6px',
      }}>
        In The News
      </h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>{subtitle}</p>
      <div style={{ marginBottom: 16 }}>
        {categories.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            <button onClick={() => setActiveCategory(null)}
              style={{ fontSize: 12, padding: '5px 14px', background: !activeCategory ? 'var(--navy)' : 'var(--off)', color: !activeCategory ? '#fff' : 'var(--muted)', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: !activeCategory ? 500 : 400 }}
            >
              All <span style={{ opacity: !activeCategory ? 0.7 : 1, fontWeight: 500 }}>{articles.length}</span>
            </button>
            {categories.map(cat => {
              const isActive = activeCategory === cat
              return (
                <button key={cat} onClick={() => setActiveCategory(isActive ? null : cat)}
                  style={{ fontSize: 12, padding: '5px 14px', background: isActive ? 'var(--navy)' : 'var(--off)', color: isActive ? '#fff' : 'var(--muted)', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 400 }}
                >
                  {cat} <span style={{ fontWeight: 500 }}>{categoryCounts[cat]}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div>
        {visible.length === 0
          ? <p style={{ fontSize: 14, color: 'var(--muted)', padding: '24px 0' }}>No articles found.</p>
          : visible.map((article, i) => (
            <ArticleCard key={article.id} article={article} currentSchoolSlug={currentSchoolSlug} defaultExpanded={i === 0} />
          ))
        }
        {articles.length > 5 && (
          <Link href="/news" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>View all education news →</Link>
        )}
      </div>
    </div>
  )
}

// ─── useMobile hook ──────────────────────────────────────────────────────────

function useMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return isMobile
}

// ─── MOBILE FEED — Option B: Briefing Drawer ─────────────────────────────────

function MobileFeedView({ articles, schoolCounts, schoolsPool = [] }: { articles: Article[]; schoolCounts?: SchoolDimensionCounts; schoolsPool?: SchoolPoolEntry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [rightTab, setRightTab] = useState<'who' | 'act' | 'sch'>('who')
  const sheetRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const touchCurY = useRef(0)

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of articles) {
      if (a.category) counts[a.category] = (counts[a.category] || 0) + 1
    }
    return counts
  }, [articles])

  const categories = useMemo(
    () => Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]),
    [categoryCounts]
  )

  const visibleCards = useMemo(() => {
    let result = activeTab === 'all' ? articles : articles.filter(a => a.category === activeTab)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(a => {
        const hl = (a.english_headline || a.source_title || '').toLowerCase()
        const bl = (a.bullets_json?.bullets || []).join(' ').toLowerCase()
        return hl.includes(q) || bl.includes(q)
      })
    }
    return result
  }, [articles, activeTab, searchQuery])

  const urgentCount = useMemo(() => articles.filter(a => a.urgency === 'high').length, [articles])

  const selectedArticle = useMemo(
    () => articles.find(a => a.id === selectedId) || null,
    [articles, selectedId]
  )

  function openSheet(id: string) {
    setSelectedId(id)
    setRightTab('who')
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
  }

  // Touch swipe-down to close
  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY
    touchCurY.current = e.touches[0].clientY
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }
  function onTouchMove(e: React.TouchEvent) {
    touchCurY.current = e.touches[0].clientY
    const dy = Math.max(0, touchCurY.current - touchStartY.current)
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`
  }
  function onTouchEnd() {
    if (sheetRef.current) sheetRef.current.style.transition = 'transform .35s cubic-bezier(.32,.72,0,1)'
    if (touchCurY.current - touchStartY.current > 80) {
      closeSheet()
      if (sheetRef.current) sheetRef.current.style.transform = ''
    } else {
      if (sheetRef.current) sheetRef.current.style.transform = 'translateY(0)'
    }
  }

  const a = selectedArticle
  const headline     = a ? (a.english_headline || a.source_title || '') : ''
  const bullets      = a?.bullets_json?.bullets || []
  const sourceName   = a?.bullets_json?.source_name || a?.source_name || ''
  const whoAffected  = a?.bullets_json?.who_affected || a?.who_affected || ''
  const actionNeeded = a?.bullets_json?.action_needed || a?.action_needed || ''
  const schools      = a?.schools_mentioned || []
  const curriculums  = (a?.curriculum_relevant || []).filter(c => c !== 'All')
  const countries    = (a?.countries_affected || []).filter(c => c !== 'Global')

  const dtabColors = {
    who: { text: '#b45309', border: '#f59e0b', pip: '#f59e0b' },
    act: { text: '#065f46', border: '#10b981', pip: '#10b981' },
    sch: { text: '#0369a1', border: '#3b82f6', pip: '#3b82f6' },
  }

  return (
    <div style={{ position: 'fixed', top: 60, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f5f5f3' }}>

      {/* Controls */}
      <div style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #f0f0ee', padding: '10px 16px 8px' }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 9 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5"
            style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Search articles..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '9px 16px 9px 36px', border: '1.5px solid #e8e8e6', borderRadius: 22, fontSize: 14, fontFamily: 'inherit', color: '#1a1a2e', outline: 'none', background: '#fff' }}
            onFocus={e => (e.target.style.borderColor = '#34c3a0')}
            onBlur={e => (e.target.style.borderColor = '#e8e8e6')}
          />
        </div>
        {/* Category pills */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' as any }}>
          {['all', ...categories].map(cat => {
            const isActive = activeTab === cat
            return (
              <button key={cat} onClick={() => setActiveTab(cat)}
                style={{ fontSize: 11, fontWeight: 700, padding: '5px 13px', borderRadius: 16, border: '1.5px solid #e8e8e6', background: isActive ? '#1a1a2e' : '#fff', color: isActive ? '#fff' : '#888', borderColor: isActive ? '#1a1a2e' : '#e8e8e6', whiteSpace: 'nowrap' as const, flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ flexShrink: 0, padding: '7px 16px', background: '#f5f5f3', borderBottom: '1px solid #e8e8e6', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{visibleCards.length} articles</span>
        {urgentCount > 0 && <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>· {urgentCount} urgent</span>}
      </div>

      {/* Card list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {visibleCards.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#bbb', fontSize: 14, fontStyle: 'italic' }}>No articles match your filter.</div>
        ) : visibleCards.map(art => {
          const catBg  = CAT_BG[art.category || ''] || '#f0f0ee'
          const catTxt = CAT_TEXT[art.category || ''] || '#555'
          const srcName = art.bullets_json?.source_name || art.source_name || ''
          const firstBullet = art.bullets_json?.bullets?.[0] || ''
          const isSelected = art.id === selectedId && sheetOpen

          return (
            <div key={art.id} onClick={() => openSheet(art.id)}
              style={{ background: isSelected ? '#f0fdf9' : '#fff', borderBottom: '1px solid #f0f0ee', borderLeft: isSelected ? '3px solid #34c3a0' : '3px solid transparent', padding: '13px 16px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, flexWrap: 'wrap' as const }}>
                {art.is_breaking && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: '#fee2e2', color: '#b91c1c', textTransform: 'uppercase' as const }}>Breaking</span>}
                {art.is_featured && !art.is_breaking && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: '#d1fae5', color: '#065f46', textTransform: 'uppercase' as const }}>Featured</span>}
                {art.urgency === 'high' && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: '#fef9c3', color: '#854d0e' }}>Urgent</span>}
                {art.category && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: catBg, color: catTxt }}>{art.category}</span>}
                <span style={{ fontSize: 11, color: '#bbb', marginLeft: 'auto', whiteSpace: 'nowrap' as const }}>{formatAge(art.published_at)}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e', lineHeight: 1.4, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                {art.english_headline || art.source_title}
              </div>
              {firstBullet && (
                <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5, paddingLeft: 12, position: 'relative', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', left: 0, color: '#34c3a0', fontWeight: 900, fontSize: 15, lineHeight: 1.25 }}>·</span>
                  {firstBullet}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#bbb', marginTop: 5 }}>{srcName}</div>
            </div>
          )
        })}
      </div>

      {/* Bottom sheet */}
      <div ref={sheetRef}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '82%', background: '#fff', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden', transform: sheetOpen ? 'translateY(0)' : 'translateY(100%)', transition: 'transform .35s cubic-bezier(.32,.72,0,1)' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div style={{ flexShrink: 0, padding: '10px 0 4px', display: 'flex', justifyContent: 'center', background: '#fff', borderRadius: '20px 20px 0 0' }}>
          <div style={{ width: 36, height: 4, background: '#e0e0dd', borderRadius: 2 }} />
        </div>

        {/* Dark topbar */}
        <div style={{ flexShrink: 0, background: '#1a1a2e', display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px 8px' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: '#34c3a0', textTransform: 'uppercase' as const, letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34c3a0', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            Briefing
          </span>
          {a && (
            <>
              {a.is_breaking && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: '#fee2e2', color: '#b91c1c', textTransform: 'uppercase' as const }}>Breaking</span>}
              {a.is_featured && !a.is_breaking && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: '#34c3a0', color: '#0a0f1a', textTransform: 'uppercase' as const }}>Featured</span>}
              {a.urgency === 'high' && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: 'rgba(254,226,226,.15)', color: '#fca5a5' }}>Urgent</span>}
              {a.category && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: CAT_BG[a.category] || '#f0f0ee', color: CAT_TEXT[a.category] || '#555' }}>{a.category}</span>}
              {a.source_url ? (
                <a href={a.source_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginLeft: 'auto', textDecoration: 'none', fontStyle: 'italic' }}
                  onClick={e => e.stopPropagation()}
                >
                  view source: {sourceName}
                </a>
              ) : (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginLeft: 'auto', fontStyle: 'italic' }}>{sourceName}</span>
              )}
            </>
          )}
        </div>

        {/* Headline */}
        <div style={{ flexShrink: 0, fontSize: 16, fontWeight: 900, color: '#1a1a2e', lineHeight: 1.4, borderLeft: '4px solid #34c3a0', padding: '14px 18px 0 12px', margin: '0 18px', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
          {headline}
        </div>

        {/* Key points label */}
        <div style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '.12em', color: '#34c3a0', padding: '10px 18px 6px' }}>
          Key points
        </div>

        {/* Bullets */}
        <div style={{ flexShrink: 0, padding: '0 18px 10px' }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ fontSize: 13, color: '#444', paddingLeft: 13, position: 'relative', lineHeight: 1.55, marginBottom: 5 }}>
              <span style={{ position: 'absolute', left: 0, color: '#34c3a0', fontWeight: 900, fontSize: 15, lineHeight: 1.25 }}>·</span>
              {b}
            </div>
          ))}
        </div>

        {/* WHO / ACTION / SCHOOLS tabs */}
        <div style={{ display: 'flex', flexShrink: 0, borderBottom: '2px solid #f0f0ee', background: '#fff' }}>
          {(['who', 'act', 'sch'] as const).map(tab => {
            const labels = { who: 'Who', act: 'Action', sch: 'Schools' }
            const tc = dtabColors[tab]
            const isActive = rightTab === tab
            return (
              <button key={tab} onClick={() => setRightTab(tab)}
                style={{ flex: 1, padding: '11px 6px', textAlign: 'center' as const, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '.07em', background: 'none', border: 'none', color: isActive ? tc.text : '#bbb', borderBottom: isActive ? `3px solid ${tc.border}` : '3px solid transparent', marginBottom: -2, transition: 'all .15s' }}
              >
                {labels[tab]}
                <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: tc.pip, marginLeft: 4, verticalAlign: 'middle' }} />
              </button>
            )
          })}
        </div>

        {/* Tab panel */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px 24px' }}>
          {rightTab === 'who' && (
            <div style={{ background: '#fffbeb', borderLeft: '3px solid #f59e0b', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '.1em', color: '#b45309', marginBottom: 5 }}>Who this affects</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#78350f', lineHeight: 1.6 }}>
                {whoAffected || <span style={{ color: '#bbb', fontStyle: 'italic' }}>Select an article to see who is affected.</span>}
              </div>
            </div>
          )}
          {rightTab === 'act' && (
            <div style={{ background: '#ecfdf5', borderLeft: '3px solid #10b981', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '.1em', color: '#065f46', marginBottom: 5 }}>What to do now</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#064e3b', lineHeight: 1.6 }}>
                {actionNeeded || <span style={{ color: '#bbb', fontStyle: 'italic' }}>Select an article to see the recommended action.</span>}
              </div>
            </div>
          )}
          {rightTab === 'sch' && (
            <div>
              {a ? <RelevantSchoolsSection article={a} pool={schoolsPool} schoolCounts={schoolCounts} /> : <p style={{ fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>Select an article.</p>}
            </div>
          )}
        </div>

      </div>

    </div>
  )
}

// ─── FEED MODE — Router (fixes Rules of Hooks) ───────────────────────────────

function FeedView({ articles, schoolCounts, schoolsPool = [] }: { articles: Article[]; schoolCounts?: SchoolDimensionCounts; schoolsPool?: SchoolPoolEntry[] }) {
  const isMobile = useMobile()
  if (isMobile === null) return null
  if (isMobile) return <MobileFeedView articles={articles} schoolCounts={schoolCounts} schoolsPool={schoolsPool} />
  return <DesktopFeedView articles={articles} schoolCounts={schoolCounts} schoolsPool={schoolsPool} />
}

// ─── FEED MODE — Flipboard layout (desktop) ───────────────────────────────────

function DesktopFeedView({ articles, schoolCounts, schoolsPool = [] }: { articles: Article[]; schoolCounts?: SchoolDimensionCounts; schoolsPool?: SchoolPoolEntry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(() => articles[0]?.id || null)
  const [activeTab, setActiveTab] = useState<'all' | string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [rightTab, setRightTab] = useState<'who' | 'act' | 'sch'>('who')
  const [fading, setFading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const selectedArticle = useMemo(
    () => articles.find(a => a.id === selectedId) || null,
    [articles, selectedId]
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of articles) {
      if (a.category) counts[a.category] = (counts[a.category] || 0) + 1
    }
    return counts
  }, [articles])

  const categories = useMemo(
    () => Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]),
    [categoryCounts]
  )

  const visibleCards = useMemo(() => {
    let result = activeTab === 'all' ? articles : articles.filter(a => a.category === activeTab)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(a => {
        const hl = (a.english_headline || a.source_title || '').toLowerCase()
        const bl = (a.bullets_json?.bullets || []).join(' ').toLowerCase()
        return hl.includes(q) || bl.includes(q)
      })
    }
    return result.slice(0, 6)
  }, [articles, activeTab, searchQuery])

  const urgentCount = useMemo(() => articles.filter(a => a.urgency === 'high').length, [articles])

  // Drag-to-scroll for card strip
  useEffect(() => {
    const wrap = scrollRef.current
    if (!wrap) return
    let down = false, startX = 0, sl = 0
    const onDown = (e: MouseEvent) => { down = true; startX = e.pageX - wrap.offsetLeft; sl = wrap.scrollLeft }
    const onUp   = () => { down = false }
    const onMove = (e: MouseEvent) => {
      if (!down) return; e.preventDefault()
      wrap.scrollLeft = sl - (e.pageX - wrap.offsetLeft - startX) * 1.3
    }
    wrap.addEventListener('mousedown', onDown)
    wrap.addEventListener('mouseleave', onUp)
    wrap.addEventListener('mouseup', onUp)
    wrap.addEventListener('mousemove', onMove)
    return () => {
      wrap.removeEventListener('mousedown', onDown)
      wrap.removeEventListener('mouseleave', onUp)
      wrap.removeEventListener('mouseup', onUp)
      wrap.removeEventListener('mousemove', onMove)
    }
  }, [])

  function selectArticle(id: string) {
    if (id === selectedId) return
    setFading(true)
    setTimeout(() => {
      setSelectedId(id)
      setFading(false)
    }, 110)
  }

  const a = selectedArticle
  const headline    = a ? (a.english_headline || a.source_title || '') : ''
  const bullets     = a?.bullets_json?.bullets || []
  const sourceName  = a?.bullets_json?.source_name || a?.source_name || ''
  const whoAffected = a?.bullets_json?.who_affected || a?.who_affected || ''
  const actionNeeded = a?.bullets_json?.action_needed || a?.action_needed || ''

  // Topbar badges
  const topBadges = a ? [
    a.is_breaking ? <span key="brk" style={{ fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 7, background: '#dc2626', color: '#fff', textTransform: 'uppercase' as const, letterSpacing: '.05em' }}>Breaking</span> : null,
    a.is_featured && !a.is_breaking ? <span key="feat" style={{ fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 7, background: '#34c3a0', color: '#0a0f1a', textTransform: 'uppercase' as const, letterSpacing: '.05em' }}>Featured</span> : null,
    a.urgency === 'high' ? <span key="urg" style={{ fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 7, background: 'rgba(254,226,226,.15)', color: '#fca5a5', textTransform: 'uppercase' as const }}>Urgent</span> : null,
    a.category ? <span key="cat" style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 8, background: CAT_BG[a.category] || '#f0f0ee', color: CAT_TEXT[a.category] || '#555' }}>{a.category}</span> : null,
  ].filter(Boolean) : []

  return (
    <div style={{
      position: 'fixed',
      top: 60, left: 0, right: 0, bottom: 0,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      background: '#f5f5f3',
    }}>

      {/* ── BROADCAST PANEL ── */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        borderBottom: '3px solid #34c3a0',
        boxShadow: '0 3px 24px rgba(0,0,0,.18)',
      }}>

        {/* Topbar — dark navy */}
        <div style={{
          flexShrink: 0,
          background: '#1a1a2e',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 44px',
          borderBottom: '1px solid rgba(255,255,255,.07)',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 800, color: '#34c3a0',
            textTransform: 'uppercase' as const, letterSpacing: '.14em',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#34c3a0',
              animation: 'pulse 2s infinite', flexShrink: 0,
              display: 'inline-block',
            }} />
            Now reading
          </span>

          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            {topBadges}
          </div>

          {a && (
            a.source_url ? (
              <a href={a.source_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginLeft: 'auto', textDecoration: 'none', transition: 'color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#34c3a0')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.3)')}
              >
                view source: {sourceName}
              </a>
            ) : (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginLeft: 'auto' }}>
                {sourceName}
              </span>
            )
          )}
        </div>

        {/* Body: left dark + right tab panel */}
        <div style={{
          flex: 1, minHeight: 0,
          display: 'grid', gridTemplateColumns: '1.25fr 1fr',
          overflow: 'hidden',
          opacity: fading ? 0 : 1,
          transition: 'opacity .11s',
        }}>

          {/* LEFT — dark navy */}
          <div style={{
            display: 'flex', flexDirection: 'column',
            padding: '28px 40px 28px 44px',
            background: '#1a1a2e',
            borderLeft: '5px solid #34c3a0',
            borderRight: '1px solid rgba(255,255,255,.07)',
            overflow: 'hidden',
          }}>
            <div style={{
              flexShrink: 0,
              fontSize: 26, fontWeight: 900, color: '#f8fafc', lineHeight: 1.3,
              marginBottom: 18,
              fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            }}>
              {headline || 'Select an article below'}
            </div>

            <div style={{
              flexShrink: 0,
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const,
              letterSpacing: '.1em', color: '#34c3a0', marginBottom: 10,
            }}>
              Key points
            </div>

            {/* Scrollable bullets */}
            <div style={{
              flex: 1, minHeight: 0,
              overflowY: 'auto', paddingRight: 6,
              scrollbarWidth: 'thin' as any,
              scrollbarColor: 'rgba(255,255,255,.1) transparent',
            }}>
              {bullets.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {bullets.map((b, i) => (
                    <li key={i} style={{
                      fontSize: 14.5, fontWeight: 400, color: 'rgba(255,255,255,.72)',
                      paddingLeft: 20, position: 'relative', lineHeight: 1.65,
                    }}>
                      <span style={{ position: 'absolute', left: 0, color: '#34c3a0', fontWeight: 900, fontSize: 22, lineHeight: 1.15 }}>·</span>
                      {b}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,.2)', fontStyle: 'italic', fontWeight: 400 }}>
                  Click any card in the row below and the briefing will load here. Key points scroll if there are many.
                </p>
              )}
            </div>
          </div>

          {/* RIGHT — V2 Tab Panel */}
          <div style={{ background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Tab strip */}
            <div style={{ display: 'flex', flexShrink: 0, borderBottom: '2px solid #f0f0ee', background: '#fff' }}>
              {(['who', 'act', 'sch'] as const).map(tab => {
                const labels: Record<string, string> = { who: 'Who', act: 'Action', sch: 'Schools' }
                const pipColors: Record<string, string> = { who: '#f59e0b', act: '#10b981', sch: '#3b82f6' }
                const activeColors: Record<string, { text: string; border: string }> = {
                  who: { text: '#b45309', border: '#f59e0b' },
                  act: { text: '#065f46', border: '#10b981' },
                  sch: { text: '#0369a1', border: '#3b82f6' },
                }
                const isActive = rightTab === tab
                const ac = activeColors[tab]
                return (
                  <button key={tab} onClick={() => setRightTab(tab)}
                    style={{
                      flex: 1, padding: '13px 8px', textAlign: 'center' as const,
                      cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '.08em',
                      background: 'none', border: 'none',
                      color: isActive ? ac.text : '#bbb',
                      borderBottom: isActive ? `3px solid ${ac.border}` : '3px solid transparent',
                      marginBottom: -2, transition: 'all .15s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#555' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#bbb' }}
                  >
                    {labels[tab]}
                    <span style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                      background: pipColors[tab],
                      marginLeft: 5, verticalAlign: 'middle', marginTop: -2,
                    }} />
                  </button>
                )
              })}
            </div>

            {/* Tab panels */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>

              {/* WHO */}
              {rightTab === 'who' && (
                <div style={{ padding: '24px 32px', overflowY: 'auto', height: '100%', scrollbarWidth: 'thin' as any }}>
                  <div style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', borderRadius: 10, padding: '18px 20px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '.1em', color: '#b45309', marginBottom: 10 }}>
                      Who this affects
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.65, color: '#78350f' }}>
                      {whoAffected || <span style={{ color: '#bbb', fontStyle: 'italic' }}>Select an article to see who is affected.</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* ACTION */}
              {rightTab === 'act' && (
                <div style={{ padding: '24px 32px', overflowY: 'auto', height: '100%', scrollbarWidth: 'thin' as any }}>
                  <div style={{ background: '#ecfdf5', borderLeft: '4px solid #10b981', borderRadius: 10, padding: '18px 20px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '.1em', color: '#065f46', marginBottom: 10 }}>
                      What to do now
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.65, color: '#064e3b' }}>
                      {actionNeeded || <span style={{ color: '#bbb', fontStyle: 'italic' }}>Select an article to see the recommended action.</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* SCHOOLS */}
              {rightTab === 'sch' && (
                <div style={{ padding: '24px 32px', overflowY: 'auto', height: '100%', scrollbarWidth: 'thin' as any }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '.12em', color: '#34c3a0', marginBottom: 12 }}>
                    Schools affected
                  </div>
                  {a ? (
                    <RelevantSchoolsSection article={a} pool={schoolsPool} schoolCounts={schoolCounts} />
                  ) : (
                    <p style={{ fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>Select an article to see affected schools.</p>
                  )}
                </div>
              )}

            </div>
          </div>

        </div>
      </div>

      {/* ── BROWSER STRIP ── */}
      <div style={{
        flexShrink: 0,
        background: '#f5f5f3',
        padding: '14px 44px 16px',
        borderTop: '1px solid #e8e8e6',
      }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e' }}>Latest News</span>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>{articles.length} articles</span>
          {urgentCount > 0 && <span style={{ fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>· {urgentCount} urgent</span>}
        </div>

        {/* Search + category tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <div style={{ position: 'relative', flexShrink: 0, width: 250 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2.5"
              style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" placeholder="Search articles..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '8px 16px 8px 36px',
                border: '1.5px solid #e8e8e6', borderRadius: 24,
                fontSize: 13, fontFamily: 'inherit', color: '#1a1a2e', outline: 'none',
                background: '#fff', transition: 'border-color .15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#34c3a0')}
              onBlur={e => (e.target.style.borderColor = '#e8e8e6')}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, scrollbarWidth: 'none' as any }}>
            {['all', ...categories].map(cat => {
              const isActive = activeTab === cat
              return (
                <button key={cat} onClick={() => setActiveTab(cat)}
                  style={{
                    fontSize: 12, fontWeight: 700, padding: '6px 15px',
                    borderRadius: 20, border: '1.5px solid #e8e8e6',
                    background: isActive ? '#1a1a2e' : '#fff',
                    color: isActive ? '#fff' : '#888',
                    borderColor: isActive ? '#1a1a2e' : '#e8e8e6',
                    cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0,
                    fontFamily: 'inherit', transition: 'all .15s',
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#34c3a0'; e.currentTarget.style.color = '#1a1a2e' } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#e8e8e6'; e.currentTarget.style.color = '#888' } }}
                >
                  {cat === 'all' ? 'All' : cat}
                </button>
              )
            })}
          </div>
        </div>

        {/* Card scroll */}
        <div ref={scrollRef} style={{
          overflowX: 'auto', overflowY: 'hidden', cursor: 'grab',
          WebkitMaskImage: 'linear-gradient(to right, black 92%, transparent 100%)',
          maskImage: 'linear-gradient(to right, black 92%, transparent 100%)',
          scrollbarWidth: 'thin' as any,
          scrollbarColor: '#34c3a0 #e8e8e6',
        }}>
          <div style={{ display: 'flex', gap: 12, width: 'max-content', alignItems: 'stretch' }}>
            {visibleCards.length === 0 ? (
              <div style={{ padding: '16px 4px', color: '#bbb', fontStyle: 'italic', fontSize: 13, whiteSpace: 'nowrap' }}>
                No articles match your filter.
              </div>
            ) : visibleCards.map((art, i) => {
              const isActive = art.id === selectedId
              const catBg = CAT_BG[art.category || ''] || '#f0f0ee'
              const catTxt = CAT_TEXT[art.category || ''] || '#555'
              const srcName = art.bullets_json?.source_name || art.source_name || ''
              const firstBullet = art.bullets_json?.bullets?.[0] || ''

              return (
                <div key={art.id} onClick={() => selectArticle(art.id)}
                  style={{
                    flexShrink: 0, width: 380,
                    background: isActive ? '#f0fdf9' : '#fff',
                    border: isActive ? '2px solid #34c3a0' : '1.5px solid #e8e8e6',
                    borderRadius: 12, padding: '14px 18px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 7,
                    overflow: 'hidden', transition: 'all .15s',
                    boxShadow: isActive ? '0 4px 18px rgba(52,195,160,.16)' : 'none',
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#34c3a0'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(52,195,160,.1)' } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#e8e8e6'; e.currentTarget.style.boxShadow = 'none' } }}
                >
                  {/* Meta row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, overflow: 'hidden' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#d4d4d0', flexShrink: 0 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {art.is_breaking && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#fee2e2', color: '#b91c1c', textTransform: 'uppercase' as const, flexShrink: 0 }}>Breaking</span>}
                    {art.is_featured && !art.is_breaking && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#d1fae5', color: '#065f46', textTransform: 'uppercase' as const, flexShrink: 0 }}>Featured</span>}
                    {art.urgency === 'high' && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#fef9c3', color: '#854d0e', flexShrink: 0 }}>Urgent</span>}
                    {art.category && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 7, background: catBg, color: catTxt, flexShrink: 0, whiteSpace: 'nowrap' as const }}>
                        {art.category}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#bbb', marginLeft: 'auto', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                      {formatAge(art.published_at)}
                    </span>
                  </div>

                  {/* Headline */}
                  <div style={{
                    fontSize: 13.5, fontWeight: 800, color: '#1a1a2e', lineHeight: 1.45,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                    overflow: 'hidden', flexShrink: 0,
                    fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                  }}>
                    {art.english_headline || art.source_title}
                  </div>

                  {/* First bullet */}
                  {firstBullet && (
                    <div style={{
                      fontSize: 12, color: '#666', lineHeight: 1.5, fontWeight: 500,
                      paddingLeft: 14, position: 'relative', flex: 1,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                      overflow: 'hidden',
                    }}>
                      <span style={{ position: 'absolute', left: 0, color: '#34c3a0', fontWeight: 900, fontSize: 16, lineHeight: 1.25 }}>·</span>
                      {firstBullet}
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 7, borderTop: '1px solid #f0f0ee', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: '#bbb' }}>{srcName}</span>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34c3a0', opacity: isActive ? 1 : 0, transition: 'opacity .15s', flexShrink: 0, display: 'inline-block' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>


    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function NewsPageClient({
  articles,
  deadlines,
  mentionedSchools,
  schoolCounts,
  schoolsPool = [],
  mode = 'feed',
  currentSchoolSlug,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of articles) {
      if (a.category) counts[a.category] = (counts[a.category] || 0) + 1
    }
    return counts
  }, [articles])

  const categories = useMemo(
    () => Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]),
    [categoryCounts]
  )

  const subtitle = useMemo(() => generateSubtitle(articles), [articles])

  if (mode === 'school') {
    return (
      <SchoolModeView
        articles={articles}
        mentionedSchools={mentionedSchools}
        schoolCounts={schoolCounts}
        currentSchoolSlug={currentSchoolSlug}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        categoryCounts={categoryCounts}
        categories={categories}
        subtitle={subtitle}
      />
    )
  }

  return <FeedView articles={articles} schoolCounts={schoolCounts} schoolsPool={schoolsPool} />
}
