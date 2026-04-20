/**
 * <CurriculumSection> — Academic overview + exam results + optional ISI quote on teaching.
 *
 * Data: school_structured_data.exam_results (JSONB), curriculum fields
 */

type ExamResults = {
  academic_year?: string
  gcse?: { pct_9?: number | null; pct_7_to_9?: number | null; pct_8_and_9?: number | null; total_pupils?: number | null; notes?: string }
  a_level?: { pct_a_star?: number | null; pct_a_star_a?: number | null; total_pupils?: number | null; notes?: string }
  ib?: { pass_rate?: number | null; average_score?: number | null; total_pupils?: number | null; notes?: string }
  source_url?: string
}

type Props = {
  curriculum?: string | null
  sixthForm?: string | null
  examResults?: ExamResults | null
  isiTeachingQuote?: string | null
  isiCitation?: string | null
}

export default function CurriculumSection({ curriculum, sixthForm, examResults, isiTeachingQuote, isiCitation }: Props) {
  const gcse = examResults?.gcse
  const alevel = examResults?.a_level
  const ib = examResults?.ib

  const hasAnyResults = gcse?.pct_9 || gcse?.pct_7_to_9 || alevel?.pct_a_star || alevel?.pct_a_star_a || ib?.pass_rate

  return (
    <section className="block" id="curriculum">
      <h2 className="block-title">Curriculum & academic outcomes</h2>

      {curriculum && <p>{curriculum}</p>}
      {sixthForm && <p><strong>Sixth Form:</strong> {sixthForm}</p>}

      {hasAnyResults && (
        <>
          <h3 className="block-sub">Published exam results{examResults?.academic_year ? ` (${examResults.academic_year})` : ''}</h3>
          <div className="fin-callout">
            {gcse?.pct_9 != null && (
              <div className="fin-stat">
                <div className="fin-stat-label">GCSE grade 9</div>
                <div className="fin-stat-value">{gcse.pct_9}<small>%</small></div>
              </div>
            )}
            {gcse?.pct_7_to_9 != null && (
              <div className="fin-stat">
                <div className="fin-stat-label">GCSE grade 7–9</div>
                <div className="fin-stat-value">{gcse.pct_7_to_9}<small>%</small></div>
              </div>
            )}
            {alevel?.pct_a_star != null && (
              <div className="fin-stat">
                <div className="fin-stat-label">A-Level A*</div>
                <div className="fin-stat-value">{alevel.pct_a_star}<small>%</small></div>
              </div>
            )}
            {alevel?.pct_a_star_a != null && (
              <div className="fin-stat">
                <div className="fin-stat-label">A-Level A*/A</div>
                <div className="fin-stat-value">{alevel.pct_a_star_a}<small>%</small></div>
              </div>
            )}
            {ib?.average_score != null && (
              <div className="fin-stat">
                <div className="fin-stat-label">IB average</div>
                <div className="fin-stat-value">{ib.average_score}</div>
              </div>
            )}
          </div>
          {examResults?.source_url && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -10 }}>
              Source: <a href={examResults.source_url}>{examResults.source_url.replace(/^https?:\/\//, '').split('/')[0]}</a>
            </p>
          )}
        </>
      )}

      {isiTeachingQuote && (
        <blockquote>
          {isiTeachingQuote}
          {isiCitation && <cite>— {isiCitation}</cite>}
        </blockquote>
      )}
    </section>
  )
}
