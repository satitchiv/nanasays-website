'use client'

import { useState } from 'react'

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
const DEFAULT_COLOR = '#888780'

const CAT_TEXT: Record<string, string> = {
  'Admissions': '#0F6E56',
  'Scholarships': '#0F6E56',
  'Visa': '#185FA5',
  'Visa & Immigration': '#185FA5',
  'Fees': '#A32D2D',
  'Fees & Funding': '#A32D2D',
  'Rankings': '#534AB7',
  'Rankings & Results': '#534AB7',
  'Policy': '#B84A14',
  'Education Policy': '#B84A14',
  'School News': '#0A6B82',
  'Curriculum': '#0A6B82',
  'University News': '#3B35A8',
  'Student Life': '#A01E5E',
  'Community': '#A01E5E',
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month ago'
  return `${months} months ago`
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function parseAffectedTags(whoAffected?: string): string[] {
  if (!whoAffected) return []
  if (whoAffected === 'No direct family impact identified') return []
  return whoAffected
    .split(/[,;]|\bparticularly\b|\bespecially\b|\bincluding\b/i)
    .map(s => s.trim().replace(/[.()]/g, ''))
    .filter(s => s.length > 2)
    .map(s => s.split(/\s+/).slice(0, 4).join(' '))
    .filter(Boolean)
    .slice(0, 4)
}

function extractDateBadge(actionNeeded?: string): string | null {
  if (!actionNeeded) return null
  const match = actionNeeded.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b|\b\d{4}\b/i
  )
  return match ? match[0] : null
}

interface BulletsJson {
  bullets?: string[]
  who_affected?: string
  action_needed?: string
  source_name?: string
}

interface Article {
  id: string
  english_headline: string
  source_name?: string
  source_url?: string
  category?: string
  published_at?: string
  urgency?: string
  who_affected?: string
  action_needed?: string
  bullets_json?: BulletsJson
  schools_mentioned?: string[]
  content_tier?: string
}

interface Props {
  article: Article
  currentSchoolSlug?: string
  defaultExpanded?: boolean
}

