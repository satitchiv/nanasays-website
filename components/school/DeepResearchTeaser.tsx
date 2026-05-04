import Link from 'next/link'
import './deep-research-teaser.css'

type Structured = {
  exam_results?: unknown | null
  university_destinations?: { top_universities?: Array<{ name?: string; count?: number }> } | null
  sports_profile?: { sport_categories?: { major?: string[] } } | null
  student_community?: unknown | null
  wellbeing_staffing?: unknown | null
} | null

type Props = {
  slug: string
  schoolName: string
  structured: Structured
}

export default function DeepResearchTeaser({ slug, schoolName, structured }: Props) {
  if (!structured) return null

  // Build "Free preview includes" from what's actually in the data.
  const freePreview: string[] = []

  const topUnis = structured.university_destinations?.top_universities ?? []
  if (topUnis.length > 0) {
    const first = topUnis.slice(0, 2).map(u => u?.name?.replace(/^University (of|College) /, '') ?? '').filter(Boolean)
    if (first.length >= 2) {
      freePreview.push(`Named university destinations (${first[0]}, ${first[1]}…)`)
    } else {
      freePreview.push('Named university destinations')
    }
  }
  if (structured.exam_results) freePreview.push('GCSE & A-Level grade distribution')
  if (structured.sports_profile) freePreview.push('Sports tier breakdown & competitions')
  if (structured.student_community) freePreview.push('Nationality breakdown')
  if (structured.wellbeing_staffing) freePreview.push('Wellbeing staff ratio')

  if (freePreview.length === 0) return null

  // Locked list is consistent across schools
  const locked = [
    'Charity Commission & financial filings',
    'Full ISI inspection quotes + safeguarding record',
    'Parent-fit verdict: is this school right for your child?',
    '5 tailored tour questions to ask on the day',
  ]

  return (
    <div style={{
      background: 'linear-gradient(180deg, #fff 0%, var(--teal-bg, #E8FAF6) 100%)',
      border: '2px solid var(--teal, #34C3A0)',
      borderRadius: 16,
      padding: '28px 32px',
      margin: '32px 0',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div aria-hidden style={{
        position: 'absolute', top: -20, right: -20, width: 160, height: 160,
        background: 'radial-gradient(circle, rgba(52,195,160,.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        fontSize: 11, fontWeight: 900, color: 'var(--teal-dk, #239C80)',
        letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span aria-hidden style={{
          width: 8, height: 8, background: 'var(--teal, #34C3A0)', borderRadius: '50%',
          boxShadow: '0 0 0 3px rgba(52,195,160,.25)',
        }} />
        Deep Research · free preview
      </div>

      <h2 style={{
        fontFamily: "'Nunito', sans-serif",
        fontSize: 22, fontWeight: 900, color: 'var(--navy, #1B3252)',
        marginBottom: 10, letterSpacing: '-.01em', lineHeight: 1.2,
      }}>
        Make the right call on {schoolName}
      </h2>

      <p style={{
        fontSize: 14, color: 'var(--body, #374151)',
        marginBottom: 20, lineHeight: 1.6, maxWidth: 640,
      }}>
        Most parents visit 4–6 schools, spend months comparing brochures, and still feel uncertain on decision day. Nana reads the inspection records, financial filings, and exam data so you walk in knowing exactly what to ask — and what to watch out for.
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20,
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--muted, #6B7280)',
            letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10,
          }}>Free preview includes</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {freePreview.map(item => (
              <li key={item} style={{
                fontSize: 13, color: 'var(--body, #374151)',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <span aria-hidden style={{
                  color: 'var(--teal-dk, #239C80)', fontWeight: 900, fontSize: 14, flexShrink: 0,
                }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--muted, #6B7280)',
            letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10,
          }}>Locked in full report</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {locked.map(item => (
              <li key={item} style={{
                fontSize: 13, color: 'var(--muted, #6B7280)',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <span aria-hidden style={{ fontSize: 12, flexShrink: 0 }}>🔒</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Price row */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 14,
        marginBottom: 14, paddingTop: 14,
        borderTop: '1px solid rgba(52,195,160,.25)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: 'var(--teal-dk, #239C80)',
          letterSpacing: '.08em', textTransform: 'uppercase',
        }}>Unlocks all school reports</div>
        <div style={{
          fontFamily: "'Nunito', sans-serif",
          fontWeight: 900, color: 'var(--navy, #1B3252)',
          lineHeight: 1, height: 30, overflow: 'hidden',
        }}>
          <div className="dr-price-track">
            <span>£39/mo</span>
            <span>$49/mo</span>
            <span>฿1,700/mo</span>
            <span>£39/mo</span>
          </div>
        </div>
      </div>

      <Link
        href={`/unlock?from=/schools/${slug}/report`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 14,
          background: 'var(--navy, #1B3252)', color: '#fff',
          fontFamily: "'Nunito', sans-serif",
          fontWeight: 800, fontSize: 13,
          letterSpacing: '.06em', textTransform: 'uppercase',
          padding: '14px 24px', borderRadius: 100,
          textDecoration: 'none',
          transition: 'transform .15s, box-shadow .15s',
        }}
      >
        See the full research report →
      </Link>

    </div>
  )
}
