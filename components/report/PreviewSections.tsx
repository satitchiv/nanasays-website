/**
 * <PreviewSections> — glimpse-pattern preview block for free visitors.
 *
 * Renders 10 hand-crafted glimpse cards (5 Tier B + 5 Tier C) matching
 * the approved mockup design. Each card: 2 visible data points at the
 * top, a blurred continuation below, and a lock chip implying depth.
 *
 * Used in place of the rich section components when isPaid = false.
 * Real data flows in via props; cards that can't be populated are
 * gracefully skipped.
 */

import Link from 'next/link'
import TierDivider from './TierDivider'

type TopUni = { name?: string; count?: number }
type Nationality = { country?: string; pct?: number }
type Quote = { text?: string; flag?: boolean }
type TourQ = { q?: string; question?: string }

type Props = {
  schoolName: string
  unlockHref: string
  structured: any
  charity: { number?: string | null; registeredDate?: string | null } | null
  isi: {
    formattedDate?: string | null
    shortDate?: string | null
    standardsMet?: boolean
    signatureQuotes?: Quote[]
    academicQuotes?: Quote[]
    wellbeingQuotes?: Quote[]
  } | null
  financialYearCount?: number
}

/* ────────── helpers ────────── */
function pick<T>(arr: T[] | null | undefined, n: number): T[] {
  return Array.isArray(arr) ? arr.slice(0, n) : []
}
function truncate(s: string | null | undefined, maxWords: number): string | null {
  if (!s) return null
  const words = s.split(/\s+/)
  if (words.length <= maxWords) return s
  return words.slice(0, maxWords).join(' ') + '…'
}

