'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { DemoQuestion, DemoAnswer, DemoComparisonTable } from '@/lib/demo-questions'
import './demo.css'

interface Props {
  slug: string
  schoolName: string
  heroImage: string | null
  questions: DemoQuestion[]
  demoAnswers: Record<string, DemoAnswer>
}

// ── Markdown renderer (mirrors NanaFullScreen) ───────────────────────────────

function renderMd(text: string): React.ReactNode[] {
  if (!text) return []
  return text.split('\n').map((line, i, arr) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    return (
      <span key={i}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : <span key={j}>{p}</span>
        )}
        {i < arr.length - 1 && <br />}
      </span>
    )
  })
}

// ── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: string }) {
  const labels: Record<string, string> = {
    high: 'High confidence', medium: 'Medium confidence',
    low: 'Low confidence', none: 'No data',
  }
  return (
    <span className={`demo-conf demo-conf--${level}`}>
      {labels[level] ?? level}
    </span>
  )
}

// ── Comparison table ─────────────────────────────────────────────────────────

function ComparisonTable({ table }: { table: DemoComparisonTable }) {
  // Normalise both table formats into { headers, rows }
  const headers: string[] = table.columns ?? table.headers ?? []
  const rawRows = table.rows ?? []
  const rows: string[][] = rawRows.map(r =>
    Array.isArray(r) ? r : [r.label, ...(r as any).values]
  )
  if (!headers.length || !rows.length) return null

  return (
    <div className="demo-table-wrap">
      {table.title && <div className="demo-table-title">{table.title}</div>}
      <table className="demo-table">
        <thead>
          <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                j === 0
                  ? <td key={j} className="demo-table-label">{cell}</td>
                  : <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.footer && <div className="demo-table-footer">{table.footer}</div>}
    </div>
  )
}

// ── Answer display ───────────────────────────────────────────────────────────

