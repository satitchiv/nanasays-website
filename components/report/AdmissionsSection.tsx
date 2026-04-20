/**
 * <AdmissionsSection> — Entry points + ISEB / assessment format + deadlines.
 *
 * Data: school_structured_data.admissions_format (JSONB) + entry_exam_type + registration_deadline
 */

type AdmissionsFormat = {
  entry_points?: Array<{
    entry_point?: string
    year?: string
    assessment?: string
    assessment_date?: string
    registration_deadline?: string
  }>
  source_url?: string
  notes?: string
}

type Props = {
  admissionsFormat?: AdmissionsFormat | null
  registrationDeadline?: string | null
  entryExamType?: string | null
}

export default function AdmissionsSection({ admissionsFormat, registrationDeadline, entryExamType }: Props) {
  const rows = admissionsFormat?.entry_points || []
  if (rows.length === 0 && !registrationDeadline && !entryExamType) return null

  return (
    <section className="block" id="admissions">
      <h2 className="block-title">Admissions</h2>

      {entryExamType && !rows.length && (
        <p><strong>Assessment format:</strong> {entryExamType}</p>
      )}
      {registrationDeadline && !rows.length && (
        <p><strong>Registration deadline:</strong> {registrationDeadline}</p>
      )}

      {rows.length > 0 && (
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
      )}

      {admissionsFormat?.notes && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{admissionsFormat.notes}</p>}
    </section>
  )
}
