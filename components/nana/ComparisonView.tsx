'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  type EvidenceQuote,
} from './comparison-placeholder'
import {
  type TravelCorridorViz,
  type ExamBandViz,
  formatMinutes,
  formatMinutesSpoken,
  bandAxisPos,
  CORRIDOR_ORIGIN_POS,
  BAND_AXIS_MIN,
  BAND_AXIS_MAX,
} from '@/lib/research-room/rrv7-viz'
import type { EntryTimelineViz, EntryTimelineState } from '@/lib/research-room/rrv4-viz'
import SchoolAdder from './SchoolAdder'
import { createClientUuid } from '@/lib/client-uuid'

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

// RRV-10 (Focus consolidation) — the single "why does the table look like
// this" sentence, computed by the parent (ResearchRoom, which owns the
// focus state) and rendered verbatim here.
type FocusDescriptor = { label: string; reason: string }

type Props = {
  data?: ComparisonData
  parentDemandTopics?: Array<{ id: string; label: string }>
  // Round-4 fix (Codex F3): when the server-side load throws, the page
  // sets this string and we surface it as a banner instead of falling
  // through to demo schools.
  loadError?: string | null
  // Slice 6 commits 7+8 — view overlay. rowOrder is an explicit list of
  // row IDs in display order. visibleRows (canonical row_names, if
  // non-null) further filters the row set before sort. Pure visual
  // overlay; the underlying comparison_rows are unchanged.
  viewOverlay?: {
    rowOrder:    string[]                 // row IDs in display order
    visibleRows: string[] | null          // null = no filter; array = canonical row_name allowlist
    label:       string                   // chip label (ephemeral) / lens name (saved)
    kind:        'ephemeral' | 'saved'
  } | null
  // Slice 6 commit 8 — drag-end callback. ComparisonView fires this
  // with the new ordering whenever the parent drops a row in a new
  // position. The parent (ResearchRoom) updates ephemeralView.rowOrder
  // and the table re-renders.
  onReorderRows?: (rowIds: string[]) => void
  // RRV-10 — the Focus chip bar. savedLenses is the full list for the
  // session (both saved/re-rank lenses and topic lenses — the same
  // underlying comparison_lenses rows, distinguished only by
  // is_topic_lens); activeLensId selects which one (if any) drives the
  // overlay. onSwitchActiveLens calls /api/research-room/active-lens +
  // router.refresh. onSelectEverything clears back to the default
  // personalized table (lens id null AND any ephemeral view).
  savedLenses?: LensListItem[]
  activeLensId?: string | null
  onSwitchActiveLens?: (lensId: string | null) => void
  onSelectEverything?: () => void
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
  // RRV-2 (never-blank table) — fired when the user taps a rung-4
  // "Ask Nana" gap chip. Parent (ResearchRoom) bridges to the chat hook
  // the same way onRefreshTopicLens does: force-open the panel and submit
  // the ready-made question. Chip still renders (disabled-looking, no-op)
  // when this isn't wired — same defensive pattern as onRemove/onReorderRows.
  onAskNanaGap?: (question: string) => void
  // RRV-10 — the golden-rule "Showing: <focus> — because …" sentence +
  // undo control. undoLabel null means nothing to undo (the default
  // "Everything" state with no prior change this session).
  focusDescriptor?: FocusDescriptor
  undoLabel?: string | null
  onUndoFocus?: () => void
  // RRV-10 — "Save this Focus", relocated here from the chat rail (it
  // used to be a chip inside ResearchRoomChat) so Save sits next to the
  // arrangement it saves rather than requiring the chat panel to be
  // open, which it isn't by default.
  canSaveAsLens?: boolean
  onSaveAsLens?: (lensName: string) => Promise<{ ok: boolean; code?: string; existingLensId?: string }>
}

// ─── Comparison redesign (2026-07-16) ───────────────────────────────────
// Consumes new OPTIONAL fields the data-side agent is landing in parallel
// on the shared types (comparison-placeholder.ts / lib/research-comparison.ts):
//   - SchoolColumn.heroImage? / SchoolColumn.logoUrl?
//   - ComparisonRow.winnerRule?: 'higher-is-better' | 'lower-is-better' | 'neutral'
//   - RowCell (kind 'value').numericValue?: number
// All optional — every read below tolerates them being absent (older/thin
// records, or this file running against the type defs before the other
// agent's loader changes have fully landed).

