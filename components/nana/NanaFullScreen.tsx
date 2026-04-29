'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import './research-panel.css'

// ── Types ────────────────────────────────────────────────────────────────────

interface ParsedSections {
  short_answer?: string
  confirmed_facts?: string
  what_this_means?: string
  tradeoff?: string
  what_we_dont_know?: string
  sources?: string
  you_might_also_ask?: string
}

interface ParsedAnswer {
  sections: ParsedSections
  confidence: 'high' | 'medium' | 'low' | 'none'
  follow_ups?: string[]
  tour_question?: string | null
  tour_target?: string | null
}

interface ResearchMessage {
  id: string
  question: string
  parsed: ParsedAnswer | null
  shareToken?: string
  createdAt: string
}

interface DecisionSummary {
  what_we_know: string[]
  outstanding_questions: string[]
  signals: 'positive' | 'mixed' | 'negative' | 'insufficient'
  one_liner: string
}

interface Session {
  id: string
  title: string | null
  summary: DecisionSummary | null
  created_at: string
  last_active_at: string
}

interface Props {
  slug: string
  schoolName: string
  initialSession: Session | null
  initialMessages: any[]
  allSessions: Session[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugToName(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function signalLabel(s: DecisionSummary['signals']) {
  return {
    positive:     { text: 'Positive signals',    cls: 'rs-signal--positive' },
    mixed:        { text: 'Mixed signals',        cls: 'rs-signal--mixed'    },
    negative:     { text: 'Concerns raised',      cls: 'rs-signal--negative' },
    insufficient: { text: 'Still gathering data', cls: 'rs-signal--neutral'  },
  }[s] ?? { text: s, cls: '' }
}

/** Pull a string field out of a partial JSON buffer as it streams */
function extractStreamingField(buf: string, key: string): string {
  const marker = `"${key}":`
  const idx = buf.indexOf(marker)
  if (idx === -1) return ''
  const after = buf.slice(idx + marker.length).trimStart()
  if (!after.startsWith('"')) return ''
  let result = ''
  let i = 1
  while (i < after.length) {
    const ch = after[i]
    if (ch === '\\' && i + 1 < after.length) { result += after[i + 1]; i += 2; continue }
    if (ch === '"') break
    result += ch; i++
  }
  return result
}

/** Very simple inline markdown: bold, source pills, line breaks */
function renderMd(text: string): React.ReactNode[] {
  if (!text) return []
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    return (
      <span key={i}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : <span key={j}>{p}</span>
        )}
        {i < text.split('\n').length - 1 && <br />}
      </span>
    )
  })
}

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    high: 'rs-conf--high', medium: 'rs-conf--medium',
    low: 'rs-conf--low', none: 'rs-conf--none',
  }
  const labels: Record<string, string> = {
    high: 'High confidence', medium: 'Medium confidence',
    low: 'Low confidence', none: 'No data',
  }
  return (
    <span className={`rs-conf-badge ${map[level] ?? ''}`}>
      {labels[level] ?? level}
    </span>
  )
}

// ── Thread message card (collapsed) ─────────────────────────────────────────

function ThreadCard({
  msg,
  isActive,
  onClick,
}: {
  msg: ResearchMessage
  isActive: boolean
  onClick: () => void
}) {
  const preview = msg.parsed?.sections?.short_answer?.slice(0, 100) ?? '—'
  return (
    <button className={`rs-thread-card ${isActive ? 'rs-thread-card--active' : ''}`} onClick={onClick}>
      <div className="rs-thread-q">{msg.question}</div>
      <div className="rs-thread-preview">{preview}{preview.length === 100 ? '…' : ''}</div>
    </button>
  )
}

// ── Expanded answer view ─────────────────────────────────────────────────────

