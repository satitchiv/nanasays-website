'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ChildSelector, { type ChildOption } from './ChildSelector'
import ChildBriefTab, { type ChildSummary, type FamilyPreferences } from './ChildBriefTab'
import PartnerBriefTab, { type PartnerBrief } from './PartnerBriefTab'
import VerdictTab, { type ResearchVerdictForUi } from './VerdictTab'
import ResearchRoomChat, { type ChatState } from './ResearchRoomChat'
import ComparisonView from './ComparisonView'
import SchoolAdder from './SchoolAdder'
import type { ComparisonData } from './comparison-placeholder'
import type { Session, ResearchMessage } from '@/lib/nana/types'
import './research-room.css'

type Tab = 'brief' | 'compare' | 'verdict' | 'partner'
type Lens = 'general' | 'child_fit'

// Slice 6 close — saved lenses surface in the picker dropdown. weights
// + visible_rows are UUID-keyed (resolved at save time by
// confirm_lens_from_proposal). The component re-keys against the
// loaded comparison rows by stripping the `cmp-` prefix; rows missing
// from the current load fall out silently (consistent with the RPC's
// "drop unresolved" stance).
export type SavedLens = {
  id:             string
  lens_name:      string
  lens_question:  string | null
  base_lens_kind: Lens
  weights:        Record<string, number>
  visible_rows:   string[] | null
  created_at:     string
  // Slice 6.6 Tier 3: true iff this lens has at least one active topic
  // row (created_by_lens_id = lens.id, undone_at IS NULL). Drives the
  // ↻ Refresh lens affordance — saved/re-rank lenses (is_topic_lens =
  // false) don't get it because refresh-with-shortlist isn't meaningful
  // for a view-of-base-rows lens.
  is_topic_lens?: boolean
}

type Props = {
  childOptions: ChildOption[]
  childSummaries?: ChildSummary[]
  familyPreferences?: FamilyPreferences
  initialActiveChildId?: string | null
  comparisonData?: ComparisonData
  comparisonError?: string | null
  lens?: Lens
  initialSession?: Session | null
  initialMessages?: ResearchMessage[]
  // Session 4 follow-up — hydrate the Build Mode progress bar + welcome-
  // back bubble from DB so they appear on first paint, not after the
  // next turn. Null = no prior Build Mode progress for this session
  // (first-time toggle or session never used Build Mode).
  initialBuildModeState?: import('@/lib/nana/types').BuildModeStreamState | null
  savedLenses?: SavedLens[]
  activeLensId?: string | null
  partnerBrief?: PartnerBrief | null
  researchVerdict?: ResearchVerdictForUi | null
  // RRV-11 — existence-only verdict probe (researchVerdict above is always
  // null at SSR by design; see page.tsx) and the returning-user day-gap,
  // both computed server-side in page.tsx.
  hasVerdict?: boolean
  daysSinceLastActive?: number | null
}

const TAB_ORDER: Tab[] = ['brief', 'compare', 'verdict', 'partner']

const TAB_LABELS: Record<Tab, string> = {
  brief: 'Child brief',
  compare: 'Comparison',
  verdict: 'Verdict',
  partner: 'Partner brief',
}

// RRV-11 — journey step captions ("Step N · <eyebrow>"), for the 3 steps
// that make up the journey (brief/compare/verdict only — partner isn't a
// step in this sequence, see rr-hero-actions in the render below).
const JOURNEY_EYEBROW: Record<'brief' | 'compare' | 'verdict', string> = {
  brief: 'The data',
  compare: 'The research',
  verdict: 'The recommendation',
}

const PLACEHOLDER_COPY: Record<Tab, { sub: string }> = {
  brief: {
    sub: 'Coming in slice 3 — list of children, the active editor, "+ Add child", soft archive.',
  },
  compare: {
    sub: 'Coming in slice 2 — your shortlist rendered side-by-side from school_structured_data, two lens tabs (child fit + Raw).',
  },
  verdict: {
    sub: 'Coming in slice 7 — per-lens essay (ranking + dissenting view + sources), shared lenses with Comparison.',
  },
  partner: {
    sub: 'Coming in slice 7 — one brief per child with tone toggles, copy email / print / share affordances.',
  },
}

const SCROLL_DURATION_MS = 450

