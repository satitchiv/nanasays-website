type Quote = { text: string; citation?: string; flag?: boolean }

type Props = {
  inspectionDate?: string | null
  inspectionAgeMonths?: number | null
  standardsMet?: boolean | null
  inspectorate?: string
  inspectionType?: string | null
  numberOfInspectors?: number | null
  durationDays?: number | null
  previousInspectionDate?: string | null
  reportUrl?: string | null
  overallSummary?: string | null
  signatureQuotes?: Quote[]
  wellbeingQuotes?: Quote[]
  academicQuotes?: Quote[]
  sendNotes?: string | null
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
  inspectionType, numberOfInspectors, durationDays, previousInspectionDate, reportUrl,
  overallSummary, signatureQuotes = [], wellbeingQuotes = [], academicQuotes = [],
  sendNotes, recommendations = [],
}: Props) {
  if (!inspectionDate) return null

  const age = ageFlag(inspectionAgeMonths)

  return (
    <section className="block" id="inspection">
      <h2 className="block-title">Inspection record</h2>

      {/* Meta strip */}
      <div className="insp-meta-strip">
        <div className="insp-meta-item">
          <span className="insp-meta-label">Inspectorate</span>
          <span className="insp-meta-value">{inspectorate}</span>
        </div>
        {inspectionType && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Type</span>
            <span className="insp-meta-value">{inspectionType}</span>
          </div>
        )}
        <div className="insp-meta-item">
          <span className="insp-meta-label">Date</span>
          <span className="insp-meta-value">{inspectionDate}</span>
        </div>
        {numberOfInspectors && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Inspectors</span>
            <span className="insp-meta-value">{numberOfInspectors}{durationDays ? ` · ${durationDays} days` : ''}</span>
          </div>
        )}
        {previousInspectionDate && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Previous</span>
            <span className="insp-meta-value">{previousInspectionDate}</span>
          </div>
        )}
        <div className="insp-meta-item">
          <span className="insp-meta-label">Outcome</span>
          <span className={`insp-meta-value insp-outcome ${standardsMet ? 'pass' : 'fail'}`}>
            {standardsMet ? '✓ All Standards met' : '✗ Standards not met'}
          </span>
        </div>
        {age && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Recency</span>
            <span className={`insp-meta-value insp-age ${age.cls}`}>{age.text}</span>
          </div>
        )}
      </div>

      {/* Plain English explainer of inspection type */}
      {inspectionType && (
        <p className="insp-type-note">
          <strong>What is a {inspectionType}?</strong>{' '}
          {inspectionType.toLowerCase().includes('compliance')
            ? 'A Compliance Inspection checks whether the school meets the Independent School Standards set by the government — covering welfare, health & safety, curriculum, leadership and governance. It is not a full quality judgement; think of it as a regulatory pass/fail check.'
            : inspectionType.toLowerCase().includes('educational quality')
            ? 'An Educational Quality Inspection assesses the quality of pupils\' academic and personal development, as well as compliance with Independent School Standards. This is the most thorough type of ISI inspection.'
            : 'An ISI inspection assesses how well the school meets the Independent School Standards set by the government.'}
        </p>
      )}

      {/* Overall summary */}
      {overallSummary && (
        <div className="insp-summary-box">
          <div className="insp-summary-label">Inspector summary</div>
          <p className="insp-summary-text">{overallSummary}</p>
        </div>
      )}

      {signatureQuotes.length > 0 && (
        <>
          <h3 className="block-sub">What inspectors said — overall character</h3>
          {signatureQuotes.map((q, i) => (
            <blockquote key={i} className={q.flag ? 'flag' : ''}>
              {q.text}
              {q.citation && <cite>— {q.citation}</cite>}
            </blockquote>
          ))}
        </>
      )}

      {wellbeingQuotes.length > 0 && (
        <>
          <h3 className="block-sub">Pupil wellbeing & pastoral care</h3>
          {wellbeingQuotes.map((q, i) => (
            <blockquote key={i}>
              {q.text}
              {q.citation && <cite>— {q.citation}</cite>}
            </blockquote>
          ))}
        </>
      )}

      {academicQuotes.length > 0 && (
        <>
          <h3 className="block-sub">Teaching & academic outcomes</h3>
          {academicQuotes.map((q, i) => (
            <blockquote key={i}>
              {q.text}
              {q.citation && <cite>— {q.citation}</cite>}
            </blockquote>
          ))}
        </>
      )}

      {sendNotes && (
        <div className="insp-send-box">
          <div className="insp-send-label">Learning support & SEND</div>
          <p>{sendNotes}</p>
        </div>
      )}

      {recommendations.length > 0 && (
        <>
          <h3 className="block-sub">Areas for improvement</h3>
          <p className="insp-rec-intro">The inspectors identified the following recommendations — these are the things the school has been asked to address:</p>
          {recommendations.map((q, i) => (
            <blockquote key={i} className="flag">
              {q.text}
              {q.citation && <cite>— {q.citation}</cite>}
            </blockquote>
          ))}
        </>
      )}

      {reportUrl && (
        <p className="insp-report-link">
          <a href={reportUrl} target="_blank" rel="noopener noreferrer">Read the full ISI report →</a>
        </p>
      )}
    </section>
  )
}
