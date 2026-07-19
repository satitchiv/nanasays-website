import '@/components/nana/research-room.css'
import './verdict-mock-c.css'

export const dynamic = 'force-static'

export default function VerdictMockCPage() {
  return (
    <div className="rr-app">
      <div className="rr-mock-banner">
        Verdict tab — design mock <em>· Layout C · Editorial Long-form</em> · Theo session
      </div>

      <nav className="rr-mock-switcher" aria-label="Compare layouts">
        <strong>Layouts:</strong>
        <a href="/nana/research-room/verdict-mock-a">A · Decision Triptych</a>
        <a href="/nana/research-room/verdict-mock">B · Selector + Drill-down</a>
        <a href="/nana/research-room/verdict-mock-c" className="is-active">C · Editorial Long-form</a>
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
                  Three honest paths for Theo,<br /><em>read like considered advice.</em>
                </h1>
                <p className="rr-view-meta">
                  Your brief stays pinned on the right. The main column reads as one flowing essay
                  with three chapters — sport-first, balanced, location-first — each ending in its
                  honest cost.
                </p>
              </div>
              <div className="rr-partner-actions">
                <button type="button" className="rr-brief-action">Regenerate</button>
              </div>
            </div>

            <div className="rr-verdict-editorial">

              {/* MAIN — the essay */}
              <article className="rr-verdict-editorial-main">

                <p className="rr-verdict-essay-lead">
                  Theo&apos;s brief gives us two anchors — sport priority and an academic 5-year picture —
                  plus a south-west location filter that currently matches only 1 of 5 shortlisted
                  schools. Three honest paths follow. Each ends in a school that wins under different
                  assumptions about what matters most. <strong>If you can tell us which of these three
                  weighs heaviest for your family, the verdict collapses to one school.</strong>
                </p>

                {/* CHAPTER I — sport */}
                <section className="rr-verdict-chapter is-chap-a">
                  <div className="rr-verdict-chapter-num">Chapter I · If sport is the real priority</div>
                  <h2 className="rr-verdict-chapter-school">Oakham School</h2>
                  <div className="rr-verdict-chapter-meta">Rutland · co-ed · full boarding · A-level</div>
                  <p className="rr-verdict-chapter-deck">
                    …even though the parent note says the 5-year picture is academic.
                  </p>

                  <div className="rr-verdict-chapter-prose">
                    <p>
                      Oakham is the most decorated rugby school in your shortlist, by a clear margin.
                      They were the <strong>U18 Schools Cup 2024 winner</strong> and{' '}
                      <strong>U18 National Cup 2025 finalist</strong>
                      <a href="https://www.oakham.rutland.sch.uk/news/three-oakham-school-teams-reach-national-finals/" target="_blank" rel="noopener" className="rr-verdict-cite">¹</a>
                      {' '}— back-to-back championship-level outcomes that almost no other school in the
                      country can match. Their rugby tier reads as &quot;national-strong&quot; on the SOCS
                      performance data, and three of their teams reached national finals across other
                      sports in the same year
                      <a href="https://www.oakham.rutland.sch.uk/news/tigers-academy-continue-winning-streak-at-oakham/" target="_blank" rel="noopener" className="rr-verdict-cite">²</a>.
                      For a child whose top priority is sport — even at recreational level — this is
                      the most active and high-visibility sports environment in your list.
                    </p>
                    <p>
                      The brief also asks for A-level and full boarding. Oakham is co-ed, takes full
                      boarders, runs an A-level pathway
                      <a href="https://www.oakham.rutland.sch.uk/academic/examination-results/" target="_blank" rel="noopener" className="rr-verdict-cite">³</a>,
                      and has live-in pastoral staff with regular tutor contact
                      <a href="https://www.oakham.rutland.sch.uk/boarding-day/pastoral-care/" target="_blank" rel="noopener" className="rr-verdict-cite">⁴</a>.
                      So the structural fit is genuinely there too — it&apos;s not a sport-only school.
                      Registration fee sits at £180, the lowest in your shortlist.
                    </p>
                  </div>

                  <div className="rr-verdict-chapter-cost">
                    <div className="rr-verdict-chapter-cost-head">The honest cost</div>
                    <ul>
                      <li>
                        <strong>Location.</strong> Oakham is in Rutland (East Midlands). Your location
                        filter is south-west — Oakham sits outside it.
                      </li>
                      <li>
                        <strong>Academic base.</strong> GCSE 9-7 grades sit at 55%, below where Bromsgrove
                        lands at 61% A*-A at A-level.
                      </li>
                      <li>
                        <strong>Fees.</strong> £28,314–£58,446 annual range — lower band inside budget,
                        upper band well above your £40k cap.
                      </li>
                    </ul>
                  </div>
                </section>

                {/* CHAPTER II — balanced */}
                <section className="rr-verdict-chapter is-chap-b">
                  <div className="rr-verdict-chapter-num">Chapter II · If you want both, equal weight</div>
                  <h2 className="rr-verdict-chapter-school">Bromsgrove School</h2>
                  <div className="rr-verdict-chapter-meta">Worcestershire · co-ed · full boarding · A-level</div>
                  <p className="rr-verdict-chapter-deck">
                    …the balance the brief actually describes.
                  </p>

                  <div className="rr-verdict-chapter-prose">
                    <p>
                      Bromsgrove is the only school in your shortlist that scores well across{' '}
                      <strong>academics, sport, and full boarding at the same time</strong>. Where Oakham
                      wins on sport at the cost of academic ceiling, and where Bryanston wins on
                      location at the cost of both, Bromsgrove is the school that asks Theo to
                      compromise least on what the brief actually says — except for one thing.
                    </p>
                    <p>
                      Academically, <strong>61% of A-level grades are A*-A</strong>
                      <a href="https://www.bromsgrove-school.co.uk/academic-results" target="_blank" rel="noopener" className="rr-verdict-cite">¹</a>
                      {' '}— the strongest in your list by a clear margin (Bryanston sits at 33%;
                      Oakham&apos;s GCSE base at 55% is lower). For a &quot;strong academic university
                      pathway,&quot; this is the school that materially supports the goal.
                    </p>
                    <p>
                      On sport, Bromsgrove&apos;s rugby reads as national-strong
                      <a href="https://www.bromsgrove-school.co.uk/sports-centre" target="_blank" rel="noopener" className="rr-verdict-cite">²</a>
                      {' '}— a genuine fit for recreational rugby at strong club-feeder level. Full
                      boarding is offered with live-in houseparents and house-tutor teams; weekly
                      tutor meetings are standard
                      <a href="https://www.bromsgrove-school.co.uk/prep-school" target="_blank" rel="noopener" className="rr-verdict-cite">³</a>.
                      Fees sit mid-range within your £30-40k budget at the boarding entry point, with
                      the upper band reaching senior years. Workable for Year 10 entry. Registration
                      fee is £120 — second-lowest in your shortlist.
                    </p>
                  </div>

                  <div className="rr-verdict-chapter-cost">
                    <div className="rr-verdict-chapter-cost-head">The honest cost</div>
                    <ul>
                      <li>
                        <strong>Location.</strong> Bromsgrove is in Worcestershire — Midlands, not
                        south-west. If your location filter is firm, Chapter II isn&apos;t the answer.
                      </li>
                    </ul>
                  </div>
                </section>

                {/* CHAPTER III — location */}
                <section className="rr-verdict-chapter is-chap-c">
                  <div className="rr-verdict-chapter-num">Chapter III · If the south-west location filter is firm</div>
                  <h2 className="rr-verdict-chapter-school">Bryanston School</h2>
                  <div className="rr-verdict-chapter-meta">Dorset · co-ed · full boarding · A-level + IB</div>
                  <p className="rr-verdict-chapter-deck">
                    …location outranks the other anchors.
                  </p>

                  <div className="rr-verdict-chapter-prose">
                    <p>
                      Bryanston is in Dorset, which is inside the south-west region. Among the
                      comparison-ranked schools, it&apos;s the closest to your location filter. All pupils
                      are fully integrated into boarding houses
                      <a href="https://www.bryanston.co.uk/staff-group/bryanston-school/" target="_blank" rel="noopener" className="rr-verdict-cite">¹</a>
                      {' '}— every Bryanston pupil sits inside the boarding house system, including day
                      pupils — one of the strongest pastoral structures in your list on paper. Fee
                      floor opens at £11k for lowest entry, and the curriculum offers both A-level and
                      IB
                      <a href="https://www.bryanston.co.uk/blog/pupils-achieve-excellent-a-level-results/" target="_blank" rel="noopener" className="rr-verdict-cite">²</a>.
                    </p>
                    <p>
                      <strong>The important warning for Chapter III.</strong> The only school in your
                      shortlist that&apos;s actually inside the south-west as understood literally (Somerset,
                      Devon, Dorset, Cornwall, Gloucestershire, Wiltshire) is{' '}
                      <strong>King&apos;s College Taunton</strong>. We&apos;ve parked it in the postscript below
                      because the comparison table has only 4 cells filled out of 52 — we can&apos;t compare
                      it fairly yet. If Chapter III is your direction, research King&apos;s Taunton properly
                      before locking Bryanston in.
                    </p>
                  </div>

                  <div className="rr-verdict-chapter-cost">
                    <div className="rr-verdict-chapter-cost-head">The honest costs</div>
                    <ul>
                      <li>
                        <strong>Academic ceiling.</strong> 33% A*-A at A-level vs Bromsgrove&apos;s 61%. For
                        a &quot;strong academic university pathway&quot; goal, this is a measurable drop. IB is
                        competitive (64% at 40+) but only if Theo would take IB instead of A-level.
                      </li>
                      <li>
                        <strong>Rugby intensity.</strong> SOCS rank 294/305
                        <a href="https://www.bryanstonsport.co.uk/Fixtures_Teams.asp?Id=61" target="_blank" rel="noopener" className="rr-verdict-cite">³</a>
                        {' '}— well outside what &quot;recreational&quot; expects in fixture quality.
                      </li>
                      <li>
                        <strong>The literal south-west school isn&apos;t ranked yet.</strong> Bryanston wins
                        Chapter III by default. King&apos;s Taunton might be the real answer.
                      </li>
                    </ul>
                  </div>
                </section>

                {/* POSTSCRIPT */}
                <section className="rr-verdict-postscript">
                  <div className="rr-verdict-postscript-head">
                    <h3>Postscript: schools we couldn&apos;t compare yet</h3>
                    <span className="rr-verdict-postscript-tag">≥50% table coverage needed to rank</span>
                  </div>
                  <p className="rr-verdict-postscript-intro">
                    Two schools on your shortlist sit below the comparison threshold. They might be
                    the answer — you just haven&apos;t built enough evidence in the table yet.
                  </p>

                  <div className="rr-verdict-postscript-item">
                    <div className="rr-verdict-postscript-name">King&apos;s College Taunton</div>
                    <div className="rr-verdict-postscript-meta">
                      Comparison table: 4 of 52 cells filled (8%) · Below the 50% threshold
                    </div>
                    <p className="rr-verdict-postscript-body">
                      <span className="rr-verdict-postscript-tag-match">brief match</span>
                      South-west location ✓ (the only school in your list that does) · co-ed · day +
                      boarding offered. Critical missing rows: A-level results, full-boarding fee,
                      rugby programme strength, lowest boarding entry point. <strong>If Chapter III is
                      your direction, this is the highest-leverage research action</strong>.
                    </p>
                  </div>

                  <div className="rr-verdict-postscript-item">
                    <div className="rr-verdict-postscript-name">Benenden School</div>
                    <div className="rr-verdict-postscript-meta">
                      Comparison table: 7 of 52 cells filled (13%) · Below the 50% threshold
                    </div>
                    <p className="rr-verdict-postscript-body">
                      Full boarding · A-level · the only girls-only school in your shortlist (worth
                      flagging given Theo is flagged as a girl in the brief).{' '}
                      <span className="rr-verdict-postscript-tag-warn">budget warning</span>
                      Top of fee range is £59,214 — above £40k cap by ~50%. Confirm bursary tolerance
                      before researching further.
                    </p>
                  </div>
                </section>

              </article>

              {/* RIGHT RAIL — sticky brief + confidence */}
              <aside className="rr-verdict-editorial-rail" aria-label="Theo's brief and confidence">
                <div className="rr-verdict-rail-card">
                  <div className="rr-verdict-rail-card-head">Your brief</div>
                  <div className="rr-verdict-rail-brief-list">
                    <div className="rr-verdict-rail-brief-row is-anchor">
                      <span className="rr-verdict-rail-brief-row-k">Top priority</span>
                      <span className="rr-verdict-rail-brief-row-v">Sport · rugby (recreational)</span>
                    </div>
                    <div className="rr-verdict-rail-brief-row is-anchor">
                      <span className="rr-verdict-rail-brief-row-k">5-year picture</span>
                      <span className="rr-verdict-rail-brief-row-v">Academic, university-track</span>
                    </div>
                    <div className="rr-verdict-rail-brief-row">
                      <span className="rr-verdict-rail-brief-row-k">Boarding</span>
                      <span className="rr-verdict-rail-brief-row-v">Full</span>
                    </div>
                    <div className="rr-verdict-rail-brief-row">
                      <span className="rr-verdict-rail-brief-row-k">Location filter</span>
                      <span className="rr-verdict-rail-brief-row-v">South West England</span>
                    </div>
                    <div className="rr-verdict-rail-brief-row">
                      <span className="rr-verdict-rail-brief-row-k">Budget</span>
                      <span className="rr-verdict-rail-brief-row-v">£30k–£40k / year</span>
                    </div>
                    <div className="rr-verdict-rail-brief-row">
                      <span className="rr-verdict-rail-brief-row-k">Curriculum</span>
                      <span className="rr-verdict-rail-brief-row-v">A-level</span>
                    </div>
                    <div className="rr-verdict-rail-brief-row">
                      <span className="rr-verdict-rail-brief-row-k">Year · Gender</span>
                      <span className="rr-verdict-rail-brief-row-v">Year 10 · girl</span>
                    </div>
                  </div>
                </div>

                <div className="rr-verdict-rail-card">
                  <div className="rr-verdict-rail-card-head">How sure we are</div>
                  <div className="rr-verdict-rail-confidence-row">
                    <span>Chapter I · Oakham</span>
                    <span className="rr-verdict-rail-conf-pill is-medium">Medium</span>
                  </div>
                  <div className="rr-verdict-rail-confidence-row">
                    <span>Chapter II · Bromsgrove</span>
                    <span className="rr-verdict-rail-conf-pill is-medium">Medium</span>
                  </div>
                  <div className="rr-verdict-rail-confidence-row">
                    <span>Chapter III · Bryanston</span>
                    <span className="rr-verdict-rail-conf-pill is-low">Low</span>
                  </div>
                  <hr style={{ border: 0, borderTop: '1px solid var(--rr-border)', margin: '10px 0' }} />
                  <div className="rr-verdict-rail-confidence-row">
                    <span>Sources cited</span><strong>15</strong>
                  </div>
                  <div className="rr-verdict-rail-confidence-row">
                    <span>Rows considered</span><strong>52</strong>
                  </div>
                  <div className="rr-verdict-rail-confidence-row">
                    <span>Updated</span><strong>21 May 14:02</strong>
                  </div>
                </div>
              </aside>

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
