/**
 * <FeesSection> — Published fee + true cost of attendance estimate + scholarships/bursaries.
 *
 * Data: school_structured_data.fees_by_grade (JSONB) — new consistent schema:
 *   {
 *     currency, vat_included, terms_per_year,
 *     rows: [{ phase, per_term, per_year, source }],
 *     compulsory_extras: [{ name, per_term, per_year, notes }]
 *   }
 *
 * Also accepts legacy array-of-rows shape + fees_min/max for schools that
 * only have a single-number fee on file.
 *
 * Display rule: always show "£X / term · £Y / year". Same look across
 * listing page, report page, and PDF, regardless of how the school
 * publishes (termly vs annual).
 */

import FeeText from '../FeeText'

type FeeRow = {
  phase?: string
  per_term?: number | null
  per_year?: number | null
  source?: 'published' | 'computed'
  notes?: string
}

type FeeExtra = {
  name?: string
  per_term?: number | null
  per_year?: number | null
  notes?: string | null
}

type FeesByGrade =
  | FeeRow[]  // legacy shape: bare array of rows
  | {
      currency?: string | null
      vat_included?: boolean | null
      terms_per_year?: number | null
      rows?: FeeRow[]
      compulsory_extras?: FeeExtra[]
    }

type Props = {
  feesMin?: number | null
  feesMax?: number | null
  currency?: string | null
  feesByGrade?: FeesByGrade | null
  includesBoarding?: boolean | null
  applicationFee?: number | null
  scholarships?: string[] | null
  bursariesNote?: string | null
  feesSourceUrl?: string | null
}

function fmt(n: number | null | undefined, prefix = '£') {
  if (n == null) return '—'
  return `${prefix}${n.toLocaleString()}`
}

function normalizeFeesByGrade(raw: FeesByGrade | null | undefined, fallbackCurrency?: string | null) {
  if (!raw) return null
  // Array = legacy shape
  if (Array.isArray(raw)) {
    return {
      currency: fallbackCurrency || 'GBP',
      vat_included: null,
      terms_per_year: 3,
      rows: raw,
      compulsory_extras: [],
    }
  }
  return {
    currency: raw.currency || fallbackCurrency || 'GBP',
    vat_included: raw.vat_included ?? null,
    terms_per_year: raw.terms_per_year ?? 3,
    rows: Array.isArray(raw.rows) ? raw.rows : [],
    compulsory_extras: Array.isArray(raw.compulsory_extras) ? raw.compulsory_extras : [],
  }
}

export default function FeesSection({
  feesMin, feesMax, currency, feesByGrade,
  includesBoarding, applicationFee, scholarships, bursariesNote, feesSourceUrl,
}: Props) {
  const normalized = normalizeFeesByGrade(feesByGrade, currency)
  const hasGradeTable = !!(normalized && normalized.rows && normalized.rows.length > 0)
  const displayCurrency = normalized?.currency || currency || 'GBP'
  const prefix = displayCurrency === 'GBP' ? '£' : displayCurrency === 'USD' ? '$' : `${displayCurrency} `

  if (!feesMin && !hasGradeTable) return null

  return (
    <section className="block" id="fees">
      <h2 className="block-title">Fees & the true cost of attendance</h2>

      <h3 className="block-sub">
        Published fees
        {normalized?.vat_included === true && <small style={{ color: 'var(--muted)', fontWeight: 500 }}> · inclusive of VAT</small>}
      </h3>

      {hasGradeTable ? (
        <>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Phase</th>
                <th>Per term</th>
                <th>Per year</th>
              </tr>
            </thead>
            <tbody>
              {normalized!.rows!.map((row, i) => (
                <tr key={i}>
                  <td>{row.phase || '—'}</td>
                  <td>{fmt(row.per_term, prefix)}</td>
                  <td>
                    {fmt(row.per_year, prefix)}
                    {row.source === 'computed' && (
                      <small style={{ color: 'var(--muted)', marginLeft: 4 }}>(computed)</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {normalized!.compulsory_extras && normalized!.compulsory_extras.length > 0 && (
            <>
              <h3 className="block-sub">Compulsory extras (on top of tuition)</h3>
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Per term</th>
                    <th>Per year</th>
                  </tr>
                </thead>
                <tbody>
                  {normalized!.compulsory_extras!.map((e, i) => (
                    <tr key={i}>
                      <td>
                        {e.name || '—'}
                        {e.notes && <><br /><small style={{ color: 'var(--muted)' }}>{e.notes}</small></>}
                      </td>
                      <td>{fmt(e.per_term, prefix)}</td>
                      <td>{fmt(e.per_year, prefix)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      ) : feesMin ? (
        <p>
          <strong><FeeText min={feesMin} max={feesMax ?? feesMin} originalCurrency={currency ?? 'GBP'} /></strong> per year
          {includesBoarding ? ' (boarding fee)' : ''}.
          {applicationFee && <> Application fee: {fmt(applicationFee, prefix)}.</>}
        </p>
      ) : null}

      {feesSourceUrl && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -8 }}>
          Source: <a href={feesSourceUrl}>{feesSourceUrl.replace(/^https?:\/\//, '').split('/')[0]}</a>
        </p>
      )}

      <div className="translate">
        <p><strong>Budget beyond the sticker price.</strong> Assume the real annual spend is 5–15% higher than the headline fee. Hidden costs typically include: registration fee, acceptance deposit (usually one term&apos;s fees, refundable at the end of schooling), uniform + sports kit, trips and expeditions, individual music tuition, exam entry fees, travel to/from home.</p>
        <p>Ask the Bursar for a sample &quot;all-in&quot; first-year invoice before committing.</p>
      </div>

      {(scholarships?.length || bursariesNote) && (
        <div className="schol-section" id="scholarships">
          <div className="schol-section-title">Scholarships & financial assistance</div>

          {scholarships && scholarships.length > 0 && (
            <>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 10px' }}>
                Merit-based scholarships ({scholarships.length} types)
              </p>
              <div className="schol-list">
                {scholarships.map((s, i) => {
                  // Try to highlight any percentage remission mentioned in the text
                  const pctMatch = s.match(/(\d+)%/)
                  return (
                    <div key={i} className="schol-item">
                      {pctMatch ? (
                        <>
                          {s.replace(pctMatch[0], '')}
                          <span className="schol-pct">{pctMatch[0]} fee remission</span>
                        </>
                      ) : s}
                    </div>
                  )
                })}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 14px', fontStyle: 'italic' }}>
                ℹ️ This school has not published the exact % fee remission for each award.
                Ask the admissions team directly — typical independent school scholarships range from 5% to 50% of fees.
              </p>
            </>
          )}

          {bursariesNote && (
            <div className="bursary-callout">
              <div className="bursary-icon">💰</div>
              <div className="bursary-text">
                <strong>Means-tested bursaries</strong> — the school looks at your family income and can offer a much larger discount than any scholarship.
                {' '}{bursariesNote}
                {' '}<em style={{ color: 'var(--muted)', fontSize: 13 }}>Ask the Bursar directly — these are rarely advertised prominently.</em>
              </div>
            </div>
          )}

          {!bursariesNote && (
            <div className="bursary-callout" style={{ marginTop: 8 }}>
              <div className="bursary-icon">💰</div>
              <div className="bursary-text">
                <strong>Bursaries (means-tested aid)</strong> — separate from scholarships and based on family income, not merit.
                Many schools offer bursaries covering 50–100% of fees for families who qualify but don&apos;t advertise this widely.
                Ask the Bursar whether a bursary programme exists, even if it&apos;s not on the website.
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
