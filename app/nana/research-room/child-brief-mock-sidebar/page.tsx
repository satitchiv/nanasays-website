'use client'

// Child brief sidebar sketch (3.3).
//
// Pure layout sketch — shows the proposed three-column arrangement:
//   LEFT  : child cards stacked vertically (current behavior)
//   MIDDLE: NEW sticky jump-to-child sidebar (3.3)
//   RIGHT : Nana chat rail (unchanged)
//
// Hardcoded with 3 children to show the multi-child scroll problem the
// sidebar solves. Click a name in the middle sidebar → smooth-scroll to
// that child's card on the left.
//
// Navigate to: http://100.100.120.57:3003/nana/research-room/child-brief-mock-sidebar

import { useState } from 'react'
import '@/components/nana/research-room.css'
import './child-brief-mock-sidebar.css'

const CHILDREN = [
  { id: 'jack',  name: 'Jack-test',  year: 'Year 9',  age: 13, status: 'active'  as const, sessionLabel: 'Has live shortlist · Path B winner: Bromsgrove' },
  { id: 'yoko',  name: 'Yoko',       year: 'Year 7',  age: 11, status: 'draft'   as const, sessionLabel: 'Brief in progress · no verdict yet' },
  { id: 'theo',  name: 'Theo',       year: 'Year 10', age: 14, status: 'archived' as const, sessionLabel: 'Archived · last touched 2026-03-10' },
]

export default function ChildBriefMockSidebar() {
  const [activeId, setActiveId] = useState<string>('jack')
  const [chatOpen, setChatOpen] = useState<boolean>(true)   // open by default so the chat-open state is visible on load

  function jumpTo(id: string) {
    setActiveId(id)
    const el = document.getElementById(`child-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="rr-app">
      <header className="rr-top">
        <div className="rr-top-in">
          <div className="rr-brand-link">
            <span className="rr-brand-text">nana<em>says</em></span>
            <span className="rr-brand-sub">Research Room</span>
          </div>
          <nav className="rr-tabs" aria-label="Research Room tabs">
            <button className="rr-tab is-active" type="button">Child brief</button>
            <button className="rr-tab" type="button">Comparison</button>
            <button className="rr-tab" type="button">Verdict</button>
            <button className="rr-tab" type="button">Partner brief</button>
          </nav>
          <div className="rr-cbms-banner">
            DESIGN MOCK · child-brief-sidebar
            <button
              type="button"
              className="rr-cbms-chat-toggle"
              onClick={() => setChatOpen(o => !o)}
            >
              Chat {chatOpen ? 'OPEN' : 'CLOSED'} · toggle
            </button>
          </div>
        </div>
      </header>

      <div className={`rr-cbms-layout${chatOpen ? ' is-chat-open' : ''}`}>
        {/* LEFT — child cards stacked (current behavior) */}
        <section className="rr-cbms-cards">
          <h1 className="rr-cbms-title">Your children</h1>
          <p className="rr-cbms-intro">Each child has their own brief. Use the sidebar to jump between them.</p>

          {CHILDREN.map(c => (
            <article
              key={c.id}
              id={`child-${c.id}`}
              className={`rr-cbms-card${activeId === c.id ? ' is-active' : ''}`}
            >
              <header className="rr-cbms-card-head">
                <h2>{c.name}</h2>
                <span className={`rr-cbms-status is-${c.status}`}>{c.status}</span>
              </header>
              <p className="rr-cbms-card-meta">{c.year} · age {c.age} · {c.sessionLabel}</p>
              <div className="rr-cbms-card-body">
                <p>BASICS · SCHOOL · PRIORITIES · IN THEIR OWN WORDS · PERSONALITY · ANCHORS</p>
                <p className="rr-cbms-card-placeholder">[ Full brief sections render here in the real page — scroll within this card to fill it in, or click another child in the sidebar to jump. ]</p>
                <p className="rr-cbms-card-placeholder">[ This card is intentionally tall in the mock to demonstrate the &ldquo;scroll 3-5 times to reach next child&rdquo; problem the sidebar solves. ]</p>
                <div className="rr-cbms-card-spacer" />
                <div className="rr-cbms-card-spacer" />
                <div className="rr-cbms-card-spacer" />
              </div>
            </article>
          ))}
        </section>

        {/* MIDDLE — NEW sticky jump-to-child sidebar (3.3) */}
        <aside className="rr-cbms-sidebar" aria-label="Jump to child">
          <div className="rr-cbms-sidebar-head">Jump to child</div>
          <ul className="rr-cbms-sidebar-list">
            {CHILDREN.map(c => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`rr-cbms-sidebar-item is-${c.status}${activeId === c.id ? ' is-active' : ''}`}
                  onClick={() => jumpTo(c.id)}
                  data-initials={c.name.split('-')[0].slice(0, 2).toUpperCase()}
                  title={c.name}
                >
                  <span className="rr-cbms-sidebar-name">{c.name}</span>
                  <span className="rr-cbms-sidebar-sub">
                    {c.year} · age {c.age}
                  </span>
                  <span className={`rr-cbms-sidebar-pill is-${c.status}`}>{c.status}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="rr-cbms-sidebar-foot">
            <button type="button" className="rr-cbms-sidebar-add">+ Add child</button>
          </div>
        </aside>

        {/* RIGHT — Nana chat rail (toggleable in mock) */}
        <aside
          className={`rr-cbms-chat${chatOpen ? ' is-open' : ''}`}
          aria-label={chatOpen ? 'Ask Nana (open)' : 'Ask Nana (collapsed)'}
        >
          {chatOpen ? (
            <div className="rr-cbms-chat-open">
              <div className="rr-cbms-chat-open-head">
                <div className="rr-cbms-chat-avatar-sm" />
                <div>
                  <div className="rr-cbms-chat-open-name">Nana</div>
                  <div className="rr-cbms-chat-open-status">Answering · about Jack-test</div>
                </div>
                <button type="button" className="rr-cbms-chat-close" onClick={() => setChatOpen(false)}>×</button>
              </div>
              <div className="rr-cbms-chat-open-body">
                <p>What would you like to know about the schools on your shortlist?</p>
                <p className="rr-cbms-chat-placeholder">[ Chat thread renders here — messages, suggestions, candidate cards. ]</p>
                <div className="rr-cbms-chat-input">
                  <input type="text" placeholder="Ask Nana about these schools..." />
                  <button type="button">Ask</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="rr-cbms-chat-avatar" />
              <div className="rr-cbms-chat-label">ASK NANA</div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