export default function ArticleCard({ article, currentSchoolSlug, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const color = CAT_COLORS[article.category || ''] || DEFAULT_COLOR
  const textColor = CAT_TEXT[article.category || ''] || '#555'
  const bullets = article.bullets_json?.bullets || []

  const whoAffected = article.bullets_json?.who_affected || article.who_affected
  const actionNeeded = article.bullets_json?.action_needed || article.action_needed
  const sourceName = article.bullets_json?.source_name || article.source_name
  const sourceUrl = article.source_url

  const affectedTags = parseAffectedTags(whoAffected)
  const isLinkTier = article.content_tier === 'link'

  const isRealAction =
    actionNeeded &&
    !actionNeeded.toLowerCase().startsWith('no immediate action')

  const dateBadge = isRealAction ? extractDateBadge(actionNeeded) : null
  const isUrgent = article.urgency === 'high'

  // LINK tier — simplified card
  if (isLinkTier) {
    return (
      <div style={{
        borderLeft: `3px solid ${color}`,
        paddingLeft: 16,
        marginBottom: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--off)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 500, color: 'var(--muted)',
            border: '0.5px solid var(--border)', flexShrink: 0,
          }}>
            {getInitials(sourceName)}
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, margin: 0, color: 'var(--navy)' }}>
              {sourceName || 'Education News'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
              {timeAgo(article.published_at)}
            </p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {article.category && (
              <span style={{
                fontSize: 11, background: `${color}18`, color: textColor,
                padding: '2px 8px', borderRadius: 10,
              }}>
                {article.category}
              </span>
            )}
          </div>
        </div>

        <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 10px', lineHeight: 1.3, color: 'var(--navy)' }}>
          {article.english_headline}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Credit source:{' '}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ color: 'var(--muted)', textDecoration: 'none' }}
              >
                {sourceName}
              </a>
            ) : (
              <span>{sourceName}</span>
            )}
          </span>
        </div>
      </div>
    )
  }

  // FULL tier — two-column card
  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      border: '0.5px solid var(--border)',
      marginBottom: 24,
      overflow: 'hidden',
    }}>
      {/* Top color bar */}
      <div style={{ height: 4, background: color }} />

      {/* Two-column body — collapsed wrapper */}
      <div style={{ position: 'relative' }}>
        <div style={{
          maxHeight: expanded ? 'none' : 340,
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr',
          }}>

        {/* LEFT — headline + source + key points */}
        <div style={{
          padding: '16px 18px',
          borderRight: '0.5px solid var(--border)',
        }}>
          {/* Source row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'var(--off)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: 'var(--muted)',
              border: '0.5px solid var(--border)', flexShrink: 0,
            }}>
              {getInitials(sourceName)}
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--navy)' }}>
                {sourceName || 'Education News'}
              </p>
              <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
                {timeAgo(article.published_at)}
              </p>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {article.category && (
                <span style={{
                  fontSize: 14, background: `${color}18`, color: textColor,
                  padding: '4px 12px', borderRadius: 10, fontWeight: 500,
                }}>
                  {article.category}
                </span>
              )}
              {isUrgent && (
                <span style={{
                  fontSize: 14, background: '#fee2e2', color: '#b91c1c',
                  padding: '4px 12px', borderRadius: 10, fontWeight: 700,
                }}>
                  Urgent
                </span>
              )}
            </div>
          </div>

          {/* Headline */}
          <p style={{
            fontSize: 28, fontWeight: 700, margin: '0 0 18px',
            lineHeight: 1.35, color: 'var(--navy)',
          }}>
            {article.english_headline}
          </p>

          {/* Key points */}
          {bullets.length > 0 && (
            <div>
              <p style={{
                fontSize: 14, fontWeight: 700, letterSpacing: '0.05em',
                textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 12px',
              }}>
                Key points
              </p>

              {bullets.map((bullet, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: color, flexShrink: 0, marginTop: 9,
                  }} />
                  <p style={{ fontSize: 17, color: 'var(--body)', margin: 0, lineHeight: 1.6 }}>
                    {bullet}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — Nana's Take */}
        <div style={{
          background: 'var(--teal-bg)',
          borderLeft: '1px solid rgba(52,195,160,0.25)',
          display: 'flex',
          flexDirection: 'column',
          padding: '18px 18px',
          gap: 16,
        }}>

          {/* Nana header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#fff',
              border: '1.5px solid rgba(52,195,160,0.35)',
              overflow: 'hidden',
              flexShrink: 0,
            }}>
              <img src="/nana-logo.png" alt="Nana" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--teal-dk)', margin: 0 }}>
                Nana's Take
              </p>
              <p style={{ fontSize: 13, color: 'var(--teal-dk)', opacity: 0.7, margin: 0 }}>
                What this means for you
              </p>
            </div>
          </div>

          {/* Who it affects — displayed as prose to preserve full context */}
          {whoAffected && whoAffected !== 'No direct family impact identified' && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal-dk)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Who this affects
              </p>
              <p style={{ fontSize: 15, color: 'var(--teal-dk)', margin: 0, lineHeight: 1.6, opacity: 0.9 }}>
                {whoAffected}
              </p>
            </div>
          )}

          {/* What to do */}
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal-dk)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {isRealAction ? 'What to do' : 'Nana says'}
            </p>
            <div style={{
              background: isRealAction ? (dateBadge ? '#fffbeb' : '#fff5f5') : '#fff',
              borderRadius: 10,
              padding: '12px 14px',
              border: isRealAction
                ? (dateBadge ? '1px solid #fcd34d' : '1px solid #fca5a5')
                : '1px solid rgba(52,195,160,0.2)',
            }}>
              {isRealAction ? (
                <>
                  <p style={{
                    fontSize: 15, lineHeight: 1.6, margin: 0,
                    color: dateBadge ? '#78350f' : '#7f1d1d',
                    marginBottom: dateBadge ? 10 : 0,
                  }}>
                    {actionNeeded}
                  </p>
                  {dateBadge && (
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      background: '#fef3c7', color: '#b45309',
                      padding: '2px 10px', borderRadius: 100,
                      border: '1px solid #fcd34d',
                      display: 'inline-block', marginTop: 2,
                    }}>
                      Deadline: {dateBadge}
                    </span>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal-dk)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p style={{ fontSize: 15, color: 'var(--teal-dk)', margin: 0, lineHeight: 1.6 }}>
                    {actionNeeded || 'Nothing to act on right now — good to stay informed.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          </div>
        </div>
        </div>{/* end maxHeight clipper */}

        {/* Fade overlay across both columns — only when collapsed */}
        {!expanded && bullets.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 60,
            background: 'linear-gradient(transparent, var(--off, #f8f9fa))',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* Expand toggle — sits between body and footer */}
      {bullets.length > 0 && (
        <div style={{
          padding: '8px 18px',
          borderTop: '0.5px solid var(--border)',
        }}>
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
            style={{
              background: 'none', border: 'none', padding: 0,
              fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
              color: '#2563eb', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {expanded ? '▴ Hide details' : '▾ Show full card'}
          </button>
        </div>
      )}

      {/* Footer */}
      <div style={{
        borderTop: '0.5px solid var(--border)',
        padding: '10px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a
          href={`/news/${article.id}`}
          onClick={e => e.stopPropagation()}
          style={{
            fontSize: 14, color: 'var(--muted)',
            textDecoration: 'none', fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          Full article
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
        <span style={{ fontSize: 15, color: 'var(--muted)' }}>
          Credit source:{' '}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: 'var(--muted)', textDecoration: 'none', fontWeight: 500 }}
            >
              {sourceName || 'Original source'}
            </a>
          ) : (
            <span style={{ fontWeight: 500 }}>{sourceName || 'Unknown'}</span>
          )}
        </span>
      </div>
    </div>
  )
}
