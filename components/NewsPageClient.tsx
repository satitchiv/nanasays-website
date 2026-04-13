'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import ArticleCard from './ArticleCard'
import DeadlineAlertCard from './DeadlineAlertCard'

const CAT_COLORS: Record<string, string> = {
  'Admissions': '#059669',
  'Scholarships': '#059669',
  'Visa': '#2563eb',
  'Visa & Immigration': '#2563eb',
  'Fees': '#dc2626',
  'Fees & Funding': '#dc2626',
  'Rankings': '#7c3aed',
  'Rankings & Results': '#7c3aed',
  'Policy': '#ea580c',
  'Education Policy': '#ea580c',
  'School News': '#0891b2',
  'Curriculum': '#0891b2',
  'University News': '#4f46e5',
  'Student Life': '#db2877',
  'Community': '#db2877',
}

const CAT_GRADIENTS: Record<string, string> = {
  'Admissions': 'linear-gradient(135deg, #0f2b4c 0%, #1a4a7a 100%)',
  'Scholarships': 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
  'Visa': 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
  'Visa & Immigration': 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
  'Fees': 'linear-gradient(135deg, #7c1d1d 0%, #dc2626 100%)',
  'Fees & Funding': 'linear-gradient(135deg, #7c1d1d 0%, #dc2626 100%)',
  'Rankings': 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)',
  'Rankings & Results': 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)',
  'Policy': 'linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)',
  'Education Policy': 'linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)',
}

function generateSubtitle(articles: Article[]): string {
  const sources = Array.from(new Set(
    articles.map(a => a.bullets_json?.source_name || a.source_name).filter(Boolean)
  )) as string[]
  if (sources.length === 0) return 'From education news sources'
  if (sources.length <= 3) return `From ${sources.join(', ')}`
  return `From ${sources.slice(0, 3).join(', ')} and other education sources`
}

function formatAge(published_at?: string): string {
  if (!published_at) return ''
  const diff = Date.now() - new Date(published_at).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

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
  english_headline: string
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
}

interface Props {
  articles: Article[]
  deadlines: Deadline[]
  mentionedSchools: MentionedSchool[]
  /** 'feed' = /news page magazine layout (default). 'school' = single column, no sidebar, max 5 articles */
  mode?: 'feed' | 'school'
  currentSchoolSlug?: string
}

const PAGE_SIZE = 20

