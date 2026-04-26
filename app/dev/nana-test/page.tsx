'use client'

/**
 * /dev/nana-test — throwaway scaffolding to validate the streaming SSE
 * endpoint at /api/nana-parent-chatbot/[slug] from inside Next.js.
 *
 * Once the real panel (NanaPanel.tsx) consumes the same endpoint and renders
 * the design from UI-DESIGN.md, this page can be deleted. It exists so we
 * can confirm streaming works in a browser tab on the actual NanaSays domain
 * — not just curl from a terminal.
 *
 * Hardcoded to slug=reeds-school-uk because v1 is Reed's-only.
 */

import { useState, useRef, FormEvent } from 'react'

type RetrievalEvent = {
  type: 'retrieval'
  payload: {
    meta: {
      embedMs: number
      retrievalMs: number
      candidatesFound: number
      sourcePathTaken: string
      isBroadFit: boolean
      totalWords: number
      warnings: string[]
    }
    chunkCount: number
    sensitiveCount: number
  }
}

type TokenEvent = { type: 'token'; text: string }

type Usage = {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  output_tokens: number
}

type Cost = {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  output_tokens: number
  cost_input: number
  cost_cache_create: number
  cost_cache_read: number
  cost_output: number
  total_usd: number
  cache_hit_pct: number
}

type FinalEvent = {
  type: 'final'
  payload: {
    parsed: any
    raw: string
    attempt: number
    parseError: string | null
    claudeError: string | null
    validationIssues: string[]
    claudeMs: number
    totalMs: number
    backend?: 'sdk' | 'cli'
    model?: string
    usage?: Usage | null
    cost?: Cost | null
  }
}

type ErrorEvent = { type: 'error'; error: string; code: string }

type StreamEvent = RetrievalEvent | TokenEvent | FinalEvent | ErrorEvent

const SLUG = 'reeds-school-uk'

const SAMPLE_QUESTIONS = [
  "How is Reed's doing financially?",
  "What are Reed's fees?",
  "Tell me about Reed's tennis programme.",
  "Will my son be happy at Reed's?",
  "What is Reed's TikTok strategy?",
  "How many rugby competitions has Reed's won?",
]

