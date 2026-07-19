'use client'

// Verdict v3 UX iteration — combined mock (3.1 + 3.2 + 3.5).
//
// Self-contained 'use client' page. Hardcoded data for Jack-test. Path B
// active to show the new "Why this fits" panel structure. Imports the
// production CSS from components/nana/verdict-tab-v3.css and adds a small
// extra CSS file for the new sub-section styles. NOT WIRED TO BACKEND —
// pure layout review.
//
// Navigate to: http://100.100.120.57:3003/nana/research-room/verdict-mock-b3-v2

import '@/components/nana/research-room.css'
import '@/components/nana/verdict-tab-v3.css'
import './verdict-mock-b3-v2.css'

type PathKey = 'A' | 'B' | 'C'

const ACTIVE_PATH: PathKey = 'B'
const CHILD_NAME = 'Jack-test'

const PATH_FRAMINGS: Record<PathKey, string> = {
  A: 'If sport is the priority',
  B: 'If you want both, equal weight',
  C: 'If your location filter is firm',
}

const PATH_TAGLINES: Record<PathKey, string> = {
  A: '…even though the parent note says the 5-year picture is academic',
  B: '…the balance the brief actually describes',
  C: '…location outranks the other anchors',
}

const PATH_WINNERS: Record<PathKey, { name: string; meta: string }> = {
  A: { name: 'Oakham School', meta: 'Rutland · co-ed · full boarding · A-Level' },
  B: { name: 'Bromsgrove School', meta: 'Worcestershire · co-ed · full boarding · A-Level' },
  C: { name: 'King\'s College Taunton', meta: 'Somerset · co-ed · day + boarding · A-Level' },
}

const ALSO_WINS: Record<PathKey, PathKey[]> = { A: [], B: ['C'], C: ['B'] }   // demo consensus B+C

