/**
 * <UniversityDestinations> — Oxbridge + named UK + US/international destinations.
 *
 * Data: school_structured_data.university_destinations (JSONB). Shape varies by school.
 */

type Destinations = {
  year?: string
  // Our stored schema (from fetch-destinations.js):
  oxbridge_acceptances?: number | null
  oxbridge_applicants?: number | null
  top_universities?: Array<{ name: string; count?: number | null }>
  us_ivy_and_top10?: Array<{ name: string; count?: number | null }>
  russell_group_count?: number | null
  medicine_dentistry_vet_count?: number | null
  apprenticeship_or_gap_count?: number | null
  // Alternate / older shapes:
  oxbridge_total?: number | null
  oxford_count?: number | null
  cambridge_count?: number | null
  oxbridge_subjects?: string[]
  us_applicants?: number | null
  us_placements?: number | null
  named_uk?: Array<string | { name: string; count?: number }>
  named_us?: Array<string | { name: string; count?: number }>
  source_urls?: string[]
  notes?: string
}

type Props = { destinations: Destinations | null }

function renderPill(item: string | { name: string; count?: number }, variant?: 'oxbridge' | 'ivy') {
  const label = typeof item === 'string' ? item : `${item.name}${item.count ? ` (${item.count})` : ''}`
  return <span className={`uni-pill${variant ? ' ' + variant : ''}`}>{label}</span>
}

export default function UniversityDestinations({ destinations: d }: Props) {
  if (!d) return null

  // Normalise stored "top_universities" to our named_uk/named_us buckets.
  const ukUnis: Array<string | { name: string; count?: number }> = []
  const usUnis: Array<string | { name: string; count?: number }> = []
  for (const u of (d.top_universities || [])) {
    if (/oxford|cambridge|UCL|Imperial|Edinburgh|LSE|London|Bristol|Durham|Exeter|Warwick|Bath|Manchester|Leeds|Oxford|Glasgow|St Andrews|King's|Queen Mary|Birmingham|Nottingham|Southampton|York|Newcastle|Sheffield|Cardiff|Liverpool|Reading|Royal Holloway|UK/i.test(u.name)) {
      ukUnis.push({ name: u.name, count: u.count ?? undefined })
    }
  }
  for (const u of (d.us_ivy_and_top10 || [])) {
    usUnis.push({ name: u.name, count: u.count ?? undefined })
  }
  const legacyNamedUK = Array.isArray(d.named_uk) ? d.named_uk : []
  const legacyNamedUS = Array.isArray(d.named_us) ? d.named_us : []
  const allUK = ukUnis.length ? ukUnis : legacyNamedUK
  const allUS = usUnis.length ? usUnis : legacyNamedUS

  // Derive Oxford / Cambridge counts from top_universities if possible
  const oxCount = d.oxford_count ?? (d.top_universities?.find(u => /oxford/i.test(u.name))?.count ?? null)
  const cambCount = d.cambridge_count ?? (d.top_universities?.find(u => /cambridge/i.test(u.name))?.count ?? null)
  const oxbridgeTotal = d.oxbridge_total ?? d.oxbridge_acceptances ?? ((oxCount ?? 0) + (cambCount ?? 0) || null)

  const hasAnyStats = oxbridgeTotal != null || d.us_placements != null || oxCount != null || cambCount != null
  const hasNamedUK = allUK.length > 0
  const hasNamedUS = allUS.length > 0

  if (!hasAnyStats && !hasNamedUK && !hasNamedUS) return null

  return (
    <section className="block" id="destinations">
      <h2 className="block-title">
        University destinations
        {d.year && <span className="stamp">{d.year}</span>}
      </h2>

      {hasAnyStats && (
        <div className="dest-grid">
          {oxbridgeTotal != null && (
            <div className="dest-stat">
              <div className="dest-stat-label">Oxbridge acceptances</div>
              <div className="dest-stat-value">{oxbridgeTotal}</div>
              <div className="dest-stat-caption">
                {oxCount != null && cambCount != null
                  ? `${oxCount} Oxford · ${cambCount} Cambridge.`
                  : 'Across Oxford and Cambridge.'}
              </div>
            </div>
          )}
          {oxCount != null && cambCount == null && (
            <div className="dest-stat">
              <div className="dest-stat-label">Oxford offers</div>
              <div className="dest-stat-value">{oxCount}</div>
              <div className="dest-stat-caption">Named above without a Cambridge breakdown — ask for the full split on tour.</div>
            </div>
          )}
          {cambCount != null && oxCount == null && (
            <div className="dest-stat">
              <div className="dest-stat-label">Cambridge offers</div>
              <div className="dest-stat-value">{cambCount}</div>
              <div className="dest-stat-caption">Named above without an Oxford breakdown.</div>
            </div>
          )}
          {d.us_placements != null && (
            <div className="dest-stat">
              <div className="dest-stat-label">US placements</div>
              <div className="dest-stat-value">
                {d.us_placements}
                {d.us_applicants != null && <small>/{d.us_applicants}</small>}
              </div>
              <div className="dest-stat-caption">
                Pupils who actually took up a US place
                {d.us_applicants != null && <> from {d.us_applicants} applicants</>}
                . "Placements" not "offers" — the number that matters.
              </div>
            </div>
          )}
        </div>
      )}

      {hasNamedUK && (
        <>
          <h3 className="block-sub">Named UK destinations</h3>
          <div className="uni-list">
            {allUK.map((u, i) => {
              const name = typeof u === 'string' ? u : u.name
              const isOxbridge = /oxford|cambridge/i.test(name)
              return <span key={i}>{renderPill(u, isOxbridge ? 'oxbridge' : undefined)}</span>
            })}
          </div>
        </>
      )}

      {hasNamedUS && (
        <>
          <h3 className="block-sub">Named US destinations</h3>
          <div className="uni-list">
            {allUS.map((u, i) => {
              const name = typeof u === 'string' ? u : u.name
              const isIvy = /harvard|yale|princeton|columbia|penn|brown|dartmouth|cornell|mit|stanford|berkeley|ucla|uchicago|chicago/i.test(name)
              return <span key={i}>{renderPill(u, isIvy ? 'ivy' : undefined)}</span>
            })}
          </div>
        </>
      )}

      {Array.isArray(d.oxbridge_subjects) && d.oxbridge_subjects.length > 0 && (
        <>
          <h3 className="block-sub">Oxbridge subject spread</h3>
          <p>{d.oxbridge_subjects.join(' · ')}</p>
        </>
      )}

      {d.notes && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{d.notes}</p>}
    </section>
  )
}
