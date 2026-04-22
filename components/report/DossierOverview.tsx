import type { DossierStats } from '@/lib/dossier-stats'

type Props = {
  schoolName: string
  stats: DossierStats
}

const TOC_ITEMS = [
  'Verified school overview',
  'Academic profile & outcomes',
  'GCSE results · grade distribution',
  'A-Level results · subject-by-subject',
  'University destinations (UK + int’l)',
  'Oxbridge & Russell Group analysis',
  'Sports profile & competitive tier',
  'Coaching staff & alumni athletes',
  'Facilities audit',
  'Pastoral care model',
  'Wellbeing team & ratios',
  'Safeguarding record',
  'Student community & nationalities',
  'Fees & hidden extras',
  'Scholarships & bursaries',
  'Admissions & entry requirements',
  'Regulatory status & filings',
  'Financial health (3-year trend)',
  'ISI inspection record',
  'Parent-fit verdict (8 dimensions)',
  '5 pointed tour questions · with scripts',
  'Methodology & sources',
]

export default function DossierOverview({ schoolName, stats }: Props) {
  return (
    <section className="dossier-overview">
      <div className="dossier-kicker">Your Deep Research dossier for {schoolName}</div>
      <h2 className="dossier-heading">A {stats.pages}-page independent analysis, not a repackaged brochure.</h2>
      <p className="dossier-intro">
        Every dimension of the school — from academic outcomes to safeguarding and financial health — verified against primary sources, regulatory filings, and inspection records.
      </p>

      <div className="dossier-stats">
        <div className="dossier-stat">
          <div className="dossier-stat-value">{stats.pages}</div>
          <div className="dossier-stat-label">pages of analysis</div>
        </div>
        <div className="dossier-stat">
          <div className="dossier-stat-value">{stats.tables}</div>
          <div className="dossier-stat-label">data tables</div>
        </div>
        <div className="dossier-stat">
          <div className="dossier-stat-value">{stats.words.toLocaleString()}+</div>
          <div className="dossier-stat-label">words of research</div>
        </div>
        <div className="dossier-stat">
          <div className="dossier-stat-value">{stats.sources}</div>
          <div className="dossier-stat-label">primary sources cross-checked</div>
        </div>
      </div>

      <div className="dossier-toc-title">Inside your dossier</div>
      <div className="dossier-toc">
        {TOC_ITEMS.map((label, i) => (
          <div key={label} className="dossier-toc-item">
            <span className="dossier-toc-num">{String(i + 1).padStart(2, '0')}</span>
            {label}
          </div>
        ))}
      </div>
    </section>
  )
}