export default function ResearchRoom({
  childOptions,
  childSummaries = [],
  familyPreferences,
  initialActiveChildId = null,
  comparisonData,
  comparisonError = null,
  lens             = 'general',
  initialSession   = null,
  initialMessages  = [],
  initialBuildModeState = null,
  savedLenses      = [],
  activeLensId     = null,
  partnerBrief     = null,
  researchVerdict  = null,
  hasVerdict       = false,
  daysSinceLastActive = null,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('compare')
  // Diagnostic follow-up (2026-07-17): the landing tab is always
  // 'compare', and 'default' chat width (400px desktop rail / 50dvh
  // mobile bottom-sheet+scrim) buried the comparison table on first
  // paint — on mobile the sheet+scrim covered nearly the whole screen,
  // and on desktop 400px of chat squeezed a 4-5 school table into
  // awkward horizontal scroll before the parent had done anything.
  // 'closed' still leaves the chat one tap/click away (a slim "ASK
  // NANA" rail on desktop, a pulsing FAB on mobile) — it just stops
  // defaulting to covering the primary content the parent lands on.
  const [chatState, setChatState] = useState<ChatState>('closed')
  const [buildMode, setBuildMode] = useState(false)
  const [activeChildId, setActiveChildId] = useState<string | null>(initialActiveChildId)
  // Slice 8 Build 7 Phase C — per-child dismiss set for fullscreen Build
  // Mode. Holds child ids whose fullscreen has been locally dismissed
  // (Skip / Build-table-now exits). Keyed individually so dismissing
  // child A doesn't bleed to B and vice-versa.
  //
  // Pure derivation gives us the gate (see currentChild + fullscreenBuildMode
  // below); this Set is just the user-override layer. The pruning effect
  // further down drops entries whose child's funnel_state has left
  // 'interview' so the Set stays bounded.
  const [dismissedFullscreenChildIds, setDismissedFullscreenChildIds] =
    useState<ReadonlySet<string>>(() => new Set())

  // RRV-11 — returning-user strip dismiss. In-memory only (resets on
  // reload), matching the existing welcomeBackDismissed precedent in
  // ResearchRoomChat.tsx for the same "greet once per visit" behavior.
  const [returningDismissed, setReturningDismissed] = useState(false)
  // RRV-11 (Fable post-build review) — hasVerdict is an SSR prop, so it
  // stays false for the rest of THIS visit even after the parent
  // generates their first verdict (VerdictTab's own POST doesn't touch
  // page.tsx's props). Flips true the moment VerdictTab reports a
  // successful generation, self-corrects to the real value on next
  // load/router.refresh either way — same "client optimism, SSR is the
  // source of truth on reload" shape as verdictReady below.
  const [verdictJustGenerated, setVerdictJustGenerated] = useState(false)

  // RRV-10 (Focus consolidation, 2026-07-20) — the six old row-arrangement
  // mechanisms (base-lens tabs, topic lenses, saved-lens picker, re-rank
  // pills, drag, save-as-lens) collapse into ONE state atom: which saved/
  // topic lens (if any) is active, plus whatever unsaved ("ephemeral")
  // pill/drag arrangement sits on top of it. Keeping both halves in ONE
  // useState (instead of the two separate ones slice 6 originally had)
  // means every focus-changing action is a single atomic setFocus call —
  // there's no way for a reactive "clear the other half" effect to fire on
  // a stale render and clobber a value another handler just set in the same
  // tick (a real bug in the two-state version, caught in RRV-10's pre-build
  // Fable review). `activeLensId` mirrors the session's persisted
  // active_lens_id (optimistic — flips before the POST resolves, same as
  // the old optimisticActiveLensId did). `ephemeralView` is the unsaved
  // pill/drag arrangement; never persisted, dropped on refresh.
  type EphemeralView = {
    rowOrder:         string[]                       // row IDs in display order
    visibleRows?:     string[]                       // canonical row_name allowlist
    weights?:         Record<string, number>         // canonical row_name → 0..5 (pill source only)
    label:            string                         // "↻ Re-rank by …" or "Custom view"
    source:           'drag' | 'pill'
    sourceMessageId?: string
    sourceProposalId?: string
  } | null
  type FocusState = { activeLensId: string | null; ephemeralView: EphemeralView }
  const [focus, setFocus] = useState<FocusState>({ activeLensId, ephemeralView: null })

  // Undo — one-slot "previous focus" snapshot, restored by handleUndoFocus
  // below. Every focus-changing handler writes the CURRENT focus into this
  // ref before applying its change, so Undo always has somewhere to go
  // back to; Undo itself re-snapshots the (about to be former) current
  // focus, so a second Undo click toggles back to where you started —
  // deliberate, the simpler of two defensible options per the pre-build
  // review. Reading `.current` during render (in focusDescriptor further
  // down) is safe here specifically because every write to this ref is
  // always paired with a setFocus call in the same handler, so a
  // re-render always follows shortly after any write.
  const previousFocusRef = useRef<FocusState | null>(null)

  // Server-truth sync: fires whenever the session's persisted active_lens_id
  // changes for a reason THIS component didn't already account for locally
  // — a chat-confirmed topic lens (create or ↻ refresh-merge), a save-as-
  // lens flip, or another tab/device. Snapshots the prior focus for Undo,
  // adopts the new lens, and drops any ephemeral view (it referenced the
  // old row set). No-ops when the prop just confirms a switch this
  // component already applied optimistically (prev.activeLensId already
  // matches) — avoids a redundant snapshot overwrite on our own POSTs.
  useEffect(() => {
    setFocus(prev => {
      if (activeLensId === prev.activeLensId) return prev
      previousFocusRef.current = prev
      return { activeLensId, ephemeralView: null }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLensId])

  // Cross-child hardening: ResearchRoom itself doesn't remount on child
  // switch (only ResearchRoomChat does, via its key prop below), so
  // without this a stale ephemeralView referencing child A's row UUIDs
  // could leak into child B's table — every row ID would miss, silently
  // filtering the table down to nothing. Not one of the six original
  // mechanisms, but a direct instance of the golden rule ("never silently
  // rearrange") this card exists to enforce, so it's included.
  useEffect(() => {
    setFocus({ activeLensId, ephemeralView: null })
    previousFocusRef.current = null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChildId])

  // Slice 6.6 Tier 3 — bridge between ComparisonView's ↻ Refresh button
  // and ResearchRoomChat's chat hook. ComparisonView fires
  // onRefreshTopicLens(name); we set pendingRefreshTopicLens, which
  // ResearchRoomChat watches via useEffect to call chat.ask(). The
  // nonce ensures repeated clicks fire fresh effects (same name twice
  // ≠ same payload). ResearchRoomChat clears the pending state once
  // it's submitted, but we don't actually need to clear it — the next
  // click bumps the nonce and re-triggers regardless.
  const [pendingRefreshTopicLens, setPendingRefreshTopicLens] =
    useState<{ topicName: string; nonce: number } | null>(null)
  const handleRefreshTopicLens = (topicName: string) => {
    setChatState((s) => (s === 'closed' ? 'default' : s))
    setPendingRefreshTopicLens({ topicName, nonce: Date.now() })
  }

  // RRV-2 (never-blank table, 2026-07-20) — same bridge pattern as
  // pendingRefreshTopicLens directly above, for the rung-4 Ask-Nana gap
  // chip: ComparisonView fires onAskNanaGap(question), we force-open the
  // chat and stash the question; ResearchRoomChat watches it and submits
  // via chat.ask() immediately (no proposal-confirm dance needed here —
  // a gap question is a plain question, not a lens-creation flow).
  const [pendingGapQuestion, setPendingGapQuestion] =
    useState<{ question: string; nonce: number } | null>(null)
  const handleAskNanaGap = (question: string) => {
    setChatState((s) => (s === 'closed' ? 'default' : s))
    setPendingGapQuestion({ question, nonce: Date.now() })
  }

  // Pill-click handler: compute initial rowOrder from weights against
  // the currently-loaded comparison rows, then store both. Keeps
  // whichever lens (if any) is active — a pill view can sit on top of a
  // saved/topic lens, same precedence as before this refactor.
  function handleApplyReRank(messageId: string, proposalId: string, viewSpec: import('@/lib/nana/types').ProposeViewSpec, label: string) {
    const rawRows = comparisonData?.rows ?? []
    const norm = (s: string) => s.trim().toLowerCase()
    const wMap = new Map<string, number>()
    for (const [k, v] of Object.entries(viewSpec.weights)) {
      if (typeof v === 'number' && Number.isFinite(v)) wMap.set(norm(k), v)
    }
    const visibleSet = viewSpec.visible_rows
      ? new Set(viewSpec.visible_rows.map(norm))
      : null
    const filtered = visibleSet
      ? rawRows.filter(r => visibleSet.has(norm(r.label)))
      : rawRows
    const indexed = filtered.map((row, idx) => ({
      id: row.id,
      idx,
      weight: wMap.get(norm(row.label)) ?? null,
    }))
    indexed.sort((a, b) => {
      const aW = a.weight, bW = b.weight
      if (aW !== null && bW === null) return -1
      if (aW === null && bW !== null) return 1
      if (aW !== null && bW !== null && aW !== bW) return bW - aW
      return a.idx - b.idx
    })
    previousFocusRef.current = focus
    setFocus(prev => ({
      activeLensId: prev.activeLensId,
      ephemeralView: {
        rowOrder:         indexed.map(x => x.id),
        visibleRows:      viewSpec.visible_rows,
        weights:          viewSpec.weights,
        label,
        source:           'pill',
        sourceMessageId:  messageId,
        sourceProposalId: proposalId,
      },
    }))
  }

  // Drag-reorder handler: rowIds are the new ordering. Edits whatever
  // ephemeral view is already live (task requirement: "drag edits it")
  // rather than creating a second concept — last action wins, same as
  // before this refactor. RRV-10 fix: also carries the originating
  // pill's sourceMessageId/sourceProposalId forward (not just weights/
  // visibleRows) when editing a pill result — without this, dragging on
  // top of a pill permanently breaks canSaveAsLens's drag branch, since
  // the save RPC needs those ids to re-read the original proposal
  // (caught in RRV-10's pre-build Fable review — the branch existed in
  // code but was unreachable).
  function handleReorderRows(rowIds: string[]) {
    previousFocusRef.current = focus
    setFocus(prev => {
      const prevEphemeral = prev.ephemeralView
      const fromPill = prevEphemeral?.source === 'pill'
      return {
        activeLensId: prev.activeLensId,
        ephemeralView: {
          rowOrder:         rowIds,
          visibleRows:      prevEphemeral?.visibleRows,
          weights:          fromPill ? prevEphemeral.weights : undefined,
          label:            fromPill ? `${prevEphemeral.label} (edited)` : 'Custom view',
          source:           'drag',
          sourceMessageId:  fromPill ? prevEphemeral.sourceMessageId  : undefined,
          sourceProposalId: fromPill ? prevEphemeral.sourceProposalId : undefined,
        },
      }
    })
  }

  // Slice 6 commit 9 — save the current ephemeral view as a permanent
  // lens. Only works when the view traces back to a ↻ pill (source =
  // 'pill', or 'drag' carrying a pill's ids forward per the fix above)
  // because the save_view_as_lens RPC reconstructs view_spec from
  // parsed_answer.proposed_actions[id]. A pure drag-from-Everything with
  // no originating pill still can't be saved — that would need a new
  // RPC accepting client-supplied weights directly, out of scope for
  // RRV-10 ("comparison_rows/lens data model stays as-is"). The button's
  // disabled tooltip (in ComparisonView) says so honestly rather than
  // implying it's broken.
  const canSaveAsLens = !!(focus.ephemeralView && focus.ephemeralView.sourceMessageId && focus.ephemeralView.sourceProposalId)

  async function handleSaveAsLens(lensName: string): Promise<{ ok: boolean; code?: string; existingLensId?: string }> {
    const ephemeralView = focus.ephemeralView
    if (!ephemeralView || !ephemeralView.sourceMessageId || !ephemeralView.sourceProposalId) {
      return { ok: false, code: 'no_savable_view' }
    }
    const trimmed = lensName.trim()
    if (trimmed.length < 1 || trimmed.length > 40) return { ok: false, code: 'bad_name' }
    try {
      const res = await fetch('/api/research-room/write-action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:      'save_view_as_lens',
          message_id:  ephemeralView.sourceMessageId,
          proposal_id: ephemeralView.sourceProposalId,
          lens_name:   trimmed,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.ok) {
        previousFocusRef.current = focus
        setFocus(prev => ({ ...prev, ephemeralView: null }))
        router.refresh()
        return { ok: true }
      }
      return { ok: false, code: body.code, existingLensId: body.existing_lens_id }
    } catch (e) {
      console.error('[save-as-lens]', e)
      return { ok: false, code: 'network' }
    }
  }

  // Slice 8 Build 7 Phase C followup: invoked by ChildBriefTab when a
  // new child is added via the +Add child form. The server's /api/children
  // POST already wrote parent_profiles.active_child_id to the new id, but
  // router.refresh() doesn't reset useState(initialActiveChildId) — so we
  // setActiveChildId optimistically here so Phase C's gate fires on the
  // new child immediately. The refresh that follows re-loads
  // childSummaries which will include the new child + its funnel_state.
  // No POST to /api/active-child needed (server already persisted).
  const handleChildAdded = (newChildId: string) => {
    setActiveChildId(newChildId)
    router.refresh()
  }

  // Persist the active child to parent_profiles + refresh server data
  // so the comparison table re-fetches per the new child's shortlist.
  // Failures revert local state to keep UI consistent with DB truth.
  async function handleActiveChildChange(nextChildId: string) {
    if (nextChildId === activeChildId) return
    const prev = activeChildId
    setActiveChildId(nextChildId)  // optimistic
    // RRV-11 — verdictJustGenerated is scoped to whichever child was
    // active when it was set; a switch (even before router.refresh lands
    // new hasVerdict) must not let it leak into the new child's journey
    // state.
    setVerdictJustGenerated(false)
    try {
      const res = await fetch('/api/active-child', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ child_id: nextChildId }),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) {
      console.error('[handleActiveChildChange]', e)
      setActiveChildId(prev)  // revert on failure
    }
  }

  const pagerRef = useRef<HTMLDivElement | null>(null)
  // Token-based suppression for IntersectionObserver during programmatic
  // scrolls. Each scrollPagerToTab call increments scrollTokenRef; only the
  // most-recent call's timeout actually unsuppresses.
  const scrollTokenRef = useRef(0)
  const isProgrammaticScroll = useRef(false)
  const suppressionTimeoutRef = useRef<number | null>(null)
  // Mirror of activeTab so async timers can read the latest value without
  // re-creating the closure.
  const activeTabRef = useRef<Tab>(activeTab)
  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  const handleToggleBuildMode = () => {
    // Browser smoke 2026-05-16: previous version forced
    // setChatState('focus' / 'default') on toggle which jolted the chat
    // panel from 400px ↔ 620px every time the parent flipped the
    // switch. Removed — chat width stays wherever the parent put it
    // (closed / default / focus); they can manually widen via ⤢ if
    // they want more room for the interview.
    setBuildMode(b => !b)
  }

  // ── Slice 8 Build 7 Phase C — fullscreen Build Mode gate ───────────
  //
  // Phase B threaded `funnel_state` into childSummaries from the children
  // table. Phase C derives a client-side gate from that prop, with a
  // per-child dismiss set so the parent can locally exit fullscreen
  // (Skip / Build-table-now) without waiting for the server-side
  // funnel_state UPDATE to land via router.refresh.
  //
  // Why pure derivation (no useState mirror of the server prop): early
  // sketch rounds tried a useState + useEffect resync pattern; Codex r2
  // flagged it as brittle (stale prop on child switch). Derived values
  // recompute every render — no resync window.

  // Pruning: drop dismissed entries whose child's funnel_state has left
  // 'interview' (post-skip / post-finalize router.refresh). Without
  // pruning the Set grows monotonically and prevents future re-entry to
  // fullscreen if SQL ever flips a child back to 'interview'. Cheap —
  // childSummaries is tiny, set size capped by interactions.
  useEffect(() => {
    setDismissedFullscreenChildIds(prev => {
      // forEach (rather than for…of) keeps this compatible with the
      // current tsconfig target — ReadonlySet's iterator needs es2015
      // or --downlevelIteration, neither set here.
      let next: Set<string> | null = null
      prev.forEach(id => {
        const child = childSummaries.find(c => c.id === id) ?? null
        if (!child || child.funnel_state !== 'interview') {
          if (!next) next = new Set(prev)
          next.delete(id)
        }
      })
      return next ?? prev
    })
  }, [childSummaries])

  const currentChild = activeChildId
    ? childSummaries.find(c => c.id === activeChildId) ?? null
    : null
  const fullscreenBuildMode = !!(
    currentChild?.funnel_state === 'interview' &&
    !dismissedFullscreenChildIds.has(activeChildId ?? '')
  )
  // chatBuildMode = user-controlled buildMode OR fullscreen-forced. Passed
  // to ResearchRoomChat as `buildMode`. The chat sees a single value that
  // drives bar / header / endpoint switching; it reads fullscreenBuildMode
  // separately (via its own prop) for things like disabling the toggle.
  const chatBuildMode = buildMode || fullscreenBuildMode

  // rr-8-build3-sibling-gender-year (2026-05-21): a sibling that lands in
  // fullscreen Build Mode without child_gender or child_year captured on
  // its row. Drives a one-line signage paragraph in the welcome bubble so
  // the parent knows the wizard was deliberately skipped and that the
  // first turn will ask a couple of basics. Two gates:
  //   - childSummaries.length > 1 → this user actually has multiple
  //     children, so "reuse your family preferences" copy is accurate.
  //   - basics missing on THIS child's profile → the sibling_basics
  //     opener will fire. Existing siblings who've already filled basics
  //     via the Brief tab don't see the message.
  const currentChildProfile = currentChild?.child_profile ?? null
  const siblingNeedsBasics  = !!(
    fullscreenBuildMode &&
    currentChildProfile &&
    childSummaries.length > 1 &&
    (!currentChildProfile.child_gender || !currentChildProfile.child_year)
  )
  // rr-8-build3-sibling-gender-year chip-strip (2026-05-21) — initial
  // captured state for the BuildModeProgressBar basics chips. Derived
  // from THIS child's profile (NOT parent_profiles, which would carry
  // first-child values for siblings). Live updates flow via the SSE
  // build_mode_progress diff inside BuildModeProgressBar — this prop
  // just seeds the initial render so a refresh/reload preserves any
  // basics already captured. Always defined so child component
  // doesn't need to null-check.
  const siblingBasicsCaptured = {
    gender: !!currentChildProfile?.child_gender,
    year:   !!currentChildProfile?.child_year,
  }

  // Chat-must-be-open invariant: when fullscreen is on AND state goes
  // 'closed' (Escape listener in ResearchRoomChat, or any future close
  // path), force back to 'default'. Codex r4 P1 — depending only on
  // [fullscreenBuildMode] missed the state→closed transition while
  // fullscreen was already on. Including chatState in deps self-heals.
  useEffect(() => {
    if (fullscreenBuildMode && chatState === 'closed') {
      setChatState('default')
    }
  }, [fullscreenBuildMode, chatState])

  // Shared exit primitive — sets user-buildMode to false AND dismisses
  // fullscreen for the active child. Used by both Skip and the in-chat
  // Build-my-table-now CTA (the chat invokes via onExitInterview prop).
  // Codex r2 P1 #1 — using onToggleBuildMode in handleBuildTableNow was
  // a foot-gun (could re-enable Build Mode in pathological flows); this
  // explicit setter is the canonical exit.
  const handleExitInterview = () => {
    setBuildMode(false)
    if (activeChildId) {
      setDismissedFullscreenChildIds(prev => {
        if (prev.has(activeChildId)) return prev
        const next = new Set(prev)
        next.add(activeChildId)
        return next
      })
    }
  }

  const handleSkipBuildMode = () => {
    // Slice 8 Build 7: optimistic UX — flip local Build Mode state
    // immediately so the parent isn't waiting on a network call.
    // Phase C: also dismiss fullscreen locally via handleExitInterview.
    // Fire the server persist (funnel_state → 'comparison') as fire-and-
    // forget. If it fails, the next page load's gate self-heals based on
    // whatever state actually landed in the DB (and the pruning effect
    // re-includes this child once funnel_state genuinely changes).
    handleExitInterview()
    if (!activeChildId) return
    void fetch('/api/research-room/build-mode/skip', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ childId: activeChildId }),
    })
      .then(res => {
        if (!res.ok) console.warn('[skip] non-2xx', res.status)
      })
      .catch(err => console.warn('[skip] network error', err))
  }

  const handleCollapseChat = () => setChatState('closed')
  const handleExpandDefault = () => setChatState('default')
  const handleToggleFocus = () =>
    setChatState((s) => (s === 'focus' ? 'default' : 'focus'))

  const scrollPagerToTab = (tab: Tab) => {
    const pager = pagerRef.current
    if (!pager) return
    const idx = TAB_ORDER.indexOf(tab)
    if (idx < 0) return

    const token = ++scrollTokenRef.current
    isProgrammaticScroll.current = true
    if (suppressionTimeoutRef.current !== null) {
      window.clearTimeout(suppressionTimeoutRef.current)
    }

    pager.scrollTo({ left: pager.clientWidth * idx, behavior: 'smooth' })

    suppressionTimeoutRef.current = window.setTimeout(() => {
      // Stale timeout — a newer scroll has started. Let that one finish.
      if (token !== scrollTokenRef.current) return
      isProgrammaticScroll.current = false
      suppressionTimeoutRef.current = null

      // Corrective: derive the actually-visible tab from scrollLeft and snap
      // state to it. Handles cases where a user swipe interrupted the
      // programmatic scroll mid-flight.
      const width = Math.max(1, pager.clientWidth)
      const idxNow = Math.round(pager.scrollLeft / width)
      const correctedTab = TAB_ORDER[idxNow]
      if (correctedTab && correctedTab !== activeTabRef.current) {
        setActiveTab(correctedTab)
      }
    }, SCROLL_DURATION_MS)
  }

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab)
    scrollPagerToTab(tab)
  }

  // Slice 8 Build 7 Phase C followup #2 — fired by ResearchRoomChat's
  // handleBuildTableNow after the parent clicks the wrap-up CTA. Routes
  // them to the Comparison tab so the finalize-streamed rows land on a
  // panel they can actually see. handleTabClick (not raw setActiveTab)
  // so the mobile pager scrolls alongside. No-op when activeTab is
  // already 'compare'.
  const handleTableBuilt = () => {
    handleTabClick('compare')
  }

  const handleShortlistRefreshed = () => {
    handleTabClick('compare')
  }

  // Initial scroll position: jump (no animation) to the default active tab so
  // the pager renders with Comparison centered, not Brief.
  useLayoutEffect(() => {
    const pager = pagerRef.current
    if (!pager) return
    const idx = TAB_ORDER.indexOf(activeTab)
    pager.scrollLeft = pager.clientWidth * idx
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-anchor scrollLeft to the active tab whenever the pager's width changes
  // (window resize, orientation change, desktop chat width changes). Without
  // this, the active tab drifts after layout.
  useEffect(() => {
    const pager = pagerRef.current
    if (!pager || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const width = pager.clientWidth
      if (width <= 0) return
      const idx = TAB_ORDER.indexOf(activeTabRef.current)
      pager.scrollLeft = width * idx
    })
    observer.observe(pager)
    return () => observer.disconnect()
  }, [])

  // Sync activeTab with scroll position (mobile thumb-swipe).
  useEffect(() => {
    const pager = pagerRef.current
    if (!pager) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScroll.current) return
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.55) {
            const tab = entry.target.getAttribute('data-tab') as Tab | null
            if (tab) setActiveTab(tab)
          }
        }
      },
      { root: pager, threshold: [0.55] },
    )
    pager.querySelectorAll('[data-tab]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Cleanup: cancel any pending suppression timeout on unmount.
  useEffect(() => {
    return () => {
      if (suppressionTimeoutRef.current !== null) {
        window.clearTimeout(suppressionTimeoutRef.current)
      }
    }
  }, [])

  const activeChild =
    activeChildId != null
      ? childSummaries.find((c) => c.id === activeChildId) ?? null
      : null

  // Slice 6 close — derive a viewOverlay from the active saved lens.
  // The lens stores weights + visible_rows keyed by row UUID; the
  // loader yields rows with id `cmp-${uuid}`. We rebuild rowOrder by
  // sorting rows by weight desc (stable on tie via original idx) and
  // map visible_rows UUIDs → canonical row_names so ComparisonView's
  // case-insensitive filter logic keeps working unchanged.
  //
  // Falls back to null when no lens is active. UUID misses are
  // silent (same posture as the RPC's unresolved-name drop on save).
  // Reads focus.activeLensId so the overlay flips with the click, not
  // 1.5s later.
  const activeLens = focus.activeLensId
    ? savedLenses.find(l => l.id === focus.activeLensId) ?? null
    : null

  const activeLensOverlay = (() => {
    if (!activeLens) return null
    const rawRows = comparisonData?.rows ?? []
    const stripPrefix = (uiId: string) => uiId.replace(/^cmp-/, '')

    const weights = activeLens.weights ?? {}
    const visibleSet = activeLens.visible_rows
      ? new Set(activeLens.visible_rows)
      : null

    const filtered = visibleSet
      ? rawRows.filter(r => visibleSet.has(stripPrefix(r.id)))
      : rawRows
    // Codex P1: when the active lens references no live rows (lens
    // saved against a row set that's since been undone), still drive
    // the overlay — returning null here would let the unfiltered base
    // table render under the saved-lens label. Empty rowOrder + empty
    // visibleRows means ComparisonView's overlay filter drops every
    // row, which is the truthful "this lens has no rows left" state.
    if (filtered.length === 0) {
      return {
        rowOrder:    [],
        visibleRows: [],
      }
    }

    const indexed = filtered.map((row, idx) => ({
      id: row.id,
      label: row.label,
      idx,
      weight: weights[stripPrefix(row.id)] ?? null,
    }))
    indexed.sort((a, b) => {
      const aW = a.weight, bW = b.weight
      if (aW !== null && bW === null) return -1
      if (aW === null && bW !== null) return 1
      if (aW !== null && bW !== null && aW !== bW) return bW - aW
      return a.idx - b.idx
    })
    return {
      rowOrder:    indexed.map(x => x.id),
      visibleRows: visibleSet ? indexed.map(x => x.label) : null,
    }
  })()

  // Effective overlay: ephemeral (pill/drag) wins over saved lens —
  // same precedence as before this refactor.
  const effectiveOverlay = focus.ephemeralView
    ? {
        rowOrder:    focus.ephemeralView.rowOrder,
        visibleRows: focus.ephemeralView.visibleRows ?? null,
        label:       focus.ephemeralView.label,
        kind:        'ephemeral' as const,
      }
    : activeLensOverlay
      ? {
          rowOrder:    activeLensOverlay.rowOrder,
          visibleRows: activeLensOverlay.visibleRows,
          label:       activeLens?.lens_name ?? '',
          kind:        'saved' as const,
        }
      : null

  // Persists a lens switch to the server; pure network side-effect — does
  // NOT touch `focus` beyond rolling back on failure. Callers own the
  // optimistic setFocus that happens before this is invoked.
  async function persistActiveLensSwitch(lensId: string | null, rollbackTo: FocusState) {
    if (!initialSession) return
    try {
      const res = await fetch('/api/research-room/active-lens', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: initialSession.id, lens_id: lensId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('[switch-active-lens]', res.status, body?.code)
        setFocus(rollbackTo)
        return
      }
      router.refresh()
    } catch (e) {
      console.error('[switch-active-lens]', e)
      setFocus(rollbackTo)
    }
  }

  // Focus bar chip click — switch to a specific saved/topic lens. 6-FU5:
  // flip local state BEFORE the fetch so the chip + table overlay update
  // on click; the server refresh reconciles in the background.
  // `opts.thenEphemeralView` is Undo's hook (handleUndoFocus below): when
  // the caller explicitly passes that key — even with value null/undefined
  // — the function proceeds even if lensId is unchanged, so an
  // ephemeral-only undo (the lens didn't change, only the arrangement on
  // top of it did) still applies.
  function handleSwitchActiveLens(lensId: string | null, opts?: { thenEphemeralView?: EphemeralView }) {
    if (!initialSession) return
    const hasEphemeralOverride = opts ? 'thenEphemeralView' in opts : false
    if (lensId === focus.activeLensId && !hasEphemeralOverride) return
    previousFocusRef.current = focus
    const rollbackTo = focus
    const changingLens = lensId !== focus.activeLensId
    setFocus({
      activeLensId:  lensId,
      ephemeralView: hasEphemeralOverride ? (opts!.thenEphemeralView ?? null) : null,
    })
    if (changingLens) void persistActiveLensSwitch(lensId, rollbackTo)
  }

  // Focus bar's "Everything" chip — the one case with no destination lens
  // AND no ephemeral view, so it's its own small function rather than a
  // handleSwitchActiveLens(null) call, which would no-op via the guard
  // above whenever a lens id isn't actually changing (e.g. an ephemeral
  // view is active with no lens underneath it — a very common case).
  function handleSelectEverything() {
    if (focus.activeLensId === null && focus.ephemeralView === null) return
    previousFocusRef.current = focus
    const rollbackTo = focus
    const hadActiveLens = focus.activeLensId !== null
    setFocus({ activeLensId: null, ephemeralView: null })
    if (hadActiveLens) void persistActiveLensSwitch(null, rollbackTo)
  }

  // The golden-rule Undo control. Restores the one-slot "previous focus"
  // snapshot via the same handler (and the same network/rollback path) a
  // normal chip switch uses, so the session's persisted active_lens_id
  // never drifts from what's on screen. handleSwitchActiveLens
  // re-snapshots the current (about-to-be-former) focus as its first
  // step, so a second Undo click toggles back to where you started.
  function handleUndoFocus() {
    const target = previousFocusRef.current
    if (!target) return
    // RRV-10 post-build Fable review: guard against a stale snapshot
    // whose lens id doesn't belong to the CURRENT session — e.g. one
    // captured right before a child switch lands (the snapshot could
    // still reference the previous child's lens for one render), or a
    // lens deleted in another tab. savedLenses is always scoped to this
    // session, so anything not in it can't be safely restored — fall
    // back to Everything rather than silently reactivating a lens that
    // doesn't belong here.
    const safeLensId = target.activeLensId === null || savedLenses.some(l => l.id === target.activeLensId)
      ? target.activeLensId
      : null
    handleSwitchActiveLens(safeLensId, { thenEphemeralView: target.ephemeralView })
  }

  // The golden rule: a single "Showing: <focus> — because …" sentence,
  // always visible, replacing four fragmented status strings the old
  // six-mechanism UI had (stats-strip "active" text, corner-cell lens
  // label, the ephemeral chip's "not saved" text, and the saved-lens
  // picker button's own label). Reading previousFocusRef.current here
  // during render is safe — see the ref's own comment above for why.
  const focusDescriptor = (() => {
    const ev = focus.ephemeralView
    if (ev) {
      if (ev.source === 'pill') {
        return { label: ev.label, reason: 'because Nana re-ranked it just now, from your chat' }
      }
      if (ev.weights) {
        // A drag that carried a pill's weights forward — the parent
        // adjusted Nana's suggestion rather than starting from scratch.
        return { label: ev.label, reason: "you adjusted Nana's suggestion" }
      }
      return { label: ev.label, reason: 'because you dragged rows into this order' }
    }
    if (activeLens) {
      return {
        label:  activeLens.lens_name,
        reason: activeLens.is_topic_lens ? 'because you asked Nana about it' : 'a Focus you saved earlier',
      }
    }
    return {
      label:  'Everything',
      reason: activeChild ? `arranged for ${activeChild.name} from your interview` : 'your personalized comparison',
    }
  })()
  const previousFocus = previousFocusRef.current
  const undoLabel = previousFocus
    ? (previousFocus.activeLensId === null && previousFocus.ephemeralView === null ? 'Back to Everything' : 'Undo')
    : null

  // RRV-11 journey header — done/here/next per step. Grounded in real
  // signals only, not navigation history:
  //  - brief: funnel_state === 'comparison' means the interview actually
  //    finished (lib/children.ts FunnelState — 'onboarding' | 'interview' |
  //    'comparison', terminal at 'comparison').
  //  - verdict: hasVerdict (SSR existence probe — see page.tsx) means a
  //    verdict has been generated at least once.
  //  - compare: no natural "done" gate of its own (continuously explorable,
  //    per the master-plan's explorer-path design) — treated as done once a
  //    verdict exists (can't have one without having engaged Comparison),
  //    so the sequence never reads as step 3 finishing before step 2.
  // Whichever step matches activeTab always renders "here", overriding done.
  type JourneyState = 'done' | 'here' | 'next'
  type JourneyTab = 'brief' | 'compare' | 'verdict'
  const briefDone = activeChild?.funnel_state === 'comparison'
  // hasVerdict is an SSR prop for the child the page loaded with — during
  // the optimistic window after a child switch (activeChildId flips before
  // router.refresh delivers new props), it still reflects the OLD child.
  // Same guard VerdictTab's own verdictReady uses below.
  const verdictDone = (activeChildId === initialActiveChildId && hasVerdict) || verdictJustGenerated
  const journeySteps: { tab: JourneyTab; state: JourneyState }[] = [
    { tab: 'brief', state: activeTab === 'brief' ? 'here' : briefDone ? 'done' : 'next' },
    { tab: 'compare', state: activeTab === 'compare' ? 'here' : verdictDone ? 'done' : 'next' },
    { tab: 'verdict', state: activeTab === 'verdict' ? 'here' : verdictDone ? 'done' : 'next' },
  ]

  // RRV-11 returning-user strip — shown when it's been ≥2 days since the
  // last visit AND there's an active child to talk about (copy
  // interpolates the child's name). Copy is built from real state only
  // (funnel_state / hasVerdict) — no fabricated "what changed" specifics
  // (e.g. deadline countdowns need RRV-4's entry-timeline data, which
  // hasn't shipped yet).
  const returningNextStep = !activeChild
    ? null
    : !briefDone
      ? `Finish ${activeChild.name}'s brief to unlock the table.`
      : !verdictDone
        ? "You have enough for Nana's first take — check the Verdict."
        : 'Revisit the Verdict — worth another look since your last visit.'
  const showReturningStrip =
    !returningDismissed &&
    !!activeChild &&
    daysSinceLastActive !== null &&
    daysSinceLastActive >= 2

  const shellClass = [
    'rr-shell',
    chatState === 'closed' ? 'rr-shell-chat-closed' : '',
    chatState === 'focus' ? 'rr-shell-chat-focus' : '',
    fullscreenBuildMode ? 'rr-shell-fullscreen' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="rr-app">
      <header className="rr-hero">
        <div className="rr-hero-in">
          <div className="rr-hero-top">
            <Link href="/" className="rr-brand-link" aria-label="Nanasays home">
              <svg className="rr-brand-mark" aria-hidden="true">
                <use href="#ic-nana" />
              </svg>
              <span className="rr-brand-text">
                nana<em>says</em>
              </span>
              <span className="rr-brand-sub">research room</span>
            </Link>

            {/* Fable pre-build review: ChildSelector self-hides for the
                common single-child case (ChildSelector.tsx), which would
                leave the hero with no child indicator at all. Fall back to
                a static, non-interactive chip so single-child families
                still see whose research this is — matches the approved
                mock's child-chip, just conditional on there being a real
                choice to make. */}
            {childOptions.length > 1 ? (
              <ChildSelector
                childOptions={childOptions}
                activeChildId={activeChildId}
                onChange={handleActiveChildChange}
              />
            ) : activeChild ? (
              <span className="rr-hero-chip">
                <span className="rr-hero-chip-avatar" aria-hidden="true">
                  {activeChild.name.charAt(0).toUpperCase()}
                </span>
                {activeChild.name}
              </span>
            ) : null}

            <div className="rr-hero-actions">
              <button
                type="button"
                className={`rr-hero-pill${activeTab === 'partner' ? ' is-active' : ''}`}
                onClick={() => handleTabClick('partner')}
                aria-current={activeTab === 'partner' ? 'page' : undefined}
              >
                {TAB_LABELS.partner}
              </button>
              <Link href="/my-reports" className="rr-cta rr-cta-ghost rr-hero-cta">
                ← My reports
              </Link>
            </div>
          </div>

          <p className="rr-hero-title">
            {activeChild ? <>Researching for <em>{activeChild.name}</em></> : 'Your Research Room'}
          </p>

          {/* The 3-step journey — replaces the old flat rr-tabs row for
              brief/compare/verdict. Partner brief moved to rr-hero-actions
              above (it's a parallel tab, not a step in the data→research→
              recommendation sequence). Same handleTabClick mechanic as
              before — only the presentation changed. */}
          <nav className="rr-journey" aria-label="Research room journey">
            {journeySteps.map((step, i) => {
              const n = i + 1
              const desc =
                step.tab === 'brief'
                  ? (step.state === 'done'
                      ? `Nana interviewed you about ${activeChild?.name ?? 'your child'} — goals, interests, what matters most.`
                      : `Answer Nana's questions so the table can get personal to ${activeChild?.name ?? 'your child'}.`)
                  : step.tab === 'compare'
                    ? 'Check the facts side by side. Ask Nana anything as you go.'
                    : "Nana's advice, built from your brief and this research."
              return (
                <button
                  key={step.tab}
                  type="button"
                  className={`rr-step rr-step-${step.state}`}
                  onClick={() => handleTabClick(step.tab)}
                  aria-current={step.state === 'here' ? 'page' : undefined}
                >
                  <span className="rr-step-n" aria-hidden="true">{step.state === 'done' ? '✓' : n}</span>
                  <span className="rr-step-body">
                    <span className="rr-step-k">
                      Step {n} · {JOURNEY_EYEBROW[step.tab]}
                      {step.state === 'here' && <span className="rr-sr-only"> — you are here</span>}
                      {step.state === 'done' && <span className="rr-sr-only"> — completed</span>}
                    </span>
                    <span className="rr-step-t">{TAB_LABELS[step.tab]}</span>
                    <span className="rr-step-d">{desc}</span>
                  </span>
                </button>
              )
            })}
          </nav>

          {showReturningStrip && (
            <div className="rr-returning" role="status">
              <span className="rr-returning-text">
                {/* Fable post-build review: last_active_at only bumps on
                    chat turns (app/api/nana-research/route.ts), not page
                    views — "since your last chat" is what this number
                    actually measures, not "since you last opened this
                    page". */}
                <strong>Welcome back.</strong> It&rsquo;s been {daysSinceLastActive} days
                since you last chatted with Nana. {returningNextStep}
              </span>
              <button
                type="button"
                className="rr-returning-dismiss"
                onClick={() => setReturningDismissed(true)}
                aria-label="Dismiss welcome back message"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={shellClass}>
        <main className="rr-main" aria-hidden={fullscreenBuildMode || undefined}>
          <div className="rr-view-pager" ref={pagerRef}>
            {TAB_ORDER.map((t) => (
              <section
                key={t}
                className={`rr-view-page${activeTab === t ? ' is-active' : ''}`}
                data-tab={t}
                aria-hidden={activeTab !== t ? 'true' : undefined}
              >
                <div className="rr-view">
                  {t === 'compare' ? (
                    <>
                      <div className="rr-view-head">
                        <div>
                          <div className="rr-view-eyebrow">Comparison · the canonical view</div>
                          <h1 className="rr-view-title">
                            Side by side, <em>through your child&rsquo;s eyes.</em>
                          </h1>
                          {/* Slice 6.6 Tier 3.5: sub-text paragraph removed
                              to reclaim ~60px of vertical space for the
                              comparison table. The lens tabs + active-lens
                              chip below already convey the same information
                              functionally. */}
                        </div>
                      </div>
                      {activeChild && (
                        <div className="rr-cmp-showing-row">
                          <div className="rr-cmp-showing-for" role="status">
                            Showing <strong>{activeChild.name}&rsquo;s</strong> matches
                          </div>
                          <SchoolAdder
                            childId={activeChildId}
                            excludeSlugs={(comparisonData?.schools ?? []).map(s => s.slug)}
                            variant="compact"
                          />
                        </div>
                      )}
                      <ComparisonView
                        data={comparisonData}
                        activeChildId={activeChildId}
                        loadError={comparisonError}
                        viewOverlay={effectiveOverlay}
                        onReorderRows={handleReorderRows}
                        savedLenses={savedLenses}
                        activeLensId={focus.activeLensId}
                        onSwitchActiveLens={handleSwitchActiveLens}
                        onSelectEverything={handleSelectEverything}
                        onRefreshTopicLens={handleRefreshTopicLens}
                        onAskNanaGap={handleAskNanaGap}
                        focusDescriptor={focusDescriptor}
                        undoLabel={undoLabel}
                        onUndoFocus={handleUndoFocus}
                        canSaveAsLens={canSaveAsLens}
                        onSaveAsLens={handleSaveAsLens}
                      />
                    </>
                  ) : t === 'brief' ? (
                    <ChildBriefTab
                      children={childSummaries}
                      activeChildId={activeChildId}
                      familyPreferences={familyPreferences}
                      onActiveChildChange={handleActiveChildChange}
                      onChildAdded={handleChildAdded}
                      onShortlistRefreshed={handleShortlistRefreshed}
                      // Phase 3 sidebar smoke fix r1 #3 (Codex 2026-05-24):
                      // guard auto-scroll so it only fires when this tab is
                      // the active view (the pager renders all tabs but only
                      // one is visible). Otherwise switching child via the
                      // top-right dropdown while on Verdict could scroll
                      // inside the hidden Brief panel.
                      isActiveTab={activeTab === 'brief'}
                    />
                  ) : t === 'verdict' ? (
                    // Codex r5 P1 + r6 P2 (2026-05-23):
                    //
                    // r5: key on sessionId forces a full remount when the
                    // active child/session changes — without it, VerdictTab's
                    // autoHydrateAttemptedRef would stay set across session
                    // swaps and leave previous child's verdict visible.
                    //
                    // r6: but `activeChildId` flips immediately on child
                    // switch, while `initialSession` lags until router.refresh
                    // delivers new server props. During that window, the OLD
                    // session.child_id !== the NEW activeChildId, so old
                    // verdict would render under new child name. Gate via
                    // verdictReady — when child_id mismatches activeChildId,
                    // pass sessionId=null + verdict=null so VerdictTab shows
                    // its loading placeholder instead of the stale verdict.
                    (() => {
                      // Codex r6 P2 + r7 P1 (2026-05-23):
                      //
                      // r6: detect optimistic child-switch via
                      //   verdictReady = activeChildId === initialActiveChildId
                      // (client vs SSR prop). r7 then surfaced that gating the
                      // verdict/sessionId props to null isn't enough — VerdictTab
                      // holds its own `localVerdict` state populated by
                      // auto-hydrate, and `useEffect([verdict])` only clears it
                      // when the prop CHANGES. If researchVerdict is already
                      // null going into the switch, the prop doesn't change,
                      // localVerdict stays populated, old verdict renders under
                      // new child name.
                      //
                      // Fix: include activeChildId in the key. When the client
                      // flips activeChildId, the key changes immediately,
                      // VerdictTab unmounts + remounts with fresh state
                      // (including a fresh autoHydrateAttemptedRef). When
                      // router.refresh later delivers the new session id, the
                      // key changes again and we remount once more — two
                      // remounts per switch, but neither shows stale data.
                      const verdictReady = activeChildId === initialActiveChildId
                      return (
                        <VerdictTab
                          key={`${activeChildId ?? 'no-child'}:${initialSession?.id ?? 'no-session'}`}
                          verdict={verdictReady ? researchVerdict : null}
                          sessionId={verdictReady ? (initialSession?.id ?? null) : null}
                          childName={activeChild?.name ?? null}
                          onVerdictReady={() => setVerdictJustGenerated(true)}
                        />
                      )
                    })()
                  ) : t === 'partner' ? (
                    <PartnerBriefTab
                      brief={partnerBrief}
                      childId={activeChildId}
                      sessionId={initialSession?.id ?? null}
                      childName={activeChild?.name ?? null}
                    />
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </main>

        <ResearchRoomChat
          key={`${activeChildId ?? 'none'}:${initialSession?.id ?? 'none'}`}
          state={chatState}
          buildMode={chatBuildMode}
          fullscreenBuildMode={fullscreenBuildMode}
          siblingNeedsBasics={siblingNeedsBasics}
          siblingBasicsCaptured={siblingBasicsCaptured}
          siblingActiveChildName={currentChild?.name ?? null}
          siblingActiveChildDob={currentChild?.date_of_birth ?? null}
          onExitInterview={handleExitInterview}
          onTableBuilt={handleTableBuilt}
          onCollapse={handleCollapseChat}
          onExpandDefault={handleExpandDefault}
          onToggleFocus={handleToggleFocus}
          onToggleBuildMode={handleToggleBuildMode}
          onSkipBuildMode={handleSkipBuildMode}
          shortlistSlugs={comparisonData?.schools.map(s => s.slug) ?? []}
          initialSession={initialSession}
          initialMessages={initialMessages}
          initialBuildModeState={initialBuildModeState}
          lensView={lens ?? 'general'}
          onApplyReRank={handleApplyReRank}
          pendingRefreshTopicLens={pendingRefreshTopicLens}
          pendingGapQuestion={pendingGapQuestion}
        />
      </div>
    </div>
  )
}
