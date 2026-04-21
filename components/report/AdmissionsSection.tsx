/**
 * <AdmissionsSection> — Entry points + process steps + open events.
 *
 * Data: school_structured_data.admissions_format (JSONB)
 * Entry points may be integer ages (legacy) or full objects (from extract-admissions.js).
 */

type EntryPoint = {
  entry_point?: string
  year?: string
  assessment?: string
  assessment_date?: string
  registration_deadline?: string
}

type AdmissionsFormat = {
  entry_points?: Array<EntryPoint | number>
  process_steps?: string[]
  what_to_submit?: string[]
  open_events?: string[]
  scholarships_noted?: string | null
  contact?: string | null
  source_url?: string | null
  notes?: string | null
}

type Props = {
  admissionsFormat?: AdmissionsFormat | null
  registrationDeadline?: string | null
  entryExamType?: string | null
}

export default function AdmissionsSection({ admissionsFormat, registrationDeadline, entryExamType }: Props) {
  const raw = admissionsFormat?.entry_points || []
  const isIntegerArray = raw.length > 0 && typeof raw[0] === 'number'
  const rows: EntryPoint[] = isIntegerArray
    ? (raw as number[]).map(age => ({ entry_point: `Year ${age}` }))
    : raw as EntryPoint[]

  const processSteps = admissionsFormat?.process_steps || []
  const whatToSubmit = admissionsFormat?.what_to_submit || []
  const openEvents   = admissionsFormat?.open_events || []

  const hasAnything = rows.length > 0 || registrationDeadline || entryExamType ||
    processSteps.length > 0 || openEvents.length > 0 ||
    !!admissionsFormat?.notes || !!admissionsFormat?.scholarships_noted ||
    whatToSubmit.length > 0 || !!admissionsFormat?.contact

  if (!hasAnything) return null

  const hasFullRowData = rows.some(r => r.assessment || r.assessment_date || r.registration_deadline)

  return (
    <section className="block" id="admissions">
      <h2 className="block-title">Admissions</h2>

      {/* ── Entry points table ── */}
      {rows.length > 0 && (
        <>
          {hasFullRowData ? (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Entry point</th>
                  <th>Assessment</th>
                  <th>Assessment date</th>
                  <th>Registration deadline</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><strong>{r.entry_point || r.year || '—'}</strong></td>
                    <td>{r.assessment || '—'}</td>
                    <td>{r.assessment_date || '—'}</td>
                    <td>{r.registration_deadline || registrationDeadline || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Fallback: just show entry ages as pills when no detail available */
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {rows.map((r, i) => (
                <span key={i} style={{
                  background: 'var(--teal-bg)', color: 'var(--teal-dk)',
                  fontWeight: 700, fontSize: 13, padding: '4px 12px', borderRadius: 20,
                }}>
                  {r.entry_point || r.year}
                </span>
              ))}
            </div>
          )}
          {!hasFullRowData && entryExamType && (
            <p><strong>Assessment format:</strong> {entryExamType}</p>
          )}
          {!hasFullRowData && registrationDeadline && (
            <p><strong>Registration deadline:</strong> {registrationDeadline}</p>
          )}
        </>
      )}

      {/* ── Application process steps ── */}
      {processSteps.length > 0 && (
        <>
          <h3 className="block-sub">How to apply</h3>
          <ol style={{ paddingLeft: 20, margin: '8px 0 16px', lineHeight: 1.7 }}>
            {processSteps.map((step, i) => (
              <li key={i} style={{ fontSize: 14 }}>{step}</li>
            ))}
          </ol>
        </>
      )}

      {/* ── What to submit ── */}
      {whatToSubmit.length > 0 && (
        <>
          <h3 className="block-sub">What you'll need to submit</h3>
          <ul style={{ paddingLeft: 20, margin: '8px 0 16px', lineHeight: 1.7 }}>
            {whatToSubmit.map((item, i) => (
              <li key={i} style={{ fontSize: 14 }}>{item}</li>
            ))}
          </ul>
        </>
      )}

      {/* ── Open events ── */}
      {openEvents.length > 0 && (
        <>
          <h3 className="block-sub">Open events</h3>
          <ul style={{ paddingLeft: 20, margin: '8px 0 16px', lineHeight: 1.7 }}>
            {openEvents.map((ev, i) => (
              <li key={i} style={{ fontSize: 14 }}>{ev}</li>
            ))}
          </ul>
        </>
      )}

      {/* ── Scholarships note ── */}
      {admissionsFormat?.scholarships_noted && (
        <div className="translate">
          <p><strong>Scholarships:</strong> {admissionsFormat.scholarships_noted}</p>
        </div>
      )}

      {/* ── Contact + notes ── */}
      {admissionsFormat?.contact && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
          <strong>Admissions contact:</strong>{' '}
          {admissionsFormat.contact.includes('@')
            ? <a href={`mailto:${admissionsFormat.contact}`}>{admissionsFormat.contact}</a>
            : admissionsFormat.contact
          }
        </p>
      )}
      {admissionsFormat?.notes && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          <em>{admissionsFormat.notes}</em>
        </p>
      )}
    </section>
  )
}