export default function NanaTestPage() {
  const [question, setQuestion] = useState("How is Reed's doing financially?")
  const [streaming, setStreaming] = useState(false)
  const [retrieval, setRetrieval] = useState<RetrievalEvent['payload'] | null>(null)
  const [tokens, setTokens] = useState('')
  const [finalEvent, setFinalEvent] = useState<FinalEvent['payload'] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [firstTokenAt, setFirstTokenAt] = useState<number | null>(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [sessionCost, setSessionCost] = useState(0)
  const [sessionTokensIn, setSessionTokensIn] = useState(0)
  const [sessionTokensOut, setSessionTokensOut] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (streaming || !question.trim()) return

    setStreaming(true)
    setRetrieval(null)
    setTokens('')
    setFinalEvent(null)
    setErrors([])
    setStartedAt(Date.now())
    setFirstTokenAt(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`/api/nana-parent-chatbot/${SLUG}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        setErrors([`HTTP ${res.status}: ${text}`])
        return
      }

      if (!res.body) {
        setErrors(['Response body is null — streaming not supported?'])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE events are separated by \n\n; each event is one or more lines
        // beginning with "data: ".
        let sep
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const dataLines = block.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6))
          if (dataLines.length === 0) continue
          const dataStr = dataLines.join('\n')
          let event: StreamEvent
          try {
            event = JSON.parse(dataStr) as StreamEvent
          } catch (err) {
            setErrors(prev => [...prev, `JSON parse failed for SSE event: ${dataStr.slice(0, 100)}`])
            continue
          }
          dispatch(event)
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setErrors(prev => [...prev, `Stream failed: ${err?.message ?? String(err)}`])
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function dispatch(event: StreamEvent) {
    switch (event.type) {
      case 'retrieval':
        setRetrieval(event.payload)
        break
      case 'token':
        setTokens(prev => {
          if (firstTokenAt === null) setFirstTokenAt(Date.now())
          return prev + event.text
        })
        break
      case 'final':
        setFinalEvent(event.payload)
        // Update session totals if cost telemetry is present
        if (event.payload.cost) {
          setSessionCount(prev => prev + 1)
          setSessionCost(prev => prev + event.payload.cost!.total_usd)
          setSessionTokensIn(prev => prev +
            event.payload.cost!.input_tokens +
            event.payload.cost!.cache_creation_input_tokens +
            event.payload.cost!.cache_read_input_tokens)
          setSessionTokensOut(prev => prev + event.payload.cost!.output_tokens)
        }
        break
      case 'error':
        setErrors(prev => [...prev, `[${event.code}] ${event.error}`])
        break
    }
  }

  function abort() {
    abortRef.current?.abort()
  }

  const elapsed = startedAt ? Date.now() - startedAt : 0
  const ttfb = firstTokenAt && startedAt ? firstTokenAt - startedAt : null

  return (
    <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif', color: '#1f2937' }}>
      <header style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 12, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#1B3252' }}>Nana — dev test page</h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>
            Throwaway scaffolding for streaming SSE validation. Slug hardcoded to <code>{SLUG}</code>. Delete this page once the real panel is built.
          </p>
        </div>
        {sessionCount > 0 && (
          <div style={{
            background: '#0f2238', color: '#d1d5db', padding: '8px 12px',
            borderRadius: 8, fontSize: 11, fontFamily: 'SF Mono, Monaco, monospace',
            minWidth: 180, lineHeight: 1.6,
          }}>
            <div style={{ color: '#34C3A0', fontWeight: 700, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 4 }}>Session totals</div>
            <div>questions: <span style={{ color: 'white', fontWeight: 700 }}>{sessionCount}</span></div>
            <div>in/out tok: <span style={{ color: 'white', fontWeight: 700 }}>{sessionTokensIn.toLocaleString()}</span> / <span style={{ color: 'white', fontWeight: 700 }}>{sessionTokensOut.toLocaleString()}</span></div>
            <div>cost: <span style={{ color: '#fde68a', fontWeight: 700 }}>{formatUSD(sessionCost)}</span></div>
            <div>avg/Q: <span style={{ color: '#fde68a', fontWeight: 700 }}>{formatUSD(sessionCost / sessionCount)}</span></div>
          </div>
        )}
      </header>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label htmlFor="q" style={{ fontSize: 12, fontWeight: 700, color: '#1B3252', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Your question
        </label>
        <textarea
          id="q"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          rows={3}
          disabled={streaming}
          style={{
            padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db',
            fontFamily: 'inherit', fontSize: 14, resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SAMPLE_QUESTIONS.map(q => (
            <button key={q} type="button" disabled={streaming} onClick={() => setQuestion(q)}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer' }}>
              {q}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={streaming || !question.trim()}
            style={{
              padding: '10px 20px', background: streaming ? '#9ca3af' : '#34C3A0',
              color: 'white', border: 'none', borderRadius: 8, fontWeight: 700,
              fontSize: 14, cursor: streaming ? 'not-allowed' : 'pointer',
            }}>
            {streaming ? 'Streaming…' : 'Ask Nana'}
          </button>
          {streaming && (
            <button type="button" onClick={abort}
              style={{ padding: '10px 16px', background: 'white', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Abort
            </button>
          )}
        </div>
      </form>

      {(streaming || retrieval || finalEvent) && (
        <section style={{ marginTop: 20, padding: '12px 14px', background: '#f6f8fa', borderRadius: 8, fontSize: 12, color: '#6b7280', fontFamily: 'SF Mono, Monaco, monospace' }}>
          {streaming && <div>elapsed: {(elapsed / 1000).toFixed(1)}s</div>}
          {ttfb !== null && <div>time to first token: {(ttfb / 1000).toFixed(2)}s</div>}
          {retrieval && (
            <div>
              retrieval: {retrieval.chunkCount} chunks · {retrieval.sensitiveCount} sensitive · path={retrieval.meta.sourcePathTaken} · embed={retrieval.meta.embedMs}ms
              {retrieval.meta.isBroadFit && ' · broad-fit'}
            </div>
          )}
          {finalEvent && (
            <div>
              final: claude={finalEvent.claudeMs}ms · total={finalEvent.totalMs}ms · attempt={finalEvent.attempt} · validation={finalEvent.validationIssues.length === 0 ? 'clean' : finalEvent.validationIssues.length + ' issues'}
            </div>
          )}
        </section>
      )}

      {errors.length > 0 && (
        <section style={{ marginTop: 20, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
          <strong style={{ color: '#991b1b' }}>Errors:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {errors.map((e, i) => <li key={i} style={{ fontSize: 13, color: '#991b1b' }}>{e}</li>)}
          </ul>
        </section>
      )}

      {tokens && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 11, fontWeight: 800, color: '#34C3A0', textTransform: 'uppercase', letterSpacing: '0.18em', margin: '0 0 8px' }}>
            Streaming output {streaming && '· live'}
          </h2>
          <pre style={{
            background: '#0f2238', color: '#d1d5db', padding: '14px 16px',
            borderRadius: 8, fontSize: 12, lineHeight: 1.5, overflow: 'auto',
            maxHeight: 400, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {tokens}
          </pre>
        </section>
      )}

      {finalEvent?.cost && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 11, fontWeight: 800, color: '#1B3252', textTransform: 'uppercase', letterSpacing: '0.18em', margin: '0 0 12px' }}>
            Cost for this answer
          </h2>
          <CostPanel cost={finalEvent.cost} backend={finalEvent.backend} model={finalEvent.model} />
        </section>
      )}

      {finalEvent && !finalEvent.cost && (
        <section style={{ marginTop: 16, padding: '10px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
          Cost telemetry not available — backend is <code>{finalEvent.backend ?? 'cli'}</code> (CLI doesn't expose token usage). Set NANA_BRAIN_BACKEND=sdk to see cost.
        </section>
      )}

      {finalEvent?.parsed && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 11, fontWeight: 800, color: '#1B3252', textTransform: 'uppercase', letterSpacing: '0.18em', margin: '0 0 12px' }}>
            Parsed answer
          </h2>
          <ParsedAnswer parsed={finalEvent.parsed} />
          {finalEvent.validationIssues.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8 }}>
              <strong style={{ color: '#92400e', fontSize: 13 }}>Validation issues:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#92400e', fontSize: 12 }}>
                {finalEvent.validationIssues.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

function ParsedAnswer({ parsed }: { parsed: any }) {
  const sections = parsed?.sections ?? {}
  const confidence = parsed?.confidence ?? 'unknown'
  const sources = parsed?.sources_used ?? []
  const followUps = parsed?.follow_ups ?? []

  return (
    <article style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ marginBottom: 14, fontSize: 11, fontWeight: 700, color: confidence === 'none' ? '#991b1b' : confidence === 'high' ? '#239C80' : '#92400e' }}>
        confidence: {confidence}
      </div>

      <Section label="Short Answer" body={sections.short_answer} bold />
      <Section label="Confirmed Facts" body={sections.confirmed_facts} />
      <Section label="What This Means" body={sections.what_this_means} amber />
      <Section label="Tradeoff / Watch-Out" body={sections.tradeoff} amber />
      <Section label="What We Don't Know" body={sections.what_we_dont_know} />

      {parsed?.tour_question && (
        <div style={{ marginTop: 16, padding: '14px 16px', border: '2px solid #1B3252', borderRadius: 12, background: '#f6f8fa' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#1B3252', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>
            Your tour question
          </div>
          <div style={{ fontSize: 14, color: '#1B3252', fontStyle: 'italic', lineHeight: 1.5 }}>{parsed.tour_question}</div>
          {parsed.tour_target && (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#1B3252', textTransform: 'uppercase', letterSpacing: '0.18em', margin: '12px 0 4px', paddingTop: 10, borderTop: '1px solid #e5e7eb' }}>
                Who to ask
              </div>
              <div style={{ fontSize: 13, color: '#1f2937' }}>{parsed.tour_target}</div>
            </>
          )}
        </div>
      )}

      {parsed?.comparison_table && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#1B3252', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>
            Comparison table
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: '#1B3252', color: 'white', padding: '8px 12px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {parsed.comparison_table.title}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{parsed.comparison_table.columns.map((c: string, i: number) => (
                  <th key={i} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#1B3252', borderBottom: '1px solid #e5e7eb' }}>{c}</th>
                ))}</tr>
              </thead>
              <tbody>{parsed.comparison_table.rows.map((row: string[], i: number) => (
                <tr key={i} style={{ background: i === parsed.comparison_table.highlight_row_index ? '#E8FAF6' : (i % 2 ? '#f6f8fa' : 'white') }}>
                  {row.map((cell, j) => <td key={j} style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>{cell}</td>)}
                </tr>
              ))}</tbody>
            </table>
            {parsed.comparison_table.footer && (
              <div style={{ padding: '6px 12px', fontSize: 11, color: '#6b7280', fontStyle: 'italic', borderTop: '1px solid #e5e7eb' }}>{parsed.comparison_table.footer}</div>
            )}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#34C3A0', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>Sources</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sources.map((s: any, i: number) => {
              const isExt = !!s.source_url
              const label = (s.section_label || s.section_id || 'source') + (isExt ? ' ↗' : ' ↑')
              if (isExt) {
                return (
                  <a key={i} href={s.source_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12, border: '1px solid #239C80', color: '#239C80', textDecoration: 'none', background: 'white' }}>
                    {label}
                  </a>
                )
              }
              return (
                <span key={i} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12, background: '#E8FAF6', color: '#239C80' }}>
                  {label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {followUps.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#34C3A0', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>You might also ask</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {followUps.map((q: string, i: number) => <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{q}</li>)}
          </ul>
        </div>
      )}
    </article>
  )
}

function Section({ label, body, amber, bold }: { label: string; body?: string; amber?: boolean; bold?: boolean }) {
  if (!body || body.trim() === 'Nothing to flag here') return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: amber ? '#D97706' : '#34C3A0', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6 }}>{label}</div>
      <div style={{
        fontSize: bold ? 15 : 13, color: bold ? '#1B3252' : '#1f2937', lineHeight: 1.55, whiteSpace: 'pre-wrap',
        ...(amber ? { background: '#FFFBEB', borderLeft: '3px solid #D97706', padding: '10px 12px', borderRadius: 4 } : {}),
      }}>{body}</div>
    </div>
  )
}

/**
 * Format a USD amount with appropriate precision.
 * < 1¢: show as fractional cents (e.g. "0.075¢")
 * < $1: show as cents (e.g. "1.2¢")
 * ≥ $1: show as dollars (e.g. "$1.24")
 */
function formatUSD(usd: number): string {
  if (usd < 0.01) {
    const cents = usd * 100
    return cents.toFixed(3) + '¢'
  }
  if (usd < 1) {
    const cents = usd * 100
    return cents.toFixed(2) + '¢'
  }
  return '$' + usd.toFixed(4)
}

function CostPanel({ cost, backend, model }: { cost: Cost; backend?: 'sdk' | 'cli'; model?: string }) {
  const totalIn = cost.input_tokens + cost.cache_creation_input_tokens + cost.cache_read_input_tokens
  const cacheStatus = cost.cache_creation_input_tokens > 0
    ? `cache write — first call paid ${cost.cache_creation_input_tokens.toLocaleString()} tokens at +25%`
    : cost.cache_read_input_tokens > 0
      ? `cache hit — ${cost.cache_read_input_tokens.toLocaleString()} tokens read at 10% cost`
      : 'no cache activity'

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#1B3252', fontFamily: 'SF Mono, Monaco, monospace' }}>
          {formatUSD(cost.total_usd)}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          {backend ?? '?'} · {model ?? 'unknown'}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'SF Mono, Monaco, monospace' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ textAlign: 'left',  padding: '6px 8px', color: '#6b7280', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>component</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>tokens</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>rate /M</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#6b7280', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>cost</th>
          </tr>
        </thead>
        <tbody>
          <CostRow label="Input (uncached)"      tokens={cost.input_tokens}                 rate="$1.00"  usd={cost.cost_input}        muted={cost.input_tokens === 0} />
          <CostRow label="Cache write (first call)" tokens={cost.cache_creation_input_tokens} rate="$1.25"  usd={cost.cost_cache_create} muted={cost.cache_creation_input_tokens === 0} highlight={cost.cache_creation_input_tokens > 0} />
          <CostRow label="Cache read (warm hit)" tokens={cost.cache_read_input_tokens}      rate="$0.10"  usd={cost.cost_cache_read}   muted={cost.cache_read_input_tokens === 0} highlight={cost.cache_read_input_tokens > 0} />
          <CostRow label="Output"                tokens={cost.output_tokens}                rate="$5.00"  usd={cost.cost_output}       />
        </tbody>
      </table>

      <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280', borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
        Total tokens: {totalIn.toLocaleString()} input + {cost.output_tokens.toLocaleString()} output · {cacheStatus}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
        Projection: <span style={{ color: '#1B3252', fontWeight: 700 }}>{formatUSD(cost.total_usd * 1000)}</span> per 1,000 questions ·
        <span style={{ marginLeft: 6, color: '#1B3252', fontWeight: 700 }}>{formatUSD(cost.total_usd * 10000)}</span> per 10,000
      </div>
    </div>
  )
}

function CostRow({ label, tokens, rate, usd, muted, highlight }: {
  label: string; tokens: number; rate: string; usd: number; muted?: boolean; highlight?: boolean
}) {
  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6', background: highlight ? '#E8FAF6' : undefined }}>
      <td style={{ padding: '6px 8px', color: muted ? '#9ca3af' : '#1f2937' }}>{label}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right', color: muted ? '#9ca3af' : '#1f2937' }}>{tokens.toLocaleString()}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#9ca3af' }}>{rate}</td>
      <td style={{ padding: '6px 8px', textAlign: 'right', color: muted ? '#9ca3af' : '#1B3252', fontWeight: muted ? 400 : 700 }}>
        {formatUSD(usd)}
      </td>
    </tr>
  )
}