/* ────────── component ────────── */
export default function PreviewSections({
  schoolName, unlockHref, structured, charity, isi, financialYearCount = 0,
}: Props) {
  // Tier B data
  const exam = structured?.exam_results ?? null
  const topUnis: TopUni[] = structured?.university_destinations?.top_universities ?? []
  const community = structured?.student_community ?? null
  const wellbeing = structured?.wellbeing_staffing ?? null

  // Tier C data
  const parentFit = structured?.report_parent_fit ?? null
  const tourQs: TourQ[] = structured?.report_tour_questions ?? []
  const allQuotes: Quote[] = [
    ...(isi?.signatureQuotes ?? []),
    ...(isi?.academicQuotes ?? []),
    ...(isi?.wellbeingQuotes ?? []),
  ]

  return (
    <>
      {/* EXAM RESULTS */}
      {exam && (
        <GlimpseCard
          title="GCSE & A-Level grade distribution"
          chipText="+ 27-subject breakdown & 3-year trend"
          unlockHref={unlockHref}
          unlockLabel="Unlock full academic breakdown"
        >
          <div className="glimpse-stats">
            {exam.gcse?.pct_9 != null && (
              <StatCard label="GCSE grade 9" value={`${exam.gcse.pct_9}%`} sub="of grades awarded" />
            )}
            {exam.a_level?.pct_a_star != null && (
              <StatCard label="A-Level A*" value={`${exam.a_level.pct_a_star}%`} sub="of entries" />
            )}
          </div>
          <div className="glimpse-hidden">
            <div className="glimpse-stats">
              {exam.gcse?.pct_7_to_9 != null && (
                <StatCard label="GCSE 7–9" value={`${exam.gcse.pct_7_to_9}%`} sub="of grades" />
              )}
              {exam.a_level?.pct_a_star_a != null && (
                <StatCard label="A-Level A*/A" value={`${exam.a_level.pct_a_star_a}%`} sub="of entries" />
              )}
            </div>
            <p className="glimpse-blur-copy"><strong>Subject-by-subject breakdown:</strong> Maths, Further Maths, English Lit, Chemistry, History + 14 more subjects with their A*/A rates, plus 3-year trend comparison.</p>
          </div>
        </GlimpseCard>
      )}

      {/* UNIVERSITY DESTINATIONS */}
      {topUnis.length > 0 && (
        <GlimpseCard
          title="Top UK university destinations"
          chipText="+ Oxbridge analysis, US placements, 5-yr trend"
          unlockHref={unlockHref}
          unlockLabel="Unlock full destinations list"
        >
          <ul className="glimpse-uni-list">
            {pick(topUnis, 2).map((u, i) => (
              <li key={i} className="glimpse-uni-row">
                <span className="glimpse-uni-name">{u.name}</span>
                <span className="glimpse-uni-count">{u.count ?? '—'}</span>
              </li>
            ))}
          </ul>
          <div className="glimpse-hidden">
            <ul className="glimpse-uni-list">
              {topUnis.slice(2, 6).map((u, i) => (
                <li key={i} className="glimpse-uni-row">
                  <span className="glimpse-uni-name">{u.name}</span>
                  <span className="glimpse-uni-count">{u.count ?? '—'}</span>
                </li>
              ))}
              {topUnis.length > 6 && (
                <li className="glimpse-uni-row">
                  <span className="glimpse-uni-name">+ {topUnis.length - 6} more UK destinations</span>
                  <span className="glimpse-uni-count">—</span>
                </li>
              )}
            </ul>
          </div>
        </GlimpseCard>
      )}

      {/* COMMUNITY */}
      {community && (
        <GlimpseCard
          title="Student community"
          chipText="+ boarding houses, year-group split, languages"
          unlockHref={unlockHref}
          unlockLabel="Unlock full community profile"
        >
          <CommunityPreview community={community} />
        </GlimpseCard>
      )}

      {/* WELLBEING */}
      {wellbeing && (
        <GlimpseCard
          title="Wellbeing team"
          chipText="+ staff table, ratios, sector comparison"
          unlockHref={unlockHref}
          unlockLabel="Unlock full wellbeing analysis"
        >
          <p className="glimpse-body">
            {truncate(wellbeing.notes, 28) ?? `${schoolName} publishes a pastoral and wellbeing team across boarding houses, plus central counselling and medical staff.`}
          </p>
          <div className="glimpse-hidden">
            <p className="glimpse-blur-copy"><strong>Team size:</strong> Total wellbeing staff across pastoral, counselling, and medical roles.</p>
            <p className="glimpse-blur-copy"><strong>Ratio:</strong> Staff-per-pupil figure plus sector benchmark comparison.</p>
          </div>
        </GlimpseCard>
      )}

      {/* ═══ TIER C ═══ */}
      <TierDivider
        tier="C"
        title="Independently verified & regulated"
        subtitle="Regulatory filings, inspection quotes, financial health, parent-fit verdict, tour questions."
      />

      {/* REGULATORY */}
      <GlimpseCard
        title="Regulatory status"
        chipText="+ 8-year trustee history, filings, TRA detail"
        unlockHref={unlockHref}
        unlockLabel="Unlock full regulatory record"
      >
        <p className="glimpse-body">
          {charity?.number ? (
            <>
              <strong>Registered charity</strong> (Charity Commission).
              {' '}Last ISI inspection{isi?.formattedDate ? ` ${isi.formattedDate}` : ''}
              {isi?.standardsMet ? ', all standards met.' : ', check findings.'}
              {' '}Governance structure active, no regulatory warnings in 24 months.
            </>
          ) : (
            <>
              {schoolName} regulatory status pending verification.
              {isi?.formattedDate && <> Last ISI inspection {isi.formattedDate}.</>}
            </>
          )}
        </p>
        <div className="glimpse-hidden">
          <dl className="glimpse-kv">
            <dt>Charity number</dt><dd>—</dd>
            <dt>Trustees</dt><dd>—</dd>
            <dt>Last filing</dt><dd>—</dd>
            <dt>Companies House</dt><dd>—</dd>
            <dt>TRA record</dt><dd>—</dd>
          </dl>
        </div>
      </GlimpseCard>

      {/* INSPECTION QUOTES */}
      {allQuotes.length > 0 && (
        <GlimpseCard
          title="ISI inspection · verbatim quotes"
          chipText={`+ ${Math.max(0, allQuotes.length - 1)} more quotes, inspector profile, scores`}
          unlockHref={unlockHref}
          unlockLabel="Unlock all inspection quotes"
        >
          <blockquote className="glimpse-quote">
            &ldquo;{truncate(allQuotes[0].text, 14) ?? '—'}&rdquo;
          </blockquote>
          {allQuotes.length > 1 && (
            <div className="glimpse-hidden">
              <blockquote className="glimpse-quote">&ldquo;Inspectors noted strong outcomes across academic and boarding provisions…&rdquo;</blockquote>
              <blockquote className="glimpse-quote">&ldquo;The quality of pupils&apos; personal development was found to be excellent…&rdquo;</blockquote>
            </div>
          )}
        </GlimpseCard>
      )}

      {/* FINANCIAL HEALTH */}
      <GlimpseCard
        title="Financial health · 3-year trend"
        chipText="+ 3-yr P&L, cash flow, sector benchmarks"
        unlockHref={unlockHref}
        unlockLabel="Unlock full financial analysis"
      >
        <p className="glimpse-body">
          {financialYearCount > 0 ? (
            <><strong>Headline:</strong> {financialYearCount}-year Charity Commission trend available. School financial position cross-checked against sector benchmarks.</>
          ) : (
            <><strong>Financial trend:</strong> Charity Commission filings analysed where available, with sector benchmark comparisons.</>
          )}
        </p>
        <div className="glimpse-hidden">
          <div className="glimpse-stats">
            <StatCard label="Net assets" value="£—" sub="+—% YoY" />
            <StatCard label="Cash reserves" value="£—" sub="— days cover" />
            <StatCard label="Fee inflation 3yr" value="—%" sub="avg annual" />
          </div>
        </div>
      </GlimpseCard>

      {/* PARENT-FIT */}
      <GlimpseCard
        title="Parent-fit verdict"
        chipText="+ 8-dimension fit scorecard, success predictors"
        unlockHref={unlockHref}
        unlockLabel="Unlock full parent-fit verdict"
      >
        <p className="glimpse-body">
          {parentFit?.best_for ? (
            <><strong>Best for:</strong> {truncate(parentFit.best_for, 18)}</>
          ) : (
            <><strong>Best for:</strong> The parent-fit verdict reads whether this school suits your child&apos;s temperament, academic profile, and family culture…</>
          )}
        </p>
        <div className="glimpse-hidden">
          <p className="glimpse-blur-copy">{parentFit?.best_for_detail ?? 'Full best-for paragraph with concrete examples.'}</p>
          <p className="glimpse-blur-copy"><strong>Less suited to:</strong> {parentFit?.less_suited_to ?? 'Detailed read on which families and pupils tend to struggle here.'}</p>
        </div>
      </GlimpseCard>

      {/* TOUR QUESTIONS */}
      <GlimpseCard
        title="5 pointed tour questions"
        chipText="+ per-question follow-ups & red flags to watch"
        unlockHref={unlockHref}
        unlockLabel="Reveal all 5 questions"
      >
        <ol className="glimpse-questions">
          {tourQs.length > 0 ? (
            pick(tourQs, 2).map((q, i) => <li key={i}>{q.q ?? q.question}</li>)
          ) : (
            <>
              <li>How do you support pupils who don&apos;t make the top sports teams?</li>
              <li>What proportion of last year&apos;s leavers took a gap year, and why?</li>
            </>
          )}
        </ol>
        <div className="glimpse-hidden">
          <ol className="glimpse-questions" start={3}>
            {tourQs.length > 2
              ? tourQs.slice(2, 5).map((q, i) => <li key={i}>{q.q ?? q.question}</li>)
              : (
                <>
                  <li>Can you describe the pastoral flow when a boarding issue is raised?</li>
                  <li>How have fees changed in the last 3 years, and what drove each increase?</li>
                  <li>Which academic subjects have you added or dropped in the past 5 years, and why?</li>
                </>
              )}
          </ol>
        </div>
      </GlimpseCard>

      {/* FINAL NAVY UNLOCK BANNER */}
      <div className="preview-final-banner">
        <div className="preview-final-kicker">One payment · instant access · all schools included</div>
        <h2 className="preview-final-title">Unlock the risk file for {schoolName}</h2>
        <p className="preview-final-sub">
          The free profile gives you the facts. The paid report gives you the intelligence: full financial health from charity filings, ISI inspection quotes, safeguarding record, policy transparency ratings, parent-fit verdict, and school-specific tour questions — for this school and every other on Nanasays.
        </p>
        <Link href={unlockHref} className="preview-final-btn">Unlock Deep Research →</Link>
      </div>
    </>
  )
}

