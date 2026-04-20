/**
 * <InspectionRecord> — Full ISI inspection record with verbatim block quotes.
 *
 * Data: school_sensitive where source='isi' OR data_type='inspection_report'.
 * The details JSONB typically includes: inspection_date, standards_met, signature_findings,
 * quotes (array of verbatim strings with citations), recommendations.
 */

type Quote = { text: string; citation?: string; flag?: boolean }

type Props = {
  inspectionDate?: string | null
  inspectionAgeMonths?: number | null
  standardsMet?: boolean | null
  inspectorate?: string
  numberOfInspectors?: number | null
  durationDays?: number | null
  previousInspectionDate?: string | null
  reportUrl?: string | null
  signatureQuotes?: Quote[]
  academicQuotes?: Quote[]
  recommendations?: Quote[]
}

function ageFlag(months: number | null | undefined) {
  if (months == null) return null
  if (months > 60) return { text: `⚠ OVERDUE — ${months} months since last inspection`, cls: 'flag' }
  if (months > 36) return { text: `⚠ DUE SOON — ${months} months since last inspection`, cls: 'flag' }
  return { text: `within normal window — ${months} months since last inspection`, cls: 'ok' }
}

export default function InspectionRecord({
  inspectionDate, inspectionAgeMonths, standardsMet, inspectorate = 'ISI',
  numberOfInspectors, durationDays, previousInspectionDate, reportUrl,
  signatureQuotes = [], academicQuotes = [], recommendations = [],
}: Props) {
  if (!inspectionDate) return null

  const age = ageFlag(inspectionAgeMonths)

  return (
    <section className="block" id="inspection">
      <h2 className="block-title">
        Inspection record — {inspectorate} routine inspection, {inspectionDate}
        {age && <span className="stamp">{inspectionAgeMonths} months old</span>}
      </h2>

      <p>
        {numberOfInspectors && <><strong>{numberOfInspectors} inspector{numberOfInspectors === 1 ? '' : 's'}</strong> visited
          {durationDays && <> for {durationDays} day{durationDays === 1 ? '' : 's'}</>}. </>}
        {standardsMet && 'All Standards met. '}
        {previousInspectionDate && <>Previous inspection: {previousInspectionDate}. </>}
        {reportUrl && <>Full report: <a href={reportUrl}>{reportUrl.replace(/^https?:\/\//, '').split('/')[0]}</a>.</>}
      </p>

      {signatureQuotes.length > 0 && (
        <>
          <h3 className="block-sub">Signature findings</h3>
          {signatureQuotes.map((q, i) => (
            <blockquote key={i} className={q.flag ? 'flag' : ''}>
              {q.text}
              {q.citation && <cite>— {q.citation}</cite>}
            </blockquote>
          ))}
        </>
      )}

      {academicQuotes.length > 0 && (
        <>
          <h3 className="block-sub">Academic and pastoral judgments</h3>
          {academicQuotes.map((q, i) => (
            <blockquote key={i}>
              {q.text}
              {q.citation && <cite>— {q.citation}</cite>}
            </blockquote>
          ))}
        </>
      )}

      {recommendations.length > 0 && (
        <>
          <h3 className="block-sub">Recommended next steps</h3>
          {recommendations.map((q, i) => (
            <blockquote key={i} className="flag">
              {q.text}
              {q.citation && <cite>— {q.citation}</cite>}
            </blockquote>
          ))}
        </>
      )}
    </section>
  )
}
