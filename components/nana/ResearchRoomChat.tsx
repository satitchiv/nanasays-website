'use client'

import { useEffect, useRef, useState } from 'react'
import { useNanaChat } from '@/lib/nana/use-nana-chat'
import { NanaMsgBubble, prettyToolName } from './NanaBubble'
import type { Session, ResearchMessage } from '@/lib/nana/types'

// Codex P2 #2 fix: gate desktop vs mobile ChatBody rendering by viewport
// so we mount only ONE instance at a time. Both surfaces share inputRef +
// chatEndRef from the chat hook; rendering both concurrently makes the
// LATER-mounted one (mobile) win those refs even on desktop, silently
// breaking auto-scroll and "+ New" focus.
const MOBILE_BREAKPOINT = 880

function useIsMobile(): boolean {
  // Default to false on the server — SSR mounts the desktop branch first;
  // a mobile client will swap to mobile on the first effect after hydrate.
  // The brief render-after-hydrate flicker is acceptable; alternatives
  // (read window during render) break SSR.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const apply = () => setIsMobile(mql.matches)
    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [])
  return isMobile
}

export type ChatState = 'closed' | 'default' | 'focus'

type Props = {
  state:               ChatState
  buildMode:           boolean
  onCollapse:          () => void
  onExpandDefault:     () => void
  onToggleFocus:       () => void
  onToggleBuildMode:   () => void
  // Slice 3d phase 4 — slugs from the active child's comparison data.
  // Threaded into the chat hook's API call so Nana scopes answers to
  // the parent's current shortlist, mirroring DecisionHub's behaviour.
  shortlistSlugs?:     string[]
  initialSession?:     Session | null
  initialMessages?:    ResearchMessage[]
}

const DRAG_TAP_THRESHOLD = 5
const DRAG_SNAP_THRESHOLD = 70

// Inner content shared by the desktop rail and the mobile bottom sheet.
// Receives the chat hook return-value from the parent so both surfaces
// share one streaming state machine. Read-only mode for slice 3d:
// no devilsAdvocate / deepMode toggles, no candidate-add, no uiIntent
// tab switching — those land in slice 5/6.
function ChatBody({
  buildMode,
  onToggleBuildMode,
  chat,
}: {
  buildMode:         boolean
  onToggleBuildMode: () => void
  chat:              ReturnType<typeof useNanaChat>
}) {
  const {
    messages,
    question,        setQuestion,
    isStreaming,     streamBuf, streamFormat,
    activeQuestion,
    agentStatus,     toolProgress,
    askError,
    ask,             stopStream, startNewConversation,
    chatEndRef,      inputRef,
  } = chat

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask()
    }
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuestion(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <>
      <button
        type="button"
        className={`rr-build-toggle${buildMode ? ' is-active' : ''}`}
        onClick={onToggleBuildMode}
        aria-pressed={buildMode}
      >
        <span className="rr-bt-ic" aria-hidden="true">⚒</span>
        <span className="rr-bt-body">
          <span className="rr-bt-name">Work on comparison table</span>
          <span className="rr-bt-desc">Nana proactively suggests rows + dimensions</span>
        </span>
        <span className="rr-bt-state">{buildMode ? 'ON' : 'OFF'}</span>
      </button>

      <div className="rr-thread">
        {messages.length === 0 && !isStreaming && (
          <div className="rr-bubble-nana">
            <div className="rr-bubble-head">
              <svg className="rr-bubble-avatar" aria-hidden="true">
                <use href="#ic-nana" />
              </svg>
              <div className="rr-bubble-name">Nana</div>
            </div>
            <div className="rr-bubble-lead">
              Ask me anything about the schools in your comparison — fees, results, pastoral care, how they stack up against each other.
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id}>
            <div className="rr-bubble-user">{msg.question}</div>
            <NanaMsgBubble msg={msg} />
          </div>
        ))}

        {isStreaming && (
          <>
            {activeQuestion && <div className="rr-bubble-user">{activeQuestion}</div>}
            {agentStatus && (
              <div className="rr-agent-status">
                <span className="rr-agent-status-dot" aria-hidden="true" />
                <span>{agentStatus}</span>
              </div>
            )}
            {toolProgress.length > 0 && (
              <div className="rr-tool-strip">
                {toolProgress.map(step => (
                  <span
                    key={step.id}
                    className={`rr-tool-pill rr-tool-pill--${step.status}`}
                  >
                    {prettyToolName(step.name)}
                    {step.status === 'completed' ? ' ✓' : '…'}
                  </span>
                ))}
              </div>
            )}
            <NanaMsgBubble isStreaming streamBuf={streamBuf} streamFormat={streamFormat} />
          </>
        )}

        {askError && !isStreaming && (
          <div className="rr-chat-error" role="alert">
            {askError.message}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <form
        className="rr-chat-input"
        onSubmit={e => { e.preventDefault(); ask() }}
      >
        {(messages.length > 0 || isStreaming) && (
          <button
            type="button"
            className="rr-chat-new-btn"
            onClick={startNewConversation}
            disabled={isStreaming}
            title="Start a fresh conversation"
          >
            + New
          </button>
        )}
        <label className="rr-chat-input-row">
          <textarea
            ref={inputRef}
            value={question}
            onChange={handleTextareaInput}
            onKeyDown={handleKey}
            placeholder="Ask Nana about these schools…"
            rows={1}
            disabled={isStreaming}
            aria-label="Ask Nana"
          />
          {isStreaming ? (
            <button type="button" onClick={stopStream}>Stop</button>
          ) : (
            <button type="submit" disabled={!question.trim()}>Ask</button>
          )}
        </label>
      </form>
    </>
  )
}

