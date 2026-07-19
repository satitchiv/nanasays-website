'use client'

import { useState } from 'react'
import '@/components/nana/research-room.css'
import './verdict-mock.css'

type PathKey = 'A' | 'B' | 'C'

export default function VerdictMockPage() {
  const [selected, setSelected] = useState<PathKey>('B')

  return (
    <div className="rr-app">
      <div className="rr-mock-banner">
        Verdict tab — design mock <em>· Layout B · Selector + Drill-down</em> · Theo session
      </div>

      <nav className="rr-mock-switcher" aria-label="Compare layouts">
        <strong>Layouts:</strong>
        <a href="/nana/research-room/verdict-mock-a">A · Decision Triptych</a>
        <a href="/nana/research-room/verdict-mock" className="is-active">B · Selector + Drill-down</a>
        <a href="/nana/research-room/verdict-mock-c">C · Editorial Long-form</a>
      </nav>

      {/* Top bar replicating the real Research Room chrome */}
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

          <a className="rr-cta rr-cta-ghost" href="#" aria-label="My reports">
            ← My reports
          </a>
        </div>
      </header>

      <div className="rr-shell rr-shell-chat-closed">
        <section className="rr-main">
         <div className="rr-view-pager">
          <div className="rr-view-page">
           <div className="rr-view">

            {/* HEADLINE BLOCK */}
            <div className="rr-view-head">
              <div>
                <div className="rr-view-eyebrow">Verdict</div>
                <h1 className="rr-view-title">
                  Three honest paths,<br /><em>pick the one that fits.</em>
                </h1>
                <p className="rr-view-meta">
                  Theo's brief gives us two anchors — sport priority and an academic 5-year picture —
                  plus a south-west location filter that currently matches only 1 of 5 shortlisted schools.
                  Tap a path below to see why that school wins and what it costs.
                </p>
              </div>
              <div className="rr-partner-actions">
                <button type="button" className="rr-brief-action">Regenerate</button>
              </div>
            </div>

            {/* COMPACT BRIEF CHIP ROW */}
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

            {/* SELECTOR TILES */}
            <div className="rr-verdict-selector" role="tablist" aria-label="Verdict paths">
              <button
                role="tab"
                aria-selected={selected === 'A'}
                className={`rr-verdict-tile is-tile-a${selected === 'A' ? ' is-active' : ''}`}
                onClick={() => setSelected('A')}
                type="button"
              >
                <div className="rr-verdict-tile-head">
                  <span className="rr-verdict-tile-letter">A</span>
                  <span className="rr-verdict-tile-frame">If sport is the priority</span>
                </div>
                <div className="rr-verdict-tile-school">Oakham School</div>
                <p className="rr-verdict-tile-tagline">
                  Most decorated rugby school in your shortlist. National-strong programme.
                  Trade-off: outside south-west, weaker academic base.
                </p>
              </button>

              <button
                role="tab"
                aria-selected={selected === 'B'}
                className={`rr-verdict-tile is-tile-b${selected === 'B' ? ' is-active' : ''}`}
                onClick={() => setSelected('B')}
                type="button"
              >
                <div className="rr-verdict-tile-head">
                  <span className="rr-verdict-tile-letter">B</span>
                  <span className="rr-verdict-tile-frame">If you want both, equal weight</span>
                </div>
                <div className="rr-verdict-tile-school">Bromsgrove School</div>
                <p className="rr-verdict-tile-tagline">
                  Only school scoring well on academics + sport + boarding together.
                  Trade-off: Worcestershire, not south-west.
                </p>
              </button>

              <button
                role="tab"
                aria-selected={selected === 'C'}
                className={`rr-verdict-tile is-tile-c${selected === 'C' ? ' is-active' : ''}`}
                onClick={() => setSelected('C')}
                type="button"
              >
                <div className="rr-verdict-tile-head">
                  <span className="rr-verdict-tile-letter">C</span>
                  <span className="rr-verdict-tile-frame">If south-west is firm</span>
                </div>
                <div className="rr-verdict-tile-school">Bryanston School</div>
                <p className="rr-verdict-tile-tagline">
                  Closest of the ranked schools to your location filter.
                  Trade-off: weaker academics; King&apos;s Taunton may be the real Path C.
                </p>
              </button>
            </div>

            {/* DETAIL PANEL — swaps based on selected tile */}
            {selected === 'A' && <PathDetailA />}
            {selected === 'B' && <PathDetailB />}
            {selected === 'C' && <PathDetailC />}

            {/* SCHOOLS WE COULDN'T COMPARE YET */}
            <section className="rr-verdict-couldnt">
              <div className="rr-verdict-couldnt-head">
                <h3>Schools we couldn&apos;t compare yet</h3>
                <span className="rr-verdict-couldnt-tag">≥50% table coverage needed to rank</span>
              </div>
              <p className="rr-verdict-couldnt-intro">
                These schools are on your shortlist but the comparison table has too few cells filled
                to compare them fairly. They might be the answer — you just haven&apos;t built enough
                evidence in the table yet.
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
                  highest-leverage research action</strong> — it could move from parked to leading.
                </p>
              </div>

              <div className="rr-verdict-couldnt-item">
                <div className="rr-verdict-couldnt-name">Benenden School</div>
                <div className="rr-verdict-couldnt-meta">
                  Comparison table: 7 of 52 cells filled (13%) · Below the 50% threshold
                </div>
                <p className="rr-verdict-couldnt-body">
                  Full boarding · A-level · the only girls-only school in your shortlist (worth flagging
                  given Theo is flagged as a girl in the brief).{' '}
                  <span className="rr-verdict-couldnt-tag-warn">budget warning</span>
                  Top of fee range is £59,214 — above £40k cap by ~50%. Confirm bursary tolerance
                  before researching further. Critical missing rows: A-level results, rugby/sports
                  programme, bursary availability.
                </p>
              </div>
            </section>

            {/* WHAT THE VERDICT CAN'T SEE YET + WHAT'S NEXT */}
            <div className="rr-verdict-prose">
              <h3>What this verdict can&apos;t see yet</h3>
              <ul>
                <li>
                  <strong>Whether the south-west filter is hard or soft.</strong> The onboarding asks
                  &quot;where do you want to look for schools&quot; — it doesn&apos;t ask whether that&apos;s a
                  non-negotiable. Path C wins or loses on this answer.
                </li>
                <li>
                  <strong>Travel logistics.</strong> The brief doesn&apos;t capture where Theo will travel from.
                  Heathrow-distance data is missing across the list anyway.
                </li>
                <li>
                  <strong>Scholarship and bursary availability</strong> across the shortlist — could
                  change Benenden&apos;s budget viability.
                </li>
              </ul>

              <h3>What to do next</h3>
              <ul>
                <li>
                  <strong>Tap the path that matches what you actually want most</strong> — sport-first,
                  balanced, or location-first. The answer collapses to one school.
                </li>
                <li>
                  <strong>Research King&apos;s College Taunton</strong> before deciding on Path C. Add at
                  least 8 rows.
                </li>
                <li>
                  <strong>Decide whether the south-west filter is hard.</strong> If hard, Paths A and B
                  both fail it — only Path C survives.
                </li>
              </ul>
            </div>

            {/* CONFIDENCE FOOTER */}
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

        {/* Collapsed chat rail */}
        <aside className="rr-mock-chat-rail" aria-label="Ask Nana (collapsed)">
          <div className="rr-mock-chat-rail-avatar" />
          <div className="rr-mock-chat-rail-label">ASK NANA</div>
        </aside>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   Per-path detail panels — kept inline so the mock is one file.
   Reuses the existing reasoning, evidence, and cost content unchanged.
   ───────────────────────────────────────────────────────────────────── */

function PathDetailA() {
  return (
    <article className="rr-verdict-detail is-path-a">
      <div className="rr-verdict-detail-eyebrow">Path A · If sport is the real priority</div>
      <h2 className="rr-verdict-detail-school">
        Oakham School <small>Rutland · co-ed · full boarding · A-level</small>
      </h2>
      <p className="rr-verdict-detail-frame">
        …even though the parent note says the 5-year picture is academic
      </p>

      <div className="rr-verdict-detail-reasoning">
        <p>
          Oakham is the most decorated rugby school in your shortlist, by a clear margin. They were
          the <strong>U18 Schools Cup 2024 winner</strong> and{' '}
          <strong>U18 National Cup 2025 finalist</strong> — back-to-back championship-level outcomes
          that almost no other school in the country can match. Their rugby tier reads as{' '}
          <strong>&quot;national-strong&quot;</strong> on the SOCS performance data, and three teams reached
          national finals across other sports in the same year. For a child whose top priority is
          sport — even at recreational level — this is the most active and high-visibility sports
          environment in your list.
        </p>
        <p>
          The brief also asks for A-level and full boarding. Oakham is co-ed, takes full boarders,
          runs an A-level pathway, and has live-in pastoral staff with regular tutor contact. So the
          structural fit is genuinely there too — it&apos;s not a sport-only school.
        </p>
      </div>

      <div className="rr-verdict-evidence">
        <div className="rr-verdict-evidence-head">Evidence we used</div>
        <ul className="rr-verdict-evidence-list">
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Rugby strength:</span>{' '}
              &quot;National-strong&quot; — U18 Schools Cup 2024 winner, U18 National Cup 2025 finalist,
              three teams in national finals.
              <span className="rr-verdict-evidence-cite">
                →{' '}
                <a href="https://www.oakham.rutland.sch.uk/news/three-oakham-school-teams-reach-national-finals/" target="_blank" rel="noopener">
                  oakham.rutland.sch.uk · three-teams-national-finals
                </a>
              </span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Recent cup record:</span>{' '}
              U18 Schools Cup 2024 winner; 2025 finalist; U15 finalist.
              <span className="rr-verdict-evidence-cite">
                →{' '}
                <a href="https://www.oakham.rutland.sch.uk/news/tigers-academy-continue-winning-streak-at-oakham/" target="_blank" rel="noopener">
                  oakham.rutland.sch.uk · tigers-academy
                </a>
              </span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Boarding house structure:</span>{' '}
              Pastoral care + integrated houses, full boarding accepted.
              <span className="rr-verdict-evidence-cite">
                →{' '}
                <a href="https://www.oakham.rutland.sch.uk/boarding-day/pastoral-care/" target="_blank" rel="noopener">
                  oakham.rutland.sch.uk · pastoral-care
                </a>
              </span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Curriculum:</span>{' '}
              A-level pathway confirmed.
              <span className="rr-verdict-evidence-cite">
                →{' '}
                <a href="https://www.oakham.rutland.sch.uk/academic/examination-results/" target="_blank" rel="noopener">
                  oakham.rutland.sch.uk · examination-results
                </a>
              </span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Registration fee:</span>{' '}
              £180 — lowest in your shortlist.
              <span className="rr-verdict-evidence-cite">→ school-extracted fees data</span>
            </span>
          </li>
        </ul>
      </div>

      <div className="rr-verdict-cost">
        <div className="rr-verdict-cost-head">Honest costs of this path</div>
        <ul>
          <li>
            <strong>Location.</strong> Oakham is in Rutland (East Midlands). Your location filter is
            south-west — Oakham sits outside it.
          </li>
          <li>
            <strong>Academic base.</strong> GCSE 9-7 grades sit at 55%, below where Bromsgrove lands
            (61% A*-A at A-level).
          </li>
          <li>
            <strong>Fees.</strong> £28,314–£58,446 annual range — lower band inside budget, upper band
            well above £40k cap.
          </li>
        </ul>
      </div>
    </article>
  )
}

function PathDetailB() {
  return (
    <article className="rr-verdict-detail is-path-b">
      <div className="rr-verdict-detail-eyebrow">Path B · If you want both, equal weight</div>
      <h2 className="rr-verdict-detail-school">
        Bromsgrove School <small>Worcestershire · co-ed · full boarding · A-level</small>
      </h2>
      <p className="rr-verdict-detail-frame">
        …the balance the brief actually describes
      </p>

      <div className="rr-verdict-detail-reasoning">
        <p>
          Bromsgrove is the only school in your shortlist that scores well across{' '}
          <strong>academics, sport, and full boarding at the same time</strong>. Where Oakham wins on
          sport at the cost of academic ceiling, and where Bryanston wins on location at the cost of
          both, Bromsgrove is the school that asks Theo to compromise least on what the brief actually
          says — except for one thing (named below).
        </p>
        <p>
          Academically, <strong>61% of A-level grades are A*-A</strong> — the strongest in your list
          by a clear margin (Bryanston sits at 33%; Oakham&apos;s GCSE base at 55% is lower). For a
          &quot;strong academic university pathway,&quot; this is the school that materially supports that
          goal. On sport, Bromsgrove&apos;s rugby reads as national-strong — a genuine fit for
          recreational rugby at strong club-feeder level. Full boarding is offered with live-in
          houseparents and house-tutor teams.
        </p>
        <p>
          Fees sit <strong>mid-range within your £30-40k budget</strong> at the boarding entry point,
          with the upper band reaching senior years. Workable for Year 10 entry.
        </p>
      </div>

      <div className="rr-verdict-evidence">
        <div className="rr-verdict-evidence-head">Evidence we used</div>
        <ul className="rr-verdict-evidence-list">
          <li>
            <span>
              <span className="rr-verdict-evidence-row">A-level A*–A:</span>{' '}
              61% — the strongest in your shortlist.
              <span className="rr-verdict-evidence-cite">
                →{' '}
                <a href="https://www.bromsgrove-school.co.uk/academic-results" target="_blank" rel="noopener">
                  bromsgrove-school.co.uk · academic-results
                </a>
              </span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Rugby strength:</span>{' '}
              &quot;National-strong&quot; rugby programme.
              <span className="rr-verdict-evidence-cite">
                →{' '}
                <a href="https://www.bromsgrove-school.co.uk/sports-centre" target="_blank" rel="noopener">
                  bromsgrove-school.co.uk · sports-centre
                </a>
              </span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Boarding house structure:</span>{' '}
              Live-in houseparents, housemothers, and tutors; weekly tutor meetings.
              <span className="rr-verdict-evidence-cite">
                →{' '}
                <a href="https://www.bromsgrove-school.co.uk/prep-school" target="_blank" rel="noopener">
                  bromsgrove-school.co.uk · boarding
                </a>
              </span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Annual boarding fee:</span>{' '}
              £11,754–£54,342 (year-aware mid-range estimate inside £30-40k budget).
              <span className="rr-verdict-evidence-cite">→ school-extracted fees data</span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Registration fee:</span>{' '}
              £120 — second-lowest in your shortlist.
              <span className="rr-verdict-evidence-cite">→ school-extracted fees data</span>
            </span>
          </li>
        </ul>
      </div>

      <div className="rr-verdict-cost">
        <div className="rr-verdict-cost-head">Honest cost of this path</div>
        <ul>
          <li>
            <strong>Location.</strong> Bromsgrove is in Worcestershire — Midlands, not south-west.
            If your location filter is firm, Path B doesn&apos;t win.
          </li>
        </ul>
      </div>
    </article>
  )
}

function PathDetailC() {
  return (
    <article className="rr-verdict-detail is-path-c">
      <div className="rr-verdict-detail-eyebrow">Path C · If the south-west location filter is firm</div>
      <h2 className="rr-verdict-detail-school">
        Bryanston School <small>Dorset · co-ed · full boarding · A-level + IB</small>
      </h2>
      <p className="rr-verdict-detail-frame">
        …location outranks the other anchors
      </p>

      <div className="rr-verdict-detail-reasoning">
        <p>
          Bryanston is in Dorset, which is inside the south-west region. Among the comparison-ranked
          schools, it&apos;s the closest to your location filter. All pupils are fully integrated into
          boarding houses (every Bryanston pupil sits inside the boarding house system, including day
          pupils) — one of the strongest pastoral structures in your list on paper. Fee floor opens
          at £11k for lowest entry, and the curriculum offers both A-level and IB.
        </p>
        <p>
          <strong>The important warning for Path C.</strong> The only school in your shortlist that&apos;s
          actually inside the south-west as understood literally (Somerset, Devon, Dorset, Cornwall,
          Gloucestershire, Wiltshire) is <strong>King&apos;s College Taunton</strong>. We&apos;ve parked it
          below because the comparison table has only 4 cells filled out of 52 — we can&apos;t compare it
          fairly yet. If Path C is your direction, research King&apos;s Taunton properly before locking
          Bryanston in.
        </p>
      </div>

      <div className="rr-verdict-evidence">
        <div className="rr-verdict-evidence-head">Evidence we used</div>
        <ul className="rr-verdict-evidence-list">
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Location:</span>{' '}
              Blandford Forum, Dorset — inside south-west.
              <span className="rr-verdict-evidence-cite">→ school-extracted location data</span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Boarding house structure:</span>{' '}
              &quot;All pupils integrated into boarding houses.&quot;
              <span className="rr-verdict-evidence-cite">
                →{' '}
                <a href="https://www.bryanston.co.uk/staff-group/bryanston-school/" target="_blank" rel="noopener">
                  bryanston.co.uk · staff-group
                </a>
              </span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Annual boarding fee:</span>{' '}
              £11,112–£56,523 (entry floor very accessible).
              <span className="rr-verdict-evidence-cite">→ school-extracted fees data</span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">A-level + IB:</span>{' '}
              33% A*–A at A-level; 64% IB 40+.
              <span className="rr-verdict-evidence-cite">
                →{' '}
                <a href="https://www.bryanston.co.uk/blog/pupils-achieve-excellent-a-level-results/" target="_blank" rel="noopener">
                  bryanston.co.uk · A-level results
                </a>
              </span>
            </span>
          </li>
          <li>
            <span>
              <span className="rr-verdict-evidence-row">Rugby strength:</span>{' '}
              Programme exists; SOCS rank 294/305 — well below national-strong tier.
              <span className="rr-verdict-evidence-cite">
                →{' '}
                <a href="https://www.bryanstonsport.co.uk/Fixtures_Teams.asp?Id=61" target="_blank" rel="noopener">
                  bryanstonsport.co.uk · fixtures
                </a>
              </span>
            </span>
          </li>
        </ul>
      </div>

      <div className="rr-verdict-cost">
        <div className="rr-verdict-cost-head">Honest costs of this path</div>
        <ul>
          <li>
            <strong>Academic ceiling.</strong> 33% A*-A at A-level vs Bromsgrove&apos;s 61%. For a
            &quot;strong academic university pathway&quot; goal, this is a measurable drop. IB is competitive
            (64% at 40+) but only if Theo would take IB instead of A-level.
          </li>
          <li>
            <strong>Rugby intensity.</strong> SOCS rank 294/305 — well outside what &quot;recreational&quot;
            expects in fixture quality.
          </li>
          <li>
            <strong>The literal south-west school in your list isn&apos;t ranked yet.</strong>{' '}
            Bryanston wins Path C by default. King&apos;s Taunton might be the real Path C answer if you
            research it.
          </li>
        </ul>
      </div>
    </article>
  )
}
