'use client'

/**
 * NanaPanel — the parent-facing chatbot panel inside the deep school report.
 *
 * Visual style: Style 1B (document grade) per the chosen mock at
 * /mocks/style-1b-document.html. Right-edge slide-out, 560px wide on desktop,
 * cream paper background, Lora serif headings, footnote-style citations.
 *
 * Backend: streams from /api/nana-parent-chatbot/[slug] via SSE
 * (retrieval → token* → final). Parses the final event and renders the
 * structured answer (sections, comparison_table, sources_used, follow_ups,
 * tour_question).
 *
 * v1 scope: State 0 (closed handle + open hero), State 2 (answer). Not yet
 * built: searching constellation animation, "Break this down" gating, Ask the
 * School save flow, email upsell, mobile bottom-sheet variant.
 */

import { useState, useRef, FormEvent, useEffect } from 'react'

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

export default function NanaPanel({ slug, schoolName = "this school" }: Props) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [retrievalReady, setRetrievalReady] = useState(false)
  const [tokens, setTokens] = useState('')
  const [final, setFinal] = useState<FinalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [askedQuestion, setAskedQuestion] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  function reset() {
    setRetrievalReady(false)
    setTokens('')
    setFinal(null)
    setError(null)
  }

  async function ask(e?: FormEvent) {
    e?.preventDefault()
    const q = question.trim()
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
        setTokens((p) => p + evt.text)
        break
      case 'final':
        setFinal(evt.payload)
        break
      case 'error':
        setError(`[${evt.code}] ${evt.error}`)
        break
    }
  }

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

  return (
    <>
      {/* CSS — scoped via .nana-* class prefix */}
      <style>{NANA_CSS}</style>

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

      {/* Open panel */}
      {open && (
        <>
          <div className="nana-dim" onClick={() => setOpen(false)} />
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
                <Hero schoolName={schoolName} setQuestion={setQuestion} ask={ask} />
              )}

              {askedQuestion && (
                <QuestionBlock question={askedQuestion} />
              )}

              {streaming && !final && (
                <StreamingState
                  retrievalReady={retrievalReady}
                  tokens={tokens}
                />
              )}

              {final?.parsed && (
                <AnswerLayout parsed={final.parsed} />
              )}

              {error && (
                <div className="nana-error">
                  <strong>Something went wrong.</strong>
                  <div>{error}</div>
                </div>
              )}
            </div>

            <form className="nana-input" onSubmit={ask}>
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
        </>
      )}
    </>
  )
}

