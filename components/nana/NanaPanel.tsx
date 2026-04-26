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
  parseError?: string | null
  claudeError?: string | null
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
  const [streamBuf, setStreamBuf] = useState('')
  const [final, setFinal] = useState<FinalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [askedQuestion, setAskedQuestion] = useState('')
  const abortRef = useRef<AbortController | null>(null)

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

  // Abort any in-flight stream when the component unmounts. Without this,
  // navigating away mid-answer leaves the SSE fetch + the brain generation
  // running on the server (and burning Anthropic tokens).
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  function closePanel() {
    abortRef.current?.abort()
    setOpen(false)
  }

  function reset() {
    setRetrievalReady(false)
    setStreamBuf('')
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

    // Track whether we received a usable terminal event. If the stream
    // closes without one (network drop, server crash, route timeout), we
    // surface a fallback error in finally so the panel never silently
    // freezes on a question with nothing under it.
    let sawTerminal = false

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
        sawTerminal = true
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // Flush any trailing bytes still held by the decoder.
          buf += decoder.decode()
          break
        }
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
          if (evt.type === 'final' || evt.type === 'error') sawTerminal = true
          dispatch(evt)
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // Caller-initiated abort (close button, unmount). Don't surface as
        // an error — the user already left.
        sawTerminal = true
      } else {
        setError('Network error: ' + (e?.message ?? String(e)))
        sawTerminal = true
      }
    } finally {
      if (!sawTerminal) {
        setError('The connection closed before Nana finished. Please try again.')
      }
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
        // Accumulate into a buffer so we can extract sections.short_answer
        // and render it character-by-character as it streams in.
        setStreamBuf((p) => p + evt.text)
        break
      case 'final':
        // The brain emits 'final' even when JSON parsing failed (parsed=null)
        // — render an explicit error so the user isn't staring at a blank
        // panel.
        if (!evt.payload?.parsed) {
          const why =
            evt.payload?.parseError
              ? `Couldn't parse Nana's answer: ${evt.payload.parseError}`
              : evt.payload?.claudeError
                ? `Claude error: ${evt.payload.claudeError}`
                : 'Nana finished but produced no answer. Please try again.'
          setError(why)
        }
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
              onClick={closePanel}
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

            {/* Show streaming view as long as we don't have a final parsed
                answer. This includes: actively streaming (dots → sections),
                AND the case where the panel was closed mid-stream then
                reopened — `streaming` is false but `streamBuf` still has
                what we saw last. Better than a blank panel. */}
            {!final?.parsed && (streaming || streamBuf) && (
              <StreamingState
                retrievalReady={retrievalReady}
                streamBuf={streamBuf}
                streaming={streaming}
              />
            )}

            {final?.parsed && (
              <AnswerLayout
                parsed={final.parsed}
                validationIssues={final.validationIssues || []}
              />
            )}

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

// ── Streaming — render every section as Claude writes it ──────────────────
// Sections are extracted from the streaming JSON in the order Claude emits
// them. The last one with content is the "active" one and gets the blinking
// cursor; earlier ones are settled prose. This way the parent sees the full
// answer build up rather than just short_answer then a long blank wait.
const STREAMING_SECTIONS: Array<{
  key: 'short_answer' | 'confirmed_facts' | 'what_this_means' | 'tradeoff' | 'what_we_dont_know'
  label: string
  amber?: boolean
}> = [
  { key: 'short_answer',      label: 'Short Answer' },
  { key: 'confirmed_facts',   label: 'Confirmed Facts' },
  { key: 'what_this_means',   label: 'What This Means' },
  { key: 'tradeoff',          label: '⚠ Tradeoff / Watch-Out', amber: true },
  { key: 'what_we_dont_know', label: "What We Don't Know" },
]

function StreamingState({
  retrievalReady,
  streamBuf,
  streaming,
}: {
  retrievalReady: boolean
  streamBuf: string
  streaming: boolean
}) {
  const extracted = STREAMING_SECTIONS.map((s) => ({
    ...s,
    body: extractStreamingField(streamBuf, s.key),
  })).filter((s) => s.body && !isEmpty(s.body))

  let status = 'Searching the data…'
  if (retrievalReady && !streamBuf) status = 'Reading and drafting…'
  if (retrievalReady && streamBuf && extracted.length === 0) status = 'Writing your answer…'

  if (extracted.length === 0) {
    // Empty buffer + not actively streaming = nothing to show. Render
    // nothing rather than spinning dots forever.
    if (!streaming) return null
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

  const lastIdx = extracted.length - 1
  return (
    <div className="nana-streaming">
      {extracted.map((s, i) => {
        // Cursor blinks only on the section currently being written.
        // After the panel was closed and reopened, `streaming` is false
        // and no cursor renders — the partial answer just sits there.
        const isActive = streaming && i === lastIdx
        const cursorClass = isActive ? ' nana-streaming-cursor' : ''
        if (s.key === 'short_answer') {
          return (
            <div key={s.key}>
              <div className="nana-eyebrow">{s.label}</div>
              <p className={`nana-short-answer${cursorClass}`}>{s.body}</p>
            </div>
          )
        }
        const eyebrowClass = s.amber ? 'nana-eyebrow nana-amber' : 'nana-eyebrow'
        const bodyClass = s.key === 'tradeoff' ? 'nana-tradeoff' : 'nana-prose'
        return (
          <div key={s.key}>
            <div className={eyebrowClass}>{s.label}</div>
            <div
              className={`${bodyClass}${cursorClass}`}
              dangerouslySetInnerHTML={{ __html: renderInlineMd(s.body) }}
            />
          </div>
        )
      })}
      {!streaming && (
        <div className="nana-stopped-note">
          Nana stopped here when you closed the panel. Ask the question
          again to get the full answer with sources.
        </div>
      )}
    </div>
  )
}

/**
 * Extract a partial JSON string-field value from the streaming buffer.
 * Matches `"key": "..."` even if the closing quote hasn't arrived yet,
 * then runs a proper left-to-right JSON-string decoder over the captured
 * content. The previous regex-chain approach got the order wrong: a
 * literal `'` in the model's text would be turned into `'` because
 * the `\u` pass ran before the `\\` pass. The single-pass decoder below
 * walks the string once and never re-processes its own output.
 */
function extractStreamingField(buf: string, key: string): string {
  if (!buf) return ''
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, 's')
  const m = buf.match(re)
  if (!m) return ''
  return decodeJsonString(m[1])
}

function decodeJsonString(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c !== '\\') { out += c; continue }
    const n = s[i + 1]
    // Trailing backslash — chunk boundary, drop it for now; next chunk
    // will bring the rest.
    if (n === undefined) break
    if (n === 'u') {
      const hex = s.slice(i + 2, i + 6)
      if (hex.length < 4) break  // partial \uXXXX at chunk boundary
      out += String.fromCharCode(parseInt(hex, 16))
      i += 5
      continue
    }
    switch (n) {
      case 'n':  out += '\n'; break
      case 't':  out += '\t'; break
      case 'r':  out += '\r'; break
      case 'b':  out += '\b'; break
      case 'f':  out += '\f'; break
      case '"':  out += '"';  break
      case '\\': out += '\\'; break
      case '/':  out += '/';  break
      default:   out += n;     break  // unknown escape: drop the backslash
    }
    i += 1
  }
  return out
}

