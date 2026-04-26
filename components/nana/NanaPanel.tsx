'use client'

/**
 * NanaPanel — the parent-facing chatbot panel inside the deep school report.
 *
 * Visual style: Style 1B (document grade) per the chosen mock at
 * /mocks/style-1b-document.html. Right-edge slide-out, 560px wide on desktop,
 * cream paper background, Lora serif headings, footnote-style citations.
 *
 * The panel is non-modal: it coexists with the report. When open, the
 * report page gets right-padding so its content shifts left to make room
 * for the panel — no dim overlay, no click blocking.
 *
 * Backend: streams from /api/nana-parent-chatbot/[slug] via SSE
 * (retrieval → token* → final). Parses the final event and renders the
 * structured answer.
 */

import { useState, useRef, FormEvent, useEffect } from 'react'
import './nana-panel.css'

type Source = {
  section_id?: string
  section_label?: string
  source_url?: string
  source_type?: string
}

type ComparisonTable = {
  title: string
  columns: string[]
  rows: string[][]
  highlight_row_index: number | null
  footer: string
}

type ParsedAnswer = {
  answer_markdown?: string
  sections?: {
    short_answer?: string
    confirmed_facts?: string
    what_this_means?: string
    tradeoff?: string
    what_we_dont_know?: string
    sources?: string
    you_might_also_ask?: string
  }
  evidence?: {
    facts?: string[]
    interpretations?: string[]
    tradeoffs?: string[]
    unknowns?: string[]
  }
  sources_used?: Source[]
  follow_ups?: string[]
  tour_question?: string | null
  tour_target?: string | null
  comparison_table?: ComparisonTable | null
  confidence?: 'high' | 'medium' | 'low' | 'none'
}

type FinalPayload = {
  parsed: ParsedAnswer | null
  validationIssues: string[]
  claudeMs: number
  totalMs: number
  cost?: { total_usd: number } | null
}

type StreamEvent =
  | { type: 'retrieval'; payload: any }
  | { type: 'token'; text: string }
  | { type: 'final'; payload: FinalPayload }
  | { type: 'error'; error: string; code: string }

type Props = { slug: string; schoolName?: string }

