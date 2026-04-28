interface ExamResults {
  a_level?: { pct_a_star?: number; pct_a_star_a?: number; academic_year?: string }
  gcse?: { pct_9?: number; pct_7_to_9?: number; academic_year?: string }
  ib?: { avg_score?: number; pass_rate?: number; academic_year?: string }
}

interface UniDestinations {
  oxbridge_acceptances?: number
  oxford_count?: number
  cambridge_count?: number
  top_universities?: { name: string; count: number }[]
  us_ivy_and_top10?: { name: string; count: number }[]
  year?: string
}

interface Props {
  examResults: ExamResults | null
  uniDestinations: UniDestinations | null
  reportVerdict: string | null
  schoolName: string
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: '#f0fdf4', border: '1px solid #86efac',
      borderRadius: 10, padding: '16px 18px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#166534', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 32, fontWeight: 900, color: 'var(--navy)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

function parseIsiResult(verdict: string | null): { date: string; met: boolean; summary: string; flag: string | null } | null {
  if (!verdict) return null
  const metMatch = verdict.match(/ISI[^.]*?(met every Standard|all standards met|outstanding)/i)
  if (!metMatch) return null

  const dateMatch = verdict.match(/((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i)
  const date = dateMatch?.[1] ?? ''

  // Split into sentences and separate any flag sentence
  const sentences = verdict.split(/(?<=\.)\s+/)
  const flagIdx = sentences.findIndex(s => /flag|concern|liabilit|deficit|debt|warning/i.test(s))
  const mainSentences = flagIdx === -1 ? sentences : sentences.slice(0, flagIdx)
  const flagSentences = flagIdx === -1 ? [] : sentences.slice(flagIdx)

  const summary = mainSentences.join(' ').trim()
  const flag = flagSentences.length > 0 ? flagSentences.join(' ').trim() : null

  return { date, met: true, summary, flag }
}

export default function AcademicSnapshotSection({ examResults, uniDestinations, reportVerdict, schoolName }: Props) {
  const isi = parseIsiResult(reportVerdict)
  const al = examResults?.a_level
  const gcse = examResults?.gcse
  const ib = examResults?.ib

  const hasExamData = al || gcse || ib
  const hasUniData = uniDestinations?.oxbridge_acceptances || uniDestinations?.top_universities?.length

  if (!hasExamData && !hasUniData && !isi) return null

  const examYear = al?.academic_year ?? gcse?.academic_year ?? ib?.academic_year ?? ''
  const topUnis = (uniDestinations?.top_universities ?? []).slice(0, 6)
  const usUnis = (uniDestinations?.us_ivy_and_top10 ?? []).slice(0, 4)

  return (
    <div style={{ marginBottom: 52 }}>
      <h2 style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
        color: 'var(--teal-dk)', marginBottom: 18, paddingBottom: 10,
        borderBottom: '2px solid var(--border)', fontWeight: 800,
        fontFamily: 'var(--font-nunito), Nunito, sans-serif',
      }}>
        Academic Results{examYear ? ` — ${examYear}` : ''}
      </h2>

      {/* Exam stat cards */}
      {hasExamData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          {al?.pct_a_star != null && (
            <StatCard label="A-Level A*" value={`${al.pct_a_star}%`} sub={al.pct_a_star_a != null ? `${al.pct_a_star_a}% A*/A` : undefined} />
          )}
          {gcse?.pct_9 != null && (
            <StatCard label="GCSE Grade 9" value={`${gcse.pct_9}%`} sub={gcse.pct_7_to_9 != null ? `${gcse.pct_7_to_9}% grade 7+` : undefined} />
          )}
          {ib?.avg_score != null && (
            <StatCard label="IB Average" value={String(ib.avg_score)} sub={ib.pass_rate != null ? `${ib.pass_rate}% pass rate` : undefined} />
          )}
          {uniDestinations?.oxbridge_acceptances != null && (
            <StatCard
              label={`Oxbridge ${uniDestinations.year ?? ''}`}
              value={String(uniDestinations.oxbridge_acceptances)}
              sub={
                uniDestinations.oxford_count != null && uniDestinations.cambridge_count != null
                  ? `${uniDestinations.oxford_count} Oxford · ${uniDestinations.cambridge_count} Cambridge`
                  : undefined
              }
            />
          )}
        </div>
      )}

      {/* Top university destinations */}
      {topUnis.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, marginTop: 4 }}>
            University Destinations {uniDestinations?.year ?? ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: usUnis.length > 0 ? 10 : 0 }}>
            {topUnis.map(u => (
              <span key={u.name} style={{
                fontSize: 12, fontWeight: 700, padding: '5px 12px',
                background: 'var(--navy)', color: '#fff', borderRadius: 6,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {u.name}
                <span style={{ fontSize: 10, opacity: 0.55 }}>{u.count}</span>
              </span>
            ))}
            {usUnis.map(u => (
              <span key={u.name} style={{
                fontSize: 12, fontWeight: 700, padding: '5px 12px',
                background: '#1e40af', color: '#fff', borderRadius: 6,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                {u.name}
                <span style={{ fontSize: 10, opacity: 0.55 }}>{u.count}</span>
              </span>
            ))}
          </div>
        </>
      )}

      {/* ISI inspection */}
      {isi && (
        <div style={{ marginTop: 18, borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#f0fdf4', borderBottom: '1px solid #bbf7d0',
            padding: '12px 16px',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#166534',
            }}>
              ISI Inspection{isi.date ? ` · ${isi.date}` : ''}
            </div>
            <div style={{
              marginLeft: 'auto', fontSize: 11, fontWeight: 700,
              background: '#16a34a', color: '#fff',
              padding: '3px 10px', borderRadius: 100,
            }}>
              ✓ Met every Standard
            </div>
          </div>

          {/* Summary body */}
          <div style={{ padding: '14px 16px', background: '#fff' }}>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>
              {isi.summary}
            </p>

            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
              ISI is the government-approved inspection body for independent schools in England. Full analysis in the Deep Report.
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
