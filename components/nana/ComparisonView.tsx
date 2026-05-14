'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
  EMPTY_DATA,
  type ComparisonData,
  type ComparisonRow,
  type RowCell,
  type SchoolColumn,
} from './comparison-placeholder'
import SchoolAdder from './SchoolAdder'

type Lens = 'general' | 'child_fit'

// Slice 6 close — minimal lens shape consumed by the picker dropdown.
// Mirrors the SavedLens type in ResearchRoom (kept loose here to avoid
// a cross-component type cycle).
type LensListItem = {
  id:             string
  lens_name:      string
  base_lens_kind: Lens
  // Slice 6.6 Tier 3: drives the ↻ Refresh lens button on the active-
  // lens chip. True for topic lenses (created via create_topic_lens RPC
  // — have rows with created_by_lens_id = this.id). False/undefined for
  // saved/re-rank lenses created via confirm_lens_from_proposal.
  is_topic_lens?: boolean
}

type Props = {
  data?: ComparisonData
  activeChildName?: string | null
  lens?: Lens
  // Round-4 fix (Codex F3): when the server-side load throws, the page
  // sets this string and we surface it as a banner instead of falling
  // through to demo schools.
  loadError?: string | null
  // Slice 6 commits 7+8 — view overlay. rowOrder is an explicit list of
  // row IDs in display order. visibleRows (canonical row_names, if
  // non-null) further filters the row set before sort. Pure visual
  // overlay; the underlying comparison_rows are unchanged.
  //
  // Two `kind`s drive subtly different chrome:
  //   - 'ephemeral' (pill / drag) renders the "view applied (not saved)"
  //     chip with × so the parent can clear back to base lens.
  //   - 'saved' (active saved lens) renders no chip — the picker
  //     dropdown is the indicator. Clearing is via the picker.
  viewOverlay?: {
    rowOrder:    string[]                 // row IDs in display order
    visibleRows: string[] | null          // null = no filter; array = canonical row_name allowlist
    label:       string                   // chip label (ephemeral) / lens name (saved)
    kind:        'ephemeral' | 'saved'
  } | null
  onClearOverlay?: () => void
  // Slice 6 commit 8 — drag-end callback. ComparisonView fires this
  // with the new ordering whenever the parent drops a row in a new
  // position. The parent (ResearchRoom) updates ephemeralView.rowOrder
  // and the table re-renders.
  onReorderRows?: (rowIds: string[]) => void
  // Slice 6 close — saved lens picker. savedLenses is the full list for
  // the session; activeLensId selects which one (if any) drives the
  // overlay. onSwitchActiveLens calls /api/research-room/active-lens +
  // router.refresh; lensId === null clears back to the URL base lens.
  savedLenses?: LensListItem[]
  activeLensId?: string | null
  onSwitchActiveLens?: (lensId: string | null) => Promise<void> | void
  // Slice 6.6 — in-room shortlist mutations. activeChildId scopes the
  // add/remove RPCs (each child has its own shortlist). When null, the
  // + Add school + × column controls are hidden — there's no shortlist
  // to mutate without a child context.
  activeChildId?: string | null
  // Slice 6.6 Tier 3 — fired when the user clicks the ↻ Refresh lens
  // affordance on a topic lens. Parent (ResearchRoom) bridges to the
  // chat hook by submitting "Create a lens for <topicName>" so Nana
  // re-emits a propose_create_topic_lens proposal that — on confirm —
  // hits the create_topic_lens RPC's MERGE branch (slice 6.6 Tier 2)
  // and refreshes the lens with the current shortlist. Only rendered
  // when an active lens is a topic lens.
  onRefreshTopicLens?: (topicName: string) => void
}

// Slice 5.5: ALL rows live in comparison_rows now (no more hardcoded
// canonical rows). Every row id is `cmp-<dbId>`. Removability is set by the
// loader: only chat-added rows have row.removable = true. Seeded
// General/child_fit rows are part of the base comparison and aren't
// user-removable until slice 5.5f-bis ships a "Restore hidden rows"
// affordance.
function customRowDbId(rowId: string): string {
  return rowId.replace(/^cmp-/, '')
}

