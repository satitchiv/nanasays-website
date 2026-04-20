/**
 * <CommunityProfile> — Student body composition (international %, EAL %, nationalities, boarding split).
 *
 * Data: school_structured_data.student_community (JSONB, populated by extract-student-community.js)
 */

type Community = {
  total_pupils?: number | null
  pct_international?: number | null
  pct_eal?: number | null
  boarding_pct?: number | null
  day_pct?: number | null
  nationalities_count?: number | null
  nationalities_mentioned?: string[]
  dominant_nationalities?: string[]
  notes?: string
  source_urls?: string[]
}

type Props = { community: Community | null; totalPupilsFallback?: number | null }

export default function CommunityProfile({ community, totalPupilsFallback }: Props) {
  // show section even with partial data — it's useful to be transparent about gaps
  if (!community && !totalPupilsFallback) return null

  const c = community || {}
  const total = c.total_pupils ?? totalPupilsFallback ?? null
  const boardingPct = c.boarding_pct
  const intlPct = c.pct_international
  const ealPct = c.pct_eal
  const nats = c.nationalities_mentioned || []

  return (
    <section className="block" id="community">
      <h2 className="block-title">Student community profile</h2>
      <p>Who fills those places — the facts the admissions brochure rarely leads with.</p>

      <div className="fin-callout">
        {total != null && (
          <div className="fin-stat">
            <div className="fin-stat-label">Total pupils</div>
            <div className="fin-stat-value">{total.toLocaleString()}</div>
          </div>
        )}
        {boardingPct != null && (
          <div className="fin-stat">
            <div className="fin-stat-label">Boarders</div>
            <div className="fin-stat-value">{boardingPct}<small>%</small></div>
          </div>
        )}
        {intlPct != null && (
          <div className="fin-stat">
            <div className="fin-stat-label">International</div>
            <div className="fin-stat-value">{intlPct}<small>%</small></div>
          </div>
        )}
        {ealPct != null && (
          <div className="fin-stat">
            <div className="fin-stat-label">EAL pupils</div>
            <div className="fin-stat-value">{ealPct}<small>%</small></div>
          </div>
        )}
      </div>

      {nats.length > 0 && (
        <>
          <h3 className="block-sub">Nationalities mentioned in school materials</h3>
          <div className="uni-list">
            {nats.map((n, i) => <span key={i} className="uni-pill">{n}</span>)}
          </div>
        </>
      )}

      {(!intlPct && !ealPct && !nats.length) && (
        <div className="translate">
          <p><strong>The school does not publish a community breakdown in the materials we can access.</strong> Ask admissions on tour: "What percentage of your current Year 7 hold UK passports vs. international passports? How many boarders stay on-site for at least one exeat per term?" Those two answers tell you more about everyday life than any marketing page.</p>
        </div>
      )}

      {c.notes && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{c.notes}</p>}
    </section>
  )
}
