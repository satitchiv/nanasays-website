'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  // Slice 6: the page's active ?lens= selection. Threaded through
  // use-nana-chat → /api/nana-research as `lensView` so the route's
  // active-lens fallback resolves to the right base when the parent
  // hasn't created a custom lens yet.
  lensView?:           'general' | 'child_fit'
  // Slice 6 commit 7: re-rank pill click handler. Owned by ResearchRoom
  // (which holds the ephemeral view state). Pure client-state — no DB
  // write, no fetch. The receive-side applies viewSpec.weights as a
  // sort/filter overlay on the comparison table.
  onApplyReRank?:      (messageId: string, proposalId: string, viewSpec: import('@/lib/nana/types').ProposeViewSpec, label: string) => void
  // Slice 6 commit 9: Save-as-lens flow. canSaveAsLens reflects whether
  // there's a pill-derived ephemeral view that can be saved (ResearchRoom
  // owns the state). onSaveAsLens fires the write-action POST and on
  // success clears the overlay + refreshes the page so the new lens
  // becomes active via loadActiveLens.
  canSaveAsLens?:      boolean
  onSaveAsLens?:       (lensName: string) => Promise<{ ok: boolean; code?: string; existingLensId?: string }>
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
  onConfirmAddRow,
  onApplyReRank,
  onConfirmTopicLens,
  canSaveAsLens,
  onSaveAsLens,
  actionError,
  onDismissActionError,
}: {
  buildMode:            boolean
  onToggleBuildMode:    () => void
  chat:                 ReturnType<typeof useNanaChat>
  onConfirmAddRow:      (messageId: string, proposalId: string) => Promise<{ ok: boolean; code?: string }>
  onApplyReRank?:       (messageId: string, proposalId: string, viewSpec: import('@/lib/nana/types').ProposeViewSpec, label: string) => void
  onConfirmTopicLens?:  (messageId: string, proposalId: string) => Promise<{ ok: boolean; code?: string }>
  canSaveAsLens?:       boolean
  onSaveAsLens?:        (lensName: string) => Promise<{ ok: boolean; code?: string; existingLensId?: string }>
  actionError:          string | null
  onDismissActionError: () => void
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
            <NanaMsgBubble msg={msg} onConfirmAddRow={onConfirmAddRow} onApplyReRank={onApplyReRank} onConfirmTopicLens={onConfirmTopicLens} />
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

        {actionError && (
          <div className="rr-chat-error" role="alert">
            {actionError}
            <button type="button" className="rr-chat-error-dismiss" onClick={onDismissActionError}>×</button>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Slice 6 commit 9 — chip rail above the chat input.
          Discoverable commands. Each chip pre-fills bulletproof
          phrasing the classifier already understands; the parent
          customises the bracketed bit and hits send. The Save view
          chip is enabled only when an ephemeral pill-derived view
          is currently active (canSaveAsLens). */}
      <ChatActionsRail
        disabled={isStreaming}
        canSaveAsLens={Boolean(canSaveAsLens && onSaveAsLens)}
        onChipFill={(prefix) => {
          setQuestion(prefix)
          // Defer focus + cursor-to-end so React commits the value first.
          requestAnimationFrame(() => {
            inputRef.current?.focus()
            const el = inputRef.current
            if (el) {
              el.setSelectionRange(prefix.length, prefix.length)
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 120) + 'px'
            }
          })
        }}
        onSaveAsLens={onSaveAsLens}
      />

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
  lensView         = 'general',
  onApplyReRank,
  canSaveAsLens    = false,
  onSaveAsLens,
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
      lensView,
    }),
    // Read-only: ignore ui_intent. DecisionHub uses these for tab switching;
    // Research Room's tabs are driven by the user, not Nana.
  })

  const isMobile = useIsMobile()
  const router   = useRouter()

  // Slice 5: confirm a "+ Add as row" proposal. Posts to write-action; on
  // success refreshes the page so loadComparisonData re-reads
  // comparison_rows. Errors get surfaced via askError-style alert below
  // the thread (cheap; no toast lib in this codebase).
  const [actionError, setActionError] = useState<string | null>(null)
  async function onConfirmAddRow(messageId: string, proposalId: string): Promise<{ ok: boolean; code?: string }> {
    try {
      const res = await fetch('/api/research-room/write-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_row', message_id: messageId, proposal_id: proposalId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const code = typeof j?.code === 'string' ? j.code : 'request_failed'
        if (code === 'duplicate_name') {
          setActionError('A row with that name already exists in this comparison.')
        } else {
          setActionError(`Could not add the row (${code}).`)
        }
        return { ok: false, code }
      }
      setActionError(null)
      router.refresh()
      return { ok: true }
    } catch (e) {
      console.error('[research-room write-action]', e)
      setActionError('Network error while adding the row.')
      return { ok: false, code: 'network' }
    }
  }

  // Slice 6.5: confirm a "Create [topic] lens with N new rows" proposal.
  // Same shape as onConfirmAddRow but routed at action='create_topic_lens'.
  // The RPC inserts the lens + N rows + flips active_lens_id atomically;
  // router.refresh() re-runs the page server fragment and the loader picks
  // up the topic rows on the active lens.
  async function onConfirmTopicLens(messageId: string, proposalId: string): Promise<{ ok: boolean; code?: string }> {
    try {
      const res = await fetch('/api/research-room/write-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_topic_lens', message_id: messageId, proposal_id: proposalId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const code = typeof j?.code === 'string' ? j.code : 'request_failed'
        if (code === 'duplicate_name') {
          setActionError('A lens with that name already exists in this session.')
        } else if (code === 'empty_after_resolution') {
          setActionError('This topic-lens proposal has no rows to insert.')
        } else {
          setActionError(`Could not create the topic lens (${code}).`)
        }
        return { ok: false, code }
      }
      setActionError(null)
      router.refresh()
      return { ok: true }
    } catch (e) {
      console.error('[research-room write-action] create_topic_lens', e)
      setActionError('Network error while creating the topic lens.')
      return { ok: false, code: 'network' }
    }
  }


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

            <ChatBody buildMode={buildMode} onToggleBuildMode={onToggleBuildMode} chat={chat} onConfirmAddRow={onConfirmAddRow} onApplyReRank={onApplyReRank} onConfirmTopicLens={onConfirmTopicLens} canSaveAsLens={canSaveAsLens} onSaveAsLens={onSaveAsLens} actionError={actionError} onDismissActionError={() => setActionError(null)} />
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

            <ChatBody buildMode={buildMode} onToggleBuildMode={onToggleBuildMode} chat={chat} onConfirmAddRow={onConfirmAddRow} onApplyReRank={onApplyReRank} onConfirmTopicLens={onConfirmTopicLens} canSaveAsLens={canSaveAsLens} onSaveAsLens={onSaveAsLens} actionError={actionError} onDismissActionError={() => setActionError(null)} />
          </div>
        </>
      )}
    </>
  )
}

