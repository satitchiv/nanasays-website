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
}

const TAB_ORDER: Tab[] = ['brief', 'compare', 'verdict', 'partner']

const TAB_LABELS: Record<Tab, string> = {
  brief: 'Child brief',
  compare: 'Comparison',
  verdict: 'Verdict',
  partner: 'Partner brief',
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
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('compare')
  const [chatState, setChatState] = useState<ChatState>('default')
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

  // 6-FU5 — optimistic active-lens id. Declared up here (before any
  // closure that references it) because handleSwitchActiveLens flips
  // it before the POST resolves; placing the state lower triggers a
  // temporal-dead-zone error at module init.
  const [optimisticActiveLensId, setOptimisticActiveLensId] =
    useState<string | null>(activeLensId)
  useEffect(() => {
    setOptimisticActiveLensId(activeLensId)
  }, [activeLensId])

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

  // Slice 6 commits 7+8 — ephemeral view. Pure client state; no DB
  // write. The single source of truth is `rowOrder` (an explicit list
  // of row IDs in display order). Both inputs flow into it:
  //   - Drag-to-reorder (commit 8): drag-end sets rowOrder directly.
  //   - ↻ Re-rank pill (commit 7): pill click computes rowOrder from
  //     weights at click time and stores both. Weights stay around for
  //     save-as-lens metadata (commit 9).
  // Refreshing the page drops this state back to null.
  type EphemeralView = {
    rowOrder:         string[]                       // row IDs in display order
    visibleRows?:     string[]                       // canonical row_name allowlist
    weights?:         Record<string, number>         // canonical row_name → 0..5 (pill source only)
    label:            string                         // "↻ Re-rank by …" or "Custom view"
    source:           'drag' | 'pill'
    sourceMessageId?: string
    sourceProposalId?: string
  } | null
  const [ephemeralView, setEphemeralView] = useState<EphemeralView>(null)

  // Pill-click handler: compute initial rowOrder from weights against
  // the currently-loaded comparison rows, then store both.
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
    setEphemeralView({
      rowOrder:         indexed.map(x => x.id),
      visibleRows:      viewSpec.visible_rows,
      weights:          viewSpec.weights,
      label,
      source:           'pill',
      sourceMessageId:  messageId,
      sourceProposalId: proposalId,
    })
  }

  // Drag-reorder handler (commit 8): rowIds are the new ordering.
  // Replaces any active pill view — last action wins. Label changes to
  // "Custom view" so the chip distinguishes user-arranged from
  // Nana-suggested.
  function handleReorderRows(rowIds: string[]) {
    setEphemeralView(prev => {
      // If a pill view was active, preserve its weights for save-as-lens
      // (the parent may have manually tweaked Nana's suggestion).
      const carriedWeights = prev?.source === 'pill' ? prev.weights : undefined
      const carriedVisible = prev?.visibleRows
      return {
        rowOrder:    rowIds,
        visibleRows: carriedVisible,
        weights:     carriedWeights,
        label:       prev?.source === 'pill' ? `${prev.label} (edited)` : 'Custom view',
        source:      'drag',
      }
    })
  }

  function handleClearReRank() { setEphemeralView(null) }

  // Codex P1: ephemeralView's rowOrder/visibleRows reference the row
  // set that was loaded WHEN the pill/drag fired. Switching base lens
  // (URL `lens` prop changes) or activating/clearing a saved lens
  // re-loads comparisonData against a different row UUID set; the
  // stale overlay would either filter to nothing or pin the wrong
  // rows. Drop it on either transition. Pill clicks themselves don't
  // change `lens` or the optimistic active-lens id, so the just-set
  // view survives. Tracking the optimistic id (not the prop) means
  // the clear fires the moment the user picks a new lens, not 1.5s
  // later when router.refresh resolves.
  useEffect(() => {
    setEphemeralView(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, optimisticActiveLensId])

  // Slice 6 commit 9 — save the current ephemeral view as a permanent
  // lens. Only works when the view originated from a ↻ pill (source =
  // 'pill') because the save_view_as_lens RPC reconstructs view_spec
  // from parsed_answer.proposed_actions[id]. If the user dragged after
  // the pill click, save is still allowed — the RPC saves the original
  // proposal's spec, not the dragged tweaks. Future commit could add a
  // separate "save current arrangement" RPC for drag-only views.
  const canSaveAsLens = !!(ephemeralView && (ephemeralView.source === 'pill' || (ephemeralView.source === 'drag' && ephemeralView.sourceProposalId && ephemeralView.sourceMessageId)))

  async function handleSaveAsLens(lensName: string): Promise<{ ok: boolean; code?: string; existingLensId?: string }> {
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
        setEphemeralView(null)
        router.refresh()
        return { ok: true }
      }
      return { ok: false, code: body.code, existingLensId: body.existing_lens_id }
    } catch (e) {
      console.error('[save-as-lens]', e)
      return { ok: false, code: 'network' }
    }
  }

  // Persist the active child to parent_profiles + refresh server data
  // so the comparison table re-fetches per the new child's shortlist.
  // Failures revert local state to keep UI consistent with DB truth.
  async function handleActiveChildChange(nextChildId: string) {
    if (nextChildId === activeChildId) return
    const prev = activeChildId
    setActiveChildId(nextChildId)  // optimistic
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
  // Reads optimisticActiveLensId so the overlay flips with the click,
  // not 1.5s later.
  const activeLens = optimisticActiveLensId
    ? savedLenses.find(l => l.id === optimisticActiveLensId) ?? null
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

  // Effective overlay: ephemeral (pill/drag) wins over saved lens. When
  // the parent clears the ephemeral chip, the saved lens overlay
  // resumes — clearing back to base lens is a separate action via the
  // picker (Activate "General comparison" tab).
  const effectiveOverlay = ephemeralView
    ? {
        rowOrder:    ephemeralView.rowOrder,
        visibleRows: ephemeralView.visibleRows ?? null,
        label:       ephemeralView.label,
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

  // Picker dropdown action — switch which saved lens drives the view
  // (or clear back to base via lensId === null). 6-FU5: flip the
  // client mirror BEFORE the fetch so the picker label + table
  // overlay update on click; the server refresh reconciles in the
  // background. Roll back optimistic state on POST failure so the
  // UI matches DB truth.
  async function handleSwitchActiveLens(lensId: string | null) {
    if (!initialSession) return
    if (lensId === optimisticActiveLensId) return
    const prev = optimisticActiveLensId
    setOptimisticActiveLensId(lensId)
    try {
      const res = await fetch('/api/research-room/active-lens', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: initialSession.id, lens_id: lensId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('[switch-active-lens]', res.status, body?.code)
        setOptimisticActiveLensId(prev)
        return
      }
      router.refresh()
    } catch (e) {
      console.error('[switch-active-lens]', e)
      setOptimisticActiveLensId(prev)
    }
  }

  const shellClass = [
    'rr-shell',
    chatState === 'closed' ? 'rr-shell-chat-closed' : '',
    chatState === 'focus' ? 'rr-shell-chat-focus' : '',
    fullscreenBuildMode ? 'rr-shell-fullscreen' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="rr-app">
      <header className="rr-top">
        <div className="rr-top-in">
          <Link href="/" className="rr-brand-link" aria-label="Nanasays home">
            <svg className="rr-brand-mark" aria-hidden="true">
              <use href="#ic-nana" />
            </svg>
            <span className="rr-brand-text">
              nana<em>says</em>
            </span>
            <span className="rr-brand-sub">research room</span>
          </Link>

          <nav className="rr-tabs" aria-label="Research room sections">
            {TAB_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                className={`rr-tab${activeTab === t ? ' is-active' : ''}${t === 'compare' ? ' rr-tab-privileged' : ''}`}
                onClick={() => handleTabClick(t)}
                aria-current={activeTab === t ? 'page' : undefined}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>

          <div className="rr-top-meta">
            <ChildSelector
              childOptions={childOptions}
              activeChildId={activeChildId}
              onChange={handleActiveChildChange}
            />
          </div>

          <Link href="/my-reports" className="rr-cta rr-cta-ghost rr-top-cta">
            ← My reports
          </Link>
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
                        activeChildName={activeChild?.name ?? null}
                        activeChildId={activeChildId}
                        lens={lens}
                        loadError={comparisonError}
                        viewOverlay={effectiveOverlay}
                        onClearOverlay={handleClearReRank}
                        onReorderRows={handleReorderRows}
                        savedLenses={savedLenses}
                        activeLensId={optimisticActiveLensId}
                        onSwitchActiveLens={handleSwitchActiveLens}
                        onRefreshTopicLens={handleRefreshTopicLens}
                      />
                    </>
                  ) : t === 'brief' ? (
                    <ChildBriefTab
                      children={childSummaries}
                      activeChildId={activeChildId}
                      familyPreferences={familyPreferences}
                      onActiveChildChange={handleActiveChildChange}
                    />
                  ) : t === 'verdict' ? (
                    <VerdictTab
                      verdict={researchVerdict}
                      sessionId={initialSession?.id ?? null}
                      baseLensKind={activeLens?.base_lens_kind ?? lens}
                      childName={activeChild?.name ?? null}
                    />
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
          onExitInterview={handleExitInterview}
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
          canSaveAsLens={canSaveAsLens}
          onSaveAsLens={handleSaveAsLens}
          pendingRefreshTopicLens={pendingRefreshTopicLens}
        />
      </div>
    </div>
  )
}