// Compact card used in the 3-col grid
function CompactCard({ article }: { article: Article }) {
  const color = CAT_COLORS[article.category || ''] || '#888780'
  const sourceName = article.bullets_json?.source_name || article.source_name
  const isUrgent = article.urgency === 'high'

  return (
    <Link
      href={`/news/${article.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow .15s',
        height: '100%',
      }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
      >
        {/* Color bar */}
        <div style={{ height: 3, background: color }} />
        <div style={{ padding: '14px 16px' }}>
          {/* Category */}
          {article.category && (
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.06em', color, marginBottom: 7,
            }}>
              {article.category}
            </div>
          )}
          {/* Title */}
          <div style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            fontSize: 14, fontWeight: 800, color: 'var(--navy)',
            lineHeight: 1.4, marginBottom: 10,
          }}>
            {article.english_headline}
          </div>
          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {[sourceName, formatAge(article.published_at)].filter(Boolean).join(' · ')}
            </span>
            {isUrgent && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: '#fee2e2', color: '#b91c1c',
                padding: '2px 8px', borderRadius: 10, flexShrink: 0,
              }}>
                Urgent
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

// Hero card — first/featured article
function HeroCard({ article }: { article: Article }) {
  const gradient = CAT_GRADIENTS[article.category || ''] || 'linear-gradient(135deg, #0f2b4c 0%, #1a4a7a 100%)'
  const catColor = CAT_COLORS[article.category || ''] || '#34c3a0'
  const sourceName = article.bullets_json?.source_name || article.source_name
  const isUrgent = article.urgency === 'high'
  const summary = article.english_summary

  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      overflow: 'hidden',
      border: '1px solid var(--border)',
      marginBottom: 20,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
    }}>
      {/* Left — gradient with category + headline */}
      <div style={{
        background: gradient,
        display: 'flex',
        alignItems: 'flex-end',
        padding: 28,
        minHeight: 220,
      }}>
        <div>
          {article.category && (
            <span style={{
              display: 'inline-block',
              background: catColor,
              color: '#fff',
              fontSize: 11, fontWeight: 800,
              padding: '4px 12px', borderRadius: 20,
              textTransform: 'uppercase', letterSpacing: '.06em',
              marginBottom: 12,
            }}>
              {article.category}
            </span>
          )}
          <div style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.3,
          }}>
            {article.english_headline}
          </div>
        </div>
      </div>

      {/* Right — summary + meta + CTA */}
      <div style={{
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        {summary && (
          <p style={{
            fontSize: 14, color: 'var(--body)', lineHeight: 1.7, marginBottom: 14,
          }}>
            {summary}
          </p>
        )}
        <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{[sourceName, formatAge(article.published_at)].filter(Boolean).join(' · ')}</span>
          {isUrgent && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              background: '#fee2e2', color: '#b91c1c',
              padding: '2px 8px', borderRadius: 10,
            }}>
              Urgent
            </span>
          )}
        </div>
        <Link
          href={`/news/${article.id}`}
          style={{
            display: 'inline-block', marginTop: 16,
            fontSize: 13, fontWeight: 700, color: '#34c3a0',
            textDecoration: 'none',
          }}
        >
          Read full article →
        </Link>
      </div>
    </div>
  )
}

export default function NewsPageClient({
  articles,
  deadlines,
  mentionedSchools,
  mode = 'feed',
  currentSchoolSlug,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const isSchoolMode = mode === 'school'

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

  const trending = useMemo(
    () => Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 4),
    [categoryCounts]
  )

  const filtered = activeCategory
    ? articles.filter(a => a.category === activeCategory)
    : articles

  const maxArticles = isSchoolMode ? 5 : visibleCount
  const visible = filtered.slice(0, maxArticles)

  const subtitle = useMemo(() => generateSubtitle(articles), [articles])

  // Category pills (shared between modes)
  const categoryPills = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28 }}>
      <button
        onClick={() => { setActiveCategory(null); setVisibleCount(PAGE_SIZE) }}
        style={{
          fontSize: 12, padding: '5px 14px',
          background: !activeCategory ? 'var(--navy)' : '#fff',
          color: !activeCategory ? '#fff' : 'var(--muted)',
          borderRadius: 20,
          border: !activeCategory ? 'none' : '1px solid var(--border)',
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
        }}
      >
        All {articles.length}
      </button>
      {categories.map(cat => {
        const isActive = activeCategory === cat
        return (
          <button
            key={cat}
            onClick={() => { setActiveCategory(isActive ? null : cat); setVisibleCount(PAGE_SIZE) }}
            style={{
              fontSize: 12, padding: '5px 14px',
              background: isActive ? 'var(--navy)' : '#fff',
              color: isActive ? '#fff' : 'var(--muted)',
              borderRadius: 20,
              border: isActive ? 'none' : '1px solid var(--border)',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            }}
          >
            {cat} {categoryCounts[cat]}
          </button>
        )
      })}
    </div>
  )

  // ── SCHOOL MODE — single column, no sidebar ──────────────────────────────
  if (isSchoolMode) {
    return (
      <div>
        <div className="ew-section-header">
          <p className="ew-section-title">
            Latest education news updates that affect this school
          </p>
          <p className="ew-section-subtitle">{subtitle}</p>
          {categories.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveCategory(null)}
                style={{
                  fontSize: 12, padding: '5px 14px',
                  background: !activeCategory ? 'var(--navy)' : 'var(--off)',
                  color: !activeCategory ? '#fff' : 'var(--muted)',
                  borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: !activeCategory ? 500 : 400,
                }}
              >
                All <span style={{ opacity: !activeCategory ? 0.7 : 1, fontWeight: 500 }}>{articles.length}</span>
              </button>
              {categories.map(cat => {
                const isActive = activeCategory === cat
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(isActive ? null : cat)}
                    style={{
                      fontSize: 12, padding: '5px 14px',
                      background: isActive ? 'var(--navy)' : 'var(--off)',
                      color: isActive ? '#fff' : 'var(--muted)',
                      borderRadius: 20, border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontWeight: 400,
                    }}
                  >
                    {cat} <span style={{ fontWeight: 500 }}>{categoryCounts[cat]}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {visible.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--muted)', padding: '24px 0' }}>No articles found.</p>
        ) : (
          visible.map((article, i) => (
            <ArticleCard
              key={article.id}
              article={article}
              currentSchoolSlug={currentSchoolSlug}
              defaultExpanded={i === 0}
            />
          ))
        )}
        {articles.length > 5 && (
          <Link href="/news" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none' }}>
            View all education news →
          </Link>
        )}
      </div>
    )
  }

  // ── FEED MODE — V1 Magazine Grid ─────────────────────────────────────────
  const hero = visible[0]
  const gridArticles = visible.slice(1)

  // Split grid articles into rows of 3, inserting deadline break cards periodically
  const gridRows: Array<Article[] | 'deadline'> = []
  let deadlineIdx = 0
  let rowCount = 0
  for (let i = 0; i < gridArticles.length; i += 3) {
    const row = gridArticles.slice(i, i + 3)
    gridRows.push(row)
    rowCount++
    // Insert a deadline card after every 2 rows (6 articles)
    if (rowCount % 2 === 0 && i + 3 < gridArticles.length && deadlines.length > 0) {
      gridRows.push('deadline')
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
        gap: 32,
        alignItems: 'start',
      }}
    >
      {/* ── LEFT: Hero + Grid ── */}
      <div>
        {/* Category pills */}
        {categoryPills}

        {/* Hero card */}
        {hero && <HeroCard article={hero} />}

        {/* 3-col card grid */}
        {gridRows.map((row, i) => {
          if (row === 'deadline') {
            const d = deadlines[deadlineIdx % deadlines.length]
            deadlineIdx++
            return (
              <div key={`break-${i}`} style={{ marginBottom: 14 }}>
                <DeadlineAlertCard deadline={d} />
              </div>
            )
          }
          return (
            <div
              key={`row-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                marginBottom: 12,
              }}
            >
              {(row as Article[]).map(article => (
                <CompactCard key={article.id} article={article} />
              ))}
            </div>
          )
        })}

        {/* Load more */}
        {visibleCount < filtered.length && (
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            style={{
              display: 'block', width: '100%', padding: 12, marginTop: 4,
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 13, fontWeight: 600,
              color: 'var(--navy)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Load more articles
          </button>
        )}

        {filtered.length === 0 && (
          <p style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>
            No articles in this category yet.
          </p>
        )}
      </div>

      {/* ── RIGHT: Sidebar ── */}
      <div style={{ position: 'sticky', top: 20 }}>

        {/* Trending this week */}
        {trending.length > 0 && (
          <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>
              Trending this week
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {trending.map(([cat, count], idx) => {
                const color = CAT_COLORS[cat] || '#888780'
                return (
                  <button
                    key={cat}
                    onClick={() => { setActiveCategory(cat); setVisibleCount(PAGE_SIZE) }}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      background: 'none', border: 'none', padding: 0,
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#e5e7eb', minWidth: 20 }}>
                      {idx + 1}
                    </span>
                    <span>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--body)' }}>{cat}</span>
                      <span style={{ display: 'block', fontSize: 11, color }}>{count} article{count !== 1 ? 's' : ''}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Upcoming deadlines */}
        {deadlines.length > 0 && (
          <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>
              Upcoming deadlines
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {deadlines.map((d, i) => {
                const diff = new Date(d.detected_date).getTime() - Date.now()
                const days = Math.ceil(diff / 86400000)
                const badgeColor = days <= 7 ? '#dc2626' : days <= 30 ? '#ea580c' : '#888780'
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Link href={`/schools/${d.nanasays_slug}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', textDecoration: 'none' }}>
                        {d.source_name || d.nanasays_slug}
                      </Link>
                      <span style={{ fontSize: 11, fontWeight: 600, color: badgeColor, background: `${badgeColor}18`, padding: '2px 8px', borderRadius: 10, flexShrink: 0 }}>
                        {days <= 0 ? 'Today' : `${days}d`}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0', lineHeight: 1.4 }}>
                      {d.title}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Schools in the news */}
        {mentionedSchools.length > 0 && (
          <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>
              Schools in the news
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mentionedSchools.map(s => (
                <Link
                  key={s.nanasays_slug}
                  href={`/schools/${s.nanasays_slug}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--off)', borderRadius: 8, padding: '6px 10px', textDecoration: 'none' }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{s.school_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>
                    {s.mention_count} mention{s.mention_count !== 1 ? 's' : ''}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Weekly briefing */}
        <div style={{ background: 'var(--off)', borderRadius: 12, padding: '14px 16px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
            Weekly briefing
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
            Top education news for international families, every week.
          </p>
          <input
            type="email"
            placeholder="your@email.com"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 20,
              border: '0.5px solid var(--border)', fontSize: 12, marginBottom: 8,
              boxSizing: 'border-box' as const, fontFamily: 'inherit',
            }}
          />
          <button style={{
            width: '100%', padding: 8, borderRadius: 20,
            background: 'var(--navy)', color: '#fff', border: 'none',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Subscribe
          </button>
        </div>

      </div>
    </div>
  )
}
