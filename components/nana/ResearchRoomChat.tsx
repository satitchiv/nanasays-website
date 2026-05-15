'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNanaChat } from '@/lib/nana/use-nana-chat'
import { NanaMsgBubble, prettyToolName } from './NanaBubble'
import BuildModeProgressBar from './BuildModeProgressBar'
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
  // Session 4 follow-up — DB-hydrated Build Mode progress so the bar +
  // welcome-back bubble render on first paint when the parent re-enters
  // a session with prior Build Mode history.
  initialBuildModeState?: import('@/lib/nana/types').BuildModeStreamState | null
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
  // Slice 6.6 Tier 3 — bridge from ComparisonView's ↻ Refresh lens
  // button. ResearchRoom updates this prop with a new nonce on each
  // click; the chat reacts in a useEffect by submitting "Create a lens
  // for <topicName>" through the regular ask() flow. Same pipeline as
  // typing it manually — Nana emits a propose_create_topic_lens
  // proposal, the user clicks confirm, the create_topic_lens RPC's
  // MERGE branch (Tier 2) fills cells for any newly-shortlisted schools.
  pendingRefreshTopicLens?: { topicName: string; nonce: number } | null
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
  onSkipBuildMode,
  onBuildTableNow,
  chat,
  showWelcomeBack,
  onDismissWelcomeBack,
  onConfirmAddRow,
  onConfirmAddSchool,
  onApplyReRank,
  onAddToLetter,
  onConfirmTopicLens,
  canSaveAsLens,
  onSaveAsLens,
  actionError,
  onDismissActionError,
}: {
  buildMode:            boolean
  onToggleBuildMode:    () => void
  // Slice 8 Build 3 session 4 — Build Mode session-exit affordances.
  // Both are pure callbacks; ResearchRoomChat owns the state transitions
  // (toggle flip + post-toggle ask for the "build table" path).
  onSkipBuildMode?:     () => void
  onBuildTableNow?:     () => void
  chat:                 ReturnType<typeof useNanaChat>
  // Codex welcome-back design pass — bubble visibility owned by
  // ResearchRoomChat (state lives there so it survives desktop↔mobile
  // ChatBody re-mounts). ChatBody just renders + dispatches dismiss.
  showWelcomeBack:      boolean
  onDismissWelcomeBack: () => void
  onConfirmAddRow:      (messageId: string, proposalId: string) => Promise<{ ok: boolean; code?: string }>
  onConfirmAddSchool:   (messageId: string, proposalId: string) => Promise<{ ok: boolean; code?: string }>
  onApplyReRank?:       (messageId: string, proposalId: string, viewSpec: import('@/lib/nana/types').ProposeViewSpec, label: string) => void
  onAddToLetter:        (messageId: string, proposalId: string) => Promise<{ ok: boolean; code?: string }>
  onConfirmTopicLens?:  (messageId: string, proposalId: string) => Promise<{ ok: boolean; code?: string; merged?: { rows_inserted: number; rows_updated: number } }>
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
    buildModeState,
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
        // Codex Q8 — disable toggle while a turn is streaming. Toggling
        // mid-stream creates confusing entry/reset timing: the active
        // SSE turn writes to whichever route was selected at submit time
        // (turn vs finalize), but the UI may flicker buildMode state +
        // re-trigger the welcome-back reset effect.
        disabled={chat.isStreaming}
        aria-pressed={buildMode}
      >
        <span className="rr-bt-ic" aria-hidden="true">⚒</span>
        <span className="rr-bt-body">
          <span className="rr-bt-name">Work on comparison table</span>
          <span className="rr-bt-desc">Nana proactively suggests rows + dimensions</span>
        </span>
        <span className="rr-bt-state">{buildMode ? 'ON' : 'OFF'}</span>
      </button>

      {buildMode && buildModeState && (
        <BuildModeProgressBar
          state={buildModeState}
          onBuildTableNow={onBuildTableNow}
        />
      )}

      {buildMode && !isStreaming && onSkipBuildMode && (
        // Slice 8 Build 3 session 4 — escape hatch from Build Mode.
        // Always available while the toggle is on; client-only — progress
        // survives via the DB (research_sessions.build_mode_progress) so
        // re-entering picks up where the parent left off.
        <button
          type="button"
          className="rr-build-skip"
          onClick={onSkipBuildMode}
        >
          ↩ Skip Build Mode for now — your progress is saved
        </button>
      )}

      {/* Welcome-back bubble (Codex design pass). Owned by ResearchRoomChat
          via `showWelcomeBack` so dismiss-state survives desktop↔mobile
          re-mounts. Reads chat.buildModeState (LIVE, mutates as turns
          fire) so the % is current. role="status" + aria-live="polite"
          announce to screen readers; dismiss button is keyboard-
          accessible. Placed OUTSIDE rr-thread to avoid the auto-scroll
          (v4 fix). */}
      {showWelcomeBack && chat.buildModeState && (
        <div
          className="rr-bubble-nana rr-bubble-nana--pinned"
          role="status"
          aria-live="polite"
        >
          <div className="rr-bubble-head">
            <svg className="rr-bubble-avatar" aria-hidden="true">
              <use href="#ic-nana" />
            </svg>
            <div className="rr-bubble-name">Nana</div>
            <button
              type="button"
              className="rr-bubble-dismiss"
              onClick={onDismissWelcomeBack}
              aria-label="Dismiss welcome back message"
              title="Dismiss"
            >×</button>
          </div>
          <div className="rr-bubble-lead">
            <strong>Welcome back.</strong>{' '}
            You’re at <strong>{Math.round((chat.buildModeState.progress?.usable_total ?? 0) * 100)}%</strong> on Build Mode.
            We can pick up right where we left off — just answer the next question below,
            or hit <em>Skip Build Mode for now</em> to head back to the table.
          </div>
        </div>
      )}

      <div className="rr-thread">
        {messages.length === 0 && !isStreaming && (
          <div className="rr-bubble-nana">
            <div className="rr-bubble-head">
              <svg className="rr-bubble-avatar" aria-hidden="true">
                <use href="#ic-nana" />
              </svg>
              <div className="rr-bubble-name">Nana</div>
            </div>
            {buildMode ? (
              // Slice 8 Build 3 session 4 — Build Mode opener.
              // Client-side synthetic message: no LLM call, no DB row.
              // Re-renders fresh every time the parent enters Build Mode
              // with an empty thread; once they send the first reply,
              // messages.length > 0 and this branch hides naturally.
              <>
                <div className="rr-bubble-lead">
                  <strong>Welcome to Build Mode.</strong>{' '}
                  The comparison table on the right is generic right now — every parent sees the same rows.
                  In Build Mode, I’ll ask you a few questions about what matters most to your family,
                  then we’ll build rows tailored to <em>your</em> priorities, not generic ones.
                </div>
                <div className="rr-bubble-lead">
                  You can skip anything you’d rather not answer, pause with the “Skip for now” button at any time,
                  and I’ll remember where we left off.
                </div>
                <div className="rr-bubble-lead">
                  To start — <strong>what’s the one thing that matters most to you when you picture the right school for your child?</strong>
                </div>
              </>
            ) : (
              <div className="rr-bubble-lead">
                Ask me anything about the schools in your comparison — fees, results, pastoral care, how they stack up against each other.
              </div>
            )}
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id}>
            <div className="rr-bubble-user">{msg.question}</div>
            <NanaMsgBubble
              msg={msg}
              onConfirmAddRow={onConfirmAddRow}
              onConfirmAddSchool={onConfirmAddSchool}
              onApplyReRank={onApplyReRank}
              onAddToLetter={onAddToLetter}
              onConfirmTopicLens={onConfirmTopicLens}
            />
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
        {(messages.length > 0 || isStreaming) && !buildMode && (
          // Codex r6 P1 — startNewConversation() clears the chat
          // hook's session, but the Build Mode turn route requires
          // sessionId to be a UUID. Hiding the affordance in Build
          // Mode prevents the parent from getting wedged mid-
          // interview; the Skip button is the right exit instead.
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
  initialBuildModeState = null,
  lensView         = 'general',
  onApplyReRank,
  canSaveAsLens    = false,
  onSaveAsLens,
  pendingRefreshTopicLens = null,
}: Props) {
  // Slice 8 Build 3 session 2: when Build Mode is active, route to the
  // dedicated /api/research-room/build-mode/turn endpoint instead of
  // the regular /api/nana-research. The build-mode route is fully
  // isolated from nana-brain.js (Codex r1 #12: avoid Anthropic fallback).
  // The endpoint switches live on each render — useNanaChat reads it
  // via ref so the same ask() closure picks up the change next call.
  const chatEndpoint = buildMode
    ? '/api/research-room/build-mode/turn'
    : '/api/nana-research'

  // One chat hook instance — but only ONE ChatBody (desktop OR mobile)
  // is mounted at a time so the hook's inputRef/chatEndRef attach to the
  // visible surface. See useIsMobile + the gated branches below.
  const chat = useNanaChat({
    initialSession,
    initialMessages,
    initialBuildModeState,
    endpoint: chatEndpoint,
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

  // Codex welcome-back design pass — dismiss-state lifted here (NOT
  // ChatBody) because ChatBody mounts separately for desktop vs
  // mobile, so local state would reset on viewport-class change.
  // Lifecycle:
  //   • Mount with buildMode=true (rare): dismissed=false → bubble shows
  //   • buildMode flips false→true: reset to false + snapshot submitSeq
  //   • submitSeq advances past snapshot: dismissed=true (auto-dismiss
  //     on user engagement)
  //   • × click: dismissed=true (manual dismiss)
  const [welcomeBackDismissed, setWelcomeBackDismissed] = useState(false)
  const submitSeqAtToggleRef = useRef<number>(chat.submitSeq)
  useEffect(() => {
    if (buildMode) {
      setWelcomeBackDismissed(false)
      submitSeqAtToggleRef.current = chat.submitSeq
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildMode])
  useEffect(() => {
    if (buildMode && chat.submitSeq > submitSeqAtToggleRef.current) {
      setWelcomeBackDismissed(true)
    }
  }, [chat.submitSeq, buildMode])
  const showWelcomeBack =
       buildMode
    && !!chat.buildModeState
    && !chat.isStreaming
    && !welcomeBackDismissed

  // Slice 6.6 Tier 3 — react to ComparisonView's ↻ Refresh lens click.
  // Parent passes a {topicName, nonce} payload; the nonce changes on
  // every click so back-to-back refreshes (same name) still re-fire.
  // We synthesise "Create a lens for <topic>" through ask() and let
  // the regular chat pipeline take over.
  //
  // Slice 6.6 Tier 3.5 — auto-confirm. After firing the ask, we mark
  // the topic name as "awaiting auto-confirm". A second effect watches
  // chat.messages; when a new message lands whose parsed answer carries
  // a propose_create_topic_lens proposal matching the awaited topic,
  // we fire onConfirmTopicLens(messageId, proposalId) ourselves so the
  // user goes from one click (↻ Refresh) to merged-table without
  // having to click the resulting pill. The post-merge page refresh
  // populates msg.activeProposalIds and the bubble renders as ✓ via
  // the server-truth path.
  const lastRefreshNonceRef = useRef<number | null>(null)
  // Slice 6.6 Tier 3.5 (Codex r1 P1/P2 #2 fix) — message-count watermark
  // captured at submit-time. The auto-confirm watcher only inspects
  // messages with index >= this watermark, so a stale matching proposal
  // from an earlier refresh can't accidentally re-fire (or worse, silently
  // disarm via the alreadyActive check). React 18 auto-batches the
  // setIsStreaming(false) + setMessages append at use-nana-chat.ts:332-343
  // into one render, but explicit watermark > implicit batching ordering.
  const refreshMsgCountRef = useRef<number | null>(null)
  const [pendingAutoConfirmTopic, setPendingAutoConfirmTopic] = useState<string | null>(null)
  useEffect(() => {
    if (!pendingRefreshTopicLens) return
    if (lastRefreshNonceRef.current === pendingRefreshTopicLens.nonce) return
    // Codex r1 P1 #1 fix: gate streaming BEFORE consuming the nonce so a
    // refresh click during an in-flight stream isn't dropped permanently.
    // Effect re-runs when chat.isStreaming flips false (chat object identity
    // changes) and we'll fire then.
    if (chat.isStreaming) return
    lastRefreshNonceRef.current = pendingRefreshTopicLens.nonce
    refreshMsgCountRef.current = chat.messages.length
    setPendingAutoConfirmTopic(pendingRefreshTopicLens.topicName.trim().toLowerCase())
    void chat.ask(`Create a lens for ${pendingRefreshTopicLens.topicName}`)
  }, [pendingRefreshTopicLens, chat])

  // Auto-confirm watcher. Stays disarmed until a refresh fires. Once
  // armed, scans the latest messages for a propose_create_topic_lens
  // proposal whose lens_name (lowercase, trimmed) matches the awaited
  // topic. Fires onConfirmTopicLens once and disarms. Defensive against
  // refreshes that fail mid-stream — Nana's response might not contain
  // a matching proposal at all, in which case we just leave the pending
  // state set; the next manual refresh will overwrite it.
  useEffect(() => {
    if (!pendingAutoConfirmTopic) return
    if (chat.isStreaming) return
    const messages = chat.messages
    // Codex r1 P1/P2 #2 fix: only inspect messages that landed AFTER the
    // refresh fired (watermark = messages.length captured at submit time).
    // Without this, a stale matching proposal from an earlier refresh
    // could disarm via the alreadyActive check before the new message
    // appended.
    const watermark = refreshMsgCountRef.current ?? 0
    if (messages.length <= watermark) return
    // Walk newest → oldest, stopping at the watermark. The relevant
    // proposal is in the LATEST assistant turn that landed post-refresh.
    type ProposalShape = { kind?: unknown; lens_name?: unknown }
    for (let i = messages.length - 1; i >= watermark; i--) {
      const m = messages[i]
      const proposals = (((m.parsed as { proposed_actions?: Record<string, ProposalShape> } | null)?.proposed_actions) ?? {})
      const alreadyActive = new Set(m.activeProposalIds ?? [])
      let hit: { messageId: string; proposalId: string } | null = null
      for (const [pid, prop] of Object.entries(proposals)) {
        if (prop?.kind !== 'propose_create_topic_lens') continue
        if (typeof prop.lens_name !== 'string') continue
        if (prop.lens_name.trim().toLowerCase() !== pendingAutoConfirmTopic) continue
        if (alreadyActive.has(pid)) {
          // Our own confirm call landed and router.refresh re-rendered
          // with the action stamped. Disarm without re-firing.
          setPendingAutoConfirmTopic(null)
          return
        }
        hit = { messageId: m.id, proposalId: pid }
        break
      }
      if (hit) {
        // Disarm BEFORE firing so the post-refresh re-render doesn't
        // re-trigger us (router.refresh updates messages → effect runs
        // again → activeProposalIds path catches it as already-active).
        setPendingAutoConfirmTopic(null)
        void onConfirmTopicLens(hit.messageId, hit.proposalId)
        return
      }
      break  // Only inspect the most-recent post-watermark turn.
    }
  }, [pendingAutoConfirmTopic, chat.messages, chat.isStreaming])

  // Slice 8 Build 3 session 4 — "Build my table" CTA. Posts to the
  // dedicated /api/research-room/build-mode/finalize route (NOT through
  // the regular Nana brain — the C-option fix replaced the earlier
  // synthetic-prompt flow that hallucinated schools and ignored
  // captured priorities). The finalize route reads child_profile +
  // shortlist server-side and emits 3-5 propose_add_row proposals in
  // the standard parsed_answer shape so the existing "+ Add as row"
  // pills render unchanged.
  //
  // We toggle Build Mode off in the same handler so the chat panel
  // returns to the regular-answering shell — the bar disappears, the
  // header switches from "BUILD MODE · CO-BUILDER" to "ANSWERING".
  // Order matters: endpointOverride is consumed at ask() submit time
  // (not from the ref), so we can call both synchronously without
  // racing the re-render.
  const handleSkipBuildMode  = () => { onToggleBuildMode() }
  const handleBuildTableNow  = () => {
    onToggleBuildMode()
    void chat.ask('Build my comparison table now', {
      endpointOverride: '/api/research-room/build-mode/finalize',
    })
  }

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

  // Slice 8 Build 6: confirm a "+ Add Sherborne" school proposal. Posts to
  // write-action; the server calls confirm_add_school RPC + best-effort
  // refreshes seeded rows so the new column populates on next render.
  async function onConfirmAddSchool(messageId: string, proposalId: string): Promise<{ ok: boolean; code?: string }> {
    try {
      const res = await fetch('/api/research-room/write-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_school', message_id: messageId, proposal_id: proposalId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const code = typeof j?.code === 'string' ? j.code : 'request_failed'
        setActionError(`Could not add that school (${code}).`)
        return { ok: false, code }
      }
      setActionError(null)
      router.refresh()
      return { ok: true }
    } catch (e) {
      console.error('[research-room add-school]', e)
      setActionError('Network error while adding the school.')
      return { ok: false, code: 'network' }
    }
  }

  async function onAddToLetter(messageId: string, proposalId: string): Promise<{ ok: boolean; code?: string }> {
    try {
      const res = await fetch('/api/research-room/write-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_to_letter', message_id: messageId, proposal_id: proposalId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const code = typeof j?.code === 'string' ? j.code : 'request_failed'
        setActionError(`Could not add that note to the partner brief (${code}).`)
        return { ok: false, code }
      }
      setActionError(null)
      router.refresh()
      return { ok: true }
    } catch (e) {
      console.error('[research-room add-to-letter]', e)
      setActionError('Network error while adding that note to the partner brief.')
      return { ok: false, code: 'network' }
    }
  }

  // Slice 6.5: confirm a "Create [topic] lens with N new rows" proposal.
  // Same shape as onConfirmAddRow but routed at action='create_topic_lens'.
  // The RPC inserts the lens + N rows + flips active_lens_id atomically;
  // router.refresh() re-runs the page server fragment and the loader picks
  // up the topic rows on the active lens.
  //
  // Slice 6.6 Tier 2: when the lens already exists with the same name and
  // is a TOPIC lens, the RPC merges new schools' cells into existing rows
  // instead of returning duplicate_name. Server returns status='merged'
  // with merge_summary { rows_inserted, rows_updated }; we surface that to
  // the button so the pill renders "<Lens> refreshed: N updated, M added".
  async function onConfirmTopicLens(messageId: string, proposalId: string): Promise<{ ok: boolean; code?: string; merged?: { rows_inserted: number; rows_updated: number } }> {
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
      const j = await res.json().catch(() => ({}))
      setActionError(null)
      router.refresh()
      if (j?.status === 'merged' && j?.merge_summary &&
          typeof j.merge_summary.rows_inserted === 'number' &&
          typeof j.merge_summary.rows_updated === 'number') {
        return { ok: true, merged: { rows_inserted: j.merge_summary.rows_inserted, rows_updated: j.merge_summary.rows_updated } }
      }
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

            <ChatBody buildMode={buildMode} onToggleBuildMode={onToggleBuildMode} onSkipBuildMode={handleSkipBuildMode} onBuildTableNow={handleBuildTableNow} chat={chat} showWelcomeBack={showWelcomeBack} onDismissWelcomeBack={() => setWelcomeBackDismissed(true)} onConfirmAddRow={onConfirmAddRow} onConfirmAddSchool={onConfirmAddSchool} onApplyReRank={onApplyReRank} onAddToLetter={onAddToLetter} onConfirmTopicLens={onConfirmTopicLens} canSaveAsLens={canSaveAsLens} onSaveAsLens={onSaveAsLens} actionError={actionError} onDismissActionError={() => setActionError(null)} />
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

            <ChatBody buildMode={buildMode} onToggleBuildMode={onToggleBuildMode} onSkipBuildMode={handleSkipBuildMode} onBuildTableNow={handleBuildTableNow} chat={chat} showWelcomeBack={showWelcomeBack} onDismissWelcomeBack={() => setWelcomeBackDismissed(true)} onConfirmAddRow={onConfirmAddRow} onConfirmAddSchool={onConfirmAddSchool} onApplyReRank={onApplyReRank} onAddToLetter={onAddToLetter} onConfirmTopicLens={onConfirmTopicLens} canSaveAsLens={canSaveAsLens} onSaveAsLens={onSaveAsLens} actionError={actionError} onDismissActionError={() => setActionError(null)} />
          </div>
        </>
      )}
    </>
  )
}

// Slice 6 — chip rail above the chat input. Discoverable commands
// surface FOUR moves the parent can make on the comparison table:
// add a row, re-rank, create a topic lens, save the current view. The
// first three chips PRE-FILL the input with phrasing the classifier
// already understands; the parent finishes the sentence and hits send.
// The 'Save view' chip is contextual — only enabled when an ephemeral
// pill-derived view is active — and short-circuits the chat entirely:
// click → inline name input → write-action POST → router.refresh.
//
// Slice 6.5 added the "Create lens for…" chip. Re-rank + Save view
// alone don't cover the topic-lens flow (which surfaces NEW rows about
// a specific topic, not a re-weighting of existing dimensions).
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
      <button type="button" className="rr-chat-rail-chip rr-chat-rail-chip--topic-lens" disabled={disabled}
              onClick={() => onChipFill('Create a lens for ')}
              title="Build a focused mini-table around a specific topic (e.g. rugby, music, drama)">
        <span aria-hidden>✦</span> Create lens for…
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