// Right-rail chat shell — slice 1 chrome + slice 3d real chat.
//   Desktop: 3 widths (closed 56 / default 400 / focus 620) on a side rail.
//   Mobile (≤880px): a Nana FAB bottom-right when closed, a draggable bottom
//     sheet when default (50dvh) or focus (90dvh). Same state machine.
//
// Codex-flagged a11y fixes applied:
//   - FAB and sheet are conditionally rendered (no offscreen tab targets)
//   - sheet has aria-modal + Escape-to-close + focus moves into close button on open
//   - drag handle distinguishes drag from tap via a didDrag flag
//   - drag offset clamped both bounds; pointer events guarded for multitouch
export default function ResearchRoomChat({
  state,
  buildMode,
  onCollapse,
  onExpandDefault,
  onToggleFocus,
  onToggleBuildMode,
  shortlistSlugs   = [],
  initialSession   = null,
  initialMessages  = [],
}: Props) {
  // One chat hook instance — but only ONE ChatBody (desktop OR mobile)
  // is mounted at a time so the hook's inputRef/chatEndRef attach to the
  // visible surface. See useIsMobile + the gated branches below.
  const chat = useNanaChat({
    initialSession,
    initialMessages,
    getServerParams: () => ({
      activeTab:        'compare',
      activeSchoolSlug: null,
      shortlistSlugs,
    }),
    // Read-only: ignore ui_intent. DecisionHub uses these for tab switching;
    // Research Room's tabs are driven by the user, not Nana.
  })

  const isMobile = useIsMobile()

  const sheetRef = useRef<HTMLDivElement | null>(null)
  const sheetCloseRef = useRef<HTMLButtonElement | null>(null)
  const dragRef = useRef<{
    startY: number
    dragging: boolean
    didDrag: boolean
    pointerId: number | null
  }>({ startY: 0, dragging: false, didDrag: false, pointerId: null })

  const setOffset = (px: number) => {
    sheetRef.current?.style.setProperty('--rr-drag-offset', `${px}px`)
  }

  const handleDragStart = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.isPrimary) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startY: e.clientY,
      dragging: true,
      didDrag: false,
      pointerId: e.pointerId,
    }
    sheetRef.current?.classList.add('is-dragging')
  }

  const handleDragMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d.dragging || d.pointerId !== e.pointerId) return
    const delta = e.clientY - d.startY
    if (Math.abs(delta) > DRAG_TAP_THRESHOLD) d.didDrag = true
    // Clamp both bounds — viewport-relative so big swipes can't fling the sheet
    // off-screen. Upward drag is shorter (~200px) since we never grow past full.
    const maxDown = typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600
    const clamped = Math.min(maxDown, Math.max(-200, delta))
    setOffset(clamped)
  }

  const handleDragEnd = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d.dragging || d.pointerId !== e.pointerId) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    const delta = e.clientY - d.startY
    d.dragging = false
    d.pointerId = null
    sheetRef.current?.classList.remove('is-dragging')
    setOffset(0)

    if (!d.didDrag) return // pure tap — onClick will handle

    if (delta > DRAG_SNAP_THRESHOLD) {
      if (state === 'focus') onExpandDefault()
      else if (state === 'default') onCollapse()
    } else if (delta < -DRAG_SNAP_THRESHOLD) {
      if (state === 'default') onToggleFocus()
    }
  }

  const handleHandleClick = () => {
    // If a drag finished, swallow the synthetic click (iOS Safari fires both).
    if (dragRef.current.didDrag) {
      dragRef.current.didDrag = false
      return
    }
    if (state === 'default') onToggleFocus()
    else if (state === 'focus') onExpandDefault()
  }

  // Escape closes the mobile sheet. Only listen while the sheet is open.
  useEffect(() => {
    if (state === 'closed') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCollapse()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state, onCollapse])

  // When the mobile sheet opens, move focus to the close button so screen
  // readers and keyboard users land inside the dialog. Only fires on mobile —
  // desktop rail uses the rail's native focus order.
  useEffect(() => {
    if (state === 'closed') return
    const isMobile =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 880px)').matches
    if (!isMobile) return
    sheetCloseRef.current?.focus()
  }, [state])

  return (
    <>
      {/* ─── Desktop right rail (only on >880px viewports) ──────────────── */}
      {!isMobile && (
      <aside className="rr-chat" aria-label="Nana chat">
        {state === 'closed' && (
          <div className="rr-chat-closed">
            <button
              type="button"
              className="rr-chat-expand-btn"
              onClick={onExpandDefault}
              aria-label="Open chat"
              title="Open chat"
            >
              ›
            </button>
            <button
              type="button"
              className="rr-chat-closed-avatar-btn"
              onClick={onExpandDefault}
              aria-label="Ask Nana"
              title="Ask Nana"
            >
              <svg className="rr-chat-closed-avatar" aria-hidden="true">
                <use href="#ic-nana" />
              </svg>
            </button>
            <button
              type="button"
              className="rr-chat-closed-label"
              onClick={onExpandDefault}
            >
              ASK <strong>NANA</strong>
            </button>
          </div>
        )}

        {state !== 'closed' && (
          <div className="rr-chat-open">
            <header className="rr-chat-head">
              <svg className="rr-chat-avatar" aria-hidden="true">
                <use href="#ic-nana" />
              </svg>
              <div className="rr-chat-name">
                Nana
                <span>{buildMode ? 'BUILD MODE · CO-BUILDER' : 'ANSWERING'}</span>
              </div>
              <button
                type="button"
                className="rr-chat-state-btn"
                onClick={onToggleFocus}
                aria-label={state === 'focus' ? 'Shrink chat' : 'Expand chat'}
                title={state === 'focus' ? 'Shrink' : 'Expand'}
              >
                ⤢
              </button>
              <button
                type="button"
                className="rr-chat-state-btn"
                onClick={onCollapse}
                aria-label="Collapse chat"
                title="Collapse"
              >
                ›
              </button>
            </header>

            <ChatBody buildMode={buildMode} onToggleBuildMode={onToggleBuildMode} chat={chat} />
          </div>
        )}
      </aside>
      )}

      {/* ─── Mobile FAB (rendered only when chat is closed AND on mobile) ─ */}
      {isMobile && state === 'closed' && (
        <button
          type="button"
          className="rr-fab is-visible"
          onClick={onExpandDefault}
          aria-label="Open chat with Nana"
        >
          <span className="rr-fab-pulse" aria-hidden="true" />
          <svg className="rr-fab-avatar" aria-hidden="true">
            <use href="#ic-nana" />
          </svg>
        </button>
      )}

      {/* ─── Mobile bottom sheet (only when chat is open AND on mobile) ── */}
      {isMobile && state !== 'closed' && (
        <>
          <button
            type="button"
            className="rr-scrim"
            onClick={onCollapse}
            aria-label="Close chat"
            tabIndex={-1}
          />
          <div
            ref={sheetRef}
            className={`rr-sheet rr-sheet-${state}`}
            role="dialog"
            aria-modal="true"
            aria-label="Chat with Nana"
          >
            <button
              type="button"
              className="rr-sheet-handle"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              onClick={handleHandleClick}
              aria-label="Drag to resize chat. Tap to expand or shrink."
            >
              <span className="rr-sheet-grip" aria-hidden="true" />
            </button>

            <header className="rr-sheet-head">
              <svg className="rr-chat-avatar" aria-hidden="true">
                <use href="#ic-nana" />
              </svg>
              <div className="rr-chat-name">
                Nana
                <span>{buildMode ? 'BUILD MODE · CO-BUILDER' : 'ANSWERING'}</span>
              </div>
              <button
                ref={sheetCloseRef}
                type="button"
                className="rr-chat-state-btn"
                onClick={onCollapse}
                aria-label="Close chat"
                title="Close"
              >
                ✕
              </button>
            </header>

            <ChatBody buildMode={buildMode} onToggleBuildMode={onToggleBuildMode} chat={chat} />
          </div>
        </>
      )}
    </>
  )
}