// Reads the numeric comparison value off a 'value' cell, if present.
function cellNumericValue(cell: RowCell): number | null {
  if (cell.kind !== 'value') return null
  const raw = cell.numericValue
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

// Rating-style text values (ISI/Ofsted-type outcomes) get a colored badge
// instead of plain text. Kept to a small known vocabulary so we never
// mis-badge an unrelated free-text cell.
const RATING_TONES: Record<string, 'green' | 'amber' | 'red'> = {
  excellent: 'green',
  outstanding: 'green',
  good: 'amber',
  satisfactory: 'red',
  'requires improvement': 'red',
  inadequate: 'red',
}
function ratingTone(primary: string): 'green' | 'amber' | 'red' | null {
  return RATING_TONES[primary.trim().toLowerCase()] ?? null
}

// Winner highlighting (redesign requirement 1). `neutral` rows (fees, etc.)
// never get a winner mark — cheapest isn't always best, per founder
// decision. Ties (2+ schools sharing the best value) mark ALL tied cells
// rather than picking one arbitrarily; a tie across every school with data
// means nothing is distinguished, so nothing is marked at all. Missing
// (`—`) cells never win.
function computeRowWinners(row: ComparisonRow): Set<number> | null {
  const rule = row.winnerRule
  if (!rule || rule === 'neutral') return null
  const values = row.cells.map(cellNumericValue)
  const present = values.filter((v): v is number => v !== null)
  if (present.length < 2) return null
  const best = rule === 'higher-is-better' ? Math.max(...present) : Math.min(...present)
  const winners = new Set<number>()
  values.forEach((v, i) => { if (v !== null && v === best) winners.add(i) })
  if (winners.size === present.length) return null // everyone with data is tied
  return winners
}

// RRV-2 (never-blank table, 2026-07-20) — data-aware row ordering. Rows
// where most schools have no real data (verified or derived) sink toward
// the bottom of their own group, so the table doesn't open with prominent
// blanks. Deliberately conservative: only reorders WITHIN a contiguous run
// of the same group_name (never across groups — that would misplace rows
// under the wrong section header, since headers render on first
// appearance of each group per SortableTableBody), and only when no
// lens/saved-view/re-rank/drag override is active (the caller only invokes
// this in the `!viewOverlay` branch — all 6 existing order mechanisms keep
// full precedence over this fallback, matching how rawRows already worked
// before this change). Stable sort — rows with equal richness keep their
// original relative order.
function cellRichness(cell: RowCell): number {
  return cell.kind === 'value' ? (cell.tier === 'derived' ? 1 : 2) : 0
}
function demoteSparseRows(rows: ComparisonRow[]): ComparisonRow[] {
  const out: ComparisonRow[] = []
  let i = 0
  while (i < rows.length) {
    const group = rows[i].group_name ?? null
    let j = i + 1
    while (j < rows.length && (rows[j].group_name ?? null) === group) j++
    const segment = rows.slice(i, j)
    if (segment.length > 1) {
      const scored = segment.map((row, idx) => ({
        row,
        idx,
        richness: row.cells.reduce((sum, c) => sum + cellRichness(c), 0),
      }))
      scored.sort((a, b) => (b.richness !== a.richness ? b.richness - a.richness : a.idx - b.idx))
      out.push(...scored.map(s => s.row))
    } else {
      out.push(...segment)
    }
    i = j
  }
  return out
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
  parentDemandTopics = [],
  loadError = null,
  viewOverlay = null,
  onReorderRows,
  savedLenses = [],
  activeLensId = null,
  onSwitchActiveLens,
  onSelectEverything,
  activeChildId = null,
  onRefreshTopicLens,
  onAskNanaGap,
  focusDescriptor,
  undoLabel = null,
  onUndoFocus,
  canSaveAsLens = false,
  onSaveAsLens,
}: Props) {
  const router = useRouter()
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [topicBusy, setTopicBusy] = useState<string | null>(null)
  const [topicError, setTopicError] = useState<string | null>(null)
  // Slice 6.6 t12 T1.1 + Codex P1#2 — optimistic column remove. The
  // slug goes into this set the moment the user clicks ×; the column
  // disappears immediately. The POST + router.refresh continue in
  // background; on success the server prop drops the slug too and the
  // sync useEffect clears the optimistic entry. On error we drop the
  // slug back so the column reappears with the error banner.
  const [optimisticallyRemoved, setOptimisticallyRemoved] = useState<Set<string>>(new Set())
  const [shortlistError, setShortlistError] = useState<string | null>(null)
  // Redesign req 4 follow-up: a present-but-broken heroImage/logoUrl (e.g.
  // an R2 object returning an HTML hotlink-protection stub instead of an
  // image, HTTP 200 but wrong content-type) doesn't throw client-side —
  // the <img> just fails to decode and the browser shows its broken-image
  // glyph. Track failures per school+image-kind so a failed load falls
  // back through the SAME code path as a null/missing URL (hasHero/
  // hasLogo below already treat both as "don't render"), instead of
  // leaving a broken-image icon or a layout gap.
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  function markImageFailed(key: string) {
    setFailedImages(prev => (prev.has(key) ? prev : new Set(prev).add(key)))
  }

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

  // Redesign req 3 — measures the header row's rendered height (it now
  // varies with hero images being present or not) so section headers can
  // stick just beneath it instead of a hardcoded offset.
  const headRowRef = useRef<HTMLDivElement | null>(null)
  const [headHeight, setHeadHeight] = useState(0)
  useEffect(() => {
    const el = headRowRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setHeadHeight(entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Redesign req 5 — soften router.refresh()'s full repaint. Instead of the
  // table flashing/repainting all at once when fresh server data lands, the
  // data rows briefly fade + settle in via CSS. Skipped on first mount (no
  // prior state to "change" from). No animation library needed.
  const [settling, setSettling] = useState(false)
  const isFirstDataRender = useRef(true)
  useEffect(() => {
    if (isFirstDataRender.current) {
      isFirstDataRender.current = false
      return
    }
    setSettling(true)
    const t = setTimeout(() => setSettling(false), 420)
    return () => clearTimeout(t)
  }, [data])

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
  // RRV-10: the Focus chip bar renders savedLenses flat (no dropdown), so
  // there's no picker-open/outside-click state to manage any more — the
  // old picker's effect (mousedown/Escape close handling) is deleted.
  const activeLens = activeLensId
    ? savedLenses.find(l => l.id === activeLensId) ?? null
    : null

  // Slice 6 commits 7+8 — apply ephemeral overlay (filter + sort).
  // Source of truth is `rowOrder`: an explicit list of row IDs. Rows
  // present in `rowOrder` render in that order; rows missing from it
  // fall to the bottom in their original loader order (defensive — in
  // normal flow rowOrder covers every visible row).
  const rows = (() => {
    if (!viewOverlay) return demoteSparseRows(rawRows)
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

  const existingTopicLabels = new Set(rows.map(row => row.label.trim().toLowerCase()))
  const databaseTopics = parentDemandTopics.filter(topic =>
    !existingTopicLabels.has(topic.label.trim().toLowerCase()),
  )

  async function addDatabaseTopic(topic: { id: string; label: string }) {
    if (!activeChildId || topicBusy) return
    setTopicBusy(topic.id)
    setTopicError(null)
    try {
      const response = await fetch('/api/research-room/research-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_id: activeChildId,
          row_label: topic.label,
          request_id: createClientUuid(),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setTopicError(typeof result?.code === 'string'
          ? `That topic could not be added (${result.code}).`
          : 'That topic could not be added. Please try again.')
        return
      }
      router.refresh()
    } catch (error) {
      console.error('[comparison-view database topic]', error)
      setTopicError('Network error while adding that topic. Please try again.')
    } finally {
      setTopicBusy(null)
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

  // Redesign req 3 — with only a few schools, letting columns stretch to
  // fill the full viewport width (minmax(220px, 1fr)) reads as sparse and
  // disconnected, more like a leftover spreadsheet than a comparison. Cap
  // the column width instead so a 1–3 school comparison reads tighter and
  // more like bounded cards sitting side by side.
  const fewSchools = schools.length <= 3
  // Diagnostic follow-up (2026-07-17): 4-5 schools is the realistic common
  // shortlist size (not just ≤3), but the old flat `minmax(220px, 1fr)`
  // still forced a 5-school table to a ~1360px content minimum (260 dim +
  // 5×220) — wider than a 1440px laptop's usable content width even with
  // chat closed, and well past a 1280px laptop's. Scale the dim column and
  // per-school min/max down as the count grows so 4-5 schools compress
  // toward what a normal laptop screen can actually show, instead of
  // always forcing horizontal scroll. Cell content (images, highlighted
  // values, progress bars) stays legible down to ~150px — verified via
  // Puppeteer at 1440/1280 against the real 5-school session.
  const dimWidth = fewSchools ? 260 : Math.max(200, 260 - (schools.length - 3) * 20)
  const colMin = fewSchools ? 240 : Math.max(150, 260 - schools.length * 18)
  const colMax = fewSchools ? 360 : Math.max(colMin, 320 - schools.length * 16)
  const gridTemplateColumns = `${dimWidth}px repeat(${schools.length}, minmax(${colMin}px, ${colMax}px))`
  // The shared `.rr-cmp-table` rule carries a flat 1100px min-width so a
  // 1-2 school table doesn't look sparse. That floor is harmless for
  // fewSchools (its own min-content already exceeds it) but for 4-5
  // schools it would silently cancel the compression above (e.g. 4
  // schools' new min-content is ~992px, comfortably under the 1100px
  // floor) — so tighten the floor to match this table's OWN computed
  // minimum instead of the shared constant once we're past ≤3 schools.
  const tableMinWidth = fewSchools ? undefined : dimWidth + schools.length * colMin

  return (
    <div className="rr-cmp-wrap">
      <div className="rr-cmp-controls">
        {/* RRV-10 (Focus consolidation) — replaces the old General/child_fit
            base-lens tabs AND the separate saved-lens dropdown picker with
            ONE flat chip row. "Everything" is the always-personal default
            (no more tab choice — see page.tsx); every entry in savedLenses
            (saved re-rank views AND topic lenses — the same
            comparison_lenses rows, distinguished only by is_topic_lens)
            renders as its own chip, active/inactive exactly like the old
            picker's menu items did. "Save this Focus" (relocated from the
            chat rail) sits in the same row, matching the approved mock. */}
        <div className="rr-cmp-lens-tabs" role="tablist" aria-label="Focus">
          <span className="rr-cmp-lens-label">Focus</span>
          <button
            type="button"
            role="tab"
            aria-selected={!activeLens}
            className={`rr-cmp-lens-tab${!activeLens ? ' is-active' : ''}`}
            onClick={onSelectEverything}
          >
            Everything
          </button>
          {savedLenses.map(l => {
            const isActive = l.id === activeLensId
            return (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`rr-cmp-lens-tab${isActive ? ' is-active' : ''}`}
                title={l.is_topic_lens ? `${l.lens_name} — a topic Focus` : `${l.lens_name} — a saved Focus`}
                onClick={() => {
                  if (isActive) { onSelectEverything?.() }
                  else if (onSwitchActiveLens) { onSwitchActiveLens(l.id) }
                }}
              >
                {l.lens_name}
              </button>
            )
          })}
          <SaveFocusButton canSave={canSaveAsLens} onSave={onSaveAsLens} />
        </div>
        {/* RRV-10 golden rule: the "Showing: <focus> — because …" sentence
            + Undo, always visible, replacing four fragmented status
            strings the old six-mechanism UI had (this stats-strip "active"
            text, the corner-cell lens label, the ephemeral chip's "not
            saved" text, and the picker button's own label). */}
        {focusDescriptor && (
          <div className="rr-cmp-showing-focus" role="status">
            <span>
              Showing: <strong>{focusDescriptor.label}</strong> — {focusDescriptor.reason}
            </span>
            {undoLabel && onUndoFocus && (
              <button type="button" className="rr-cmp-showing-focus-undo" onClick={onUndoFocus}>
                {undoLabel}
              </button>
            )}
          </div>
        )}
        {/* Slice 6.6 Tier 3.5: stats row is now a single inline strip
            holding rows/schools count, the ↻ Refresh affordance (topic
            lenses only), and the zoom −/+ controls. */}
        <div className="rr-cmp-stats">
          <span className="rr-cmp-stats-counts">{rows.length} rows · {schools.length} schools</span>
          {activeLens && activeLens.is_topic_lens && onRefreshTopicLens && (
            <button
              type="button"
              className="rr-cmp-stats-refresh"
              onClick={() => onRefreshTopicLens(activeLens.lens_name)}
              title={`Ask Nana to fill ${activeLens.lens_name} data for any newly-shortlisted schools.`}
              aria-label={`Refresh ${activeLens.lens_name} Focus with current shortlist`}
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

      {databaseTopics.length > 0 && (
        <section className="rr-cmp-topics" aria-labelledby="rr-cmp-topics-title">
          <div>
            <div className="rr-cmp-topics-eyebrow">More verified comparisons</div>
            <h2 id="rr-cmp-topics-title" className="rr-cmp-topics-title">Topics parents can explore</h2>
            <p className="rr-cmp-topics-copy">
              These topics are backed by information already verified in our database.
            </p>
          </div>
          <div className="rr-cmp-topics-list">
            {databaseTopics.map(topic => (
              <button
                key={topic.id}
                type="button"
                className="rr-cmp-topic-button"
                onClick={() => void addDatabaseTopic(topic)}
                disabled={!activeChildId || topicBusy !== null}
              >
                <span>{topic.label}</span>
                <small>{topicBusy === topic.id ? 'Adding…' : 'Add comparison'}</small>
              </button>
            ))}
          </div>
          {topicError && <div className="rr-cmp-error" role="alert">{topicError}</div>}
        </section>
      )}

      <div
        className={`rr-cmp-table-wrap${fewSchools ? ' rr-cmp-table-wrap--cards' : ''}${settling ? ' rr-cmp-table-wrap--settling' : ''}`}
        style={{ zoom }}
      >
        <div className="rr-cmp-table" style={tableMinWidth != null ? { minWidth: tableMinWidth } : undefined}>
          {/* Header row */}
          <div ref={headRowRef} className="rr-cmp-table-row rr-cmp-table-row--head" style={{ gridTemplateColumns }}>
            <div className="rr-cmp-corner">
              <div className="rr-cmp-corner-eyebrow">Comparing</div>
              <div className="rr-cmp-corner-title">
                {schools.length} schools, <em>{rows.length} dimensions</em>
              </div>
              {/* RRV-10: sourced from the same focusDescriptor the
                  Showing-line uses, one level up — can't drift out of
                  sync with it the way the old independently-derived
                  corner label could. */}
              {focusDescriptor && (
                <div className="rr-cmp-corner-meta">{focusDescriptor.label}</div>
              )}
            </div>
            {schools.map((s, i) => {
              // Redesign req 4 — hero photo + logo badge in the column
              // header, when the data-side agent has populated them.
              // Gracefully omitted (no empty box) when absent.
              const heroFailKey = `${s.slug}:hero`
              const logoFailKey = `${s.slug}:logo`
              const hasHero = Boolean(s.heroImage) && !failedImages.has(heroFailKey)
              const hasLogo = Boolean(s.logoUrl) && !failedImages.has(logoFailKey)
              return (
              // Slice 6.6 t12 T1.1: column disappears optimistically,
              // so no per-column "removing…" indicator needed — the
              // column is already gone the moment the user clicks ×.
              <div key={s.slug} className="rr-cmp-head">
                {(hasHero || hasLogo) && (
                  <div className={`rr-cmp-head-media${hasHero ? '' : ' rr-cmp-head-media--logo-only'}`}>
                    {hasHero && (
                      // eslint-disable-next-line @next/next/no-img-element -- remote domain unknown ahead of time; avoids next/image domain config coupling
                      <img
                        src={s.heroImage}
                        alt=""
                        className="rr-cmp-head-hero"
                        loading="lazy"
                        onError={() => markImageFailed(heroFailKey)}
                      />
                    )}
                    {hasLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.logoUrl}
                        alt={`${s.name} logo`}
                        className="rr-cmp-head-logo"
                        loading="lazy"
                        onError={() => markImageFailed(logoFailKey)}
                      />
                    )}
                  </div>
                )}
                <div className="rr-cmp-head-rank">
                  No. <strong>{String(i + 1).padStart(2, '0')}</strong>
                </div>
                <div className="rr-cmp-head-name">{s.name}</div>
                <div className="rr-cmp-head-meta">{s.meta}</div>
                {/* Slice 8 Build 2b (2026-05-18) — surface the
                    match_reasons stored on shortlisted_schools as
                    "Added because: …" so parents can see WHY each
                    school landed in their list. Null-safe: skipped
                    when the row has no reasons (pre-Build-2 legacy
                    rows, or chat-adds where the best-effort reasons
                    write failed). */}
                {s.addedBecause && (
                  <div className="rr-cmp-head-reasons" title={`Added because: ${s.addedBecause}`}>
                    <span className="rr-cmp-head-reasons-label">Added because:</span>{' '}
                    <span className="rr-cmp-head-reasons-text">{s.addedBecause}</span>
                  </div>
                )}
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
              )
            })}
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
            sectionHeaderTop={headHeight}
            onAskNanaGap={onAskNanaGap}
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

// RRV-10 — "Save this Focus", relocated from ChatActionsRail (in
// ResearchRoomChat.tsx) into the Focus bar so it sits next to the
// arrangement it saves rather than requiring the chat panel to be open
// (chat defaults to closed). Behavior/copy ported verbatim from the old
// chat-rail chip + inline name-prompt form; only the trigger moved.
function SaveFocusButton({
  canSave,
  onSave,
}: {
  canSave: boolean
  onSave?: (lensName: string) => Promise<{ ok: boolean; code?: string; existingLensId?: string }>
}) {
  const [promptOpen, setPromptOpen] = useState(false)
  const [lensName,   setLensName]   = useState('')
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)

  async function submitSave() {
    if (!onSave) return
    setSaveError(null)
    setSaving(true)
    const result = await onSave(lensName)
    setSaving(false)
    if (result.ok) {
      setPromptOpen(false)
      setLensName('')
      return
    }
    if (result.code === 'duplicate_name') {
      setSaveError('A Focus with that name already exists. Pick a different name.')
    } else if (result.code === 'bad_name') {
      setSaveError('Name must be 1–40 characters.')
    } else if (result.code === 'empty_after_resolution') {
      setSaveError('The rows referenced by this Focus are no longer active.')
    } else {
      setSaveError('Could not save this Focus. Try again.')
    }
  }

  return (
    <div className="rr-cmp-save-focus">
      <button
        type="button"
        className="rr-cmp-lens-tab rr-cmp-lens-tab--save"
        disabled={!canSave || !onSave}
        title={canSave ? 'Save the current arrangement as a Focus you can come back to' : 'Ask Nana to re-rank or add a row first, then you can save this Focus'}
        onClick={() => { setPromptOpen(true); setSaveError(null) }}
      >
        <span aria-hidden>＋</span> Save this Focus
      </button>

      {promptOpen && (
        <form
          className="rr-cmp-save-focus-form"
          onSubmit={e => { e.preventDefault(); void submitSave() }}
        >
          <input
            type="text"
            value={lensName}
            onChange={e => setLensName(e.target.value)}
            placeholder="Name this Focus (e.g. Academics + value)"
            maxLength={40}
            disabled={saving}
            autoFocus
            className="rr-cmp-save-focus-input"
          />
          <button type="submit" className="rr-cmp-save-focus-submit" disabled={saving || lensName.trim().length === 0}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="rr-cmp-save-focus-cancel" disabled={saving}
                  onClick={() => { setPromptOpen(false); setSaveError(null); setLensName('') }}>
            Cancel
          </button>
          {saveError && <span className="rr-cmp-save-focus-error" role="alert">{saveError}</span>}
        </form>
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
  sectionHeaderTop,
  onAskNanaGap,
}: {
  rows: ComparisonRow[]
  schools: SchoolColumn[]
  gridTemplateColumns: string
  onRemove: (rowId: string) => Promise<void> | void
  pendingRemoveId: string | null
  onReorderRows?: (rowIds: string[]) => void
  // Redesign req 3 — section headers stick just below the (variable-
  // height, now sometimes photo-bearing) school header row instead of a
  // hardcoded top offset. 0 is a safe fallback (sticks to the very top).
  sectionHeaderTop: number
  onAskNanaGap?: (question: string) => void
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
        {(() => {
          // Slice 8 Step 0.6: section header on FIRST appearance of each
          // group_name. 'general' is suppressed because it's the default
          // unscoped group. Chat-added rows often land at the bottom
          // regardless of group, so a strict prev-row comparison
          // re-renders the same header twice; tracking seen groups
          // collapses each header to a single render at its first row.
          // Header is a sibling of SortableRow inside a Fragment — it
          // is NOT a member of SortableContext's items array, so dnd-kit
          // will not attempt to drag it.
          const seenGroups = new Set<string>()
          return rows.map((row) => {
            const group = row.group_name ?? null
            const showHeader = Boolean(group)
                            && group !== 'general'
                            && !seenGroups.has(group as string)
            if (showHeader) seenGroups.add(group as string)
            return (
              <Fragment key={row.id}>
                {showHeader && (
                  <div
                    role="presentation"
                    className="rr-section-header"
                    style={{ gridColumn: '1 / -1', top: sectionHeaderTop }}
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
                  winners={computeRowWinners(row)}
                  onAskNanaGap={onAskNanaGap}
                />
              </Fragment>
            )
          })
        })()}
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
  winners,
  onAskNanaGap,
}: {
  row: ComparisonRow
  schools: SchoolColumn[]
  gridTemplateColumns: string
  onRemove: ((rowId: string) => void) | null
  removing: boolean
  isDragEnabled: boolean
  // Redesign req 1 — indices into `schools` whose cell wins this row.
  // null when the row has no winner to mark (neutral rule, no rule, no
  // comparable data, or an all-tied row).
  winners: Set<number> | null
  onAskNanaGap?: (question: string) => void
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
      {schools.map((s, i) => {
        const isWinner = winners?.has(i) ?? false
        return (
          <div
            key={`${row.id}-${s.slug}`}
            className={`rr-cmp-cell${isWinner ? ' rr-cmp-cell--winner' : ''}`}
            data-school={s.name}
          >
            {isWinner && (
              <span className="rr-cmp-cell-winner-badge" role="img" aria-label={`Best in shortlist: ${s.name}`} title="Best in shortlist">
                ✓
              </span>
            )}
            <CellBody cell={row.cells[i] ?? { kind: 'empty' }} onAskNanaGap={onAskNanaGap} />
          </div>
        )
      })}
      {/* RRV-7 — cross-school strip (travel corridor / exam band) under
          the row's cells. A real grid child spanning `1 / -1` auto-flows
          onto an implicit second grid row at full width on desktop; in the
          ≤680px cards layout the row becomes a flex column and the strip
          simply stacks. In-flow (never absolutely positioned) with its own
          inner overflow-x scroll — the RRV-6 clipping constraint. Lives
          inside the sortable row so it drags with it. */}
      {row.viz?.kind === 'travel-corridor' && <TravelCorridorStrip viz={row.viz} />}
      {row.viz?.kind === 'exam-band' && <ExamBandStrip viz={row.viz} />}
      {row.viz?.kind === 'entry-timeline' && <EntryTimelineStrip viz={row.viz} />}
    </div>
  )
}

// ─── RRV-7 — travel corridor (mock §7) ──────────────────────────────────────
//
// Positions are precomputed server-side (rrv7-viz.ts corridorStopPositions,
// collision-adjusted); this component just draws them. The strip element
// carries role="img" + a full spoken sentence, so the decorative internals
// are hidden from AT; the honest partial-coverage caption sits OUTSIDE the
// role="img" element so screen readers still hit it.
function TravelCorridorStrip({ viz }: { viz: TravelCorridorViz }) {
  const aria =
    'Travel from Heathrow arrivals: ' +
    viz.stops.map(s => `${s.name} ${formatMinutesSpoken(s.minutes)}`).join('; ') + '.'
  return (
    <div className="rr-viz-strip" style={{ gridColumn: '1 / -1' }}>
      <div className="rr-corr-scroll">
        <div
          className="rr-corr"
          role="img"
          aria-label={aria}
          style={{ minWidth: `${Math.max(560, (viz.stops.length + 1) * 140)}px` }}
        >
          <div className="rr-corr-line" aria-hidden="true" />
          <div className="rr-corr-stop rr-corr-stop--origin" aria-hidden="true" style={{ left: `${CORRIDOR_ORIGIN_POS}%` }}>
            <span className="rr-corr-time">✈️ LHR</span>
            <span className="rr-corr-dot" />
            <span className="rr-corr-name">Heathrow arrivals</span>
          </div>
          {viz.stops.map(s => (
            <div className="rr-corr-stop" aria-hidden="true" key={s.slug} style={{ left: `${s.pos}%` }}>
              <span className="rr-corr-time">{formatMinutes(s.minutes)}</span>
              <span className="rr-corr-dot" />
              <span className="rr-corr-name">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
      {viz.missing.length > 0 && (
        <p className="rr-viz-note">No verified Heathrow time yet: {viz.missing.join(', ')}</p>
      )}
      <p className="rr-viz-note rr-viz-note--muted">
        Door-to-door from the plane — exeat weekends and emergencies are measured in hours, not miles.
      </p>
    </div>
  )
}

// ─── RRV-7 — GCSE context band (mock §8) ────────────────────────────────────
//
// Fixed 20–100% axis; dots plotted only for schools with a true 9–7 share
// (9–8-only publishers are named, never plotted as if 9–7). The dashed
// "typical" window is the middle half of the UK pool's verified values,
// computed live server-side — suppressed (typical=null) below the n-floor,
// never fabricated.
function ExamBandStrip({ viz }: { viz: ExamBandViz }) {
  const aria =
    'GCSE grades 9 to 7 in context: ' +
    viz.dots.map(d => `${d.name} ${d.pct} percent`).join('; ') +
    (viz.typical ? `. Typical range across the ${viz.typical.n} UK independent schools we track: ${viz.typical.lo} to ${viz.typical.hi} percent.` : '.')
  const axisTicks = [20, 40, 60, 80, 100].filter(t => t >= BAND_AXIS_MIN && t <= BAND_AXIS_MAX)
  return (
    <div className="rr-viz-strip" style={{ gridColumn: '1 / -1' }}>
      <div className="rr-band-scroll">
        <div className="rr-band" role="img" aria-label={aria}>
          <div className="rr-band-track" aria-hidden="true" />
          {viz.typical && (
            <div
              className="rr-band-typical"
              aria-hidden="true"
              style={{
                left:  `${bandAxisPos(viz.typical.lo)}%`,
                width: `${bandAxisPos(viz.typical.hi) - bandAxisPos(viz.typical.lo)}%`,
              }}
            >
              <span className="rr-band-typical-lbl">typical range · middle half of {viz.typical.n} schools we track</span>
            </div>
          )}
          {viz.dots.map(d => (
            <div
              className={`rr-band-dot${d.labelBelow ? '' : ' rr-band-dot--label-above'}`}
              aria-hidden="true"
              key={d.slug}
              style={{ left: `${d.pos}%` }}
            >
              <span className="rr-band-dot-lbl">{d.name} {d.pct}%</span>
            </div>
          ))}
          <div className="rr-band-axis" aria-hidden="true">
            {axisTicks.map(t => (
              <span key={t}>{t}%</span>
            ))}
          </div>
        </div>
      </div>
      {viz.altBand.length > 0 && (
        <p className="rr-viz-note">{viz.altBand.join(', ')} {viz.altBand.length === 1 ? 'publishes' : 'publish'} grades 9–8 only — not on this band</p>
      )}
      {viz.missing.length > 0 && (
        <p className="rr-viz-note">No GCSE results on record: {viz.missing.join(', ')}</p>
      )}
    </div>
  )
}

// ─── RRV-4 — entry timeline (mock §3) ───────────────────────────────────────
//
// Deliberately NOT a plotted calendar axis — see lib/research-room/
// rrv4-viz.ts for the honesty reasoning (no per-family calendar-year
// anchor exists; every dated string is one historical crawl, not a
// verified live status). This renders a state chip + hedged caption per
// school instead — a compact "where does each shortlisted school stand,
// today" scan, with "today" as the implicit reference point behind every
// caption rather than a pixel position on an axis.
const ENTRY_STATE_LABEL: Record<EntryTimelineState, string> = {
  'rolling':      'Rolling',
  'dated-future': 'Deadline ahead',
  'dated-past':   'Deadline passed',
  'vague':        'Timing varies',
}

function EntryTimelineStrip({ viz }: { viz: EntryTimelineViz }) {
  const aria = 'Entry timeline: ' + viz.entries.map(e => `${e.name}: ${e.caption}`).join('; ') + '.'
  return (
    <div className="rr-viz-strip" style={{ gridColumn: '1 / -1' }}>
      <ul className="rr-timeline-list" role="img" aria-label={aria}>
        {viz.entries.map(e => (
          <li key={e.slug} className="rr-timeline-row" aria-hidden="true">
            <span className={`rr-timeline-chip rr-timeline-chip--${e.state}`}>
              {ENTRY_STATE_LABEL[e.state]}
            </span>
            <span className="rr-timeline-name">{e.name}</span>
            <span className="rr-timeline-caption">{e.caption}</span>
          </li>
        ))}
      </ul>
      {viz.missing.length > 0 && (
        <p className="rr-viz-note">No admissions timing on record: {viz.missing.join(', ')}</p>
      )}
    </div>
  )
}


function CellBody({ cell, onAskNanaGap }: { cell: RowCell; onAskNanaGap?: (question: string) => void }) {
  if (cell.kind === 'empty') {
    return <div className="rr-cmp-cell-empty">—</div>
  }
  // RRV-2 rung 3 — no verified/derived value for this school, but enough
  // shortlisted peers report it that a range beats a blank.
  if (cell.kind === 'cohort') {
    return (
      <div className="rr-cmp-cell-cohort">
        <span className="rr-cmp-tag rr-cmp-tag--cohort">context</span>
        <div className="rr-cmp-cell-sub">{cell.note}</div>
      </div>
    )
  }
  // RRV-2 rung 4 — the floor of the ladder. No value, no peer range: offer
  // to ask Nana instead of a bare "—". Copy is the exact line from the
  // Satit-approved visual mock (artifact c6e453ac §1).
  if (cell.kind === 'gap') {
    return (
      <button
        type="button"
        className="rr-cmp-ask-nana"
        onClick={() => onAskNanaGap?.(cell.question)}
        disabled={!onAskNanaGap}
      >
        💬 Not verified yet — ask Nana
      </button>
    )
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

  // Redesign req 2 — type-aware rendering. Percentages get a small inline
  // progress bar; known rating vocabularies get a colored badge; anything
  // else (including fees, which stay big bold numbers via .rr-cmp-cell-num)
  // falls back to the existing plain treatment. Detected from the display
  // string itself — no new field required, so this works today even
  // before the data-side agent's fields land.
  const percentMatch = /^(\d+(?:\.\d+)?)\s?%$/.exec(cell.primary.trim())
  const tone = ratingTone(cell.primary)
  // RRV-2 rung 2 — this value already carries a "~"/"derived:" provenance
  // marker from seed-rows.ts (classified in cellFromRaw, not re-derived
  // here). A small "≈" tag distinguishes it from a plain verified read;
  // deliberately NOT adding a "✓ verified" tag to every other cell — that
  // would touch every populated cell in the table (not just the blanks
  // RRV-2 targets) and the mock's "checked against official data" legend
  // copy over-claims what these cells actually are (extractor/Notion
  // crawls, not human-verified) per the pre-build review finding. Flagged
  // for Satit as a separate copy/scope decision, not resolved here.
  const derivedTag = cell.tier === 'derived' ? <span className="rr-cmp-tag rr-cmp-tag--derived">≈</span> : null
  // RRV-6 — present only for rows wired in EVIDENCE_DIMENSION_BY_ROW_SLUG
  // (rugby_strength today) where school_facts had real quotes for this
  // school. Undefined/empty is the common case and renders nothing extra.
  const evidenceBlock = cell.evidence && cell.evidence.length > 0
    ? <EvidenceDisclosure evidence={cell.evidence} />
    : null

  // RRV-5 (2026-07-20) — fit bars (mock §4). Checked BEFORE percentMatch:
  // a band cell's `primary` can itself look like a percentage (e.g.
  // "82%" on Academic stretch) and must not fall into the generic
  // single-fill percent bar below. `filled`-of-`total` discrete segments,
  // never a continuous width — see FitBand's comment in
  // comparison-placeholder.ts for why (no score exists to measure
  // continuously; a word + ordinal position is all the data supports).
  if (cell.band) {
    const { word, filled, total, muted } = cell.band
    return (
      <>
        <div className={`rr-cmp-cell-band${muted ? ' rr-cmp-cell-band--muted' : ''}`}>
          <span className="rr-cmp-cell-band-track" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`rr-cmp-cell-band-seg${i < filled ? ' is-filled' : ''}`} />
            ))}
          </span>
          <span className="rr-cmp-cell-band-word">{word}</span>
          {derivedTag}
        </div>
        {cell.sub && <div className="rr-cmp-cell-sub">{cell.sub}</div>}
        {evidenceBlock}
      </>
    )
  }

  // RRV-5 — boarding mix (mock §5): a genuine 2-segment board/day
  // proportional bar, only ever attached when a real per-school % exists
  // (see buildBoardingRatio) — checked before percentMatch for the same
  // reason as band above (cell.primary is itself "NN%").
  if (cell.mix) {
    return (
      <>
        <div className="rr-cmp-cell-mix">
          <span className="rr-cmp-cell-mix-value">{cell.primary}</span>
          {derivedTag}
          <span className="rr-cmp-cell-mix-track" aria-hidden="true">
            <span className="rr-cmp-cell-mix-fill rr-cmp-cell-mix-fill--board" style={{ width: `${cell.mix.boardPct}%` }} />
            <span className="rr-cmp-cell-mix-fill rr-cmp-cell-mix-fill--day" style={{ width: `${cell.mix.dayPct}%` }} />
          </span>
        </div>
        {cell.sub && <div className="rr-cmp-cell-sub">{cell.sub}</div>}
        {evidenceBlock}
      </>
    )
  }

  if (percentMatch) {
    const pct = Math.max(0, Math.min(100, parseFloat(percentMatch[1])))
    return (
      <>
        <div className="rr-cmp-cell-pct">
          <span className="rr-cmp-cell-pct-value">{cell.primary}</span>
          {derivedTag}
          <span className="rr-cmp-cell-pct-track" aria-hidden="true">
            <span className="rr-cmp-cell-pct-fill" style={{ width: `${pct}%` }} />
          </span>
        </div>
        {cell.sub && <div className="rr-cmp-cell-sub">{cell.sub}</div>}
        {evidenceBlock}
      </>
    )
  }

  if (tone) {
    return (
      <>
        <span className={`rr-cmp-cell-badge rr-cmp-cell-badge--${tone}`}>{cell.primary}</span>
        {derivedTag}
        {cell.sub && <div className="rr-cmp-cell-sub">{cell.sub}</div>}
        {evidenceBlock}
      </>
    )
  }

  return (
    <>
      <div className={cell.numeric ? 'rr-cmp-cell-num' : 'rr-cmp-cell-text'}>
        {cell.primary}
        {derivedTag}
      </div>
      {cell.sub && <div className="rr-cmp-cell-sub">{cell.sub}</div>}
      {evidenceBlock}
    </>
  )
}

// RRV-6 — inline evidence disclosure. A native <details>/<summary> rather
// than a floating popover: ComparisonView's table wrap is `overflow-x:
// auto` (forces overflow-y:auto too, per spec — clips any absolutely-
// positioned child) and the mobile "cards" layout sets `overflow: hidden`
// on each row, so a SchoolAdder-style anchored popup would get clipped in
// both layouts (confirmed in the RRV-6 pre-build review). An inline
// disclosure instead grows the row's own height — grid rows and the cards
// layout both auto-size, so nothing clips, no outside-click/Escape
// plumbing is needed, and it's closer to the approved mock (§6 is itself
// a <details> disclosure).
function EvidenceDisclosure({ evidence }: { evidence: EvidenceQuote[] }) {
  return (
    <details className="rr-cmp-evidence">
      <summary className="rr-cmp-evidence-trigger">
        <span aria-hidden="true">📎</span> {evidence.length} {evidence.length === 1 ? 'quote' : 'quotes'}
        <span className="rr-cmp-evidence-arrow" aria-hidden="true">›</span>
      </summary>
      <div className="rr-cmp-evidence-list">
        {evidence.map((e, i) => (
          <div className="rr-cmp-evidence-quote" key={i}>
            <p>&ldquo;{e.quote}&rdquo;</p>
            <div className="rr-cmp-evidence-src">
              {e.factLabel}
              {e.hostLabel && <> · {e.url ? (
                <a href={e.url} target="_blank" rel="noopener noreferrer">{e.hostLabel}</a>
              ) : e.hostLabel}</>}
              {e.older && <span className="rr-cmp-tag rr-cmp-tag--cohort">older result</span>}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
