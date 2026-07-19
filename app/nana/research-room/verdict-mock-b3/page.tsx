'use client'

import '@/components/nana/research-room.css'
import '../verdict-mock/verdict-mock.css'
import './verdict-mock-b3.css'
import VerdictMockShell from '@/lib/research-room/verdict-mock-shell'
import type { PathFacts } from '@/lib/research-room/verdict-mock-data'

function renderB3Detail(path: PathFacts) {
  const accentClass = `is-path-${path.letter.toLowerCase()}`
  // Parse boarding/day/intl percentages into numbers for the visual bar
  const num = (s: string) => Number(s.replace('%', '')) || 0
  const boardPct = num(path.students.boardersPct)
  const dayPct = num(path.students.dayPct)
  const intlPct = num(path.students.intlPct)

  return (
    <article className={`rr-vb3-detail ${accentClass}`}>
      <div className="rr-vb3-eyebrow">Path {path.letter} · {path.framing}</div>
      <h2 className="rr-vb3-school">{path.schoolName}</h2>
      <div className="rr-vb3-meta">{path.meta}</div>

      {/* HORIZONTAL FACT RIBBON */}
      <div className="rr-vb3-ribbon">
        <div className="rr-vb3-ribbon-cell">
          <div className="rr-vb3-ribbon-label">A-level A*–A</div>
          <div className="rr-vb3-ribbon-value">
            {path.grades.aLevelAStar}
            {path.grades.gcseTopGrades && <small>{path.grades.gcseTopGrades}</small>}
          </div>
        </div>
        <div className="rr-vb3-ribbon-cell">
          <div className="rr-vb3-ribbon-label">Type</div>
          <div className="rr-vb3-ribbon-value">
            {path.coed}<small>{path.curriculum}</small>
          </div>
        </div>
        <div className="rr-vb3-ribbon-cell">
          <div className="rr-vb3-ribbon-label">Fees / year</div>
          <div className="rr-vb3-ribbon-value">
            {path.fees.annual.split(' / ')[0].replace(' – ', '–')}
            <span className={`rr-vb3-pill is-${path.fees.inBudget}`}>
              {path.fees.inBudget === 'fits' ? 'Fits' : path.fees.inBudget === 'partial' ? 'Partial' : 'Over'}
            </span>
          </div>
        </div>
        <div className="rr-vb3-ribbon-cell">
          <div className="rr-vb3-ribbon-label">From Heathrow</div>
          <div className="rr-vb3-ribbon-value">
            {path.location.heathrowMiles} mi<small>{path.location.heathrowDrive}</small>
          </div>
        </div>
        <div className="rr-vb3-ribbon-cell">
          <div className="rr-vb3-ribbon-label">Students</div>
          <div className="rr-vb3-ribbon-value">
            {path.students.total}<small>{path.students.boardersPct} boarders</small>
          </div>
        </div>
      </div>

      {/* WIDE MAP EMBED */}
      <div className="rr-vb3-map-block">
        <iframe
          className="rr-vb3-map"
          src={path.location.mapsEmbed}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`Map of ${path.schoolName}`}
        />
        <div className="rr-vb3-map-caption">
          <strong>{path.location.town}</strong> · {path.location.region}{' '}
          <span className={`rr-vb3-pill ${path.location.insideFilter ? 'is-inside' : 'is-outside'}`}>
            {path.location.insideFilter ? 'Inside SW filter' : 'Outside SW filter'}
          </span>
          {' · '}
          <a href={path.location.mapsExternal} target="_blank" rel="noopener">open in Google Maps</a>
        </div>
      </div>

      {/* NARRATIVE — the main thing parents read, promoted to a prominent panel */}
      <section className="rr-vb3-section is-narrative">
        <div className="rr-vb3-section-head">
          <span className="rr-vb3-section-icon">★</span>
          <h3>Why this fits Theo&apos;s brief</h3>
          <span className="rr-vb3-section-sub">advisor&apos;s take</span>
        </div>
        <div className="rr-vb3-narrative">
          {path.reasoning.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </section>

      {/* EVIDENCE — prominent panel */}
      <section className="rr-vb3-section is-evidence">
        <div className="rr-vb3-section-head">
          <span className="rr-vb3-section-icon">✓</span>
          <h3>Why we picked this — evidence we used</h3>
          <span className="rr-vb3-section-sub">{path.evidence.length} citations</span>
        </div>
        <ul className="rr-vb3-evidence-list">
          {path.evidence.map((e, i) => (
            <li key={i}>
              <span>
                <span className="rr-vb3-evidence-row">{e.row}:</span> {e.value}
                <span className="rr-vb3-evidence-cite">
                  → {e.sourceUrl
                    ? <a href={e.sourceUrl} target="_blank" rel="noopener">{e.sourceLabel}</a>
                    : e.sourceLabel}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* HONEST COSTS — prominent panel */}
      <section className="rr-vb3-section is-cost">
        <div className="rr-vb3-section-head">
          <span className="rr-vb3-section-icon">!</span>
          <h3>Honest costs of this path</h3>
          <span className="rr-vb3-section-sub">{path.costs.length} item{path.costs.length === 1 ? '' : 's'}</span>
        </div>
        <ul className="rr-vb3-cost-list">
          {path.costs.map((c, i) => (
            <li key={i}><strong>{c.label}.</strong> {c.detail}</li>
          ))}
        </ul>
      </section>

      {/* BOARDING MIX + SAFETY */}
      <section className="rr-vb3-section">
        <div className="rr-vb3-section-head">
          <h3>Community shape</h3>
          <span className="rr-vb3-section-sub">Who&apos;s on site</span>
        </div>
        <div className="rr-vb3-mix-grid">
          <div className="rr-vb3-mix-card">
            <div className="rr-vb3-mix-label">Boarding / day mix</div>
            <div className="rr-vb3-mix-value">{path.students.boardersPct} boarders</div>
            <div className="rr-vb3-mix-detail">
              {path.students.dayPct} day · {path.students.total} total pupils
            </div>
            <div className="rr-vb3-mix-bar" aria-label="Boarding vs day split">
              <span className="rr-vb3-mix-bar-fill is-board" style={{ width: `${boardPct}%` }} />
              <span className="rr-vb3-mix-bar-fill is-day"   style={{ width: `${dayPct}%` }} />
            </div>
          </div>
          <div className="rr-vb3-mix-card">
            <div className="rr-vb3-mix-label">International students</div>
            <div className="rr-vb3-mix-value">{path.students.intlPct} international</div>
            <div className="rr-vb3-mix-detail">
              {100 - intlPct}% UK · weekend community varies by international share
            </div>
            <div className="rr-vb3-mix-bar" aria-label="International vs UK split">
              <span className="rr-vb3-mix-bar-fill is-intl" style={{ width: `${intlPct}%` }} />
              <span className="rr-vb3-mix-bar-fill is-day"  style={{ width: `${100 - intlPct}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* AREA SAFETY */}
      <section className="rr-vb3-section">
        <div className="rr-vb3-section-head">
          <h3>Area safety context</h3>
          <span className="rr-vb3-section-sub">police.uk data</span>
        </div>
        <p className="rr-vb3-safety-body">
          <strong>{path.safety.headline}.</strong> {path.safety.detail}{' '}
          <a href={path.safety.sourceUrl} target="_blank" rel="noopener">View live crime map</a>
        </p>
      </section>

      {/* THINGS TO CONSIDER */}
      <section className="rr-vb3-section is-consider">
        <div className="rr-vb3-section-head">
          <span className="rr-vb3-section-icon">?</span>
          <h3>Things to think about before deciding</h3>
        </div>
        <ul className="rr-vb3-consider-list">
          {path.considerations.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </section>
    </article>
  )
}

export default function VerdictMockB3Page() {
  return (
    <VerdictMockShell
      variantSlug="b3"
      variantLabel="Fact ribbon + sequential sections"
      renderDetail={renderB3Detail}
    />
  )
}