// ── Final answer layout (Style 1B) ───────────────────────────────────────────
function AnswerLayout({
  parsed,
  validationIssues,
}: {
  parsed: ParsedAnswer
  validationIssues: string[]
}) {
  const s = parsed.sections || {}
  const sources = parsed.sources_used || []
  const followUps = parsed.follow_ups || []

  // The schema/citation validator is the trust mechanism. If any issue
  // tripped, surface a warning. If a CITATION issue tripped (a URL we
  // didn't retrieve), suppress source pills entirely — better to show
  // no source than an unverifiable one.
  const hasIssues = validationIssues.length > 0
  const citationFailure = validationIssues.some((v) =>
    /sources_used|source_url|citation/i.test(v)
  )
  const showSources = sources.length > 0 && !citationFailure

  return (
    <article className="nana-answer">
      {hasIssues && (
        <div className="nana-validation-warn">
          <strong>⚠ Some checks didn't pass on this answer.</strong>
          <div className="nana-validation-detail">
            {citationFailure
              ? 'Source links have been hidden because Nana cited something we couldn\'t verify against the school\'s data.'
              : "Treat this answer with extra care — verify with the school directly."}
          </div>
          <details className="nana-validation-debug">
            <summary>What specifically failed?</summary>
            <ul>
              {validationIssues.map((v, i) => (
                <li key={i}><code>{v}</code></li>
              ))}
            </ul>
          </details>
        </div>
      )}

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

      {showSources && (
        <>
          <div className="nana-eyebrow">Sources</div>
          <div className="nana-sources">
            {sources.map((src, i) => {
              const safeHref = isSafeHttpUrl(src.source_url)
              const label =
                src.section_label || src.section_id || src.source_url || 'source'
              if (safeHref) {
                return (
                  <a
                    key={i}
                    href={safeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nana-pill nana-pill-ext"
                  >
                    {label} ↗
                  </a>
                )
              }
              const sectionId = src.section_id
              return (
                <button
                  key={i}
                  className="nana-pill nana-pill-scroll"
                  onClick={() => {
                    if (!sectionId) return
                    const el = document.getElementById(sectionId)
                    if (!el) return
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    el.classList.add('nana-section-highlight')
                    setTimeout(() => el.classList.remove('nana-section-highlight'), 1800)
                  }}
                >
                  {label} ↑
                </button>
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

// Defense in depth: never render a source link unless the URL parses and
// uses http or https. The validator already restricts sources to known
// hostnames, but if the database is ever poisoned we don't want
// `javascript:` or `data:` URLs becoming clickable. Returns the safe URL
// or null.
function isSafeHttpUrl(u: string | undefined): string | null {
  if (!u) return null
  try {
    const parsed = new URL(u)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString()
    }
  } catch { /* not a URL */ }
  return null
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