// Slice 8 Step 0.6: human-readable label for a comparison_rows.group_name.
// 'general' is suppressed at the call site so it never reaches this helper.
function prettyGroupName(g: string): string {
  if (g === 'child-specific')   return 'For your child'
  if (g.startsWith('seeded-'))  return `Topic: ${g.slice(7)}`
  return g.replace(/-/g, ' ')
}

export default function ComparisonView({
  data = EMPTY_DATA,
  activeChildName = null,
  lens = 'general',
  loadError = null,
  viewOverlay = null,
  onClearOverlay,
  onReorderRows,
  savedLenses = [],
  activeLensId = null,
  onSwitchActiveLens,
  activeChildId = null,
  onRefreshTopicLens,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  // Slice 6.6 t12 T1.1 + Codex P1#2 — optimistic column remove. The
  // slug goes into this set the moment the user clicks ×; the column
  // disappears immediately. The POST + router.refresh continue in
  // background; on success the server prop drops the slug too and the
  // sync useEffect clears the optimistic entry. On error we drop the
  // slug back so the column reappears with the error banner.
  const [optimisticallyRemoved, setOptimisticallyRemoved] = useState<Set<string>>(new Set())
  const [shortlistError, setShortlistError] = useState<string | null>(null)

  // Slice 6.6 Tier 3.5 — zoom state for the comparison table. Three
  // discrete steps (small / normal / large) give predictable layout vs
  // a continuous slider. Persisted to localStorage so the parent's
  // preference sticks across reloads. SSR-safe init: read on mount in
  // useEffect, not in useState's initialiser.
  const ZOOM_STEPS = [0.85, 1.0, 1.15] as const
  type ZoomStep = typeof ZOOM_STEPS[number]
  const [zoom, setZoom] = useState<ZoomStep>(1.0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem('rr-cmp-zoom')
    if (!raw) return
    const n = parseFloat(raw)
    const match = ZOOM_STEPS.find(s => Math.abs(s - n) < 0.001)
    if (match) setZoom(match)
    // ZOOM_STEPS is a frozen const; safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function adjustZoom(delta: -1 | 1) {
    const idx = ZOOM_STEPS.indexOf(zoom)
    const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + delta))]
    if (next === zoom) return
    setZoom(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('rr-cmp-zoom', String(next))
    }
  }

  async function handleRemoveSchool(slug: string) {
    if (!activeChildId) return
    if (optimisticallyRemoved.has(slug)) return  // already in-flight
    setShortlistError(null)
    setOptimisticallyRemoved(prev => {
      const next = new Set(prev)
      next.add(slug)
      return next
    })
    try {
      const res = await fetch('/api/research-room/shortlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', child_id: activeChildId, school_slug: slug }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const code = typeof j?.code === 'string' ? j.code : 'request_failed'
        setShortlistError(`Could not remove the school (${code}).`)
        // Drop the slug back so the column reappears.
        setOptimisticallyRemoved(prev => {
          const next = new Set(prev)
          next.delete(slug)
          return next
        })
        return
      }
      router.refresh()
      // Optimistic entry stays set until the server prop reflects the
      // remove (sync useEffect below). This avoids a flash where the
      // column briefly reappears between the fetch resolving and the
      // re-rendered server data landing.
    } catch (e) {
      console.error('[ComparisonView remove school]', e)
      setShortlistError('Network error removing the school.')
      setOptimisticallyRemoved(prev => {
        const next = new Set(prev)
        next.delete(slug)
        return next
      })
    }
  }

  // Sync effect: drop optimistic entries once the server data no
  // longer contains them (router.refresh has landed). Codex P1#2:
  // ensures the optimistic set doesn't grow stale across multiple
  // remove cycles.
  useEffect(() => {
    if (optimisticallyRemoved.size === 0) return
    const liveSlugs = new Set(data.schools.map(s => s.slug))
    let needsUpdate = false
    const next = new Set<string>()
    optimisticallyRemoved.forEach(slug => {
      if (liveSlugs.has(slug)) {
        next.add(slug)  // server still has it — keep optimistic
      } else {
        needsUpdate = true  // server dropped it → drop optimistic
      }
    })
    if (needsUpdate) setOptimisticallyRemoved(next)
  }, [data.schools, optimisticallyRemoved])

  // Codex t13 follow-up: the optimistic set is keyed by slug only.
  // If the user switches active child (Maya → Otis) while a remove is
  // in flight, the slug could leak into the new child's view (each
  // child has their own shortlist). Clear the set on activeChildId
  // change so cross-child removes don't bleed.
  useEffect(() => {
    setOptimisticallyRemoved(new Set())
    setShortlistError(null)
  }, [activeChildId])
  // Codex P1#2: optimistic filter must apply to BOTH schools AND each
  // row's cells in lockstep. row.cells[] is indexed by school position,
  // so dropping a school from `schools` without dropping the matching
  // index from each row's cells would offset every cell to the wrong
  // column. visibleSchoolIndices is computed once and used for both.
  const rawSchools = data.schools
  const visibleSchoolIndices: number[] = []
  for (let i = 0; i < rawSchools.length; i++) {
    if (!optimisticallyRemoved.has(rawSchools[i].slug)) {
      visibleSchoolIndices.push(i)
    }
  }
  const schools = visibleSchoolIndices.map(i => rawSchools[i])
  const rawRows = data.rows.map(r => ({
    ...r,
    cells: visibleSchoolIndices.map(i => r.cells[i] ?? { kind: 'empty' as const }),
  }))
  const childLensLabel = activeChildName ? `${activeChildName} fit` : 'Child fit'
  const activeLens = activeLensId
    ? savedLenses.find(l => l.id === activeLensId) ?? null
    : null

  // Close the picker when the parent clicks outside or hits Escape.
  // Mounted only when open so it's a no-op during the common case.
  useEffect(() => {
    if (!pickerOpen) return
    function onDocClick(e: MouseEvent) {
      if (!pickerRef.current) return
      if (pickerRef.current.contains(e.target as Node)) return
      setPickerOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  // Slice 6 commits 7+8 — apply ephemeral overlay (filter + sort).
  // Source of truth is `rowOrder`: an explicit list of row IDs. Rows
  // present in `rowOrder` render in that order; rows missing from it
  // fall to the bottom in their original loader order (defensive — in
  // normal flow rowOrder covers every visible row).
  const rows = (() => {
    if (!viewOverlay) return rawRows
    const norm = (s: string) => s.trim().toLowerCase()
    const visibleSet = viewOverlay.visibleRows
      ? new Set(viewOverlay.visibleRows.map(norm))
      : null
    const filtered = visibleSet
      ? rawRows.filter(r => visibleSet.has(norm(r.label)))
      : rawRows
    const orderIdx = new Map<string, number>()
    viewOverlay.rowOrder.forEach((id, i) => orderIdx.set(id, i))
    const indexed = filtered.map((row, idx) => ({
      row,
      idx,
      orderPos: orderIdx.has(row.id) ? orderIdx.get(row.id)! : Number.POSITIVE_INFINITY,
    }))
    indexed.sort((a, b) => {
      if (a.orderPos !== b.orderPos) return a.orderPos - b.orderPos
      return a.idx - b.idx
    })
    return indexed.map(x => x.row)
  })()

  // Slice 5.5a: lens switch via URL param. The server reads searchParams.lens
  // in page.tsx and re-fetches the right rows. router.replace keeps history
  // tidy (no per-click entry); cloning the existing search params preserves
  // anything already on the URL (e.g. future ?ref=, ?from=, etc.).
  //
  // Slice 6 close — clicking a base-lens tab also clears the active
  // saved lens (if any). Otherwise the URL flips but the saved lens
  // keeps driving the overlay, which is confusing.
  //
  // Codex P2: sequence the two mutations. Firing router.replace and
  // onSwitchActiveLens concurrently means the URL change can land
  // server-side BEFORE the active-lens POST resolves, briefly
  // rendering the new base lens with the OLD active_lens_id still
  // overriding it. Awaiting the clear first means the URL change
  // re-fetches against DB truth.
  async function switchLens(next: Lens) {
    if (activeLensId && onSwitchActiveLens) {
      await onSwitchActiveLens(null)
    }
    if (next !== lens) {
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      if (next === 'general') params.delete('lens')
      else params.set('lens', next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    }
  }

  async function handleRemoveRow(uiRowId: string) {
    const dbId = customRowDbId(uiRowId)
    setPendingRemoveId(uiRowId)
    setRemoveError(null)
    try {
      const res = await fetch('/api/research-room/write-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo_add_row', row_id: dbId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const code = typeof j?.code === 'string' ? j.code : 'request_failed'
        setRemoveError(`Could not remove the row (${code}).`)
        return
      }
      router.refresh()
    } catch (e) {
      console.error('[comparison-view remove]', e)
      setRemoveError('Network error while removing the row.')
    } finally {
      setPendingRemoveId(null)
    }
  }

  // Server-side load error: show an explicit banner. We deliberately do
  // NOT fall through to the empty-state CTA (which would suggest "add some
  // schools") because the user might already have schools — they just
  // failed to load.
  if (loadError) {
    return (
      <div className="rr-cmp-empty" role="alert">
        <div className="rr-cmp-empty-eyebrow">Comparison unavailable</div>
        <h2 className="rr-cmp-empty-title">Something went wrong loading your comparison.</h2>
        <p className="rr-cmp-empty-body">{loadError}</p>
      </div>
    )
  }

  if (schools.length === 0) {
    return (
      <div className="rr-cmp-empty" role="status">
        <div className="rr-cmp-empty-eyebrow">Nothing to compare yet</div>
        <h2 className="rr-cmp-empty-title">
          Add some schools to your shortlist first.
        </h2>
        <p className="rr-cmp-empty-body">
          The comparison table fills in automatically once you've saved a few.
        </p>
        {/* Slice 6.6 (Codex r1 P2): the in-room add affordance also
            renders in the empty state. Without it the user's only path
            forward was "Browse schools →" (an external page), defeating
            the in-room workspace promise. */}
        {activeChildId && (
          <div className="rr-cmp-empty-add">
            <SchoolAdder childId={activeChildId} excludeSlugs={[]} />
          </div>
        )}
        <Link href="/schools" className="rr-cmp-empty-cta">
          {activeChildId ? 'Or browse schools →' : 'Browse schools →'}
        </Link>
      </div>
    )
  }

  const gridTemplateColumns = `260px repeat(${schools.length}, minmax(220px, 1fr))`

  return (
    <div className="rr-cmp-wrap">
      <div className="rr-cmp-controls">
        <div className="rr-cmp-lens-tabs" role="tablist" aria-label="Comparison lens">
          <span className="rr-cmp-lens-label">Lenses</span>
          <button
            type="button"
            role="tab"
            aria-selected={!activeLens && lens === 'general'}
            className={`rr-cmp-lens-tab${!activeLens && lens === 'general' ? ' is-active' : ''}`}
            onClick={() => switchLens('general')}
          >
            General comparison
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!activeLens && lens === 'child_fit'}
            className={`rr-cmp-lens-tab${!activeLens && lens === 'child_fit' ? ' is-active' : ''}`}
            onClick={() => switchLens('child_fit')}
          >
            {childLensLabel}
          </button>
          {/* Slice 6 close — saved-lens picker. Hidden until the parent
              has saved at least one lens. The active lens (if any) is
              also shown as the button label so the picker doubles as
              the active-lens indicator. */}
          {savedLenses.length > 0 && (
            <div className="rr-cmp-lens-picker" ref={pickerRef}>
              <button
                type="button"
                className={`rr-cmp-lens-tab rr-cmp-lens-tab--picker${activeLens ? ' is-active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen(o => !o)}
                title={activeLens ? `Active lens: ${activeLens.lens_name}` : 'Pick a saved lens'}
              >
                {activeLens ? activeLens.lens_name : 'Saved lenses'}
                <span aria-hidden className="rr-cmp-lens-picker-caret">▾</span>
              </button>
              {pickerOpen && (
                <div role="menu" className="rr-cmp-lens-picker-menu">
                  <div className="rr-cmp-lens-picker-eyebrow">Saved lenses · this session</div>
                  {savedLenses.map(l => {
                    const isActive = l.id === activeLensId
                    return (
                      <button
                        key={l.id}
                        type="button"
                        role="menuitem"
                        className={`rr-cmp-lens-picker-item${isActive ? ' is-active' : ''}`}
                        onClick={() => {
                          setPickerOpen(false)
                          if (onSwitchActiveLens) void onSwitchActiveLens(isActive ? null : l.id)
                        }}
                      >
                        <span className="rr-cmp-lens-picker-check" aria-hidden>{isActive ? '✓' : ''}</span>
                        <span className="rr-cmp-lens-picker-name">{l.lens_name}</span>
                        <span className="rr-cmp-lens-picker-base">{l.base_lens_kind === 'child_fit' ? 'child fit' : 'general'}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Slice 6.6 Tier 3.5: stats row is now a single inline strip
            holding rows/schools count, the active-lens label, the ↻
            Refresh affordance (topic lenses only), and the zoom −/+
            controls. Two-line layout was wasting vertical space the
            user wanted for the table. */}
        <div className="rr-cmp-stats">
          <span className="rr-cmp-stats-counts">{rows.length} rows · {schools.length} schools</span>
          <span className="rr-cmp-stats-divider" aria-hidden="true">·</span>
          <span className="rr-cmp-stats-active">
            <strong>{activeLens ? activeLens.lens_name : (lens === 'general' ? 'General' : childLensLabel)}</strong> active
          </span>
          {activeLens && activeLens.is_topic_lens && onRefreshTopicLens && (
            <button
              type="button"
              className="rr-cmp-stats-refresh"
              onClick={() => onRefreshTopicLens(activeLens.lens_name)}
              title={`Ask Nana to fill ${activeLens.lens_name} data for any newly-shortlisted schools.`}
              aria-label={`Refresh ${activeLens.lens_name} lens with current shortlist`}
            >
              <span aria-hidden="true">↻</span> Refresh
            </button>
          )}
          <span className="rr-cmp-stats-zoom" role="group" aria-label="Table zoom">
            <span className="rr-cmp-stats-zoom-icon" aria-hidden="true">🔍</span>
            <button
              type="button"
              className="rr-cmp-stats-zoom-btn"
              onClick={() => adjustZoom(-1)}
              disabled={zoom === ZOOM_STEPS[0]}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <span aria-hidden="true">−</span>
            </button>
            <button
              type="button"
              className="rr-cmp-stats-zoom-btn"
              onClick={() => adjustZoom(1)}
              disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <span aria-hidden="true">+</span>
            </button>
          </span>
        </div>
        {/* Slice 6.6 — the + Add school control moved to the
            ResearchRoom header (next to the active-child pill) so the
            comparison-controls row stays compact. Empty-state path
            below renders its own SchoolAdder so the user always has an
            in-room recovery affordance. */}
      </div>

      {shortlistError && (
        <div className="rr-cmp-error" role="alert">
          {shortlistError}
          <button type="button" className="rr-chat-error-dismiss" onClick={() => setShortlistError(null)}>×</button>
        </div>
      )}

      {/* Slice 6 commit 7 — ephemeral re-rank chip. Shows the active
          view label with × to clear. Saved-lens overlays skip the
          chip — the picker dropdown above already indicates which
          lens is active. */}
      {viewOverlay && viewOverlay.kind === 'ephemeral' && (
        <div className="rr-cmp-overlay-chip" role="status">
          <span className="rr-cmp-overlay-chip-icon" aria-hidden="true">↻</span>
          <span className="rr-cmp-overlay-chip-text">
            <strong>{viewOverlay.label}</strong>
            <span className="rr-cmp-overlay-chip-meta"> · view applied (not saved)</span>
          </span>
          {onClearOverlay && (
            <button
              type="button"
              className="rr-cmp-overlay-chip-clear"
              onClick={onClearOverlay}
              aria-label="Reset to base lens"
              title="Reset to base lens"
            >
              ×
            </button>
          )}
        </div>
      )}


      <div
        className="rr-cmp-table-wrap"
        style={{ zoom }}
      >
        <div className="rr-cmp-table">
          {/* Header row */}
          <div className="rr-cmp-table-row rr-cmp-table-row--head" style={{ gridTemplateColumns }}>
            <div className="rr-cmp-corner">
              <div className="rr-cmp-corner-eyebrow">Comparing</div>
              <div className="rr-cmp-corner-title">
                {schools.length} schools, <em>{rows.length} dimensions</em>
              </div>
              <div className="rr-cmp-corner-meta">
                {activeLens
                  ? `${activeLens.lens_name} lens`
                  : (lens === 'general' ? 'General lens' : `${childLensLabel} lens`)}
              </div>
            </div>
            {schools.map((s, i) => (
              // Slice 6.6 t12 T1.1: column disappears optimistically,
              // so no per-column "removing…" indicator needed — the
              // column is already gone the moment the user clicks ×.
              <div key={s.slug} className="rr-cmp-head">
                <div className="rr-cmp-head-rank">
                  No. <strong>{String(i + 1).padStart(2, '0')}</strong>
                </div>
                <div className="rr-cmp-head-name">{s.name}</div>
                <div className="rr-cmp-head-meta">{s.meta}</div>
                {activeChildId && (
                  <button
                    type="button"
                    className="rr-cmp-head-remove"
                    aria-label={`Remove ${s.name} from comparison`}
                    title="Remove this school"
                    onClick={() => handleRemoveSchool(s.slug)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Slice 6 commit 8 — sortable data rows. DnD wraps the rows
              so the parent can drag them into any order. The drag-end
              handler reads the new array and surfaces it via
              onReorderRows, which the parent (ResearchRoom) writes into
              ephemeralView.rowOrder. */}
          <SortableTableBody
            rows={rows}
            schools={schools}
            gridTemplateColumns={gridTemplateColumns}
            onRemove={handleRemoveRow}
            pendingRemoveId={pendingRemoveId}
            onReorderRows={onReorderRows}
          />
        </div>
      </div>

      {removeError && (
        <div className="rr-cmp-error" role="alert">
          {removeError}
          <button type="button" className="rr-chat-error-dismiss" onClick={() => setRemoveError(null)}>×</button>
        </div>
      )}
    </div>
  )
}

// Slice 6 commit 8 — DnD-aware sortable row body. Wraps the data rows
// in DndContext + SortableContext. The header row stays outside (we
// don't drag the school column headers). Pointer + keyboard sensors
// for accessibility.
function SortableTableBody({
  rows,
  schools,
  gridTemplateColumns,
  onRemove,
  pendingRemoveId,
  onReorderRows,
}: {
  rows: ComparisonRow[]
  schools: SchoolColumn[]
  gridTemplateColumns: string
  onRemove: (rowId: string) => Promise<void> | void
  pendingRemoveId: string | null
  onReorderRows?: (rowIds: string[]) => void
}) {
  // PointerSensor needs a small distance threshold so a click on the
  // remove × or a cell doesn't accidentally start a drag. 4px is the
  // standard Linear/Notion threshold.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    if (!onReorderRows) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = rows.findIndex(r => r.id === active.id)
    const newIndex = rows.findIndex(r => r.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(rows, oldIndex, newIndex).map(r => r.id)
    onReorderRows(next)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
        {rows.map((row, idx) => {
          // Slice 8 Step 0.6: section header when group_name changes between
          // adjacent rows. 'general' is suppressed because it's the default
          // unscoped group and a header would just be visual noise. The
          // header is a sibling of SortableRow inside a Fragment — it is
          // NOT a member of SortableContext's items array, so dnd-kit will
          // not attempt to drag it.
          const prevGroup  = idx > 0 ? rows[idx - 1].group_name ?? null : null
          const showHeader = Boolean(row.group_name)
                          && row.group_name !== prevGroup
                          && row.group_name !== 'general'
          return (
            <Fragment key={row.id}>
              {showHeader && (
                <div
                  role="presentation"
                  className="rr-section-header"
                  style={{ gridColumn: '1 / -1' }}
                >
                  {prettyGroupName(row.group_name!)}
                </div>
              )}
              <SortableRow
                row={row}
                schools={schools}
                gridTemplateColumns={gridTemplateColumns}
                onRemove={row.removable ? onRemove : null}
                removing={pendingRemoveId === row.id}
                isDragEnabled={Boolean(onReorderRows)}
              />
            </Fragment>
          )
        })}
      </SortableContext>
    </DndContext>
  )
}

// Each data row renders as its own grid (matching the header's
// gridTemplateColumns). A ⋮⋮ drag handle appears next to the dimension
// label on hover/focus; pointer-down on the handle starts the drag.
function SortableRow({
  row,
  schools,
  gridTemplateColumns,
  onRemove,
  removing,
  isDragEnabled,
}: {
  row: ComparisonRow
  schools: SchoolColumn[]
  gridTemplateColumns: string
  onRemove: ((rowId: string) => void) | null
  removing: boolean
  isDragEnabled: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: !isDragEnabled })

  const style = {
    gridTemplateColumns,
    transform: CSS.Transform.toString(transform),
    transition,
    // Lift the row visually while dragging.
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : 1,
    boxShadow: isDragging ? '0 8px 24px rgba(27, 50, 82, 0.18)' : undefined,
    background: isDragging ? 'var(--rr-white)' : undefined,
  } as React.CSSProperties

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rr-cmp-table-row${isDragging ? ' is-dragging' : ''}`}
    >
      <div className="rr-cmp-dim">
        <div className="rr-cmp-dim-name">
          {isDragEnabled && (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              className="rr-cmp-row-drag"
              aria-label={`Drag row ${row.label}`}
              title="Drag to reorder"
            >
              ⋮⋮
            </button>
          )}
          {row.label}
          {row.emphasis && (
            <>
              {' '}
              <em>{row.emphasis}</em>
            </>
          )}
          {onRemove && (
            <button
              type="button"
              className="rr-cmp-row-remove"
              aria-label={`Remove row ${row.label}`}
              onClick={() => onRemove(row.id)}
              disabled={removing}
              title="Remove this row"
            >
              {removing ? '…' : '×'}
            </button>
          )}
        </div>
        {row.blurb && <div className="rr-cmp-dim-blurb">{row.blurb}</div>}
      </div>
      {schools.map((s, i) => (
        <div key={`${row.id}-${s.slug}`} className="rr-cmp-cell">
          <CellBody cell={row.cells[i] ?? { kind: 'empty' }} />
        </div>
      ))}
    </div>
  )
}


function CellBody({ cell }: { cell: RowCell }) {
  if (cell.kind === 'empty') {
    return <div className="rr-cmp-cell-empty">—</div>
  }
  if (cell.kind === 'lights') {
    return (
      <div className="rr-cmp-stamps">
        {cell.lights.map((l, j) => (
          <span key={j} className={`rr-cmp-stamp rr-cmp-stamp--${l.tone}`}>
            {l.label}
          </span>
        ))}
      </div>
    )
  }
  return (
    <>
      <div className={cell.numeric ? 'rr-cmp-cell-num' : 'rr-cmp-cell-text'}>
        {cell.primary}
      </div>
      {cell.sub && <div className="rr-cmp-cell-sub">{cell.sub}</div>}
    </>
  )
}
