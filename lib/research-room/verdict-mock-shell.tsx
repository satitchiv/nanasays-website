'use client'

import { useState, type ReactNode } from 'react'
import { PATHS, TILE_TAGLINE, type PathKey, type PathFacts } from './verdict-mock-data'

type Props = {
  variantSlug:    'b1' | 'b2' | 'b3'
  variantLabel:   string                       // e.g. "Stats grid + narrative below"
  renderDetail:   (path: PathFacts) => ReactNode
}

const VARIANT_LINKS: Array<{ slug: 'b1' | 'b2' | 'b3'; label: string }> = [
  { slug: 'b1', label: 'B1 · Stats grid' },
  { slug: 'b2', label: 'B2 · Stats sidebar' },
  { slug: 'b3', label: 'B3 · Fact ribbon' },
]

export default function VerdictMockShell({ variantSlug, variantLabel, renderDetail }: Props) {
  const [selected, setSelected] = useState<PathKey>('B')
  const activePath = PATHS[selected]

  return (
    <div className="rr-app">
      <div className="rr-mock-banner">
        Verdict tab — design mock <em>· Layout {variantSlug.toUpperCase()} · {variantLabel}</em> · Theo session
      </div>

      <nav className="rr-mock-switcher" aria-label="Compare layouts">
        <strong>Base:</strong>
        <a href="/nana/research-room/verdict-mock-a">A · Triptych</a>
        <a href="/nana/research-room/verdict-mock">B · Selector</a>
        <a href="/nana/research-room/verdict-mock-c">C · Editorial</a>
        <strong style={{ marginLeft: '14px' }}>B variants:</strong>
        {VARIANT_LINKS.map(v => (
          <a
            key={v.slug}
            href={`/nana/research-room/verdict-mock-${v.slug}`}
            className={v.slug === variantSlug ? 'is-active' : undefined}
          >
            {v.label}
          </a>
        ))}
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
                  Three honest paths,<br /><em>pick the one that fits.</em>
                </h1>
                <p className="rr-view-meta">
                  Theo&apos;s brief gives us two anchors — sport priority and an academic 5-year picture
                  — plus a south-west location filter. Tap a path below to see the full picture for
                  that school: what fits, what costs you, and what to look at next.
                </p>
              </div>
              <div className="rr-partner-actions">
                <button type="button" className="rr-brief-action">Regenerate</button>
              </div>
            </div>

            <section className="rr-verdict-brief-strip" aria-label="Theo&apos;s brief">
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

            {/* Selector tiles */}
            <div className="rr-verdict-selector" role="tablist" aria-label="Verdict paths">
              {(['A', 'B', 'C'] as PathKey[]).map(letter => {
                const path = PATHS[letter]
                const isActive = selected === letter
                return (
                  <button
                    key={letter}
                    role="tab"
                    aria-selected={isActive}
                    className={`rr-verdict-tile is-tile-${letter.toLowerCase()}${isActive ? ' is-active' : ''}`}
                    onClick={() => setSelected(letter)}
                    type="button"
                  >
                    <div className="rr-verdict-tile-head">
                      <span className="rr-verdict-tile-letter">{letter}</span>
                      <span className="rr-verdict-tile-frame">{path.framing}</span>
                    </div>
                    <div className="rr-verdict-tile-school">{path.schoolName}</div>
                    <p className="rr-verdict-tile-tagline">{TILE_TAGLINE[letter]}</p>
                  </button>
                )
              })}
            </div>

            {/* Variant-specific detail panel */}
            {renderDetail(activePath)}

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
                  lowest boarding entry point.
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