function AnswerDisplay({
  question,
  answer,
  revealed,
}: {
  question: string
  answer: DemoAnswer
  revealed: boolean
}) {
  const s = answer.sections

  return (
    <div className="demo-answer">
      <div className="demo-answer-q">{question}</div>
      <div className="demo-answer-meta">
        <ConfidenceBadge level={answer.confidence} />
        <span className="demo-answer-tag">Free preview</span>
      </div>

      {s.short_answer && (
        <div className={`demo-section demo-section--lead ${revealed ? 'demo-section--in' : ''}`}>
          <div className="demo-eyebrow">Short Answer</div>
          <p className="demo-short">{renderMd(s.short_answer)}</p>
        </div>
      )}

      {revealed && s.confirmed_facts && (
        <div className="demo-section demo-section--in">
          <div className="demo-eyebrow">Confirmed Facts</div>
          <p className="demo-prose">{renderMd(s.confirmed_facts)}</p>
        </div>
      )}

      {revealed && answer.comparison_table && (
        <div className="demo-section demo-section--in">
          <div className="demo-eyebrow">At a Glance</div>
          <ComparisonTable table={answer.comparison_table} />
        </div>
      )}

      {revealed && s.what_this_means && s.what_this_means !== 'Nothing to flag here.' && (
        <div className="demo-section demo-section--in">
          <div className="demo-eyebrow">What This Means for Parents</div>
          <p className="demo-prose">{renderMd(s.what_this_means)}</p>
        </div>
      )}

      {revealed && s.tradeoff && s.tradeoff !== 'Nothing to flag here.' && (
        <div className="demo-section demo-section--in">
          <div className="demo-eyebrow">Trade-off to Know</div>
          <p className="demo-prose">{renderMd(s.tradeoff)}</p>
        </div>
      )}

      {revealed && s.what_we_dont_know && s.what_we_dont_know !== 'Nothing to flag here.' && (
        <div className="demo-section demo-section--in">
          <div className="demo-eyebrow">What We Don't Know</div>
          <p className="demo-prose demo-prose--muted">{renderMd(s.what_we_dont_know)}</p>
        </div>
      )}

      {revealed && answer.tour_question && (
        <div className="demo-tour-q">
          <span className="demo-tour-icon">🗣</span>
          <div>
            <div className="demo-tour-label">Question to ask on the tour</div>
            <div className="demo-tour-text">&ldquo;{answer.tour_question}&rdquo;</div>
            {answer.tour_target && (
              <div className="demo-tour-target">Ask: {answer.tour_target}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Typewriter hook — animates a reveal flag after a delay ───────────────────

function useTypewriter(active: boolean, totalMs = 1800): boolean {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    if (!active) { setRevealed(false); return }
    const t = setTimeout(() => setRevealed(true), totalMs)
    return () => clearTimeout(t)
  }, [active, totalMs])
  return revealed
}

// ── Main component ───────────────────────────────────────────────────────────

export default function NanaDemoClient({ slug, schoolName, questions, demoAnswers }: Props) {
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') ?? questions[0]?.id ?? ''
  const [activeId, setActiveId] = useState(initialQ)
  const [showUnlock, setShowUnlock] = useState(false)
  const [inputLocked, setInputLocked] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)

  const activeQ = questions.find(q => q.id === activeId) ?? questions[0]
  const activeAnswer = demoAnswers[activeId] ?? null
  const hasAnswer = !!activeAnswer
  const revealed = useTypewriter(hasAnswer, 1600)

  // Show unlock banner after answer is fully revealed
  useEffect(() => {
    if (!revealed) { setShowUnlock(false); return }
    const t = setTimeout(() => setShowUnlock(true), 400)
    return () => clearTimeout(t)
  }, [revealed])

  // Scroll to top of main area when question changes
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    setShowUnlock(false)
  }, [activeId])

  function handlePillClick(id: string) {
    setActiveId(id)
    // Update URL without navigation
    const url = new URL(window.location.href)
    url.searchParams.set('q', id)
    window.history.replaceState({}, '', url.toString())
  }

  return (
    <div className="demo-shell">

      {/* Header */}
      <header className="demo-header">
        <Link href={`/schools/${slug}`} className="demo-back">← {schoolName}</Link>
        <div className="demo-header-center">
          <span className="demo-pulse" />
          <span className="demo-header-label">Nana</span>
          <span className="demo-header-mode">FREE DEMO</span>
        </div>
        <Link href="/unlock" className="demo-header-unlock">Unlock £39/mo →</Link>
      </header>

      {/* Question pills */}
      <div className="demo-pills-bar">
        <div className="demo-pills-label">Try a question:</div>
        <div className="demo-pills">
          {questions.map(q => (
            <button
              key={q.id}
              className={`demo-pill ${activeId === q.id ? 'demo-pill--active' : ''}`}
              onClick={() => handlePillClick(q.id)}
            >
              <span className="demo-pill-emoji">{q.emoji}</span>
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="demo-body" ref={mainRef}>
        <div className="demo-main">

          {/* Loading shimmer while "streaming" */}
          {hasAnswer && !revealed && (
            <div className="demo-streaming">
              <div className="demo-streaming-dot" />
              <div className="demo-streaming-dot" />
              <div className="demo-streaming-dot" />
              <span className="demo-streaming-label">Nana is thinking…</span>
            </div>
          )}

          {/* No cached answer yet */}
          {!hasAnswer && (
            <div className="demo-no-answer">
              <div className="demo-no-answer-icon">🔬</div>
              <div className="demo-no-answer-title">Generating demo answer…</div>
              <p className="demo-no-answer-body">
                This question&apos;s demo is being prepared. Try another question while you wait.
              </p>
            </div>
          )}

          {/* Answer */}
          {hasAnswer && activeQ && (
            <AnswerDisplay
              question={activeQ.question}
              answer={activeAnswer}
              revealed={revealed}
            />
          )}

          {/* Unlock CTA banner — appears after answer */}
          {showUnlock && (
            <div className="demo-unlock-banner">
              <div className="demo-unlock-inner">
                <div className="demo-unlock-left">
                  <div className="demo-unlock-title">That&apos;s just one question.</div>
                  <p className="demo-unlock-body">
                    Nana can answer <em>anything</em> about {schoolName} — or compare it to
                    any of our <strong>140 UK schools</strong>. Ask your own questions,
                    build a shortlist, and get tour prep in minutes.
                  </p>
                </div>
                <div className="demo-unlock-right">
                  <Link href="/unlock" className="demo-unlock-btn">
                    Unlock full access
                    <span className="demo-unlock-price">£39 / month</span>
                  </Link>
                  <div className="demo-unlock-note">Cancel any time · No contract</div>
                </div>
              </div>
            </div>
          )}

          {/* Spacer so content isn't hidden behind input bar */}
          <div style={{ height: 120 }} />
        </div>
      </div>

      {/* Locked input bar */}
      <div className="demo-input-bar">
        <button
          className="demo-input-locked"
          onClick={() => setInputLocked(true)}
        >
          <span className="demo-input-lock-icon">🔒</span>
          <span className="demo-input-placeholder">Ask Nana your own question about {schoolName}…</span>
        </button>
        <Link href="/unlock" className="demo-input-cta">
          Unlock
        </Link>

        {/* Tooltip on click */}
        {inputLocked && (
          <div className="demo-input-tooltip">
            <button className="demo-input-tooltip-close" onClick={() => setInputLocked(false)}>✕</button>
            <div className="demo-input-tooltip-title">Unlock to ask anything</div>
            <p className="demo-input-tooltip-body">
              Full access lets you ask unlimited questions about {schoolName} and
              compare with 139 other UK schools.
            </p>
            <Link href="/unlock" className="demo-input-tooltip-btn" onClick={() => setInputLocked(false)}>
              Get full access — £39/month →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