export default function NanaPanel({ slug, schoolName = 'this school' }: Props) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [retrievalReady, setRetrievalReady] = useState(false)
  const [tokenCount, setTokenCount] = useState(0)
  const [final, setFinal] = useState<FinalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [askedQuestion, setAskedQuestion] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Toggle a body class so report-page CSS can shift content over to make
  // room for the panel.
  useEffect(() => {
    if (open) document.body.classList.add('nana-panel-open')
    else document.body.classList.remove('nana-panel-open')
    return () => document.body.classList.remove('nana-panel-open')
  }, [open])

  // Lora font load (idempotent — fine if it lands twice across the page)
  useEffect(() => {
    if (document.querySelector('link[data-nana-fonts]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.dataset.nanaFonts = 'true'
    link.href =
      'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&display=swap'
    document.head.appendChild(link)
  }, [])

  function reset() {
    setRetrievalReady(false)
    setTokenCount(0)
    setFinal(null)
    setError(null)
  }

  async function ask(e?: FormEvent, override?: string) {
    e?.preventDefault()
    const q = (override ?? question).trim()
    if (!q || streaming) return

    reset()
    setAskedQuestion(q)
    setQuestion('')
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`/api/nana-parent-chatbot/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const text = !res.ok ? await res.text() : '(no response body)'
        setError(`Request failed (${res.status}): ${text.slice(0, 200)}`)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let sep
        while ((sep = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, sep)
          buf = buf.slice(sep + 2)
          const dataLines = block
            .split('\n')
            .filter((l) => l.startsWith('data: '))
            .map((l) => l.slice(6))
          if (!dataLines.length) continue
          let evt: StreamEvent
          try {
            evt = JSON.parse(dataLines.join('\n')) as StreamEvent
          } catch {
            continue
          }
          dispatch(evt)
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setError('Network error: ' + (e?.message ?? String(e)))
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function dispatch(evt: StreamEvent) {
    switch (evt.type) {
      case 'retrieval':
        setRetrievalReady(true)
        break
      case 'token':
        // We don't show raw tokens to the user — just bump a counter so we
        // can show "drafting…" and an animated dot indicator. Final answer
        // renders in one go when the `final` event arrives.
        setTokenCount((n) => n + 1)
        break
      case 'final':
        setFinal(evt.payload)
        break
      case 'error':
        setError(`[${evt.code}] ${evt.error}`)
        break
    }
  }

  return (
    <>
      {/* Closed-state handle */}
      {!open && (
        <button
          aria-label="Ask Nana"
          className="nana-handle"
          onClick={() => setOpen(true)}
        >
          <span className="nana-handle-pulse" />
          <span className="nana-handle-text">ASK NANA</span>
        </button>
      )}

      {/* Open panel — non-modal, no dim overlay */}
      {open && (
        <aside className="nana-panel">
          <header className="nana-header">
            <span className="nana-pulse" />
            <h2 className="nana-title">Nana</h2>
            <span className="nana-sub">reading {schoolName}</span>
            <button
              className="nana-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </header>

          <div className="nana-body">
            {!askedQuestion && !streaming && (
              <Hero
                schoolName={schoolName}
                onPick={(q) => ask(undefined, q)}
              />
            )}

            {askedQuestion && (
              <QuestionBlock question={askedQuestion} />
            )}

            {streaming && !final && (
              <StreamingState
                retrievalReady={retrievalReady}
                tokenCount={tokenCount}
              />
            )}

            {final?.parsed && <AnswerLayout parsed={final.parsed} />}

            {error && (
              <div className="nana-error">
                <strong>Something went wrong.</strong>
                <div>{error}</div>
              </div>
            )}
          </div>

          <form className="nana-input" onSubmit={(e) => ask(e)}>
            <input
              type="text"
              placeholder={
                askedQuestion ? `Ask another question…` : `Ask about ${schoolName}…`
              }
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={streaming}
            />
            <button type="submit" disabled={streaming || !question.trim()}>
              {streaming ? '…' : 'Ask'}
            </button>
          </form>
        </aside>
      )}
    </>
  )
}

// ── Hero (State 0) ───────────────────────────────────────────────────────────
function Hero({
  schoolName,
  onPick,
}: {
  schoolName: string
  onPick: (q: string) => void
}) {
  const starters = [
    `What are ${schoolName}'s fees?`,
    `Will my son be happy at ${schoolName}?`,
    `What's it really like to be a pupil here?`,
  ]
  return (
    <div className="nana-hero">
      <div className="nana-hero-greeting">Hi — I'm Nana.</div>
      <div className="nana-hero-claim">
        I've read this entire report and every page of {schoolName}'s public site.
        Ask me anything — I'll show you exactly where the answer came from.
      </div>
      <div className="nana-hero-starters-label">PARENTS USUALLY START WITH</div>
      <div className="nana-hero-starters">
        {starters.map((s, i) => (
          <button
            key={i}
            className="nana-starter"
            onClick={() => onPick(s)}
          >
            <span>{s}</span>
            <span className="nana-starter-arrow">→</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Question block ───────────────────────────────────────────────────────────
function QuestionBlock({ question }: { question: string }) {
  return <div className="nana-question">{question}</div>
}

// ── Streaming — clean "Reading..." status, no raw JSON ──────────────────────
function StreamingState({
  retrievalReady,
  tokenCount,
}: {
  retrievalReady: boolean
  tokenCount: number
}) {
  let status = 'Searching the data…'
  if (retrievalReady && tokenCount === 0) status = 'Reading and drafting…'
  if (retrievalReady && tokenCount > 0) status = 'Writing your answer…'
  return (
    <div className="nana-streaming">
      <div className="nana-streaming-status">{status}</div>
      <div className="nana-streaming-progress">
        <span className="nana-streaming-dot"></span>
        <span className="nana-streaming-dot"></span>
        <span className="nana-streaming-dot"></span>
      </div>
    </div>
  )
}

// ── Final answer layout (Style 1B) ───────────────────────────────────────────
function AnswerLayout({ parsed }: { parsed: ParsedAnswer }) {
  const s = parsed.sections || {}
  const sources = parsed.sources_used || []
  const followUps = parsed.follow_ups || []

  return (
    <article className="nana-answer">
      {s.short_answer && (
        <>
          <div className="nana-eyebrow">Short Answer</div>
          <p className="nana-short-answer">{s.short_answer}</p>
        </>
      )}

      {s.confirmed_facts && !isEmpty(s.confirmed_facts) && (
        <>
          <div className="nana-eyebrow">Confirmed Facts</div>
          <div
            className="nana-prose"
            dangerouslySetInnerHTML={{ __html: renderInlineMd(s.confirmed_facts) }}
          />
        </>
      )}

      {parsed.comparison_table && parsed.comparison_table.rows?.length > 0 && (
        <ComparisonTableView t={parsed.comparison_table} />
      )}

      {s.what_this_means && !isEmpty(s.what_this_means) && (
        <>
          <div className="nana-eyebrow">What This Means</div>
          <div
            className="nana-prose"
            dangerouslySetInnerHTML={{ __html: renderInlineMd(s.what_this_means) }}
          />
        </>
      )}

      {s.tradeoff && !isEmpty(s.tradeoff) && (
        <>
          <div className="nana-eyebrow nana-amber">⚠ Tradeoff / Watch-Out</div>
          <div
            className="nana-tradeoff"
            dangerouslySetInnerHTML={{ __html: renderInlineMd(s.tradeoff) }}
          />
        </>
      )}

      {parsed.tour_question && (
        <div className="nana-tour-card">
          <div className="nana-eyebrow">Your Tour Question</div>
          <div className="nana-tour-q">{parsed.tour_question}</div>
          {parsed.tour_target && (
            <>
              <div className="nana-tour-who-label">Who to ask</div>
              <div className="nana-tour-who">{parsed.tour_target}</div>
            </>
          )}
        </div>
      )}

      {s.what_we_dont_know && !isEmpty(s.what_we_dont_know) && (
        <>
          <div className="nana-eyebrow">What We Don't Know</div>
          <div
            className="nana-prose"
            dangerouslySetInnerHTML={{ __html: renderInlineMd(s.what_we_dont_know) }}
          />
        </>
      )}

      {sources.length > 0 && (
        <>
          <div className="nana-eyebrow">Sources</div>
          <div className="nana-sources">
            {sources.map((src, i) => {
              const isExt = !!src.source_url
              const label =
                src.section_label || src.section_id || src.source_url || 'source'
              if (isExt) {
                return (
                  <a
                    key={i}
                    href={src.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nana-pill nana-pill-ext"
                  >
                    {label} ↗
                  </a>
                )
              }
              return (
                <span key={i} className="nana-pill">
                  {label} ↑
                </span>
              )
            })}
          </div>
        </>
      )}

      {followUps.length > 0 && (
        <>
          <div className="nana-eyebrow">You Might Also Ask</div>
          <div className="nana-followups">
            {followUps.map((q, i) => (
              <div key={i} className="nana-followup">
                {q}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="nana-closer">
        Want me to dig into any of this further? — Nana
      </div>
    </article>
  )
}

function ComparisonTableView({ t }: { t: ComparisonTable }) {
  return (
    <div className="nana-table">
      <div className="nana-table-title">{t.title}</div>
      <table>
        {t.columns?.length && (
          <thead>
            <tr>
              {t.columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {t.rows.map((row, i) => (
            <tr key={i} className={i === t.highlight_row_index ? 'highlight' : ''}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {t.footer && <div className="nana-table-footer">{t.footer}</div>}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function isEmpty(s?: string) {
  if (!s) return true
  const t = s.trim().toLowerCase()
  return t === 'nothing to flag here' || t === 'nothing to flag here.'
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderInlineMd(text: string): string {
  let out = escHtml(text)
  // Inline source pills: [Section ↑] or [domain ↗]
  out = out.replace(/\[([^\]]+?)\s*([↑↗])\]/g, (_, label, arrow) => {
    const isExt = arrow === '↗'
    return `<span class="nana-inline-pill${isExt ? ' nana-inline-pill-ext' : ''}">${label.trim()} ${arrow}</span>`
  })
  // Bold
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  // Italic
  out = out.replace(
    /(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g,
    '$1<em>$2</em>'
  )
  // Newlines → <br>
  out = out.replace(/\n/g, '<br>')
  return out
}