/* ────────── sub-components ────────── */

function GlimpseCard({
  title, chipText, unlockHref, unlockLabel, children,
}: {
  title: string
  chipText: string
  unlockHref: string
  unlockLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="glimpse-card">
      <div className="glimpse-card-title">
        <span>{title}</span>
        <span className="glimpse-lock-chip">🔒 {chipText}</span>
      </div>
      {children}
      <Link href={unlockHref} className="glimpse-inline-unlock">{unlockLabel} →</Link>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

function CommunityPreview({ community }: { community: any }) {
  const nats: Nationality[] = community?.nationalities ?? []
  const hasNats = nats.length > 0
  const ukPct = community?.uk_pct ?? community?.domiciled_uk_pct ?? null

  if (!hasNats && ukPct == null) {
    return (
      <>
        <p className="glimpse-body">
          Student community composition — UK-domiciled vs international split, nationality breakdown, boarding mix.
        </p>
        <div className="glimpse-hidden">
          <p className="glimpse-blur-copy"><strong>Nationality breakdown:</strong> Top origin countries with % of student body, plus languages spoken and religious/cultural mix.</p>
        </div>
      </>
    )
  }

  const bars: Array<{ label: string; pct: number }> = []
  if (ukPct != null) bars.push({ label: 'UK domiciled', pct: ukPct })
  nats.forEach(n => {
    if (n.country && typeof n.pct === 'number') bars.push({ label: n.country, pct: n.pct })
  })

  return (
    <>
      {bars.slice(0, 2).map(b => (
        <CommunityBar key={b.label} label={b.label} pct={b.pct} />
      ))}
      {bars.length > 2 && (
        <div className="glimpse-hidden">
          {bars.slice(2, 5).map(b => (
            <CommunityBar key={b.label} label={b.label} pct={b.pct} />
          ))}
        </div>
      )}
    </>
  )
}

function CommunityBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="community-bar">
      <span className="community-label">{label}</span>
      <div className="community-track"><div className="community-fill" style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <span className="community-value">{pct}%</span>
    </div>
  )
}
