'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ChildSelector, { type ChildOption } from './ChildSelector'
import ChildBriefTab, { type ChildSummary, type FamilyPreferences } from './ChildBriefTab'
import ResearchRoomChat, { type ChatState } from './ResearchRoomChat'
import ComparisonView from './ComparisonView'
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
  savedLenses?: SavedLens[]
  activeLensId?: string | null
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
  savedLenses      = [],
  activeLensId     = null,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('compare')
  const [chatState, setChatState] = useState<ChatState>('default')
  const [buildMode, setBuildMode] = useState(false)
  const [activeChildId, setActiveChildId] = useState<string | null>(initialActiveChildId)

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
  // change `lens` or `activeLensId`, so the just-set view survives.
  useEffect(() => {
    setEphemeralView(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, activeLensId])

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
    const next = !buildMode
    setBuildMode(next)
    setChatState(next ? 'focus' : 'default')
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
  // Falls back to undefined when no lens is active or the lens is
  // empty (UUID misses are silent — same posture as the RPC's
  // unresolved-name drop on save).
  const activeLens = activeLensId
    ? savedLenses.find(l => l.id === activeLensId) ?? null
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
  // (or clear back to base via lensId === null). Calls the existing
  // /api/research-room/active-lens route shipped during slice 6, then
  // refreshes server data so loadComparisonData re-fetches against the
  // new effective base lens.
  async function handleSwitchActiveLens(lensId: string | null) {
    if (!initialSession) return
    if (lensId === activeLensId) return
    try {
      const res = await fetch('/api/research-room/active-lens', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ session_id: initialSession.id, lens_id: lensId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('[switch-active-lens]', res.status, body?.code)
        return
      }
      router.refresh()
    } catch (e) {
      console.error('[switch-active-lens]', e)
    }
  }

  const shellClass = [
    'rr-shell',
    chatState === 'closed' ? 'rr-shell-chat-closed' : '',
    chatState === 'focus' ? 'rr-shell-chat-focus' : '',
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
        <main className="rr-main">
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
                          <p className="rr-view-meta">
                            Two lenses: <strong>General comparison</strong> (universally-relevant rows every parent sees) and{' '}
                            <strong>{activeChild ? `${activeChild.name} fit` : 'Child fit'}</strong> (tailored to your child&rsquo;s profile).
                            Chat with Nana to add custom rows; rows added from chat can be removed with ×.
                          </p>
                        </div>
                      </div>
                      {activeChild && (
                        <div className="rr-cmp-showing-for" role="status">
                          Showing <strong>{activeChild.name}&rsquo;s</strong> matches
                        </div>
                      )}
                      <ComparisonView
                        data={comparisonData}
                        activeChildName={activeChild?.name ?? null}
                        lens={lens}
                        loadError={comparisonError}
                        viewOverlay={effectiveOverlay}
                        onClearOverlay={handleClearReRank}
                        onReorderRows={handleReorderRows}
                        savedLenses={savedLenses}
                        activeLensId={activeLensId}
                        onSwitchActiveLens={handleSwitchActiveLens}
                      />
                    </>
                  ) : t === 'brief' ? (
                    <ChildBriefTab
                      children={childSummaries}
                      activeChildId={activeChildId}
                      familyPreferences={familyPreferences}
                      onActiveChildChange={handleActiveChildChange}
                    />
                  ) : (
                    <>
                      <div className="rr-view-head">
                        <div>
                          <div className="rr-view-eyebrow">{TAB_LABELS[t]}</div>
                          <h1 className="rr-view-title">
                            {TAB_LABELS[t]} · <em>placeholder.</em>
                          </h1>
                          <p className="rr-view-meta">{PLACEHOLDER_COPY[t].sub}</p>
                        </div>
                      </div>

                      <div className="rr-placeholder-card" role="status">
                        <div className="rr-placeholder-eyebrow">Slice 1 · shell only</div>
                        <div className="rr-placeholder-body">
                          The four tabs and the chat states work. Swipe left/right on
                          mobile to flip between tabs. Real content appears in later
                          slices.
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>
            ))}
          </div>
        </main>

        <ResearchRoomChat
          state={chatState}
          buildMode={buildMode}
          onCollapse={handleCollapseChat}
          onExpandDefault={handleExpandDefault}
          onToggleFocus={handleToggleFocus}
          onToggleBuildMode={handleToggleBuildMode}
          shortlistSlugs={comparisonData?.schools.map(s => s.slug) ?? []}
          initialSession={initialSession}
          initialMessages={initialMessages}
          lensView={lens ?? 'general'}
          onApplyReRank={handleApplyReRank}
          canSaveAsLens={canSaveAsLens}
          onSaveAsLens={handleSaveAsLens}
        />
      </div>
    </div>
  )
}
