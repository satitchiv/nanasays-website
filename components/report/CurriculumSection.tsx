/**
 * <CurriculumSection> — Academic overview + exam results + subjects.
 *
 * Data: school_structured_data.exam_results (JSONB), curriculum fields
 * exam_results may also contain subjects_gcse, subjects_a_level,
 * setting_policy, progress_tracking, academic_enrichment from
 * extract-curriculum-results.js.
 */

type YearResult = {
  academic_year?: string
  gcse?: { pct_9?: number | null; pct_7_to_9?: number | null; notes?: string | null }
  a_level?: { pct_a_star?: number | null; pct_a_star_a?: number | null; notes?: string | null }
}

type ExamResults = {
  academic_year?: string
  gcse?: { pct_9?: number | null; pct_7_to_9?: number | null; pct_8_and_9?: number | null; total_pupils?: number | null; notes?: string | null }
  a_level?: { pct_a_star?: number | null; pct_a_star_a?: number | null; total_pupils?: number | null; notes?: string | null }
  ib?: { pass_rate?: number | null; average_score?: number | null; total_pupils?: number | null; notes?: string | null }
  history?: YearResult[]
  subjects_gcse?: string[]
  subjects_a_level?: string[]
  setting_policy?: string | null
  progress_tracking?: string | null
  academic_enrichment?: string[]
  source_url?: string
}

type Props = {
  curriculum?: string | string[] | null
  sixthForm?: string | null
  examResults?: ExamResults | null
  isiTeachingQuote?: string | null
  isiCitation?: string | null
}