export default function VerdictMockB3V2() {
  return (
    <div className="rr-app">
      <header className="rr-top">
        <div className="rr-top-in">
          <div className="rr-brand-link">
            <span className="rr-brand-text">nana<em>says</em></span>
            <span className="rr-brand-sub">Research Room</span>
          </div>
          <nav className="rr-tabs" aria-label="Research Room tabs">
            <button className="rr-tab" type="button">Child brief</button>
            <button className="rr-tab" type="button">Comparison</button>
            <button className="rr-tab is-active" type="button">Verdict</button>
            <button className="rr-tab" type="button">Partner brief</button>
          </nav>
          <div className="rr-mock-banner-inline">DESIGN MOCK · verdict-mock-b3-v2 · {CHILD_NAME}</div>
        </div>
      </header>

      <div className="rr-shell rr-shell-chat-closed">
        <section className="rr-main">
          <div className="rr-view-pager">
            <div className="rr-view-page">
              <div className="rr-view">

                {/* ─── 3.1 Child name + 3.2 expanded brief callout ─────── */}
                <div className="rr-view-head">
                  <div>
                    <div className="rr-view-eyebrow">Verdict</div>
                    <h1 className="rr-view-title rr-v3v2-title">
                      Three honest paths for <em>{CHILD_NAME}</em>
                    </h1>
                    <p className="rr-view-meta">
                      {CHILD_NAME}&apos;s brief, ranked from all current Research Room evidence. Tap a path to see what fits, what costs you, and what to look at next.
                    </p>
                  </div>
                  <div className="rr-partner-actions">
                    <button type="button" className="rr-brief-action">Regenerate</button>
                  </div>
                </div>

                {/* ─── 3.2 Expanded brief callout — replaces the small chip strip ─── */}
                <section className="rr-v3v2-brief" aria-label={`${CHILD_NAME}'s brief`}>
                  <div className="rr-v3v2-brief-head">
                    <span className="rr-v3v2-brief-eyebrow">Brief that drives this verdict</span>
                    <span className="rr-v3v2-brief-meta">Year 9 · age 13 · A son</span>
                  </div>

                  <div className="rr-v3v2-brief-grid">
                    <div className="rr-v3v2-brief-cell is-anchor">
                      <div className="rr-v3v2-brief-k">Top priority</div>
                      <div className="rr-v3v2-brief-v">Sport · county-level rugby</div>
                    </div>
                    <div className="rr-v3v2-brief-cell is-anchor">
                      <div className="rr-v3v2-brief-k">Boarding</div>
                      <div className="rr-v3v2-brief-v">Full boarding</div>
                    </div>
                    <div className="rr-v3v2-brief-cell">
                      <div className="rr-v3v2-brief-k">Curriculum</div>
                      <div className="rr-v3v2-brief-v">A-Level</div>
                    </div>
                    <div className="rr-v3v2-brief-cell">
                      <div className="rr-v3v2-brief-k">Budget</div>
                      <div className="rr-v3v2-brief-v">£40k</div>
                    </div>
                    <div className="rr-v3v2-brief-cell">
                      <div className="rr-v3v2-brief-k">Location</div>
                      <div className="rr-v3v2-brief-v">Anywhere in UK</div>
                    </div>
                  </div>

                  <div className="rr-v3v2-brief-quote">
                    <span className="rr-v3v2-brief-quote-mark">&ldquo;</span>
                    <p>
                      Jack is a serious rugby player at county level and wants to keep that going through school — eyes on first XV by sixth form. Cricket in summer too, school first XI level. Academically he&apos;s a solid B+ student, no Oxbridge pressure, the academics just need to be reasonable while he focuses on sport. Nonnegotiable: must have a top rugby programme and proper pitches, ideally with national-level fixtures.
                    </p>
                  </div>
                </section>

                {/* ─── Consensus banner + path tiles ──────────────────── */}
                <div className="rr-verdict-consensus" role="status">
                  <span className="rr-verdict-consensus-badge">Strong consensus</span>
                  <span className="rr-verdict-consensus-body">
                    <strong>Bromsgrove School</strong> wins paths <strong>B + C</strong> — same school satisfies multiple framings.
                  </span>
                </div>

                <div className="rr-verdict-selector" role="tablist" aria-label="Verdict paths">
                  {(['A', 'B', 'C'] as PathKey[]).map(letter => {
                    const isActive = letter === ACTIVE_PATH
                    return (
                      <button
                        key={letter}
                        role="tab"
                        aria-selected={isActive}
                        className={`rr-verdict-tile is-tile-${letter.toLowerCase()}${isActive ? ' is-active' : ''}`}
                        type="button"
                      >
                        <div className="rr-verdict-tile-head">
                          <span className="rr-verdict-tile-letter">{letter}</span>
                          <span className="rr-verdict-tile-frame">{PATH_FRAMINGS[letter]}</span>
                        </div>
                        <div className="rr-verdict-tile-school">{PATH_WINNERS[letter].name}</div>
                        {ALSO_WINS[letter].length > 0 && (
                          <div className="rr-verdict-tile-also">Also wins Path {ALSO_WINS[letter].join(' + Path ')}</div>
                        )}
                        <p className="rr-verdict-tile-tagline">{PATH_TAGLINES[letter]}</p>
                      </button>
                    )
                  })}
                </div>

                {/* ─── ACTIVE PATH DETAIL — Path B (Bromsgrove) ────────── */}
                <article className="rr-vb3-detail is-path-b">
                  <div className="rr-vb3-eyebrow">Path B · If you want both, equal weight</div>
                  <h2 className="rr-vb3-school">Bromsgrove School</h2>
                  <div className="rr-vb3-meta">Worcestershire · Co-ed · Full boarding · A-Level</div>

                  {/* Fact ribbon */}
                  <div className="rr-vb3-ribbon">
                    <div className="rr-vb3-ribbon-cell">
                      <div className="rr-vb3-ribbon-label">A-level A*–A</div>
                      <div className="rr-vb3-ribbon-value">61%<small>78% at 9-7 GCSE</small></div>
                    </div>
                    <div className="rr-vb3-ribbon-cell">
                      <div className="rr-vb3-ribbon-label">Type</div>
                      <div className="rr-vb3-ribbon-value">Co-ed<small>A-Level</small></div>
                    </div>
                    <div className="rr-vb3-ribbon-cell">
                      <div className="rr-vb3-ribbon-label">Fees / year</div>
                      <div className="rr-vb3-ribbon-value">£11,754 – £54,342<span className="rr-vb3-pill is-fits">Fits</span></div>
                    </div>
                    <div className="rr-vb3-ribbon-cell">
                      <div className="rr-vb3-ribbon-label">From Heathrow</div>
                      <div className="rr-vb3-ribbon-value">110 mi</div>
                    </div>
                    <div className="rr-vb3-ribbon-cell">
                      <div className="rr-vb3-ribbon-label">Students</div>
                      <div className="rr-vb3-ribbon-value">~1,700<small>55% boarders</small></div>
                    </div>
                  </div>

                  {/* Map */}
                  <div className="rr-vb3-map-block">
                    <iframe
                      className="rr-vb3-map"
                      src="https://maps.google.com/maps?q=Bromsgrove%20School&t=&z=13&ie=UTF8&iwloc=&output=embed"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title="Map of Bromsgrove School"
                    />
                    <div className="rr-vb3-map-caption">
                      <strong>Bromsgrove, Worcestershire</strong> · West Midlands
                      {' · '}<a href="https://maps.google.com/?q=Bromsgrove%20School" target="_blank" rel="noopener">open in Google Maps</a>
                    </div>
                  </div>

                  {/* ─── 3.5 NEW: "Why this fits Jack-test's brief" panel — 6 sub-sections ─── */}
                  <section className="rr-vb3-section is-narrative rr-v3v2-whyfits">
                    <div className="rr-vb3-section-head">
                      <span className="rr-vb3-section-icon">★</span>
                      <h3>Why this fits {CHILD_NAME}&apos;s brief</h3>
                      <span className="rr-vb3-section-sub">advisor&apos;s take</span>
                    </div>

                    {/* (1) Matched against your brief — checklist */}
                    <div className="rr-v3v2-whyfits-sub">
                      <div className="rr-v3v2-whyfits-sub-head">
                        <span className="rr-v3v2-whyfits-sub-num">1</span>
                        <h4>Matched against your brief</h4>
                      </div>
                      <ul className="rr-v3v2-checklist">
                        <li className="is-match"><span className="rr-v3v2-check">✓</span><span><strong>Full boarding</strong> · school offers full boarding, 55% boarders, live-in housemasters</span></li>
                        <li className="is-match"><span className="rr-v3v2-check">✓</span><span><strong>A-Level</strong> · school is A-Level only</span></li>
                        <li className="is-match"><span className="rr-v3v2-check">✓</span><span><strong>~£40k budget</strong> · year-aware mid-range £35k fits inside your cap</span></li>
                        <li className="is-match"><span className="rr-v3v2-check">✓</span><span><strong>Co-ed</strong> · school is co-ed</span></li>
                        <li className="is-match"><span className="rr-v3v2-check">✓</span><span><strong>Location filter open</strong> · Worcestershire works because you said anywhere in UK</span></li>
                        <li className="is-bonus"><span className="rr-v3v2-check">+</span><span><strong>County-level rugby priority</strong> · national-strong rugby programme</span></li>
                        <li className="is-bonus"><span className="rr-v3v2-check">+</span><span><strong>Cricket interest</strong> · 1st XI plays at top-tier independent schools level</span></li>
                      </ul>
                    </div>

                    {/* (2) Your words */}
                    <div className="rr-v3v2-whyfits-sub">
                      <div className="rr-v3v2-whyfits-sub-head">
                        <span className="rr-v3v2-whyfits-sub-num">2</span>
                        <h4>Your words</h4>
                      </div>
                      <blockquote className="rr-v3v2-yourwords">
                        &ldquo;Jack is a serious rugby player at county level and wants to keep that going through school — eyes on first XV by sixth form.&rdquo;
                      </blockquote>
                      <p className="rr-v3v2-yourwords-bridge">
                        Bromsgrove&apos;s rugby and pathway both materially support that goal — the 1st XV regularly plays Wellington, Sherborne, Marlborough.
                      </p>
                    </div>

                    {/* (3) Priority strengths · evidence */}
                    <div className="rr-v3v2-whyfits-sub">
                      <div className="rr-v3v2-whyfits-sub-head">
                        <span className="rr-v3v2-whyfits-sub-num">3</span>
                        <h4>Priority strengths · evidence</h4>
                      </div>
                      <ul className="rr-v3v2-strengths">
                        <li>
                          <span className="rr-v3v2-strength-tag is-priority">Sport (your priority)</span>
                          National-strong rugby — 1st XV plays top-tier independent schools fixtures (Wellington, Sherborne, Marlborough). U18 finalists in 2024.
                          <span className="rr-v3v2-cite">→ <a href="#" target="_blank" rel="noopener">bromsgrove-school.co.uk · sports-centre</a></span>
                        </li>
                        <li>
                          <span className="rr-v3v2-strength-tag">Academic foundation</span>
                          61% A-level A*-A — strongest in your shortlist by a clear margin.
                          <span className="rr-v3v2-cite">→ <a href="#" target="_blank" rel="noopener">bromsgrove-school.co.uk · academic-results</a></span>
                        </li>
                        <li>
                          <span className="rr-v3v2-strength-tag">Full boarding fit</span>
                          Live-in housemasters + housemothers + house tutors; weekly tutor meetings standard.
                          <span className="rr-v3v2-cite">→ <a href="#" target="_blank" rel="noopener">bromsgrove-school.co.uk · boarding</a></span>
                        </li>
                        <li>
                          <span className="rr-v3v2-strength-tag">Cricket</span>
                          1st XI plays at top-tier independent schools level; cricket pitches dedicated.
                          <span className="rr-v3v2-cite">→ <a href="#" target="_blank" rel="noopener">bromsgrove-school.co.uk · sport</a></span>
                        </li>
                      </ul>
                    </div>

                    {/* (4) Personality fit */}
                    <div className="rr-v3v2-whyfits-sub">
                      <div className="rr-v3v2-whyfits-sub-head">
                        <span className="rr-v3v2-whyfits-sub-num">4</span>
                        <h4>Personality fit</h4>
                      </div>
                      <p>
                        Jack reads as driven and goal-oriented with a strong sport identity (county-level rugby, eyes on first XV). Bromsgrove&apos;s house system pairs him with tutors who track sport + academic progress together; mid-week training + weekend fixtures keep momentum without burning him out.
                      </p>
                      <ul className="rr-v3v2-pastoral">
                        <li><strong>11 boarding houses</strong>, each with live-in housemaster + housemother</li>
                        <li><strong>Weekly tutor meeting</strong> — academic + pastoral check-in</li>
                        <li><strong>Wellbeing team</strong> — 4 staff incl. chaplain, counsellor, nurse</li>
                        <li><strong>ISI 2024</strong>: pastoral provision rated &ldquo;outstanding&rdquo;</li>
                      </ul>
                    </div>

                    {/* (5) Where this leads — sixth form */}
                    <div className="rr-v3v2-whyfits-sub">
                      <div className="rr-v3v2-whyfits-sub-head">
                        <span className="rr-v3v2-whyfits-sub-num">5</span>
                        <h4>Where this leads — sixth form &amp; beyond</h4>
                      </div>
                      <div className="rr-v3v2-leads-grid">
                        <div className="rr-v3v2-leads-cell">
                          <div className="rr-v3v2-leads-stat">36%</div>
                          <div className="rr-v3v2-leads-label">to Russell Group universities</div>
                        </div>
                        <div className="rr-v3v2-leads-cell">
                          <div className="rr-v3v2-leads-stat">8</div>
                          <div className="rr-v3v2-leads-label">Oxbridge offers · 2024</div>
                        </div>
                        <div className="rr-v3v2-leads-cell">
                          <div className="rr-v3v2-leads-stat">12</div>
                          <div className="rr-v3v2-leads-label">sport scholars to top-uni programmes</div>
                        </div>
                        <div className="rr-v3v2-leads-cell">
                          <div className="rr-v3v2-leads-stat is-text">Worcester Warriors</div>
                          <div className="rr-v3v2-leads-label">rugby pathway placements in recent leavers</div>
                        </div>
                      </div>
                    </div>

                    {/* (6) About the school — prose overview */}
                    <div className="rr-v3v2-whyfits-sub">
                      <div className="rr-v3v2-whyfits-sub-head">
                        <span className="rr-v3v2-whyfits-sub-num">6</span>
                        <h4>About the school</h4>
                      </div>
                      <p>
                        Bromsgrove School is a co-educational boarding and day school founded in 1553 on a 100-acre campus 13 miles south of Birmingham. It runs Prep (3-13), Senior (13-18), and a substantial international sixth form alongside its main UK cohort. Day pupils sit at 45% of the senior school, with full boarders making up the rest — a deliberately blended community rather than an either/or.
                      </p>
                      <p>
                        Reputation rests on three legs: a strong sport programme (rugby + cricket + hockey all play at top-tier independent fixture level), academic results that pass muster without being pressure-cooker (61% A*-A at A-level), and a pastoral structure that the most recent ISI inspection called &ldquo;outstanding.&rdquo; The campus has full sports facilities (rugby pitches, 25m pool, fitness centre, athletics track) plus a dedicated music school and theatre.
                      </p>
                    </div>

                    {/* (7) ISI inspector said — direct quotes from ISI deep PDF */}
                    <div className="rr-v3v2-whyfits-sub">
                      <div className="rr-v3v2-whyfits-sub-head">
                        <span className="rr-v3v2-whyfits-sub-num">7</span>
                        <h4>What the ISI inspector said</h4>
                        <span className="rr-vb3-section-sub">ISI report · February 2024</span>
                      </div>
                      <ul className="rr-v3v2-isi">
                        <li>
                          <span className="rr-v3v2-isi-tag">Pastoral</span>
                          <blockquote>&ldquo;The school&apos;s pastoral provision is outstanding. Live-in house staff, supplemented by a wellbeing team of four full-time professionals, ensure pupils feel known and supported across the boarding houses.&rdquo;</blockquote>
                        </li>
                        <li>
                          <span className="rr-v3v2-isi-tag">Academic</span>
                          <blockquote>&ldquo;A culture of high academic challenge sits comfortably alongside an unhurried atmosphere — pupils are stretched without being driven into burnout.&rdquo;</blockquote>
                        </li>
                        <li>
                          <span className="rr-v3v2-isi-tag">Co-curricular</span>
                          <blockquote>&ldquo;The sport programme operates at a regional and national level, with significant fixtures lists and visible alumni pathways into university and senior club programmes.&rdquo;</blockquote>
                        </li>
                      </ul>
                      <p className="rr-v3v2-isi-cite">
                        <a href="https://www.isi.net/reports/2024/bromsgrove" target="_blank" rel="noopener">Read full ISI report (PDF) →</a>
                      </p>
                    </div>

                    {/* (8) Location & area context */}
                    <div className="rr-v3v2-whyfits-sub">
                      <div className="rr-v3v2-whyfits-sub-head">
                        <span className="rr-v3v2-whyfits-sub-num">8</span>
                        <h4>Location &amp; area context</h4>
                      </div>
                      <p>
                        <strong>Bromsgrove, Worcestershire</strong> — small market town in the West Midlands. 110 miles from Heathrow (~2h drive). Crime well below national average; most incidents are minor anti-social, not violent. Calm boarding environment, limited urban amenities nearby. <a href="https://www.police.uk/pu/your-area/west-mercia-police/bromsgrove/" target="_blank" rel="noopener">View live crime map →</a>
                      </p>
                    </div>
                  </section>

                  {/* NEW dedicated panel — restored advisor's long-form prose narrative.
                      Separate from "Why this fits" so it stays as the unhurried "read this
                      whole thing" piece, while the 8 sub-sections above are scannable. */}
                  <section className="rr-vb3-section rr-v3v2-advisor">
                    <div className="rr-vb3-section-head">
                      <span className="rr-vb3-section-icon">✎</span>
                      <h3>Advisor&apos;s full take</h3>
                      <span className="rr-vb3-section-sub">long-form</span>
                    </div>
                    <div className="rr-v3v2-advisor-body">
                      <p>
                        Bromsgrove is the only school in your shortlist that scores well across academics, sport, and full boarding at the same time. Where Oakham wins on sport at the cost of academic ceiling, and where Bryanston wins on location at the cost of both, Bromsgrove is the school that asks Jack to compromise least on what your brief actually says — except for one thing, which we&apos;ll get to.
                      </p>
                      <p>
                        On sport specifically: the rugby programme reads as national-strong, with a 1st XV regularly playing Wellington, Sherborne, and Marlborough. For a child whose brief says &ldquo;first XV by sixth form,&rdquo; this is the school that materially supports that goal — there&apos;s a real pathway here, not a hopeful aspiration. Cricket sits at the same fixture tier in summer, so Jack&apos;s second sport is also covered. We see Worcester Warriors pathway placements in recent leavers; those don&apos;t happen by accident.
                      </p>
                      <p>
                        Academically, <strong>61% of A-level grades are A*-A</strong> — the strongest in your shortlist by a clear margin. For a &ldquo;solid B+ student, no Oxbridge pressure&rdquo; brief, this means Jack will be in a cohort that takes academics seriously without making it the entire identity. The ISI report&apos;s phrasing — &ldquo;stretched without being driven into burnout&rdquo; — is the exact tone your brief asks for.
                      </p>
                      <p>
                        Full boarding offered with live-in housemasters, housemothers, and house tutors; weekly tutor meetings are standard. The ISI 2024 inspection called pastoral provision &ldquo;outstanding.&rdquo; Fees mid-range comfortably inside your £30-40k budget at boarding entry, with the upper band reaching senior years — workable for Year 9 entry.
                      </p>
                      <p>
                        <strong>The honest cost:</strong> location. Bromsgrove is in Worcestershire, not the south-west. You said &ldquo;anywhere in the UK&rdquo; in your brief so this isn&apos;t a deal-breaker — but if you have unstated preference for staying south-west, this fails it. The 30% international student body is also worth a weekend visit before committing; it&apos;s the highest in your shortlist and changes the weekend boarding culture.
                      </p>
                    </div>
                  </section>

                  {/* ─── Existing panels below (kept as-is) ───────────────── */}
                  <section className="rr-vb3-section is-evidence">
                    <div className="rr-vb3-section-head">
                      <span className="rr-vb3-section-icon">✓</span>
                      <h3>Why we picked this — evidence we used</h3>
                      <span className="rr-vb3-section-sub">5 citations</span>
                    </div>
                    <ul className="rr-vb3-evidence-list">
                      <li><span><span className="rr-vb3-evidence-row">A-level A*–A:</span> 61% — strongest in your shortlist.<span className="rr-vb3-evidence-cite">→ <a href="#" target="_blank" rel="noopener">bromsgrove-school.co.uk · academic-results</a></span></span></li>
                      <li><span><span className="rr-vb3-evidence-row">Rugby strength:</span> National-strong rugby programme.<span className="rr-vb3-evidence-cite">→ <a href="#" target="_blank" rel="noopener">bromsgrove-school.co.uk · sports-centre</a></span></span></li>
                      <li><span><span className="rr-vb3-evidence-row">Boarding house structure:</span> Live-in housemasters, housemothers, house tutors.<span className="rr-vb3-evidence-cite">→ <a href="#" target="_blank" rel="noopener">bromsgrove-school.co.uk · boarding</a></span></span></li>
                      <li><span><span className="rr-vb3-evidence-row">Annual boarding fee:</span> £11,754 – £54,342 (mid-range inside £40k cap).<span className="rr-vb3-evidence-cite">→ school-extracted fees data</span></span></li>
                    </ul>
                  </section>

                  <section className="rr-vb3-section is-cost">
                    <div className="rr-vb3-section-head">
                      <span className="rr-vb3-section-icon">!</span>
                      <h3>Honest costs of this path</h3>
                      <span className="rr-vb3-section-sub">3 items</span>
                    </div>
                    <ul className="rr-vb3-cost-list">
                      <li><strong>Location.</strong> Worcestershire — West Midlands, not south-west. 110 miles from Heathrow.</li>
                      <li><strong>International student body.</strong> 30% international — highest in your shortlist. Could be fit-positive (diverse) or fit-negative (specific cultural feel).</li>
                      <li><strong>Day pupil ratio.</strong> 45% day — meaningful for a boarder. Confirm weekend culture before deciding.</li>
                    </ul>
                  </section>

                  <section className="rr-vb3-section is-consider">
                    <div className="rr-vb3-section-head">
                      <span className="rr-vb3-section-icon">?</span>
                      <h3>Things to think about before deciding</h3>
                    </div>
                    <ul className="rr-vb3-consider-list">
                      <li>If a south-west visit is doable, check King&apos;s Taunton too — the literal south-west pick.</li>
                      <li>30% international body — visit on a weekend to feel the boarding culture before committing.</li>
                      <li>Rugby academy pathway timing — when does Jack want to commit to a club, and does that align with Bromsgrove&apos;s 1st XV trajectory?</li>
                    </ul>
                  </section>
                </article>

                <div className="rr-verdict-confidence">
                  <span>Confidence: <strong className=" is-medium">medium</strong></span>
                  <span>Sources: <strong>15</strong></span>
                  <span>Updated: <strong>23 May 2026, 14:02</strong></span>
                </div>

              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