// Slice 6 — chip rail above the chat input. Discoverable commands
// surface three moves the parent can make on the comparison table:
// add a row, re-rank, save the current view. The first two chips
// PRE-FILL the input with phrasing the classifier already understands;
// the parent finishes the sentence and hits send. The 'Save view' chip
// is contextual — only enabled when an ephemeral pill-derived view is
// active — and short-circuits the chat entirely: click → inline name
// input → write-action POST → router.refresh. (The "Create a lens…"
// chip was dropped at slice 6 close; Re-rank + Save view covers the
// same flow without a separate proposal kind.)
function ChatActionsRail({
  disabled,
  canSaveAsLens,
  onChipFill,
  onSaveAsLens,
}: {
  disabled:      boolean
  canSaveAsLens: boolean
  onChipFill:    (prefix: string) => void
  onSaveAsLens?: (lensName: string) => Promise<{ ok: boolean; code?: string; existingLensId?: string }>
}) {
  const [savePromptOpen, setSavePromptOpen] = useState(false)
  const [lensName,       setLensName]       = useState('')
  const [saveError,      setSaveError]      = useState<string | null>(null)
  const [saving,         setSaving]         = useState(false)

  async function submitSave() {
    if (!onSaveAsLens) return
    setSaveError(null)
    setSaving(true)
    const result = await onSaveAsLens(lensName)
    setSaving(false)
    if (result.ok) {
      setSavePromptOpen(false)
      setLensName('')
      return
    }
    if (result.code === 'duplicate_name') {
      setSaveError('A lens with that name already exists. Pick a different name.')
    } else if (result.code === 'bad_name') {
      setSaveError('Name must be 1–40 characters.')
    } else if (result.code === 'empty_after_resolution') {
      setSaveError('The rows referenced by this view are no longer active.')
    } else {
      setSaveError('Could not save the lens. Try again.')
    }
  }

  return (
    <div className="rr-chat-rail">
      <button type="button" className="rr-chat-rail-chip" disabled={disabled}
              onClick={() => onChipFill('Add a row about ')}>
        <span aria-hidden>+</span> Add a row…
      </button>
      <button type="button" className="rr-chat-rail-chip" disabled={disabled}
              onClick={() => onChipFill('Rank these by ')}>
        <span aria-hidden>↻</span> Re-rank by…
      </button>
      <button
        type="button"
        className="rr-chat-rail-chip rr-chat-rail-chip--save"
        disabled={disabled || !canSaveAsLens}
        title={canSaveAsLens ? 'Save the current view as a permanent lens' : 'Apply a re-rank first to enable Save view'}
        onClick={() => { setSavePromptOpen(true); setSaveError(null) }}
      >
        <span aria-hidden>✦</span> Save view
      </button>

      {savePromptOpen && (
        <form
          className="rr-chat-rail-save-form"
          onSubmit={e => { e.preventDefault(); submitSave() }}
        >
          <input
            type="text"
            value={lensName}
            onChange={e => setLensName(e.target.value)}
            placeholder="Name this lens (e.g. Academics + value)"
            maxLength={40}
            disabled={saving}
            autoFocus
            className="rr-chat-rail-save-input"
          />
          <button type="submit" className="rr-chat-rail-save-submit" disabled={saving || lensName.trim().length === 0}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="rr-chat-rail-save-cancel" disabled={saving}
                  onClick={() => { setSavePromptOpen(false); setSaveError(null); setLensName('') }}>
            Cancel
          </button>
          {saveError && <span className="rr-chat-rail-save-error" role="alert">{saveError}</span>}
        </form>
      )}
    </div>
  )
}

