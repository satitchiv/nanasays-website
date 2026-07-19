'use client'

import '@/components/nana/research-room.css'
import '../verdict-mock/verdict-mock.css'
import './verdict-mock-b2.css'
import VerdictMockShell from '@/lib/research-room/verdict-mock-shell'
import type { PathFacts } from '@/lib/research-room/verdict-mock-data'

function renderB2Detail(path: PathFacts) {
  const accentClass = `is-path-${path.letter.toLowerCase()}`
  return (
    <article className={`rr-vb2-detail ${accentClass}`}>
      <header className="rr-vb2-header">
        <div className="rr-vb2-eyebrow">Path {path.letter} · {path.framing}</div>
        <h2 className="rr-vb2-school">
          {path.schoolName} <small>{path.meta}</small>
        </h2>
        <p className="rr-vb2-deck">{path.framingLong}</p>
      </header>

      <div className="rr-vb2-body">

        {/* MAIN — narrative + evidence + costs */}
        <div className="rr-vb2-main">
          <div className="rr-vb2-section-head">Why this fits Theo&apos;s brief</div>
          <div className="rr-vb2-narrative">
            {path.reasoning.map((p, i) => <p key={i}>{p}</p>)}
          </div>

          <section className="rr-vb2-evidence">
            <h3 className="rr-vb2-evidence-head">Evidence we used</h3>
            <ul className="rr-vb2-evidence-list">
              {path.evidence.map((e, i) => (
                <li key={i}>
                  <span>
                    <span className="rr-vb2-evidence-row">{e.row}:</span> {e.value}
                    <span className="rr-vb2-evidence-cite">
                      → {e.sourceUrl
                        ? <a href={e.sourceUrl} target="_blank" rel="noopener">{e.sourceLabel}</a>
                        : e.sourceLabel}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rr-vb2-cost">
            <h3 className="rr-vb2-cost-head">Honest costs of this path</h3>
            <ul className="rr-vb2-cost-list">
              {path.costs.map((c, i) => (
                <li key={i}><strong>{c.label}.</strong> {c.detail}</li>
              ))}
            </ul>
          </section>
        </div>

        {/* SIDEBAR — sticky stat stack */}
        <aside className="rr-vb2-aside" aria-label="Quick facts">
          <div className="rr-vb2-stat">
            <div className="rr-vb2-stat-label">Academic results</div>
            <div className="rr-vb2-stat-value">{path.grades.aLevelAStar}</div>
            <div className="rr-vb2-stat-detail">
              A-level A*–A
              {path.grades.gcseTopGrades && <> · {path.grades.gcseTopGrades}</>}
              {path.grades.ibAvg && <> · IB {path.grades.ibAvg}</>}
              {path.grades.sourceUrl && <>
                {' '}
                <a href={path.grades.sourceUrl} target="_blank" rel="noopener">source</a>
              </>}
            </div>
          </div>

          <div className="rr-vb2-stat">
            <div className="rr-vb2-stat-label">Location</div>
            <div className="rr-vb2-stat-value">
              {path.location.town}
              <span className={`rr-vb2-pill ${path.location.insideFilter ? 'is-inside' : 'is-outside'}`}>
                {path.location.insideFilter ? 'In SW' : 'Out'}
              </span>
            </div>
            <div className="rr-vb2-stat-detail">
              {path.location.heathrowMiles} mi from Heathrow · {path.location.heathrowDrive}
            </div>
            <iframe
              className="rr-vb2-map"
              src={path.location.mapsEmbed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Map of ${path.schoolName}`}
            />
          </div>

          <div className="rr-vb2-stat">
            <div className="rr-vb2-stat-label">Fees / year</div>
            <div className="rr-vb2-stat-value">
              {path.fees.annual.split(' / ')[0]}
              <span className={`rr-vb2-pill is-${path.fees.inBudget}`}>
                {path.fees.inBudget === 'fits' ? 'Fits' : path.fees.inBudget === 'partial' ? 'Partial' : 'Over'}
              </span>
            </div>
            <div className="rr-vb2-stat-detail">
              {path.fees.note}
              {path.fees.registration && <> · Reg {path.fees.registration}</>}
            </div>
          </div>

          <div className="rr-vb2-stat">
            <div className="rr-vb2-stat-label">Student body</div>
            <div className="rr-vb2-stat-value">{path.students.total}</div>
            <div className="rr-vb2-stat-detail">
              {path.students.boardersPct} board · {path.students.dayPct} day · {path.students.intlPct} intl
            </div>
          </div>

          <div className="rr-vb2-stat">
            <div className="rr-vb2-stat-label">Quick facts</div>
            <div className="rr-vb2-stat-value" style={{ fontSize: '13px', lineHeight: 1.4 }}>
              {path.coed} · {path.curriculum}
            </div>
            <div className="rr-vb2-stat-detail">
              Year 10 entry · full boarding
            </div>
          </div>

          <div className="rr-vb2-stat">
            <div className="rr-vb2-stat-label">Area safety</div>
            <div className="rr-vb2-stat-value" style={{ fontSize: '13px', lineHeight: 1.4 }}>
              {path.safety.headline}
            </div>
            <div className="rr-vb2-stat-detail">
              {path.safety.detail}{' '}
              <a href={path.safety.sourceUrl} target="_blank" rel="noopener">police.uk</a>
            </div>
          </div>
        </aside>
      </div>

      {/* Things to consider — full width below body */}
      <section className="rr-vb2-consider">
        <div className="rr-vb2-consider-head">Things to think about before deciding</div>
        <ul>
          {path.considerations.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </section>
    </article>
  )
}

export default function VerdictMockB2Page() {
  return (
    <VerdictMockShell
      variantSlug="b2"
      variantLabel="Narrative + sticky stat sidebar"
      renderDetail={renderB2Detail}
    />
  )
}
