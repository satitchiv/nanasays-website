'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type {
  ParsedAnswer,
  RecommendedSchool,
  ResearchMessage,
  ToolStep,
  Session,
  StreamFormat,
  AskError,
  NanaUiIntent,
} from './types'

// Slice 3d phase 3: chat state machine extracted from DecisionHub.tsx so
// the Research Room right rail (phase 4) can mount the same chat without
// duplicating ~250 lines of streaming logic. Behaviour-preserving — same
// SSE event handling, same auto-scroll, same abort + retry semantics,
// same useCallback memoisation as the original.

// Server-side params the parent component owns (active tab, active school,
// shortlist). These change between renders, so the hook fetches them at
// ask() time via a ref-backed getter — keeps `ask` stable without
// re-creating it on every parent re-render. deepMode is hook-owned (the
// parent toggles it via setDeepMode); the hook reads it directly.
export interface NanaChatServerParams {
  activeTab:        string
  activeSchoolSlug: string | null
  shortlistSlugs:   string[]
  // Slice 6: caller's view of the active base lens (derived from the
  // ?lens= URL parameter for research-room consumers; omitted for
  // legacy DecisionHub callers). The route prefers
  // research_sessions.active_lens_id → comparison_lenses.base_lens_kind
  // when set, falling back to this hint when no custom lens is active.
  lensView?:        'general' | 'child_fit'
}

export interface UseNanaChatOptions {
  initialSession:   Session | null
  initialMessages:  ResearchMessage[]
  getServerParams:  () => NanaChatServerParams
  // Optional: parent decides whether to honour ui_intent. DecisionHub
  // switches tabs / focuses schools on show_verdict + show_compare;
  // Research Room read-only mode ignores these. show_candidates is
  // handled internally (sets the hook-owned candidates state) and
  // ALSO emitted here for parent telemetry / future side-effects.
  //
  // Codex P2 #3: callback receives submission-time server params so
  // mid-stream parent-state changes don't desync the intent handler.
  // The original (pre-extraction) DecisionHub captured localShortlist
  // in the ask() closure; matching that semantic here avoids drift.
  onUiIntent?:      (intent: NanaUiIntent, submittedAt: NanaChatServerParams) => void
  // Override (defaults to /api/nana-research)
  endpoint?:        string
}

export interface UseNanaChatReturn {
  // State
  session:           Session | null
  setSession:        React.Dispatch<React.SetStateAction<Session | null>>
  messages:          ResearchMessage[]
  question:          string
  setQuestion:       React.Dispatch<React.SetStateAction<string>>
  isStreaming:       boolean
  streamBuf:         string
  streamFormat:      StreamFormat
  activeQuestion:    string
  activeParsed:      ParsedAnswer | null
  activeShareToken:  string | undefined
  devilsAdvocate:    boolean
  setDevilsAdvocate: React.Dispatch<React.SetStateAction<boolean>>
  deepMode:          boolean
  setDeepMode:       React.Dispatch<React.SetStateAction<boolean>>
  candidates:        RecommendedSchool[]
  setCandidates:     React.Dispatch<React.SetStateAction<RecommendedSchool[]>>
  askError:          AskError | null
  setAskError:       React.Dispatch<React.SetStateAction<AskError | null>>
  toolProgress:      ToolStep[]
  agentStatus:       string | null
  shortlistLocked:   boolean
  // Refs
  abortRef:          React.RefObject<AbortController | null>
  chatEndRef:        React.RefObject<HTMLDivElement>
  inputRef:          React.RefObject<HTMLTextAreaElement>
  // Actions
  // Slice 6.6 Tier 3 — optional overrideQuestion bypasses the input
  // textarea state. Used by ResearchRoom's ↻ Refresh lens flow which
  // synthesises "Create a lens for <topic>" without the user typing.
  // When omitted (existing call sites: Enter key + Send button + chip
  // pre-fill flow) the hook reads `question` state as before.
  ask:               (overrideQuestion?: string) => Promise<void>
  stopStream:        () => void
  startNewConversation: () => void
}

