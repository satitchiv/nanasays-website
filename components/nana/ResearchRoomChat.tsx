'use client'

import { useEffect, useRef } from 'react'

export type ChatState = 'closed' | 'default' | 'focus'

type Props = {
  state: ChatState
  buildMode: boolean
  onCollapse: () => void
  onExpandDefault: () => void
  onToggleFocus: () => void
  onToggleBuildMode: () => void
}

type ChatBodyProps = Pick<Props, 'buildMode' | 'onToggleBuildMode'>

const DRAG_TAP_THRESHOLD = 5
const DRAG_SNAP_THRESHOLD = 70

// Inner content shared by the desktop rail and the mobile bottom sheet — build
// mode toggle, thread, and (disabled) input. Slice 1 ships placeholder content
// only; real chat lands in slice 5.
function ChatBody({ buildMode, onToggleBuildMode }: ChatBodyProps) {
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
        <div className="rr-bubble-nana">
          <div className="rr-bubble-head">
            <svg className="rr-bubble-avatar" aria-hidden="true">
              <use href="#ic-nana" />
            </svg>
            <div className="rr-bubble-name">
              Nana
              <small>placeholder · slice 5</small>
            </div>
          </div>
          <div className="rr-bubble-eyebrow">Coming soon</div>
          <div className="rr-bubble-lead">
            Real chat lands in slice 5. For now, click the tabs above to see the four surfaces.
          </div>
        </div>
      </div>

      <div className="rr-chat-input">
        <label className="rr-chat-input-row">
          <input
            type="text"
            placeholder="Chat coming in slice 5"
            disabled
            aria-label="Chat input (disabled — slice 5)"
          />
          <button type="button" disabled>Ask</button>
        </label>
      </div>
    </>
  )
}

// Right-rail chat shell — slice 1.
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
}: Props) {
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
      {/* ─── Desktop right rail ─────────────────────────────────────────── */}
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

            <ChatBody buildMode={buildMode} onToggleBuildMode={onToggleBuildMode} />
          </div>
        )}
      </aside>

      {/* ─── Mobile FAB (rendered only when chat is closed) ─────────────── */}
      {state === 'closed' && (
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

      {/* ─── Mobile bottom sheet (rendered only when chat is open) ──────── */}
      {state !== 'closed' && (
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

            <ChatBody buildMode={buildMode} onToggleBuildMode={onToggleBuildMode} />
          </div>
        </>
      )}
    </>
  )
}
