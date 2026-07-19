import '@/components/nana/research-room.css'
import './verdict-mock-a.css'

export const dynamic = 'force-static'

export default function VerdictMockAPage() {
  return (
    <div className="rr-app">
      <div className="rr-mock-banner">
        Verdict tab — design mock <em>· Layout A · Decision Triptych</em> · Theo session
      </div>

      <nav className="rr-mock-switcher" aria-label="Compare layouts">
        <strong>Layouts:</strong>
        <a href="/nana/research-room/verdict-mock-a" className="is-active">A · Decision Triptych</a>
        <a href="/nana/research-room/verdict-mock">B · Selector + Drill-down</a>
        <a href="/nana/research-room/verdict-mock-c">C · Editorial Long-form</a>
      </nav>

      <header className="rr-top">
        <div className="rr-top-in">
          <div className="rr-brand-link">
            <div className="rr-mock-brand-mark" aria-hidden="true">n</div>
            <span className="rr-brand-text">nana<em>says</em></span>
            <span className="rr-brand-sub">Research Room</span>
          </div>
          <nav className="rr-tabs" aria-label="Research Room tabs">
            <button className="rr-tab" type="button">Child brief</button>
            <button className="rr-tab rr-tab-privileged" type="button">Comparison</button>
            <button className="rr-tab is-active" type="button">Verdict</button>
            <button className="rr-tab" type="button">Partner brief</button>
          </nav>
          <div className="rr-child-selector">
            <span className="rr-child-selector-label">Child</span>
            <span className="rr-child-selector-input">Theo</span>
          </div>
          <a className="rr-cta rr-cta-ghost" href="#" aria-label="My reports">← My reports</a>
        </div>
      </header>

      <div className="rr-shell rr-shell-chat-closed">
        <section className="rr-main">
         <div className="rr-view-pager">
          <div className="rr-view-page">
           <div className="rr-view">

            <div className="rr-view-head">
              <div>
                <div className="rr-view-eyebrow">Verdict</div>
                <h1 className="rr-view-title">
                  Three honest paths,<br /><em>side-by-side.</em>
                </h1>
                <p className="rr-view-meta">
                  All three paths visible at once for direct comparison. Pick the school whose
                  trade-offs you can live with.
                </p>
              </div>
              <div className="rr-partner-actions">
                <button type="button" className="rr-brief-action">Regenerate</button>
              </div>
            </div>

            <section className="rr-verdict-brief-strip" aria-label="Theo's brief">
              <div className="rr-verdict-brief-strip-head">Brief that drives this verdict</div>
              <div className="rr-verdict-brief-chips">
                <span className="rr-verdict-brief-chip is-anchor">
                  <span className="rr-verdict-brief-chip-k">Top priority</span>
                  <span className="rr-verdict-brief-chip-v">Sport · rugby (recreational)</span>
                </span>
                <span className="rr-verdict-brief-chip is-anchor">
                  <span className="rr-verdict-brief-chip-k">5-year picture</span>
                  <span className="rr-verdict-brief-chip-v">Academic, university-track</span>
                </span>
                <span className="rr-verdict-brief-chip">
                  <span className="rr-verdict-brief-chip-k">Boarding</span>
                  <span className="rr-verdict-brief-chip-v">Full</span>
                </span>
                <span className="rr-verdict-brief-chip">
                  <span className="rr-verdict-brief-chip-k">Location filter</span>
                  <span className="rr-verdict-brief-chip-v">South West England</span>
                </span>
                <span className="rr-verdict-brief-chip">
                  <span className="rr-verdict-brief-chip-k">Budget</span>
                  <span className="rr-verdict-brief-chip-v">£30k–£40k</span>
                </span>
                <span className="rr-verdict-brief-chip">
                  <span className="rr-verdict-brief-chip-k">Curriculum</span>
                  <span className="rr-verdict-brief-chip-v">A-level</span>
                </span>
                <span className="rr-verdict-brief-chip">
                  <span className="rr-verdict-brief-chip-k">Year · Gender</span>
                  <span className="rr-verdict-brief-chip-v">Year 10 · girl</span>
                </span>
              </div>
            </section>

            {/* THREE COLUMNS — side-by-side comparison */}
            <div className="rr-verdict-triptych">

              {/* PATH A — sport */}
              <article className="rr-verdict-col is-col-a">
                <div className="rr-verdict-col-head">
                  <span className="rr-verdict-col-letter">A</span>
                  <span className="rr-verdict-col-frame">If sport is the priority</span>
                </div>
                <div className="rr-verdict-col-school">Oakham School</div>
                <div className="rr-verdict-col-meta">Rutland · co-ed · full boarding · A-level</div>

                <div className="rr-verdict-col-reasoning">
                  <p>
                    Most decorated rugby school in your shortlist. <strong>U18 Schools Cup 2024 winner</strong>{' '}
                    and <strong>U18 National Cup 2025 finalist</strong> — back-to-back championship-level
                    outcomes. Three teams reached national finals across other sports in the same year.
                  </p>
                  <p>
                    A-level pathway + full boarding fit the brief structurally. Live-in pastoral staff,
                    regular tutor contact.
                  </p>
                </div>

                <div className="rr-verdict-col-section-head">Evidence</div>
                <ul className="rr-verdict-col-evidence">
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">Rugby strength:</span>{' '}
                      &quot;National-strong&quot; — three teams in national finals.
                      <span className="rr-verdict-col-evidence-cite">
                        →{' '}
                        <a href="https://www.oakham.rutland.sch.uk/news/three-oakham-school-teams-reach-national-finals/" target="_blank" rel="noopener">
                          oakham.rutland.sch.uk
                        </a>
                      </span>
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">Cup record:</span>{' '}
                      U18 Schools Cup 2024 winner; 2025 finalist; U15 finalist.
                      <span className="rr-verdict-col-evidence-cite">
                        →{' '}
                        <a href="https://www.oakham.rutland.sch.uk/news/tigers-academy-continue-winning-streak-at-oakham/" target="_blank" rel="noopener">
                          tigers-academy
                        </a>
                      </span>
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">Boarding:</span> Pastoral care +
                      integrated houses, full boarding.
                      <span className="rr-verdict-col-evidence-cite">
                        →{' '}
                        <a href="https://www.oakham.rutland.sch.uk/boarding-day/pastoral-care/" target="_blank" rel="noopener">
                          pastoral-care
                        </a>
                      </span>
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">Registration:</span> £180 — lowest in
                      your shortlist.
                    </span>
                  </li>
                </ul>

                <div className="rr-verdict-col-cost">
                  <div className="rr-verdict-col-cost-head">Honest costs</div>
                  <ul>
                    <li><strong>Location:</strong> Rutland — outside south-west.</li>
                    <li><strong>Academic base:</strong> GCSE 9-7 = 55% (Bromsgrove A*-A = 61%).</li>
                    <li><strong>Fees:</strong> £28,314–£58,446 — upper band above £40k cap.</li>
                  </ul>
                </div>
              </article>

              {/* PATH B — balanced */}
              <article className="rr-verdict-col is-col-b">
                <div className="rr-verdict-col-head">
                  <span className="rr-verdict-col-letter">B</span>
                  <span className="rr-verdict-col-frame">If you want both, equal weight</span>
                </div>
                <div className="rr-verdict-col-school">Bromsgrove School</div>
                <div className="rr-verdict-col-meta">Worcestershire · co-ed · full boarding · A-level</div>

                <div className="rr-verdict-col-reasoning">
                  <p>
                    The only school in your shortlist scoring well across{' '}
                    <strong>academics, sport, and full boarding at the same time</strong>. Asks Theo to
                    compromise least on the brief — except on location.
                  </p>
                  <p>
                    <strong>61% A*-A at A-level</strong> — strongest in your list (Bryanston 33%, Oakham
                    GCSE 55%). Rugby is national-strong. Full boarding with live-in houseparents and
                    house-tutor teams. Fees mid-range within budget.
                  </p>
                </div>

                <div className="rr-verdict-col-section-head">Evidence</div>
                <ul className="rr-verdict-col-evidence">
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">A-level A*–A:</span> 61% — strongest in
                      your shortlist.
                      <span className="rr-verdict-col-evidence-cite">
                        →{' '}
                        <a href="https://www.bromsgrove-school.co.uk/academic-results" target="_blank" rel="noopener">
                          academic-results
                        </a>
                      </span>
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">Rugby:</span> &quot;National-strong&quot;
                      programme.
                      <span className="rr-verdict-col-evidence-cite">
                        →{' '}
                        <a href="https://www.bromsgrove-school.co.uk/sports-centre" target="_blank" rel="noopener">
                          sports-centre
                        </a>
                      </span>
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">Boarding:</span> Live-in houseparents,
                      housemothers, tutors; weekly tutor meetings.
                      <span className="rr-verdict-col-evidence-cite">
                        →{' '}
                        <a href="https://www.bromsgrove-school.co.uk/prep-school" target="_blank" rel="noopener">
                          boarding
                        </a>
                      </span>
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">Annual fee:</span> £11,754–£54,342 —
                      mid-range within £30-40k budget.
                    </span>
                  </li>
                </ul>

                <div className="rr-verdict-col-cost">
                  <div className="rr-verdict-col-cost-head">Honest cost</div>
                  <ul>
                    <li><strong>Location:</strong> Worcestershire — Midlands, not south-west.</li>
                  </ul>
                </div>
              </article>

              {/* PATH C — location */}
              <article className="rr-verdict-col is-col-c">
                <div className="rr-verdict-col-head">
                  <span className="rr-verdict-col-letter">C</span>
                  <span className="rr-verdict-col-frame">If south-west is firm</span>
                </div>
                <div className="rr-verdict-col-school">Bryanston School</div>
                <div className="rr-verdict-col-meta">Dorset · co-ed · full boarding · A-level + IB</div>

                <div className="rr-verdict-col-reasoning">
                  <p>
                    Dorset — inside the south-west region. Closest of the comparison-ranked schools to
                    your location filter. <strong>All pupils integrated into boarding houses</strong>.
                    Fee floor opens at £11k for lowest entry. A-level + IB on offer.
                  </p>
                  <p>
                    <strong>Warning:</strong> the literal south-west school in your list is{' '}
                    <strong>King&apos;s College Taunton</strong> — see &quot;couldn&apos;t compare yet&quot; below.
                    Research it before locking Bryanston in.
                  </p>
                </div>

                <div className="rr-verdict-col-section-head">Evidence</div>
                <ul className="rr-verdict-col-evidence">
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">Location:</span> Blandford Forum,
                      Dorset — inside south-west.
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">Boarding:</span> &quot;All pupils
                      integrated into boarding houses.&quot;
                      <span className="rr-verdict-col-evidence-cite">
                        →{' '}
                        <a href="https://www.bryanston.co.uk/staff-group/bryanston-school/" target="_blank" rel="noopener">
                          staff-group
                        </a>
                      </span>
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">A-level + IB:</span> 33% A*–A at
                      A-level; 64% IB 40+.
                      <span className="rr-verdict-col-evidence-cite">
                        →{' '}
                        <a href="https://www.bryanston.co.uk/blog/pupils-achieve-excellent-a-level-results/" target="_blank" rel="noopener">
                          A-level results
                        </a>
                      </span>
                    </span>
                  </li>
                  <li>
                    <span>
                      <span className="rr-verdict-col-evidence-row">Annual fee:</span> £11,112–£56,523 —
                      entry floor very accessible.
                    </span>
                  </li>
                </ul>

                <div className="rr-verdict-col-cost">
                  <div className="rr-verdict-col-cost-head">Honest costs</div>
                  <ul>
                    <li><strong>Academics:</strong> 33% A*-A vs Bromsgrove&apos;s 61%.</li>
                    <li><strong>Rugby:</strong> SOCS 294/305 — below national-strong.</li>
                    <li><strong>King&apos;s Taunton:</strong> may be the real Path C answer.</li>
                  </ul>
                </div>
              </article>

            </div>

            {/* Couldn't compare yet */}
            <section className="rr-verdict-couldnt">
              <div className="rr-verdict-couldnt-head">
                <h3>Schools we couldn&apos;t compare yet</h3>
                <span className="rr-verdict-couldnt-tag">≥50% table coverage needed to rank</span>
              </div>
              <p className="rr-verdict-couldnt-intro">
                These schools are on your shortlist but the comparison table has too few cells filled
                to compare them fairly.
              </p>

              <div className="rr-verdict-couldnt-item">
                <div className="rr-verdict-couldnt-name">King&apos;s College Taunton</div>
                <div className="rr-verdict-couldnt-meta">
                  Comparison table: 4 of 52 cells filled (8%) · Below the 50% threshold
                </div>
                <p className="rr-verdict-couldnt-body">
                  <span className="rr-verdict-couldnt-tag-match">brief match</span>
                  South-west location ✓ (the only school in your list that does) · co-ed · day + boarding offered.
                  Critical missing rows: A-level results, full-boarding fee, rugby programme strength,
                  lowest boarding entry point. <strong>If Path C is your direction, this is the
                  highest-leverage research action</strong>.
                </p>
              </div>

              <div className="rr-verdict-couldnt-item">
                <div className="rr-verdict-couldnt-name">Benenden School</div>
                <div className="rr-verdict-couldnt-meta">
                  Comparison table: 7 of 52 cells filled (13%) · Below the 50% threshold
                </div>
                <p className="rr-verdict-couldnt-body">
                  Full boarding · A-level · the only girls-only school in your shortlist.{' '}
                  <span className="rr-verdict-couldnt-tag-warn">budget warning</span>
                  Top of fee range is £59,214 — above £40k cap by ~50%.
                </p>
              </div>
            </section>

            {/* Confidence footer */}
            <div className="rr-verdict-confidence">
              <span>Path A: <strong className="is-medium">Medium</strong></span>
              <span>Path B: <strong className="is-medium">Medium</strong></span>
              <span>Path C: <strong className="is-low">Low</strong></span>
              <span>Sources: <strong>15</strong></span>
              <span>Rows considered: <strong>52</strong></span>
              <span>Updated: <strong>21 May 2026, 14:02</strong></span>
            </div>

           </div>
          </div>
         </div>
        </section>

        <aside className="rr-mock-chat-rail" aria-label="Ask Nana (collapsed)">
          <div className="rr-mock-chat-rail-avatar" />
          <div className="rr-mock-chat-rail-label">ASK NANA</div>
        </aside>
      </div>
    </div>
  )
}