export function useNanaChat(opts: UseNanaChatOptions): UseNanaChatReturn {
  const [session,            setSession]            = useState<Session | null>(opts.initialSession)
  const [messages,           setMessages]           = useState<ResearchMessage[]>(opts.initialMessages)
  const [question,           setQuestion]           = useState('')
  const [isStreaming,        setIsStreaming]        = useState(false)
  const [streamBuf,          setStreamBuf]          = useState('')
  const [activeQuestion,     setActiveQuestion]     = useState('')
  const [activeParsed,       setActiveParsed]       = useState<ParsedAnswer | null>(null)
  const [activeShareToken,   setActiveShareToken]   = useState<string | undefined>()
  const [devilsAdvocate,     setDevilsAdvocate]     = useState(false)
  const [deepMode,           setDeepMode]           = useState(false)
  const [candidates,         setCandidates]         = useState<RecommendedSchool[]>([])
  const [askError,           setAskError]           = useState<AskError | null>(null)
  const [toolProgress,       setToolProgress]       = useState<ToolStep[]>([])
  const [agentStatus,        setAgentStatus]        = useState<string | null>(null)
  const [shortlistLocked,    setShortlistLocked]    = useState(false)
  // Phase A — intent router signals "prose" via {type:'answer_format'}.
  // During streaming the bubble renders streamBuf as plain markdown
  // (rather than running extractStreamingField against partial JSON).
  const [streamFormat,       setStreamFormat]       = useState<StreamFormat>('structured')

  const abortRef   = useRef<AbortController | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  // Keep latest references to caller-provided getters in refs so the ask()
  // useCallback can stay stable. If we put them in deps, an inline closure
  // from the parent would re-create ask() on every render — defeats memo.
  //
  // Codex P2 #1: assign during render rather than via useEffect. Effects
  // run in the commit phase AFTER the parent's render — if a user event
  // fires immediately after a hot re-render but before the next paint, an
  // effect-based update would hand the OLD closure to ask(). Refs are
  // safe to mutate during render (they're not part of React's reconciler
  // state model), so this is the canonical pattern for "always-current
  // callback ref".
  const serverParamsRef = useRef(opts.getServerParams)
  const onUiIntentRef   = useRef(opts.onUiIntent)
  const endpointRef     = useRef(opts.endpoint ?? '/api/nana-research')
  serverParamsRef.current = opts.getServerParams
  onUiIntentRef.current   = opts.onUiIntent
  endpointRef.current     = opts.endpoint ?? '/api/nana-research'

  // Slice 5-FU2: sync activeProposalIds from server (router.refresh()
  // re-runs the page server component). The hook owns its own messages
  // state after mount, so we'd otherwise miss × removals / re-adds that
  // change which proposals are currently materialised as table rows.
  // Stable signature dep avoids per-render churn — only fires when the
  // (msg_id, active_proposals) tuple actually changes.
  const activeProposalsSig = opts.initialMessages
    .map(m => `${m.id}:${(m.activeProposalIds ?? []).slice().sort().join(',')}`)
    .join('|')
  useEffect(() => {
    const byId = new Map<string, string[]>(
      opts.initialMessages.map(m => [m.id, m.activeProposalIds ?? []])
    )
    setMessages(prev => prev.map(m => {
      const next = byId.get(m.id)
      if (!next) return m
      const cur = m.activeProposalIds ?? []
      if (cur.length === next.length && cur.every((v, i) => v === next[i])) return m
      return { ...m, activeProposalIds: next }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProposalsSig])

  // Auto-scroll chat to bottom on new messages or stream tokens
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamBuf, isStreaming])

  const ask = useCallback(async (overrideQuestion?: string) => {
    // Slice 6.6 Tier 3: synthetic refresh-lens calls bypass `question`
    // state (the textarea may have unrelated draft text). Otherwise the
    // hook reads from state as it always has.
    const raw = typeof overrideQuestion === 'string' ? overrideQuestion : question
    const q = raw.trim()
    if (!q || isStreaming) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setAskError(null)
    setIsStreaming(true)
    setStreamBuf('')
    setStreamFormat('structured')   // reset; prose intent fires answer_format event if applicable
    setActiveQuestion(q)
    setActiveParsed(null)
    setActiveShareToken(undefined)
    setQuestion('')
    setCandidates([])
    setToolProgress([])
    setShortlistLocked(false)
    // Optimistic status copy — fills the silent ~3-5s gap between submit and
    // the first server-emitted agent_status / tool_call event so parents see
    // immediate feedback. Server events overwrite this once they arrive.
    setAgentStatus('Looking into our library — one moment…')

    // Hoisted so the finalization watchdog can run in both happy-path
    // (post-loop) and error-path (catch) — if the stream drops mid-flight
    // we still preserve whatever partial text Nana sent.
    let sawFinal = false
    let localStreamText = ''
    let serverError: string | null = null

    const commitPartialAsMessage = () => {
      setMessages(prev => [...prev, {
        id:        crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        question:  q,
        parsed:    null,
        rawText:   localStreamText,
        parseError: 'Stream ended before Nana finished a structured answer.',
        shareToken: undefined,
        createdAt: new Date().toISOString(),
      }])
    }

    // Snapshot server-params at submission time, not at hook-init time.
    // Codex P2 #3: this snapshot is also passed to onUiIntent at `final`
    // time so the parent's intent handler can use shortlist-as-it-was-at-
    // submit (matches the closure semantics of the original DecisionHub).
    const sp = serverParamsRef.current()

    try {
      const res = await fetch(endpointRef.current, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          sessionId: session?.id,
          devilsAdvocate,
          deepMode: deepMode && sp.shortlistSlugs.length >= 2,
          activeTab: sp.activeTab,
          activeSchoolSlug: sp.activeSchoolSlug,
          shortlistSlugs: sp.shortlistSlugs,
          // Slice 6: optional hint; route prefers DB-derived lens when set.
          ...(sp.lensView ? { lensView: sp.lensView } : {}),
        }),
        signal: ac.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        const httpError: any = new Error(err.error || 'Request failed')
        httpError.status = res.status
        throw httpError
      }

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let   rawBuf = ''
      let   shareToken: string | undefined
      let   localParsed: ParsedAnswer | null = null
      let   hasContent = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        rawBuf += dec.decode(value, { stream: true })
        const lines = rawBuf.split('\n')
        rawBuf = lines.pop() ?? ''

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
              if (evt.agenticLocked === true) setShortlistLocked(true)
              break

            case 'agent_status':
              // Server-emitted progress copy ("Planning the checks for your shortlist…",
              // "Writing the comparison…"). Parents see this during the silent multi-second
              // turns where there's no token streaming.
              if (typeof evt.message === 'string') setAgentStatus(evt.message)
              break

            case 'answer_format':
              // Phase A — intent router emits this BEFORE any tokens. Tells the
              // bubble whether to render streamBuf as plain markdown ('prose')
              // or run extractStreamingField against partial JSON ('structured').
              if (evt.format === 'prose' || evt.format === 'structured') {
                setStreamFormat(evt.format)
              }
              break

            case 'token': {
              const text = typeof evt.text === 'string' ? evt.text : ''
              if (text) {
                hasContent = true
                localStreamText += text
                setStreamBuf(prev => prev + text)
              }
              break
            }

            case 'stream_reset':
              // Agentic loop emits this before a parse-error retry when the
              // original turn already streamed partial tokens. Clear the
              // partial-JSON buffer so stale text doesn't sit on screen
              // while the retry runs.
              localStreamText = ''
              setStreamBuf('')
              break

            case 'final': {
              sawFinal = true
              setAgentStatus(null)  // clear progress copy now that the answer is here
              shareToken = evt.shareToken
              setActiveShareToken(evt.shareToken)
              if (evt.payload?.parsed) {
                localParsed = evt.payload.parsed
                setActiveParsed(localParsed)
              }
              const rawText: string | undefined =
                typeof evt.payload?.raw === 'string' && evt.payload.raw.length > 0
                  ? evt.payload.raw
                  : undefined
              const parseError: string | undefined =
                typeof evt.payload?.parseError === 'string' ? evt.payload.parseError : undefined
              setIsStreaming(false)
              if (localParsed || hasContent || rawText) {
                // Slice-5 round-4 fix (Codex F2): prefer the server-issued
                // DB id from the persisted message. confirm_add_row
                // requires a real id; the local UUID fallback only applies
                // before the route fix has landed (older deploy) — those
                // bubbles will fail confirm_add_row with "message not
                // found" until a refresh rehydrates the real id.
                const serverMessageId = typeof evt.messageId === 'string' && evt.messageId
                  ? evt.messageId
                  : null
                setMessages(prev => [...prev, {
                  id:        serverMessageId ?? crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
                  question:  q,
                  parsed:    localParsed,
                  rawText,
                  parseError,
                  shareToken,
                  createdAt: new Date().toISOString(),
                }])
              }
              // F5: react to ui_intent. Internally handled actions update
              // hook-owned state; parent's onUiIntent observer is also
              // invoked with the submission-time server-params snapshot
              // so it can match Nana's intent against the shortlist at
              // submit-time (Codex P2 #3 — restores original DH closure
              // semantics across mid-stream parent-state edits).
              {
                const intent = evt.uiIntent as NanaUiIntent | undefined
                // Codex P3 #1: discriminated-union narrowing — TS infers
                // intent.candidates as RecommendedSchool[] inside this
                // branch, no cast needed.
                if (intent?.action === 'show_candidates') {
                  setCandidates(intent.candidates)
                }
                if (intent && onUiIntentRef.current) {
                  onUiIntentRef.current(intent, sp)
                }
              }
              break
            }

            case 'summary_generating':
              break

            case 'summary_update':
              if (evt.payload?.summary) {
                setSession(prev => prev ? { ...prev, summary: evt.payload.summary } : prev)
              }
              break

            case 'error':
              serverError = typeof evt.error === 'string' ? evt.error : 'Nana hit an error generating this answer.'
              setAgentStatus(null)  // clear optimistic copy so error isn't hidden behind a spinner
              setIsStreaming(false)
              void reader.cancel().catch(() => {})
              break

            case 'tool_call': {
              // Agentic-mode progress event. Don't touch sawFinal/serverError —
              // these are pure progress bookkeeping. Append on 'started',
              // mark complete in place on 'completed'.
              const name = typeof evt.name === 'string' ? evt.name : 'tool'
              const args = (evt.args && typeof evt.args === 'object') ? evt.args as Record<string, unknown> : {}
              const id = `${name}:${JSON.stringify(args)}`
              const status: 'started' | 'completed' = evt.status === 'completed' ? 'completed' : 'started'
              const summary = typeof evt.result_summary === 'string' ? evt.result_summary : undefined

              setToolProgress(prev => {
                if (status === 'started') {
                  if (prev.some(p => p.id === id)) return prev
                  return [...prev, { id, name, args, status: 'started' }]
                }
                return prev.map(p => p.id === id ? { ...p, status: 'completed', result_summary: summary } : p)
              })
              break
            }
          }
        }
      }

      // Watchdog: stream closed cleanly but no `final` arrived. Either the brain
      // emitted an `error` event, or the response ended early. Surface what we
      // can so the user never sees a silent dead-end.
      if (!sawFinal) {
        if (serverError) {
          setAskError({ message: serverError })
        } else if (localStreamText) {
          commitPartialAsMessage()
        } else {
          setAskError({ message: 'The connection ended before Nana could answer. Please try again.' })
        }
      }

    } catch (e: any) {
      if (e?.name === 'AbortError') return
      // Mid-stream drop with partial tokens already received: commit the partial
      // so the user keeps what Nana actually said, rather than losing it to an
      // error toast.
      if (!sawFinal && localStreamText) {
        commitPartialAsMessage()
      } else {
        const status = typeof e?.status === 'number' ? e.status : undefined
        const message =
          status === 401 ? 'You need to be signed in to ask Nana. Open this in a browser where you\'re logged in.'
          : status === 402 ? 'Deep Research needs an active subscription. Visit /unlock to subscribe.'
          : status === 429 ? 'You\'re sending questions too fast. Give it a moment and try again.'
          : (typeof e?.message === 'string' && e.message) || 'Something went wrong. Please try again.'
        setAskError({ status, message })
      }
    } finally {
      setIsStreaming(false)
      setAgentStatus(null)  // clear any leftover progress copy on stream end
    }
  }, [question, isStreaming, session, devilsAdvocate, deepMode])

  function stopStream() {
    abortRef.current?.abort()
    setIsStreaming(false)
  }

  function startNewConversation() {
    abortRef.current?.abort()
    setIsStreaming(false)
    setSession(null)
    setMessages([])
    setStreamBuf('')
    setActiveQuestion('')
    setActiveParsed(null)
    setActiveShareToken(undefined)
    setCandidates([])
    setAskError(null)
    setQuestion('')
    inputRef.current?.focus()
  }

  return {
    session, setSession,
    messages, question, setQuestion,
    isStreaming, streamBuf, streamFormat,
    activeQuestion, activeParsed, activeShareToken,
    devilsAdvocate, setDevilsAdvocate,
    deepMode, setDeepMode,
    candidates, setCandidates,
    askError, setAskError,
    toolProgress, agentStatus,
    shortlistLocked,
    abortRef, chatEndRef, inputRef,
    ask, stopStream, startNewConversation,
  }
}