function AnswerView({
  question,
  parsed,
  shareToken,
  isStreaming,
  streamBuf,
}: {
  question: string
  parsed: ParsedAnswer | null
  shareToken?: string
  isStreaming: boolean
  streamBuf: string
}) {
  const s = parsed?.sections ?? {}

  // While streaming, extract short_answer from the raw buffer
  const liveShort = isStreaming
    ? extractStreamingField(streamBuf, 'short_answer')
    : ''

  return (
    <div className="rs-answer">
      <div className="rs-answer-question">{question}</div>

      {parsed && (
        <div className="rs-answer-meta">
          <ConfidenceBadge level={parsed.confidence} />
          {shareToken && (
            <Link
              href={`/nana/answer/${shareToken}`}
              className="rs-share-link"
              target="_blank"
            >
              Share ↗
            </Link>
          )}
        </div>
      )}

      {(liveShort || s.short_answer) && (
        <div className="rs-section rs-section--lead">
          <div className="rs-eyebrow">Short Answer</div>
          <p className="rs-short-answer">
            {isStreaming ? liveShort || '…' : renderMd(s.short_answer!)}
          </p>
        </div>
      )}

      {!isStreaming && s.confirmed_facts && s.confirmed_facts !== 'Nothing to flag here.' && (
        <div className="rs-section">
          <div className="rs-eyebrow">Confirmed Facts</div>
          <p className="rs-prose">{renderMd(s.confirmed_facts)}</p>
        </div>
      )}

      {!isStreaming && s.what_this_means && s.what_this_means !== 'Nothing to flag here.' && (
        <div className="rs-section">
          <div className="rs-eyebrow">What This Means</div>
          <p className="rs-prose">{renderMd(s.what_this_means)}</p>
        </div>
      )}

      {!isStreaming && s.tradeoff && s.tradeoff !== 'Nothing to flag here.' && (
        <div className="rs-section rs-section--tradeoff">
          <div className="rs-eyebrow rs-eyebrow--amber">⚠ Tradeoff / Watch-Out</div>
          <p className="rs-prose">{renderMd(s.tradeoff)}</p>
        </div>
      )}

      {!isStreaming && s.what_we_dont_know && s.what_we_dont_know !== 'Nothing to flag here.' && (
        <div className="rs-section">
          <div className="rs-eyebrow">What We Don&apos;t Know</div>
          <p className="rs-prose rs-prose--dim">{renderMd(s.what_we_dont_know)}</p>
        </div>
      )}

      {!isStreaming && parsed?.tour_question && (
        <div className="rs-section rs-section--tour">
          <div className="rs-eyebrow">Tour Question</div>
          <p className="rs-tour-q">&ldquo;{parsed.tour_question}&rdquo;</p>
          {parsed.tour_target && (
            <p className="rs-tour-target">Ask: {parsed.tour_target}</p>
          )}
        </div>
      )}

      {isStreaming && !liveShort && (
        <div className="rs-skeleton">
          <div className="rs-skeleton-line rs-skeleton-line--80" />
          <div className="rs-skeleton-line rs-skeleton-line--60" />
          <div className="rs-skeleton-line rs-skeleton-line--90" />
        </div>
      )}
    </div>
  )
}

// ── Decision panel ───────────────────────────────────────────────────────────

