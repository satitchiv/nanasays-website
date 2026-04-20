/**
 * <FeesSection> — Published fee + true cost of attendance estimate + scholarships/bursaries.
 *
 * Data: school_structured_data (fees_local_min/max, fees_currency, fees_by_grade, scholarships, bursaries)
 */

import FeeText from '../FeeText'

type FeesByGrade = Array<{
  phase?: string
  per_term?: number | null
  per_year?: number | null
  notes?: string
}>

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

export default function FeesSection({
  feesMin, feesMax, currency, feesByGrade,
  includesBoarding, applicationFee, scholarships, bursariesNote, feesSourceUrl,
}: Props) {
  const prefix = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency ? `${currency} ` : '£'
  const hasGradeTable = Array.isArray(feesByGrade) && feesByGrade.length > 0

  if (!feesMin && !hasGradeTable) return null

  return (
    <section className="block" id="fees">
      <h2 className="block-title">Fees & the true cost of attendance</h2>

      <h3 className="block-sub">Published fees</h3>
      {hasGradeTable ? (
        <table className="fin-table">
          <thead>
            <tr>
              <th>Phase</th>
              <th>Per term</th>
              <th>Per year</th>
            </tr>
          </thead>
          <tbody>
            {feesByGrade!.map((row, i) => (
              <tr key={i}>
                <td>{row.phase || '—'}</td>
                <td>{fmt(row.per_term, prefix)}</td>
                <td>{fmt(row.per_year, prefix)}{row.notes && <><br/><small style={{color: 'var(--muted)'}}>{row.notes}</small></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
        <p><strong>Budget beyond the sticker price.</strong> Assume the real annual spend is 5–15% higher than the headline fee. Hidden costs typically include: registration fee, acceptance deposit (usually one term's fees, refundable at the end of schooling), uniform + sports kit, trips and expeditions, individual music tuition, exam entry fees, travel to/from home.</p>
        <p>Ask the Bursar for a sample "all-in" first-year invoice before committing.</p>
      </div>

      {(scholarships?.length || bursariesNote) && (
        <>
          <h3 className="block-sub">Scholarships & bursaries</h3>
          {scholarships && scholarships.length > 0 && (
            <ul>
              {scholarships.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
          {bursariesNote && (
            <p>
              <em>
                "Means-tested" just means the school looks at your family's income and assets to decide how much help you get —
                like applying for a student loan. If your household earns below a certain threshold, you could receive a much
                bigger discount than any scholarship offers.
              </em>
              {' '}{bursariesNote}
            </p>
          )}
        </>
      )}
    </section>
  )
}