// ── Hero (State 0) ───────────────────────────────────────────────────────────
function Hero({
  schoolName,
  setQuestion,
  ask,
}: {
  schoolName: string
  setQuestion: (q: string) => void
  ask: () => void
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
            onClick={() => {
              setQuestion(s)
              setTimeout(ask, 0)
            }}
          >
            {s} <span className="nana-starter-arrow">→</span>
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

// ── Streaming ────────────────────────────────────────────────────────────────
function StreamingState({
  retrievalReady,
  tokens,
}: {
  retrievalReady: boolean
  tokens: string
}) {
  return (
    <div className="nana-streaming">
      {!retrievalReady && (
        <div className="nana-streaming-status">Searching {`Reed's`} data…</div>
      )}
      {retrievalReady && !tokens && (
        <div className="nana-streaming-status">Reading and drafting…</div>
      )}
      {tokens && (
        <div className="nana-streaming-tokens">
          <pre>{tokens}</pre>
        </div>
      )}
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

      {s.confirmed_facts && (
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
                    {label} <span>↗</span>
                  </a>
                )
              }
              return (
                <span key={i} className="nana-pill">
                  {label} <span>↑</span>
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
  return s.trim().toLowerCase() === 'nothing to flag here' ||
         s.trim().toLowerCase() === 'nothing to flag here.'
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
  // Newlines → <br> for prose readability
  out = out.replace(/\n/g, '<br>')
  return out
}

// ── Styles ───────────────────────────────────────────────────────────────────
const NANA_CSS = `
.nana-handle {
  position: fixed; right: 0; top: 50%; transform: translateY(-50%);
  background: #fdfcf7; border: 1px solid #DDD4C0; border-right: none;
  border-radius: 14px 0 0 14px; padding: 18px 14px;
  box-shadow: -4px 0 16px rgba(27,50,82,0.06);
  cursor: pointer; z-index: 80; writing-mode: vertical-rl;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  transition: padding 0.2s, box-shadow 0.2s;
}
.nana-handle:hover { box-shadow: -6px 0 20px rgba(27,50,82,0.10); padding-right: 18px; }
.nana-handle-pulse {
  width: 10px; height: 10px; background: #34C3A0; border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(52,195,160,0.2);
  animation: nana-pulse 2.4s infinite; writing-mode: horizontal-tb;
}
.nana-handle-text {
  font-family: 'Nunito Sans', sans-serif; font-size: 11px; font-weight: 800;
  color: #1B3252; letter-spacing: 0.18em;
}
@keyframes nana-pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(52,195,160,0.2); }
  50%      { box-shadow: 0 0 0 8px rgba(52,195,160,0.05); }
}

.nana-dim {
  position: fixed; inset: 0; background: rgba(15,34,56,0.35);
  z-index: 90; animation: nana-fade-in 0.3s ease-out;
}
@keyframes nana-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.nana-panel {
  position: fixed; top: 0; right: 0; height: 100vh; width: 560px;
  background: #fdfcf7; box-shadow: -8px 0 32px rgba(27,50,82,0.12);
  z-index: 100; display: flex; flex-direction: column;
  animation: nana-slide-in 0.3s cubic-bezier(0.2, 0, 0, 1);
}
@keyframes nana-slide-in {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@media (max-width: 640px) {
  .nana-panel { width: 100vw; }
}

.nana-header {
  background: white; border-bottom: 1px solid #DDD4C0;
  padding: 18px 28px; display: flex; align-items: center; gap: 12px;
}
.nana-pulse {
  width: 10px; height: 10px; background: #34C3A0; border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(52,195,160,0.2);
  animation: nana-pulse 2.4s infinite;
}
.nana-title {
  font-family: 'Lora', Georgia, serif; font-size: 20px;
  color: #1B3252; font-weight: 800; letter-spacing: -0.01em;
  margin: 0;
}
.nana-sub {
  font-family: 'Lora', Georgia, serif; font-style: italic;
  font-size: 12px; color: #6B7280;
}
.nana-close {
  margin-left: auto; background: none; border: none;
  font-size: 22px; color: #6B7280; cursor: pointer; padding: 4px 10px;
  font-family: -apple-system, system-ui, sans-serif;
}
.nana-close:hover { color: #1B3252; }

.nana-body {
  flex: 1; overflow-y: auto; padding: 32px 36px 40px;
  font-family: 'Lora', Georgia, serif;
}

.nana-hero {
  padding: 20px 0;
}
.nana-hero-greeting {
  font-family: 'Lora', serif; font-size: 26px; color: #1B3252;
  font-weight: 600; margin-bottom: 12px;
}
.nana-hero-claim {
  font-family: 'Lora', serif; font-size: 16px; line-height: 1.7;
  color: #1f2937; margin-bottom: 28px;
}
.nana-hero-starters-label {
  font-family: 'Nunito Sans', sans-serif; font-size: 10px;
  font-weight: 800; color: #1B3252; letter-spacing: 0.18em;
  text-transform: uppercase; margin-bottom: 10px;
}
.nana-hero-starters { display: flex; flex-direction: column; gap: 8px; }
.nana-starter {
  background: white; border: 1px solid #DDD4C0; border-radius: 12px;
  padding: 14px 16px; text-align: left; cursor: pointer;
  font-family: 'Lora', serif; font-size: 15px; color: #1B3252;
  display: flex; align-items: center; justify-content: space-between;
  transition: border-color 0.15s, transform 0.15s;
}
.nana-starter:hover {
  border-color: #239C80; transform: translateX(2px);
}
.nana-starter-arrow { color: #239C80; font-weight: 700; margin-left: 12px; }

.nana-question {
  font-family: 'Lora', serif; font-size: 19px; line-height: 1.4;
  color: #1B3252; font-weight: 600; font-style: italic;
  margin-bottom: 24px; padding-bottom: 18px;
  border-bottom: 1px solid #DDD4C0;
}
.nana-question::before {
  content: '“'; color: #239C80; font-size: 28px; line-height: 0;
  vertical-align: -8px; margin-right: 4px;
}
.nana-question::after {
  content: '”'; color: #239C80; font-size: 28px; line-height: 0;
  vertical-align: -8px; margin-left: 4px;
}

.nana-streaming {
  padding: 12px 0;
}
.nana-streaming-status {
  font-family: 'Lora', serif; font-style: italic;
  color: #6B7280; font-size: 14px;
  display: flex; align-items: center; gap: 10px;
}
.nana-streaming-status::before {
  content: ''; width: 10px; height: 10px; border-radius: 50%;
  background: #34C3A0; box-shadow: 0 0 0 3px rgba(52,195,160,0.2);
  animation: nana-pulse 1.6s infinite;
}
.nana-streaming-tokens {
  margin-top: 16px; background: #f6f8fa; border: 1px solid #DDD4C0;
  border-radius: 8px; padding: 12px 14px; font-family: 'SF Mono', Monaco, monospace;
  font-size: 11px; line-height: 1.55; color: #4a5563;
  max-height: 200px; overflow-y: auto;
}
.nana-streaming-tokens pre {
  margin: 0; white-space: pre-wrap; word-break: break-word;
  font-family: inherit; font-size: inherit;
}

.nana-eyebrow {
  font-family: 'Nunito Sans', sans-serif; font-size: 11px; font-weight: 700;
  color: #239C80; letter-spacing: 0.24em; text-transform: uppercase;
  margin: 26px 0 12px;
}
.nana-eyebrow.nana-amber { color: #D97706; }
.nana-answer > .nana-eyebrow:first-child { margin-top: 0; }

.nana-short-answer {
  font-family: 'Lora', serif; font-size: 18px; line-height: 1.6;
  color: #1B3252; font-weight: 500; margin: 0;
}

.nana-prose {
  font-family: 'Lora', serif; font-size: 15px; color: #1f2937; line-height: 1.75;
}
.nana-prose strong { color: #1B3252; font-weight: 600; }
.nana-prose em { color: #1f2937; font-style: italic; }

.nana-tradeoff {
  background: #FEF3C7; border-left: 4px solid #D97706;
  padding: 14px 18px; border-radius: 0 8px 8px 0;
  font-family: 'Lora', serif; font-style: italic;
  font-size: 15px; line-height: 1.7; color: #1f2937;
}
.nana-tradeoff strong { color: #B45309; font-style: normal; }

.nana-tour-card {
  margin: 20px 0; padding: 18px 22px;
  background: white; border: 2px solid #1B3252; border-radius: 12px;
}
.nana-tour-card .nana-eyebrow { color: #1B3252; margin-top: 0; margin-bottom: 8px; }
.nana-tour-q {
  font-family: 'Lora', serif; font-size: 16px; line-height: 1.55;
  color: #1B3252; font-style: italic; font-weight: 500;
}
.nana-tour-who-label {
  font-family: 'Nunito Sans', sans-serif; font-size: 10px;
  font-weight: 800; color: #1B3252; letter-spacing: 0.18em;
  text-transform: uppercase; margin: 14px 0 4px;
  padding-top: 12px; border-top: 1px solid #E5E7EB;
}
.nana-tour-who { font-family: 'Lora', serif; font-size: 14px; color: #1f2937; }

.nana-table {
  margin: 18px 0; border: 1px solid #DDD4C0; border-radius: 12px;
  overflow: hidden; background: white;
}
.nana-table-title {
  background: #1B3252; color: white; padding: 10px 16px;
  font-family: 'Nunito Sans', sans-serif; font-size: 11px;
  font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
}
.nana-table table {
  width: 100%; border-collapse: collapse;
  font-family: 'Lora', serif; font-size: 14px;
}
.nana-table th, .nana-table td {
  padding: 10px 16px; text-align: left;
  border-bottom: 1px solid #E5E7EB;
}
.nana-table th {
  font-family: 'Nunito Sans', sans-serif; font-size: 11px;
  color: #1B3252; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
}
.nana-table tr:nth-child(odd) td { background: #FBFBF8; }
.nana-table tr.highlight td {
  background: #E8FAF6; font-weight: 700; color: #1B3252;
}
.nana-table tr:last-child td { border-bottom: none; }
.nana-table-footer {
  padding: 6px 16px; font-size: 11px; color: #6B7280; font-style: italic;
  border-top: 1px solid #E5E7EB; background: white;
}

.nana-pill, .nana-pill-ext {
  display: inline-block; color: #239C80; font-family: 'Nunito Sans', sans-serif;
  font-size: 12px; font-weight: 700; text-decoration: none;
  border-bottom: 1px dotted #239C80; padding: 0 0 1px;
  margin: 0 8px 4px 0;
}
.nana-pill-ext { color: #239C80; }
.nana-pill-ext:hover, .nana-pill:hover { color: #1B3252; border-bottom-color: #1B3252; }

.nana-inline-pill, .nana-inline-pill-ext {
  display: inline; color: #239C80; font-family: 'Nunito Sans', sans-serif;
  font-size: 11px; font-weight: 700; border-bottom: 1px dotted #239C80;
  padding: 0 0 1px; white-space: nowrap;
}

.nana-sources { margin-top: 4px; }

.nana-followups { margin-top: 4px; }
.nana-followup {
  padding: 14px 0 14px 22px; position: relative; cursor: pointer;
  font-family: 'Lora', serif; font-style: italic; font-size: 15px;
  color: #1B3252; border-bottom: 1px dotted #DDD4C0;
}
.nana-followup:last-child { border-bottom: none; }
.nana-followup::before {
  content: '→'; position: absolute; left: 0; color: #239C80;
  font-style: normal; font-weight: 700;
}
.nana-followup:hover { color: #239C80; }

.nana-closer {
  margin-top: 28px; padding-top: 20px; border-top: 1px solid #DDD4C0;
  font-family: 'Lora', serif; font-style: italic; font-size: 14px;
  color: #1B3252; text-align: right;
}

.nana-error {
  margin-top: 16px; padding: 14px 18px;
  background: #fef2f2; border: 1px solid #fecaca;
  border-radius: 8px; color: #991b1b;
  font-family: 'Nunito Sans', sans-serif; font-size: 13px;
}
.nana-error strong { display: block; margin-bottom: 4px; }

.nana-input {
  border-top: 1px solid #DDD4C0; padding: 16px 28px; background: white;
  display: flex; gap: 10px;
}
.nana-input input {
  flex: 1; padding: 12px 16px; border: 1px solid #DDD4C0; border-radius: 12px;
  font-size: 15px; font-family: 'Lora', serif; font-style: italic;
  color: #1f2937; background: #fdfcf7;
}
.nana-input input:focus {
  outline: none; border-color: #239C80;
}
.nana-input button {
  background: #1B3252; color: white; border: none; padding: 0 22px;
  border-radius: 12px; font-weight: 700; font-size: 13px; cursor: pointer;
  font-family: 'Nunito Sans', sans-serif; letter-spacing: 0.06em;
}
.nana-input button:disabled { opacity: 0.4; cursor: not-allowed; }
`
