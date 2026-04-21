/**
 * <CrimeSafetySection> — Part 2 (premium)
 *
 * Renders local crime context with mandatory international framing.
 * Core value: UK "violent crime" ≠ Bangkok/Singapore/HK "violent crime".
 * Parents from those cities will dramatically misread raw UK numbers without this.
 *
 * Data: school_structured_data.location_profile.crime_summary (JSONB)
 */

type CrimeCategory = { name?: string | null; count?: number | null; pct?: number | null }

export type CrimeSummary = {
  total_incidents?: number | null
  period?: string | null
  radius_miles?: number | null
  top_categories?: CrimeCategory[]
  interpretation?: string | null
  rate_per_1k?: number | null
  county_rate_per_1k?: number | null
  england_rate_per_1k?: number | null
}

type Props = { crime: CrimeSummary | null }

const BENCHMARKS = [
  { flag: '🇬🇧', label: 'Surrey county avg', rate: '~55–65', note: 'Same broad UK definition', highlight: true },
  { flag: '🇬🇧', label: 'England & Wales avg', rate: '~85', note: 'Same broad UK definition', highlight: false },
  { flag: '🇹🇭', label: 'Bangkok (official)', rate: '~20–25', note: 'Underreported; counts serious assault only — est. 2–3× higher in reality', highlight: false },
  { flag: '🇸🇬', label: 'Singapore', rate: '~6–8', note: 'Narrow definition; very low crime environment globally', highlight: false },
  { flag: '🇭🇰', label: 'Hong Kong', rate: '~10–15', note: 'Narrow definition; property crime more common', highlight: false },
  { flag: '🇺🇸', label: 'United States', rate: '~40–50', note: 'Higher threshold than UK for "violent crime"', highlight: false },
]

function categoryNote(name?: string | null): string | null {
  if (!name) return null
  const n = name.toLowerCase()
  if (n.includes('violence') || n.includes('violent'))
    return 'UK definition includes minor altercations, pushes, verbal threats — ~70–80% involve no injury'
  if (n.includes('anti-social'))
    return 'Noise, public rowdiness — suburban background noise, not physical threat'
  if (n.includes('burglary'))
    return 'Opportunistic property crime; common in affluent postcodes'
  if (n.includes('vehicle'))
    return 'Car theft / break-ins — follows affluent postcode pattern'
  if (n.includes('public order'))
    return 'Disorder, drunk-and-disorderly type incidents'
  if (n.includes('drug'))
    return 'Possession and supply offences'
  return null
}

function burglaryFlag(cat: CrimeCategory): boolean {
  return (cat.name?.toLowerCase().includes('burglary') ?? false) && (cat.pct ?? 0) > 12
}

