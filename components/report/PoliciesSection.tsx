import React from 'react'

type Analysis = {
  bullet_points: string[]
  tour_question: string
  transparency_rating: 'detailed' | 'basic' | 'vague'
}

type PolicyDoc = {
  title: string
  source_url: string
  analysis?: Analysis | null
}

type Category = {
  label: string
  icon: string
  docs: PolicyDoc[]
}

const CATEGORY_RULES: { label: string; icon: string; keywords: string[] }[] = [
  { label: 'Safeguarding & child protection', icon: '🔴', keywords: ['safeguard', 'child protection', 'prevent', 'radicalisation'] },
  { label: 'Pastoral & wellbeing',            icon: '💚', keywords: ['pastoral', 'bullying', 'wellbeing', 'mental health', 'self-harm', 'eating disorder', 'rshe', 'relationships', 'boarding', 'head injury', 'first aid'] },
  { label: 'Academic',                        icon: '📚', keywords: ['curriculum', 'academic', 'special educational', 'sen', 'eal', 'gifted', 'talent', 'exam', 'assessment', 'word processor', 'access arrangement', 'ai appropriate', 'homework'] },
  { label: 'Behaviour & conduct',             icon: '📋', keywords: ['behaviour', 'dress', 'attendance', 'mobile', 'phone', 'it acceptable', 'online safety', 'acceptable use'] },
  { label: 'Data & privacy',                  icon: '🔒', keywords: ['data', 'gdpr', 'privacy', 'retention'] },
  { label: 'Health & safety',                 icon: '🏥', keywords: ['health and safety', 'health & safety', 'fire safety', 'risk assessment'] },
  { label: 'People & recruitment',            icon: '👥', keywords: ['recruitment', 'whistleblowing', 'equal', 'equality', 'diversity', 'disability', 'gender pay', 'bursary'] },
]

const TRANSPARENCY_LABELS: Record<string, { label: string; className: string }> = {
  detailed: { label: 'Detailed',  className: 'trans-detailed' },
  basic:    { label: 'Basic',     className: 'trans-basic' },
  vague:    { label: 'Vague',     className: 'trans-vague' },
}

function categorise(docs: PolicyDoc[]): Category[] {
  const categories: Category[] = CATEGORY_RULES.map(r => ({ label: r.label, icon: r.icon, docs: [] }))
  const other: Category = { label: 'Other policies', icon: '📄', docs: [] }

  for (const doc of docs) {
    const lower = doc.title.toLowerCase()
    let matched = false
    for (let i = 0; i < CATEGORY_RULES.length; i++) {
      if (CATEGORY_RULES[i].keywords.some(kw => lower.includes(kw))) {
        categories[i].docs.push(doc)
        matched = true
        break
      }
    }
    if (!matched) other.docs.push(doc)
  }

  const result = categories.filter(c => c.docs.length > 0)
  if (other.docs.length > 0) result.push(other)
  return result
}

export function hasMeaningfulPoliciesData(docs: PolicyDoc[] | null | undefined): boolean {
  return Array.isArray(docs) && docs.length > 0
}

function PolicyItem({ doc }: { doc: PolicyDoc }) {
  const a = doc.analysis
  const count = a?.bullet_points?.length ?? 0
  const showPlus = count === 10
  const trans = a?.transparency_rating ? TRANSPARENCY_LABELS[a.transparency_rating] : null

  return (
    <details className="policy-item">
      <summary className="policy-chip">
        <span className="policy-chip-icon">📄</span>
        <span className="policy-chip-name">{doc.title}</span>
        {count > 0 && (
          <span className="policy-findings-badge">
            {showPlus ? '10+' : count} finding{count !== 1 ? 's' : ''}
          </span>
        )}
        <span className="policy-chip-caret">›</span>
      </summary>

      <div className="policy-analysis">
        {a && count > 0 ? (
          <>
            <ul className="policy-bullets">
              {a.bullet_points.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>

            {a.tour_question && (
              <div className="policy-tour-q">
                <span className="policy-tour-label">Ask on tour</span>
                <span className="policy-tour-text">&ldquo;{a.tour_question}&rdquo;</span>
              </div>
            )}

            <div className="policy-analysis-footer">
              {trans && (
                <span className={`policy-trans-badge ${trans.className}`}>
                  {trans.label}
                </span>
              )}
              <a
                href={doc.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="policy-pdf-link"
              >
                Read full policy →
              </a>
            </div>
          </>
        ) : (
          <div className="policy-analysis-footer">
            <a
              href={doc.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="policy-pdf-link"
            >
              Read full policy →
            </a>
          </div>
        )}
      </div>
    </details>
  )
}

export default function PoliciesSection({ docs }: { docs: PolicyDoc[] }) {
  const categories = categorise(docs)
  const analysedCount = docs.filter(d => d.analysis?.bullet_points?.length).length

  return (
    <section className="block" id="policies">
      <h2 className="block-title">Published policies</h2>

      <div className="policies-intro">
        <p>
          <strong>{docs.length} policies published online.</strong>{' '}
          Schools that publish their full policy library give parents direct access to the rules, values, and safeguards in place — without having to ask admissions.
          {analysedCount > 0 && (
            <> We&rsquo;ve read every document and surfaced what parents actually want to know. Click any policy to see the findings.</>
          )}
        </p>
      </div>

      <div className="policies-groups">
        {categories.map(cat => (
          <div key={cat.label} className="policies-group">
            <h3 className="policies-group-label">
              <span>{cat.icon}</span> {cat.label}
            </h3>
            <div className="policies-list">
              {cat.docs.map(doc => (
                <PolicyItem key={doc.source_url} doc={doc} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