export default function CurriculumSection({ curriculum, sixthForm, examResults, isiTeachingQuote, isiCitation }: Props) {
  const gcse   = examResults?.gcse
  const alevel = examResults?.a_level
  const ib     = examResults?.ib

  const hasAnyResults = gcse?.pct_9 || gcse?.pct_7_to_9 || alevel?.pct_a_star || alevel?.pct_a_star_a || ib?.pass_rate || ib?.average_score
  const hasALevelData = alevel?.pct_a_star != null || alevel?.pct_a_star_a != null || alevel?.notes
  const subjectsGCSE   = Array.isArray(examResults?.subjects_gcse)   ? examResults!.subjects_gcse!   : []
  const subjectsALevel = Array.isArray(examResults?.subjects_a_level) ? examResults!.subjects_a_level! : []
  const enrichment     = Array.isArray(examResults?.academic_enrichment) ? examResults!.academic_enrichment! : []

  return (
    <section className="block" id="curriculum">
      <h2 className="block-title">Curriculum & academic outcomes</h2>

      {/* ── Programmes offered ── */}
      {curriculum && (
        <p>{Array.isArray(curriculum) ? (curriculum as string[]).join(' · ') : curriculum}</p>
      )}

      {/* ── Sixth form description ── */}
      {sixthForm && <p><strong>Sixth Form:</strong> {sixthForm}</p>}

      {/* ── Setting + progress tracking ── */}
      {(examResults?.setting_policy || examResults?.progress_tracking) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0 16px' }}>
          {examResults.setting_policy && (
            <p style={{ margin: 0, fontSize: 14 }}>
              <strong>Setting:</strong> {examResults.setting_policy}
            </p>
          )}
          {examResults.progress_tracking && (
            <p style={{ margin: 0, fontSize: 14 }}>
              <strong>Progress tracking:</strong> {examResults.progress_tracking}
            </p>
          )}
        </div>
      )}

      {/* ── Exam results stats ── */}
      {(hasAnyResults || hasALevelData) && (
        <>
          <h3 className="block-sub">Published exam results{examResults?.academic_year ? ` (${examResults.academic_year})` : ''}</h3>

          <div className="exam-results-block">
            {/* GCSE row */}
            {(gcse?.pct_9 != null || gcse?.pct_7_to_9 != null || gcse?.pct_8_and_9 != null) && (
              <div className="exam-row">
                <div className="exam-row-label">GCSE</div>
                <div>
                  <div className="exam-stats">
                    {gcse?.pct_9 != null && (
                      <div>
                        <div className="exam-stat-num">{gcse.pct_9}<small>%</small></div>
                        <div className="exam-stat-lbl">Grade 9</div>
                      </div>
                    )}
                    {gcse?.pct_8_and_9 != null && (
                      <div>
                        <div className="exam-stat-num">{gcse.pct_8_and_9}<small>%</small></div>
                        <div className="exam-stat-lbl">Grade 8–9</div>
                      </div>
                    )}
                    {gcse?.pct_7_to_9 != null && (
                      <div>
                        <div className="exam-stat-num">{gcse.pct_7_to_9}<small>%</small></div>
                        <div className="exam-stat-lbl">Grade 7–9</div>
                      </div>
                    )}
                  </div>
                  {gcse?.notes && <p className="exam-notes-inline" style={{ marginTop: 8, marginBottom: 0 }}>{gcse.notes}</p>}
                </div>
              </div>
            )}

            {/* A Level row */}
            {hasALevelData && (
              <div className="exam-row">
                <div className="exam-row-label">A Level</div>
                <div>
                  {(alevel?.pct_a_star != null || alevel?.pct_a_star_a != null) && (
                    <div className="exam-stats">
                      {alevel?.pct_a_star != null && (
                        <div>
                          <div className="exam-stat-num">{alevel.pct_a_star}<small>%</small></div>
                          <div className="exam-stat-lbl">A*</div>
                        </div>
                      )}
                      {alevel?.pct_a_star_a != null && (
                        <div>
                          <div className="exam-stat-num">{alevel.pct_a_star_a}<small>%</small></div>
                          <div className="exam-stat-lbl">A*/A</div>
                        </div>
                      )}
                    </div>
                  )}
                  {alevel?.notes && <p className="exam-notes-inline" style={{ marginTop: alevel?.pct_a_star != null || alevel?.pct_a_star_a != null ? 8 : 0, marginBottom: 0 }}>{alevel.notes}</p>}
                </div>
              </div>
            )}

            {/* IB row */}
            {ib?.average_score != null && (
              <div className="exam-row">
                <div className="exam-row-label">IB</div>
                <div className="exam-stats">
                  <div>
                    <div className="exam-stat-num">{ib.average_score}<small>/45</small></div>
                    <div className="exam-stat-lbl">Average score</div>
                  </div>
                  {ib.pass_rate != null && (
                    <div>
                      <div className="exam-stat-num">{ib.pass_rate}<small>%</small></div>
                      <div className="exam-stat-lbl">Pass rate</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Multi-year history table ── */}
          {examResults?.history && examResults.history.length > 0 && (
            <>
              <h3 className="block-sub" style={{ marginTop: 16 }}>Results by year</h3>
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th style={{ textAlign: 'right' }}>GCSE 7–9</th>
                    <th style={{ textAlign: 'right' }}>GCSE 9</th>
                    <th style={{ textAlign: 'right' }}>A-Level A*/A</th>
                    <th style={{ textAlign: 'right' }}>A-Level A*</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Most recent year first */}
                  <tr style={{ background: 'var(--teal-bg)' }}>
                    <td style={{ fontWeight: 700 }}>{examResults.academic_year ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{gcse?.pct_7_to_9 != null ? `${gcse.pct_7_to_9}%` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{gcse?.pct_9 != null ? `${gcse.pct_9}%` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{alevel?.pct_a_star_a != null ? `${alevel.pct_a_star_a}%` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{alevel?.pct_a_star != null ? `${alevel.pct_a_star}%` : '—'}</td>
                  </tr>
                  {examResults.history.map((yr, i) => (
                    <tr key={i}>
                      <td>{yr.academic_year ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>{yr.gcse?.pct_7_to_9 != null ? `${yr.gcse.pct_7_to_9}%` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{yr.gcse?.pct_9 != null ? `${yr.gcse.pct_9}%` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{yr.a_level?.pct_a_star_a != null ? `${yr.a_level.pct_a_star_a}%` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{yr.a_level?.pct_a_star != null ? `${yr.a_level.pct_a_star}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {examResults?.source_url && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -10 }}>
              Source: <a href={examResults.source_url}>{examResults.source_url.replace(/^https?:\/\//, '').split('/')[0]}</a>
            </p>
          )}
        </>
      )}

      {/* ── Subjects at GCSE ── */}
      {subjectsGCSE.length > 0 && (
        <>
          <h3 className="block-sub">GCSE subjects offered ({subjectsGCSE.length})</h3>
          <div className="curriculum-chips">
            {subjectsGCSE.map((s, i) => <span key={i} className="curriculum-chip">{s}</span>)}
          </div>
        </>
      )}

      {/* ── Subjects at A Level ── */}
      {subjectsALevel.length > 0 && (
        <>
          <h3 className="block-sub">A Level subjects offered ({subjectsALevel.length})</h3>
          <div className="curriculum-chips">
            {subjectsALevel.map((s, i) => <span key={i} className="curriculum-chip">{s}</span>)}
          </div>
        </>
      )}

      {/* ── Academic enrichment programmes ── */}
      {enrichment.length > 0 && (
        <>
          <h3 className="block-sub">Academic enrichment</h3>
          <ul style={{ paddingLeft: 20, margin: '8px 0 0' }}>
            {enrichment.map((e, i) => <li key={i} style={{ fontSize: 14 }}>{e}</li>)}
          </ul>
        </>
      )}

      {/* ── ISI teaching quote ── */}
      {isiTeachingQuote && (
        <blockquote>
          {isiTeachingQuote}
          {isiCitation && <cite>— {isiCitation}</cite>}
        </blockquote>
      )}
    </section>
  )
}