function DecisionPanel({ summary, generating }: { summary: DecisionSummary | null; generating: boolean }) {
  if (!summary && !generating) {
    return (
      <div className="rs-decision rs-decision--empty">
        <div className="rs-decision-title">Decision Brief</div>
        <p className="rs-decision-hint">Ask Nana a few questions — your decision brief will build here.</p>
      </div>
    )
  }

  if (generating && !summary) {
    return (
      <div className="rs-decision rs-decision--empty">
        <div className="rs-decision-title">Decision Brief</div>
        <p className="rs-decision-generating">Synthesising…</p>
      </div>
    )
  }

  if (!summary) return null
  const sig = signalLabel(summary.signals)

  return (
    <div className="rs-decision">
      <div className="rs-decision-title">
        Decision Brief{generating && <span className="rs-decision-updating"> · updating…</span>}
      </div>

      <div className={`rs-signal ${sig.cls}`}>{sig.text}</div>

      <p className="rs-one-liner">{summary.one_liner}</p>

      {summary.what_we_know.length > 0 && (
        <div className="rs-decision-block">
          <div className="rs-decision-label">What we know</div>
          <ul className="rs-decision-list">
            {summary.what_we_know.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.outstanding_questions.length > 0 && (
        <div className="rs-decision-block">
          <div className="rs-decision-label">Outstanding questions</div>
          <ul className="rs-decision-list rs-decision-list--qs">
            {summary.outstanding_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function NanaFullScreen({
  slug,
  schoolName,
  initialSession,
  initialMessages,
}: Props) {
  const [session, setSession] = useState<Session | null>(initialSession)
  const [messages, setMessages] = useState<ResearchMessage[]>(
    (initialMessages ?? []).map(m => ({
      id: m.id,
      question: m.question,
      parsed: m.parsed_answer,
      shareToken: m.share_token,
      createdAt: m.created_at,
    }))
  )
  const [summary, setSummary] = useState<DecisionSummary | null>(
    initialSession?.summary ?? null
  )
  const [summaryGenerating, setSummaryGenerating] = useState(false)

  const [question, setQuestion] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamBuf, setStreamBuf] = useState('')
  const [activeQuestion, setActiveQuestion] = useState('')
  const [activeParsed, setActiveParsed] = useState<ParsedAnswer | null>(null)
  const [activeShareToken, setActiveShareToken] = useState<string | undefined>()

  // Which thread card to expand (null = show latest/streaming)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const mainRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll main area when streaming
  useEffect(() => {
    if (isStreaming && mainRef.current) {
      mainRef.current.scrollTop = mainRef.current.scrollHeight
    }
  }, [streamBuf, isStreaming])

  const ask = useCallback(async () => {
    const q = question.trim()
    if (!q || isStreaming) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setIsStreaming(true)
    setStreamBuf('')
    setActiveQuestion(q)
    setActiveParsed(null)
    setActiveShareToken(undefined)
    setExpandedId(null)
    setQuestion('')

    try {
      const res = await fetch(`/api/nana-research/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, sessionId: session?.id }),
        signal: ac.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Request failed')
      }

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let   buf    = ''
      let   shareToken: string | undefined
      // Track locally so the "add to thread" step at the end has the fresh value
      let   localParsed: ParsedAnswer | null = null
      let   hasContent = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          let evt: any
          try { evt = JSON.parse(line.slice(5).trim()) } catch { continue }

          switch (evt.type) {
            case 'session_ready':
              setSession(prev => {
                if (prev && prev.id === evt.sessionId) return prev
                return {
                  id: evt.sessionId,
                  title: q.slice(0, 80),
                  summary: null,
                  created_at: new Date().toISOString(),
                  last_active_at: new Date().toISOString(),
                }
              })
              break

            case 'token':
              hasContent = true
              setStreamBuf(prev => prev + (evt.text ?? ''))
              break

            case 'final':
              shareToken = evt.shareToken
              setActiveShareToken(evt.shareToken)
              if (evt.payload?.parsed) {
                localParsed = evt.payload.parsed
                setActiveParsed(localParsed)
              }
              // Unblock the input immediately — summary arrives separately
              setIsStreaming(false)
              if (localParsed || hasContent) {
                setMessages(prev => [...prev, {
                  id:        crypto.randomUUID(),
                  question:  q,
                  parsed:    localParsed,
                  shareToken,
                  createdAt: new Date().toISOString(),
                }])
              }
              break

            case 'summary_generating':
              setSummaryGenerating(true)
              break

            case 'summary_update':
              setSummaryGenerating(false)
              if (evt.payload?.summary) {
                setSummary(evt.payload.summary)
                setSession(prev => prev ? { ...prev, summary: evt.payload.summary } : prev)
              }
              break
          }
        }
      }

    } catch (e: any) {
      if (e?.name === 'AbortError') return
    } finally {
      // Ensure isStreaming is cleared even on error/abort
      setIsStreaming(false)
    }
  }, [question, isStreaming, session, slug])

  const stopStream = () => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask()
    }
  }

  // Which message to show in the main view
  const viewMsg: ResearchMessage | null = expandedId
    ? messages.find(m => m.id === expandedId) ?? null
    : null

  return (
    <div className="rs-shell">
      {/* ── Header ── */}
      <header className="rs-header">
        <Link href={`/schools/${slug}/report`} className="rs-back">
          ← Report
        </Link>
        <div className="rs-header-school">
          <span className="rs-header-pulse" />
          <span className="rs-header-name">{schoolName}</span>
          <span className="rs-header-mode">Research Mode</span>
        </div>
        <div className="rs-header-right">
          <span className="rs-header-count">
            {messages.length} question{messages.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      <div className="rs-body">
        {/* ── Left sidebar: thread + decision ── */}
        <aside className="rs-sidebar">
          <div className="rs-sidebar-inner">
            <div className="rs-thread-section">
              <div className="rs-section-label">Research Thread</div>
              {messages.length === 0 && !isStreaming && (
                <p className="rs-thread-empty">Your questions will appear here.</p>
              )}
              <div className="rs-thread-list">
                {messages.map(msg => (
                  <ThreadCard
                    key={msg.id}
                    msg={msg}
                    isActive={expandedId === msg.id}
                    onClick={() => setExpandedId(
                      expandedId === msg.id ? null : msg.id
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="rs-sidebar-divider" />

            <DecisionPanel summary={summary} generating={summaryGenerating} />
          </div>
        </aside>

        {/* ── Main: answer area + input ── */}
        <main className="rs-main">
          <div className="rs-answer-scroll" ref={mainRef}>
            {/* Show selected thread card or current streaming/latest answer */}
            {viewMsg ? (
              <AnswerView
                question={viewMsg.question}
                parsed={viewMsg.parsed}
                shareToken={viewMsg.shareToken}
                isStreaming={false}
                streamBuf=""
              />
            ) : isStreaming || activeQuestion ? (
              <AnswerView
                question={activeQuestion}
                parsed={activeParsed}
                shareToken={activeShareToken}
                isStreaming={isStreaming}
                streamBuf={streamBuf}
              />
            ) : messages.length > 0 ? (
              /* Show last completed answer by default */
              <AnswerView
                question={messages[messages.length - 1].question}
                parsed={messages[messages.length - 1].parsed}
                shareToken={messages[messages.length - 1].shareToken}
                isStreaming={false}
                streamBuf=""
              />
            ) : (
              <div className="rs-empty-state">
                <div className="rs-empty-pulse" />
                <h2 className="rs-empty-title">Research {schoolName}</h2>
                <p className="rs-empty-hint">
                  Ask anything — fees, pastoral, sport, admissions, inspection results.
                  Nana builds a decision brief as you go.
                </p>
                <div className="rs-starter-chips">
                  {[
                    'What are the boarding fees?',
                    'How strong is the pastoral care?',
                    'What sports does the school excel at?',
                    'How selective is admissions?',
                  ].map(q => (
                    <button
                      key={q}
                      className="rs-chip"
                      onClick={() => { setQuestion(q); inputRef.current?.focus() }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="rs-input-bar">
            <textarea
              ref={inputRef}
              className="rs-input"
              placeholder={`Ask Nana about ${schoolName}…`}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKey}
              rows={2}
              disabled={isStreaming}
            />
            <div className="rs-input-actions">
              {isStreaming ? (
                <button className="rs-btn rs-btn--stop" onClick={stopStream}>
                  ■ Stop
                </button>
              ) : (
                <button
                  className="rs-btn rs-btn--ask"
                  onClick={ask}
                  disabled={!question.trim()}
                >
                  Ask →
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