export default function CrimeSafetySection({ crime }: Props) {
  if (!crime || !crime.total_incidents) return null

  const cats = Array.isArray(crime.top_categories) ? crime.top_categories : []
  const maxCount = Math.max(...cats.map(c => c.count ?? 0), 1)

  const hasViolent = cats.some(c => c.name?.toLowerCase().includes('violen'))
  const hasBurglaryFlag = cats.some(c => burglaryFlag(c))

  // Derive a verdict label from the rate or interpretation
  const rate = crime.rate_per_1k ?? null
  const countyRate = crime.county_rate_per_1k ?? 60
  const verdict = rate != null
    ? rate <= countyRate * 0.9
      ? { label: 'Below county average', color: 'var(--teal-dk)', bg: 'var(--teal-bg)' }
      : rate <= countyRate * 1.1
      ? { label: 'Near county average', color: '#D97706', bg: '#FEF3C7' }
      : { label: 'Above county average', color: '#B91C1C', bg: '#FEE2E2' }
    : crime.interpretation?.toLowerCase().includes('safe') || crime.interpretation?.toLowerCase().includes('below')
    ? { label: 'Below county average', color: 'var(--teal-dk)', bg: 'var(--teal-bg)' }
    : { label: 'Within normal range', color: '#D97706', bg: '#FEF3C7' }

  return (
    <section className="block" id="crime">
      <h2 className="block-title">Local safety context</h2>

      {/* ── Verdict banner ── */}
      <div className="crime-verdict" style={{ background: verdict.bg }}>
        <div className="crime-verdict-label" style={{ color: verdict.color }}>{verdict.label}</div>
        <div className="crime-verdict-meta">
          {crime.total_incidents} incidents · {crime.radius_miles ?? 1} mile radius · {crime.period ?? 'last 12 months'}
        </div>
        {crime.interpretation && (
          <div className="crime-verdict-note">{crime.interpretation}</div>
        )}
      </div>

      {/* ── Critical context callout ── */}
      {hasViolent && (
        <div className="translate">
          <p>
            <strong>Read this before you look at the numbers.</strong> In the United Kingdom,
            &quot;violent crime&quot; (officially &quot;Violence Against the Person&quot;) captures{' '}
            <strong>any unwanted physical contact</strong> — including a push, a shove, a raised
            fist, or verbal threats that escalated into contact. Roughly{' '}
            <strong>70–80% of these incidents involve no injury</strong>.
          </p>
          <p>
            In Bangkok, Singapore, or Hong Kong police statistics, &quot;violent crime&quot; means serious
            assault, robbery with violence, or worse. The two definitions are{' '}
            <strong>not comparable</strong>. A parent from Bangkok reading &quot;40% violent crime&quot; in
            a UK report would naturally be alarmed — and should not be. The UK figure captures incidents
            that Thai, Singaporean, or Hong Kong police would not record as crimes at all.
          </p>
        </div>
      )}

      {/* ── International comparison table ── */}
      <h3 className="block-sub">International comparison</h3>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 10 }}>
        Police-recorded incidents per 1,000 residents per year. Definition differences explain most of the gap.
      </p>
      <table className="fin-table">
        <thead>
          <tr>
            <th>Location</th>
            <th style={{ textAlign: 'right' }}>Rate per 1k / year</th>
            <th>What &quot;violent crime&quot; actually includes</th>
          </tr>
        </thead>
        <tbody>
          {rate != null && (
            <tr style={{ background: 'var(--teal-bg)' }}>
              <td style={{ fontWeight: 800, color: 'var(--teal-dk)' }}>🏫 This school's area</td>
              <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--teal-dk)' }}>{rate}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>Full UK definition — minor altercations through serious assault</td>
            </tr>
          )}
          {BENCHMARKS.map((b, i) => (
            <tr key={i} style={b.highlight ? { background: 'var(--off)' } : {}}>
              <td style={{ fontWeight: b.highlight ? 700 : 400 }}>{b.flag} {b.label}</td>
              <td style={{ textAlign: 'right' }}>{b.rate}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{b.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Category breakdown ── */}
      {cats.length > 0 && (
        <>
          <h3 className="block-sub">Category breakdown</h3>
          <div className="crime-bars">
            {cats.map((c, i) => {
              const barWidth = maxCount > 0 ? Math.round(((c.count ?? 0) / maxCount) * 100) : 0
              const note = categoryNote(c.name)
              const isWarn = burglaryFlag(c)
              return (
                <div key={i} className="crime-bar-row">
                  <div className="crime-bar-label">{c.name || '—'}</div>
                  <div className="crime-bar-track">
                    <div
                      className="crime-bar-fill"
                      style={{
                        width: `${barWidth}%`,
                        background: isWarn ? '#D97706' : 'var(--teal)',
                      }}
                    />
                  </div>
                  <div className="crime-bar-count">
                    {c.count != null ? c.count : '—'}
                    {c.pct != null && <span> ({c.pct}%)</span>}
                  </div>
                  {note && <div className="crime-bar-note">{note}</div>}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Burglary flag ── */}
      {hasBurglaryFlag && (
        <div style={{
          background: '#FEF3C7', borderLeft: '4px solid #D97706', borderRadius: 8,
          padding: '12px 16px', marginTop: 12, fontSize: 14,
        }}>
          <strong style={{ color: 'var(--navy)' }}>Burglary is elevated here.</strong>{' '}
          Affluent postcodes attract opportunistic property theft — this is a known pattern in
          prosperous commuter areas. Ask the school whether boarding houses have secure entry
          after hours.
        </div>
      )}

      {/* ── Tour question ── */}
      <div className="translate" style={{ marginTop: 20 }}>
        <p>
          <strong>Tour question:</strong> &quot;Have there been any incidents at or near the school
          perimeter in the past 12 months, and how are late-evening entry points managed?&quot;
        </p>
      </div>
    </section>
  )
}
