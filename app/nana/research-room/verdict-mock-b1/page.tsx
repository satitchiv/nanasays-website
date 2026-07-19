'use client'

import '@/components/nana/research-room.css'
import '../verdict-mock/verdict-mock.css'
import './verdict-mock-b1.css'
import VerdictMockShell from '@/lib/research-room/verdict-mock-shell'
import type { PathFacts } from '@/lib/research-room/verdict-mock-data'

function renderB1Detail(path: PathFacts) {
  const accentClass = `is-path-${path.letter.toLowerCase()}`
  return (
    <article className={`rr-vb1-detail ${accentClass}`}>
      <div className="rr-vb1-eyebrow">Path {path.letter} · {path.framing}</div>
      <h2 className="rr-vb1-school">
        {path.schoolName} <small>{path.meta}</small>
      </h2>
      <p className="rr-vb1-deck">{path.framingLong}</p>

      {/* STAT CARD GRID — prominent, top */}
      <div className="rr-vb1-stat-grid">
        <div className="rr-vb1-stat">
          <div className="rr-vb1-stat-label">Academic results</div>
          <div className="rr-vb1-stat-value">{path.grades.aLevelAStar}</div>
          <div className="rr-vb1-stat-detail">
            A-level A*–A
            {path.grades.gcseTopGrades && <> · {path.grades.gcseTopGrades}</>}
            {path.grades.ibAvg && <> · IB {path.grades.ibAvg}</>}
            {path.grades.sourceUrl && <>
              {' '}
              <a href={path.grades.sourceUrl} target="_blank" rel="noopener">source</a>
            </>}
          </div>
        </div>

        <div className="rr-vb1-stat">
          <div className="rr-vb1-stat-label">Student body</div>
          <div className="rr-vb1-stat-value">{path.students.total}</div>
          <div className="rr-vb1-stat-detail">
            {path.students.boardersPct} boarders · {path.students.dayPct} day · {path.students.intlPct} international
          </div>
        </div>

        <div className="rr-vb1-stat">
          <div className="rr-vb1-stat-label">Fees / year</div>
          <div className="rr-vb1-stat-value">
            {path.fees.annual.split(' / ')[0]}
            <span className={`rr-vb1-pill is-${path.fees.inBudget}`}>
              {path.fees.inBudget === 'fits' ? 'In budget' : path.fees.inBudget === 'partial' ? 'Partial' : 'Over'}
            </span>
          </div>
          <div className="rr-vb1-stat-detail">
            {path.fees.note}
            {path.fees.registration && <> · Reg fee {path.fees.registration}</>}
          </div>
        </div>

        <div className="rr-vb1-stat is-wide">
          <div className="rr-vb1-stat-label">Location</div>
          <div className="rr-vb1-stat-value">
            {path.location.town}
            <span className={`rr-vb1-pill ${path.location.insideFilter ? 'is-inside' : 'is-outside'}`}>
              {path.location.insideFilter ? 'Inside SW filter' : 'Outside SW filter'}
            </span>
          </div>
          <div className="rr-vb1-stat-detail">
            {path.location.region} · {path.location.heathrowMiles} mi from Heathrow · {path.location.heathrowDrive}
          </div>
          <iframe
            className="rr-vb1-map"
            src={path.location.mapsEmbed}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map of ${path.schoolName}`}
          />
        </div>

        <div className="rr-vb1-stat">
          <div className="rr-vb1-stat-label">Quick facts</div>
          <div className="rr-vb1-stat-value" style={{ fontSize: '15px', lineHeight: 1.35 }}>
            {path.coed} · {path.curriculum}
          </div>
          <div className="rr-vb1-stat-detail">
            Year 10 entry available · full boarding offered
          </div>
        </div>

        <div className="rr-vb1-stat is-wide">
          <div className="rr-vb1-stat-label">Area safety context</div>
          <div className="rr-vb1-stat-value" style={{ fontSize: '15px', lineHeight: 1.35 }}>
            {path.safety.headline}
          </div>
          <div className="rr-vb1-stat-detail">
            {path.safety.detail}{' '}
            <a href={path.safety.sourceUrl} target="_blank" rel="noopener">police.uk data</a>
          </div>
        </div>
      </div>

      {/* PROMINENT EVIDENCE PANEL */}
      <section className="rr-vb1-evidence">
        <div className="rr-vb1-evidence-head">
          <span className="rr-vb1-evidence-icon">✓</span>
          <h3>Why we picked this — evidence we used</h3>
        </div>
        <ul className="rr-vb1-evidence-list">
          {path.evidence.map((e, i) => (
            <li key={i}>
              <span>
                <span className="rr-vb1-evidence-row">{e.row}:</span> {e.value}
                <span className="rr-vb1-evidence-cite">
                  → {e.sourceUrl
                    ? <a href={e.sourceUrl} target="_blank" rel="noopener">{e.sourceLabel}</a>
                    : e.sourceLabel}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* PROMINENT COST PANEL */}
      <section className="rr-vb1-cost">
        <div className="rr-vb1-cost-head">
          <span className="rr-vb1-cost-icon">!</span>
          <h3>Honest costs of this path</h3>
        </div>
        <ul className="rr-vb1-cost-list">
          {path.costs.map((c, i) => (
            <li key={i}><strong>{c.label}.</strong> {c.detail}</li>
          ))}
        </ul>
      </section>

      {/* Narrative below the data + evidence */}
      <section className="rr-vb1-narrative">
        <h3>Why this fits Theo&apos;s brief</h3>
        {path.reasoning.map((p, i) => <p key={i}>{p}</p>)}
      </section>

      {/* Things to consider */}
      <section className="rr-vb1-consider">
        <div className="rr-vb1-consider-head">Things to think about before deciding</div>
        <ul>
          {path.considerations.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </section>
    </article>
  )
}

export default function VerdictMockB1Page() {
  return (
    <VerdictMockShell
      variantSlug="b1"
      variantLabel="Stats grid + narrative below"
      renderDetail={renderB1Detail}
    />
  )
}
