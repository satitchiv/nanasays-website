'use client'

import { useEffect, useRef, useState } from 'react'
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
import { createClientUuid } from '@/lib/client-uuid'
import {
  findComparisonCatalogueSuggestions,
  matchComparisonRequest,
  RESEARCH_ONLY_COMPARISONS,
  SUPPORTED_COMPARISON_IDS,
} from '@/lib/research-room/comparison-catalog'

type Lens = 'general' | 'child_fit'
type DisplayMode = 'snapshot' | 'table'
type LocalComparisonRow = {
  id: string
  label: string
  status?: 'idle' | 'researching'
}

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
  availableComparisonIds?: string[]
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

function comparisonStorageKey(kind: 'priorities' | 'local-rows', childId: string | null) {
  return `rr-cmp-${kind}:${childId ?? 'default'}`
}

export default function ComparisonView({
  data = EMPTY_DATA,
  availableComparisonIds = SUPPORTED_COMPARISON_IDS,
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
  const [displayMode, setDisplayMode] = useState<DisplayMode>('snapshot')
  const [isNarrow, setIsNarrow] = useState(false)
  const [mobileSchoolSlug, setMobileSchoolSlug] = useState<string | null>(null)
  const [priorityEditorOpen, setPriorityEditorOpen] = useState(false)
  const [selectedPriorityIds, setSelectedPriorityIds] = useState<string[]>([])
  const [draftPriorityIds, setDraftPriorityIds] = useState<string[]>([])
  const [localRows, setLocalRows] = useState<LocalComparisonRow[]>([])
  const [localRowsChildId, setLocalRowsChildId] = useState<string | null>(null)
  const [rowEditorOpen, setRowEditorOpen] = useState(false)
  const [newRowLabel, setNewRowLabel] = useState('')
  const [newRowError, setNewRowError] = useState<string | null>(null)
  const [rowResearchNotice, setRowResearchNotice] = useState<string | null>(null)
  const [isSavingResearchRequest, setIsSavingResearchRequest] = useState(false)
  const [rowAutocompleteOpen, setRowAutocompleteOpen] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const autocompleteRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('rr-cmp-display-mode')
    if (stored === 'snapshot' || stored === 'table') setDisplayMode(stored)

    const media = window.matchMedia('(max-width: 700px)')
    const syncNarrow = () => setIsNarrow(media.matches)
    syncNarrow()
    media.addEventListener('change', syncNarrow)
    return () => media.removeEventListener('change', syncNarrow)
  }, [])

  function changeDisplayMode(next: DisplayMode) {
    setDisplayMode(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('rr-cmp-display-mode', next)
    }
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(comparisonStorageKey('local-rows', activeChildId)) ?? '[]',
      )
      if (!Array.isArray(stored)) {
        setLocalRows([])
        setLocalRowsChildId(activeChildId)
        return
      }
      setLocalRows(
        stored
          .filter((row): row is LocalComparisonRow =>
            Boolean(
              row
              && typeof row === 'object'
              && typeof row.id === 'string'
              && typeof row.label === 'string'
              && row.label.trim(),
            ),
          )
          .map(row => ({ ...row, status: 'idle' as const }))
          .slice(0, 12),
      )
    } catch {
      setLocalRows([])
    }
    setLocalRowsChildId(activeChildId)
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
  const rawRows = [
    ...data.rows.map(r => ({
      ...r,
      cells: visibleSchoolIndices.map(i => r.cells[i] ?? { kind: 'empty' as const }),
    })),
    ...localRows.map(row => ({
      id: row.id,
      label: row.label,
      blurb: row.status === 'researching'
        ? 'Researching each school'
        : 'Added to this comparison',
      removable: row.status !== 'researching',
      cells: schools.map(() => (
        row.status === 'researching'
          ? { kind: 'loading' as const }
          : { kind: 'empty' as const }
      )),
    })),
  ]
  const isResearchingRow = localRows.some(row => row.status === 'researching')
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

  const rowSignature = rows.map(row => row.id).join('|')
  useEffect(() => {
    const available = new Set(rows.map(row => row.id))
    let next: string[] = []
    if (typeof window !== 'undefined') {
      try {
        const stored = JSON.parse(
          window.localStorage.getItem(comparisonStorageKey('priorities', activeChildId)) ?? '[]',
        )
        if (Array.isArray(stored)) {
          next = stored
            .filter((id): id is string => typeof id === 'string' && available.has(id))
            .slice(0, 3)
        }
      } catch {
        next = []
      }
    }
    if (next.length === 0) next = rows.slice(0, 3).map(row => row.id)
    setSelectedPriorityIds(next)
    setDraftPriorityIds(next)
  // rowSignature deliberately represents the available row identities.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChildId, rowSignature])

  useEffect(() => {
    if (schools.length === 0) {
      setMobileSchoolSlug(null)
      return
    }
    if (!mobileSchoolSlug || !schools.some(school => school.slug === mobileSchoolSlug)) {
      setMobileSchoolSlug(schools[0].slug)
    }
  }, [mobileSchoolSlug, schools])

  const priorityRows = selectedPriorityIds
    .map(id => rows.find(row => row.id === id))
    .filter((row): row is ComparisonRow => Boolean(row))
  const availableComparisonIdSet = new Set(availableComparisonIds)
  const existingComparisonRows = new Map<string, string>()
  rows.forEach(row => {
    const match = matchComparisonRequest(row.label)
    if (match.kind === 'supported') {
      existingComparisonRows.set(match.id, row.id)
      return
    }
    const researchTopic = RESEARCH_ONLY_COMPARISONS.find(topic =>
      topic.label.toLowerCase() === match.canonicalTopic.toLowerCase())
    if (researchTopic) existingComparisonRows.set(`research:${researchTopic.id}`, row.id)
  })
  const autocompleteSuggestions = findComparisonCatalogueSuggestions(newRowLabel)

  const tableSchoolIndices = isNarrow
    ? [Math.max(0, schools.findIndex(school => school.slug === mobileSchoolSlug))]
    : schools.map((_, index) => index)
  const tableSchools = tableSchoolIndices.map(index => schools[index]).filter(Boolean)
  const tableRows = rows.map(row => ({
    ...row,
    cells: tableSchoolIndices.map(index => row.cells[index] ?? { kind: 'empty' as const }),
  }))

  function openPriorityEditor() {
    setDraftPriorityIds(selectedPriorityIds)
    setPriorityEditorOpen(true)
  }

  function closeRowEditor() {
    setRowAutocompleteOpen(false)
    setActiveSuggestionIndex(-1)
  }

  function viewComparisonRow(rowId: string) {
    changeDisplayMode('table')
    setRowEditorOpen(false)
    closeRowEditor()
    setNewRowLabel('')
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document.querySelector<HTMLElement>(`[data-comparison-row-id="${rowId}"]`)
        ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
    })
  }

  async function handleCatalogueSuggestion(
    suggestion: ReturnType<typeof findComparisonCatalogueSuggestions>[number],
  ) {
    const key = suggestion.kind === 'supported' ? suggestion.id : `research:${suggestion.id}`
    const existingRowId = existingComparisonRows.get(key)
    if (existingRowId) {
      viewComparisonRow(existingRowId)
      return
    }

    setNewRowLabel(suggestion.label)
    await addComparisonLabel(suggestion.label)
  }

  function handleRowSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setRowAutocompleteOpen(false)
      setActiveSuggestionIndex(-1)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return

    if (event.key === 'Enter') {
      if (rowAutocompleteOpen && activeSuggestionIndex >= 0) {
        const suggestion = autocompleteSuggestions[activeSuggestionIndex]
        if (suggestion) {
          event.preventDefault()
          void handleCatalogueSuggestion(suggestion)
        }
      }
      return
    }

    event.preventDefault()
    setRowAutocompleteOpen(true)
    if (autocompleteSuggestions.length === 0) {
      setActiveSuggestionIndex(-1)
      return
    }
    setActiveSuggestionIndex(current => {
      if (event.key === 'ArrowDown') {
        return current >= autocompleteSuggestions.length - 1 ? 0 : current + 1
      }
      return current <= 0 ? autocompleteSuggestions.length - 1 : current - 1
    })
  }

  useEffect(() => {
    if (!rowAutocompleteOpen || activeSuggestionIndex < 0) return
    autocompleteRef.current
      ?.querySelector<HTMLElement>(`[data-suggestion-index="${activeSuggestionIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeSuggestionIndex, rowAutocompleteOpen])

  function toggleDraftPriority(rowId: string) {
    setDraftPriorityIds(current => {
      if (current.includes(rowId)) return current.filter(id => id !== rowId)
      if (current.length >= 3) return current
      return [...current, rowId]
    })
  }

  function applyPriorities() {
    if (draftPriorityIds.length === 0) return
    setSelectedPriorityIds(draftPriorityIds)
    setPriorityEditorOpen(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        comparisonStorageKey('priorities', activeChildId),
        JSON.stringify(draftPriorityIds),
      )
    }
  }

  function dropLocalRow(rowId: string) {
    setLocalRows(current => {
      const next = current.filter(row => row.id !== rowId)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          comparisonStorageKey('local-rows', activeChildId),
          JSON.stringify(next.filter(row => row.status !== 'researching')),
        )
      }
      return next
    })
  }

  async function researchLocalRow(
    label: string,
    optimisticId: string | null,
    options: { legacy?: boolean } = {},
  ) {
    try {
      const response = await fetch('/api/research-room/research-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_id: activeChildId,
          row_label: label,
          request_id: createClientUuid(),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        const code = typeof result?.code === 'string' ? result.code : 'request_failed'
        if (options.legacy && code === 'duplicate_name') {
          if (optimisticId) dropLocalRow(optimisticId)
          setRowResearchNotice('This saved comparison row is now up to date.')
          router.refresh()
          return
        }
        const message =
          code === 'duplicate_name'
            ? 'That comparison row already exists.'
            : code === 'shortlist_empty'
              ? 'Add at least one school before researching a row.'
              : 'The school information could not be researched. Please try again.'
        if (optimisticId) dropLocalRow(optimisticId)
        setNewRowLabel(label)
        setNewRowError(message)
        setRowEditorOpen(true)
        return
      }

      if (result?.status === 'research_request_saved') {
        if (optimisticId) dropLocalRow(optimisticId)
        const topic = typeof result?.canonical_topic === 'string'
          ? result.canonical_topic
          : label
        setNewRowLabel('')
        setNewRowError(null)
        setRowEditorOpen(false)
        setRowResearchNotice(
          `We do not have enough reliable information for “${topic}” yet. `
          + 'Your request has been saved to help decide what Nana researches next. '
          + 'Thank you for helping us improve.',
        )
        return
      }

      const filled = typeof result?.filled_count === 'number' ? result.filled_count : 0
      const total = typeof result?.total_count === 'number' ? result.total_count : schools.length
      if (optimisticId) dropLocalRow(optimisticId)
      setRowResearchNotice(
        filled === total
          ? `Information added for all ${total} ${total === 1 ? 'school' : 'schools'}.`
          : filled > 0
            ? result?.missing_request_saved
              ? `Information added for ${filled} of ${total} schools. We saved the missing information for future research.`
              : `Information added for ${filled} of ${total} schools. The rest need checking.`
            : 'No reliable information was found yet.',
      )
      router.refresh()
    } catch (error) {
      console.error('[comparison-view research row]', error)
      if (optimisticId) dropLocalRow(optimisticId)
      setNewRowLabel(label)
      setNewRowError('Network error while researching the schools. Please try again.')
      setRowEditorOpen(true)
    } finally {
      setIsSavingResearchRequest(false)
    }
  }

  async function addComparisonLabel(rawLabel: string) {
    const label = rawLabel.trim().replace(/\s+/g, ' ')
    if (label.length < 2 || label.length > 60) {
      setNewRowError('Use a short label between 2 and 60 characters.')
      return
    }
    if (rows.some(row => row.label.trim().toLowerCase() === label.toLowerCase())) {
      setNewRowError('That comparison row already exists.')
      return
    }
    if (!activeChildId) {
      setNewRowError('Choose a child before adding a comparison row.')
      return
    }

    const match = matchComparisonRequest(label)
    const displayLabel = match.kind === 'supported' ? match.label : label
    if (rows.some(row => {
      if (row.label.trim().toLowerCase() === displayLabel.toLowerCase()) return true
      if (match.kind !== 'supported') return false
      const existingMatch = matchComparisonRequest(row.label)
      return existingMatch.kind === 'supported' && existingMatch.id === match.id
    })) {
      setNewRowError('That comparison row already exists.')
      return
    }

    let optimisticId: string | null = null
    const canAddWithoutResearch = match.kind === 'supported' && availableComparisonIdSet.has(match.id)
    if (canAddWithoutResearch) {
      optimisticId = `local-${createClientUuid()}`
      const optimisticRow: LocalComparisonRow = {
        id: optimisticId,
        label: displayLabel,
        status: 'researching',
      }
      setLocalRows(current => [...current, optimisticRow].slice(-12))
      setNewRowLabel('')
    } else {
      setIsSavingResearchRequest(true)
    }
    setNewRowError(null)
    setRowResearchNotice(null)
    setRowEditorOpen(false)
    await researchLocalRow(label, optimisticId)
  }

  async function addLocalRow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await addComparisonLabel(newRowLabel)
  }

  // Rows created before direct research shipped were saved only in this
  // browser. Migrate one at a time so an old empty "Airport distance" row
  // automatically becomes a normal, sourced database row after refresh.
  useEffect(() => {
    if (!activeChildId || localRowsChildId !== activeChildId || isResearchingRow) return
    const legacyRow = localRows.find(row => !row.status || row.status === 'idle')
    if (!legacyRow) return

    const savedMatch = data.rows.some(
      row => row.label.trim().toLowerCase() === legacyRow.label.trim().toLowerCase(),
    )
    if (savedMatch) {
      dropLocalRow(legacyRow.id)
      return
    }

    setLocalRows(current => current.map(row => (
      row.id === legacyRow.id ? { ...row, status: 'researching' } : row
    )))
    setRowResearchNotice(null)
    void researchLocalRow(legacyRow.label, legacyRow.id, { legacy: true })
  // This migration is intentionally driven by local-row identity/status.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChildId, data.rows, isResearchingRow, localRows, localRowsChildId])

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
    if (uiRowId.startsWith('local-')) {
      dropLocalRow(uiRowId)
      setSelectedPriorityIds(current => current.filter(id => id !== uiRowId))
      return
    }
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
      <div className="rr-cmp-wrap">
        <header className="rr-cmp-workspace-head">
          <div>
            <h1 className="rr-cmp-workspace-title">
              {activeChildName ? `${activeChildName}’s shortlist` : 'Your school shortlist'}
            </h1>
            <p className="rr-cmp-workspace-meta">Comparison unavailable</p>
          </div>
        </header>
        <div className="rr-cmp-empty" role="alert">
          <h2 className="rr-cmp-empty-title">Something went wrong loading your comparison.</h2>
          <p className="rr-cmp-empty-body">{loadError}</p>
        </div>
      </div>
    )
  }

  if (schools.length === 0) {
    return (
      <div className="rr-cmp-wrap">
        <header className="rr-cmp-workspace-head">
          <div>
            <h1 className="rr-cmp-workspace-title">
              {activeChildName ? `${activeChildName}’s shortlist` : 'Your school shortlist'}
            </h1>
            <p className="rr-cmp-workspace-meta">0 schools</p>
          </div>
        </header>
        <div className="rr-cmp-empty" role="status">
          <h2 className="rr-cmp-empty-title">Add the first school to start comparing.</h2>
          <p className="rr-cmp-empty-body">
            Snapshot and Table will appear once the shortlist has schools.
          </p>
          {activeChildId && (
            <div className="rr-cmp-empty-add">
              <SchoolAdder childId={activeChildId} excludeSlugs={[]} />
            </div>
          )}
          <Link href="/schools" className="rr-cmp-empty-cta">
            {activeChildId ? 'Browse all schools' : 'Browse schools'}
          </Link>
        </div>
      </div>
    )
  }

  const tableGridTemplateColumns = isNarrow
    ? 'minmax(132px, 0.82fr) minmax(0, 1.18fr)'
    : `260px repeat(${tableSchools.length}, minmax(220px, 1fr))`

  return (
    <div className="rr-cmp-wrap">
      <header className="rr-cmp-workspace-head">
        <div>
          <h1 className="rr-cmp-workspace-title">
            {activeChildName ? `${activeChildName}’s shortlist` : 'Your school shortlist'}
          </h1>
          <p className="rr-cmp-workspace-meta">
            {schools.length} {schools.length === 1 ? 'school' : 'schools'}
          </p>
        </div>
        <div className="rr-cmp-workspace-actions">
          {activeChildId && (
            <SchoolAdder
              childId={activeChildId}
              excludeSlugs={schools.map(school => school.slug)}
              variant="compact"
            />
          )}
          <div className="rr-cmp-display-switch" role="tablist" aria-label="Comparison display">
            <button
              type="button"
              role="tab"
              aria-selected={displayMode === 'snapshot'}
              className={displayMode === 'snapshot' ? 'is-active' : ''}
              onClick={() => changeDisplayMode('snapshot')}
            >
              <span aria-hidden="true">▥</span>
              Snapshot
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={displayMode === 'table'}
              className={displayMode === 'table' ? 'is-active' : ''}
              onClick={() => changeDisplayMode('table')}
            >
              <span aria-hidden="true">▦</span>
              Table
            </button>
          </div>
        </div>
      </header>

      {shortlistError && (
        <div className="rr-cmp-error" role="alert">
          {shortlistError}
          <button type="button" className="rr-chat-error-dismiss" onClick={() => setShortlistError(null)}>×</button>
        </div>
      )}

      {displayMode === 'snapshot' ? (
        <>
          <div className="rr-cmp-priority-bar">
            <div className="rr-cmp-priority-copy">
              <strong>Your priorities</strong>
              <span>Snapshot shows up to three things that matter most.</span>
            </div>
            <div className="rr-cmp-priority-list" aria-label="Selected priorities">
              {priorityRows.length > 0 ? priorityRows.map(row => (
                <span key={row.id}>{row.label}</span>
              )) : (
                <span className="is-empty">No priorities selected</span>
              )}
            </div>
            <button
              type="button"
              className="rr-cmp-secondary-action"
              onClick={openPriorityEditor}
              disabled={rows.length === 0}
            >
              Choose priorities
            </button>
          </div>

          {priorityEditorOpen && (
            <section className="rr-cmp-priority-editor" aria-labelledby="rr-priority-editor-title">
              <div className="rr-cmp-editor-head">
                <div>
                  <h2 id="rr-priority-editor-title">Choose up to three priorities</h2>
                  <p>Select the details you want to see first in Snapshot.</p>
                </div>
                <span aria-live="polite">{draftPriorityIds.length} of 3 selected</span>
              </div>
              <div className="rr-cmp-priority-options">
                {rows.map(row => {
                  const selected = draftPriorityIds.includes(row.id)
                  const disabled = !selected && draftPriorityIds.length >= 3
                  return (
                    <label
                      key={row.id}
                      className={`${selected ? 'is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => toggleDraftPriority(row.id)}
                      />
                      <span>{row.label}</span>
                    </label>
                  )
                })}
              </div>
              <div className="rr-cmp-editor-actions">
                <button type="button" className="rr-cmp-primary-action" onClick={applyPriorities}>
                  Apply priorities
                </button>
                <button
                  type="button"
                  className="rr-cmp-text-action"
                  onClick={() => setPriorityEditorOpen(false)}
                >
                  Keep current priorities
                </button>
              </div>
            </section>
          )}

          <SnapshotView rows={priorityRows} schools={schools} />
        </>
      ) : (
        <>
          <div className="rr-cmp-table-toolbar">
            <div>
              <strong>Detailed comparison</strong>
              <span>{rows.length} rows across {schools.length} schools</span>
            </div>
            <button
              type="button"
              className="rr-cmp-primary-action"
              onClick={() => {
                setRowEditorOpen(open => {
                  const next = !open
                  if (!next) {
                    setRowAutocompleteOpen(false)
                    setActiveSuggestionIndex(-1)
                  }
                  return next
                })
                setNewRowError(null)
              }}
              aria-expanded={rowEditorOpen}
              disabled={isResearchingRow || isSavingResearchRequest}
            >
              {isResearchingRow
                ? 'Finding information…'
                : isSavingResearchRequest
                  ? 'Saving request…'
                  : '+ Add comparison row'}
            </button>
          </div>

          {rowEditorOpen && (
            <form className="rr-cmp-row-editor" onSubmit={addLocalRow}>
              <div className="rr-cmp-row-editor-copy">
                <label htmlFor="rr-new-row">What else would you like to compare?</label>
                <span>
                  Search all comparison topics. Ready topics can be added now; the rest can be requested for research.
                </span>
              </div>
              <div className="rr-cmp-row-editor-input">
                <div
                  className="rr-cmp-row-search"
                  onBlur={event => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setRowAutocompleteOpen(false)
                      setActiveSuggestionIndex(-1)
                    }
                  }}
                >
                  <input
                    id="rr-new-row"
                    value={newRowLabel}
                    maxLength={60}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={rowAutocompleteOpen}
                    aria-controls="rr-comparison-suggestions"
                    aria-activedescendant={
                      activeSuggestionIndex >= 0
                        ? `rr-comparison-suggestion-${activeSuggestionIndex}`
                        : undefined
                    }
                    onFocus={() => setRowAutocompleteOpen(true)}
                    onKeyDown={handleRowSearchKeyDown}
                    onChange={event => {
                      setNewRowLabel(event.target.value)
                      setNewRowError(null)
                      setRowAutocompleteOpen(true)
                      setActiveSuggestionIndex(-1)
                    }}
                    placeholder="Start typing, for example nearest airport"
                    autoComplete="off"
                    autoFocus
                  />
                  {rowAutocompleteOpen && (
                    <div
                      id="rr-comparison-suggestions"
                      ref={autocompleteRef}
                      className="rr-cmp-autocomplete"
                      role="listbox"
                      aria-label="Comparison topics"
                    >
                      {autocompleteSuggestions.length > 0 ? autocompleteSuggestions.map((suggestion, index) => (
                        <div
                          id={`rr-comparison-suggestion-${index}`}
                          key={suggestion.id}
                          role="option"
                          tabIndex={-1}
                          data-suggestion-index={index}
                          data-action={
                            existingComparisonRows.has(
                              suggestion.kind === 'supported'
                                ? suggestion.id
                                : `research:${suggestion.id}`,
                            )
                              ? 'view'
                              : suggestion.kind === 'supported' && availableComparisonIdSet.has(suggestion.id)
                                ? 'add'
                                : 'research'
                          }
                          aria-selected={index === activeSuggestionIndex}
                          className={index === activeSuggestionIndex ? 'is-active' : ''}
                          onMouseDown={event => event.preventDefault()}
                          onMouseEnter={() => setActiveSuggestionIndex(index)}
                          onClick={() => void handleCatalogueSuggestion(suggestion)}
                        >
                          <svg viewBox="0 0 20 20" aria-hidden="true">
                            <circle cx="8.5" cy="8.5" r="5.5" />
                            <path d="m12.5 12.5 4 4" />
                          </svg>
                          <span>{suggestion.label}</span>
                          <small>
                            {existingComparisonRows.has(
                              suggestion.kind === 'supported'
                                ? suggestion.id
                                : `research:${suggestion.id}`,
                            )
                              ? 'View comparison'
                              : suggestion.kind === 'supported' && availableComparisonIdSet.has(suggestion.id)
                                ? 'Add comparison'
                              : 'Request research'}
                          </small>
                        </div>
                      )) : (
                        <div className="rr-cmp-autocomplete-empty">
                          No comparison topics match yet. You can still submit your own research request.
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button type="submit" className="rr-cmp-primary-action">
                  {(() => {
                    const match = matchComparisonRequest(newRowLabel)
                    return match.kind === 'supported' && availableComparisonIdSet.has(match.id)
                      ? 'Add comparison'
                      : 'Request research'
                  })()}
                </button>
                <button
                  type="button"
                  className="rr-cmp-text-action"
                  onClick={() => {
                    setRowEditorOpen(false)
                    setRowAutocompleteOpen(false)
                    setActiveSuggestionIndex(-1)
                    setNewRowLabel('')
                    setNewRowError(null)
                  }}
                >
                  Cancel
                </button>
              </div>
              {newRowError && <p className="rr-cmp-field-error" role="alert">{newRowError}</p>}
            </form>
          )}

          {rowResearchNotice && (
            <div className="rr-cmp-row-notice" role="status">
              <span>{rowResearchNotice}</span>
              <button
                type="button"
                onClick={() => setRowResearchNotice(null)}
                aria-label="Dismiss research update"
              >
                ×
              </button>
            </div>
          )}

          <details className="rr-cmp-settings">
            <summary>Comparison settings</summary>
            <div className="rr-cmp-controls">
              <div className="rr-cmp-lens-tabs" role="group" aria-label="Comparison focus">
                <span className="rr-cmp-lens-label">Focus</span>
                <button
                  type="button"
                  className={`rr-cmp-lens-tab${!activeLens && lens === 'general' ? ' is-active' : ''}`}
                  onClick={() => switchLens('general')}
                >
                  Overall
                </button>
                <button
                  type="button"
                  className={`rr-cmp-lens-tab${!activeLens && lens === 'child_fit' ? ' is-active' : ''}`}
                  onClick={() => switchLens('child_fit')}
                >
                  {childLensLabel}
                </button>
                {savedLenses.length > 0 && (
                  <div className="rr-cmp-lens-picker" ref={pickerRef}>
                    <button
                      type="button"
                      className={`rr-cmp-lens-tab rr-cmp-lens-tab--picker${activeLens ? ' is-active' : ''}`}
                      aria-haspopup="menu"
                      aria-expanded={pickerOpen}
                      onClick={() => setPickerOpen(open => !open)}
                    >
                      {activeLens ? activeLens.lens_name : 'Saved focuses'}
                      <span aria-hidden className="rr-cmp-lens-picker-caret">▾</span>
                    </button>
                    {pickerOpen && (
                      <div role="menu" className="rr-cmp-lens-picker-menu">
                        <div className="rr-cmp-lens-picker-eyebrow">Saved focuses</div>
                        {savedLenses.map(saved => {
                          const isActive = saved.id === activeLensId
                          return (
                            <button
                              key={saved.id}
                              type="button"
                              role="menuitem"
                              className={`rr-cmp-lens-picker-item${isActive ? ' is-active' : ''}`}
                              onClick={() => {
                                setPickerOpen(false)
                                if (onSwitchActiveLens) void onSwitchActiveLens(isActive ? null : saved.id)
                              }}
                            >
                              <span className="rr-cmp-lens-picker-check" aria-hidden>{isActive ? '✓' : ''}</span>
                              <span className="rr-cmp-lens-picker-name">{saved.lens_name}</span>
                              <span className="rr-cmp-lens-picker-base">
                                {saved.base_lens_kind === 'child_fit' ? 'child fit' : 'overall'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="rr-cmp-stats">
                {activeLens && activeLens.is_topic_lens && onRefreshTopicLens && (
                  <button
                    type="button"
                    className="rr-cmp-stats-refresh"
                    onClick={() => onRefreshTopicLens(activeLens.lens_name)}
                  >
                    ↻ Refresh information
                  </button>
                )}
                {!isNarrow && (
                  <span className="rr-cmp-stats-zoom" role="group" aria-label="Table zoom">
                    <span className="rr-cmp-stats-zoom-icon" aria-hidden="true">Size</span>
                    <button
                      type="button"
                      className="rr-cmp-stats-zoom-btn"
                      onClick={() => adjustZoom(-1)}
                      disabled={zoom === ZOOM_STEPS[0]}
                      aria-label="Make table smaller"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="rr-cmp-stats-zoom-btn"
                      onClick={() => adjustZoom(1)}
                      disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                      aria-label="Make table larger"
                    >
                      +
                    </button>
                  </span>
                )}
              </div>
            </div>
          </details>

          {viewOverlay && viewOverlay.kind === 'ephemeral' && (
            <div className="rr-cmp-overlay-chip" role="status">
              <span className="rr-cmp-overlay-chip-icon" aria-hidden="true">↻</span>
              <span className="rr-cmp-overlay-chip-text">
                <strong>{viewOverlay.label}</strong>
                <span className="rr-cmp-overlay-chip-meta"> · temporary view</span>
              </span>
              {onClearOverlay && (
                <button
                  type="button"
                  className="rr-cmp-overlay-chip-clear"
                  onClick={onClearOverlay}
                  aria-label="Reset temporary view"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {isNarrow && tableSchools.length > 0 && (
            <label className="rr-cmp-mobile-school">
              <span>School shown</span>
              <select
                value={mobileSchoolSlug ?? ''}
                onChange={event => setMobileSchoolSlug(event.target.value)}
              >
                {schools.map(school => (
                  <option key={school.slug} value={school.slug}>{school.name}</option>
                ))}
              </select>
            </label>
          )}

          <div
            className={`rr-cmp-table-wrap${isNarrow ? ' is-single-school' : ''}`}
            style={{ zoom: isNarrow ? 1 : zoom }}
          >
            <div className="rr-cmp-table">
              <div className="rr-cmp-table-row rr-cmp-table-row--head" style={{ gridTemplateColumns: tableGridTemplateColumns }}>
                <div className="rr-cmp-corner">
                  <div className="rr-cmp-corner-title">Comparison details</div>
                  <div className="rr-cmp-corner-meta">{tableRows.length} rows</div>
                </div>
                {tableSchools.map(school => (
                  <div key={school.slug} className="rr-cmp-head">
                    <div className="rr-cmp-head-name">{school.name}</div>
                    <div className="rr-cmp-head-meta">{school.meta}</div>
                    {activeChildId && (
                      <button
                        type="button"
                        className="rr-cmp-head-remove"
                        aria-label={`Remove ${school.name} from comparison`}
                        title="Remove this school"
                        onClick={() => handleRemoveSchool(school.slug)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <SortableTableBody
                rows={tableRows}
                schools={tableSchools}
                gridTemplateColumns={tableGridTemplateColumns}
                onRemove={handleRemoveRow}
                pendingRemoveId={pendingRemoveId}
                onReorderRows={onReorderRows}
              />
            </div>
          </div>
        </>
      )}

      {removeError && (
        <div className="rr-cmp-error" role="alert">
          {removeError}
          <button type="button" className="rr-chat-error-dismiss" onClick={() => setRemoveError(null)}>×</button>
        </div>
      )}
    </div>
  )
}

function SnapshotView({
  rows,
  schools,
}: {
  rows: ComparisonRow[]
  schools: SchoolColumn[]
}) {
  if (rows.length === 0) {
    return (
      <section className="rr-snapshot-empty" role="status">
        <h2>Your snapshot is waiting for comparison details.</h2>
        <p>Open Table to add the first comparison row, or return after school information has been added.</p>
      </section>
    )
  }

  const questions = rows.flatMap(row =>
    schools.flatMap((school, index) =>
      row.cells[index]?.kind === 'empty'
        ? [`${school.name}: check ${row.label.toLowerCase()}.`]
        : [],
    ),
  ).slice(0, 3)

  const gridTemplateColumns = `220px repeat(${schools.length}, minmax(220px, 1fr))`

  return (
    <section className="rr-snapshot" aria-labelledby="rr-snapshot-title">
      <div className="rr-snapshot-intro">
        <h2 id="rr-snapshot-title">What matters most</h2>
        <p>A quick view of the information available for your selected priorities.</p>
      </div>

      <div className="rr-snapshot-grid-wrap">
        <div className="rr-snapshot-grid">
          <div className="rr-snapshot-row rr-snapshot-row--head" style={{ gridTemplateColumns }}>
            <div>Priority</div>
            {schools.map(school => <div key={school.slug}>{school.name}</div>)}
          </div>
          {rows.map(row => (
            <div key={row.id} className="rr-snapshot-row" style={{ gridTemplateColumns }}>
              <div className="rr-snapshot-priority">
                <strong>{row.label}</strong>
                {row.blurb && <span>{row.blurb}</span>}
              </div>
              {schools.map((school, index) => (
                <SnapshotCell
                  key={`${row.id}-${school.slug}`}
                  schoolName={school.name}
                  cell={row.cells[index] ?? { kind: 'empty' }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="rr-snapshot-questions">
        <div className="rr-snapshot-questions-title">
          <span aria-hidden="true">?</span>
          <div>
            <h3>Questions to resolve</h3>
            <p>Information that would make the comparison clearer.</p>
          </div>
        </div>
        {questions.length > 0 ? (
          <ul>
            {questions.map(question => <li key={question}>{question}</li>)}
          </ul>
        ) : (
          <p className="rr-snapshot-complete">No obvious information gaps in these priorities.</p>
        )}
      </div>
    </section>
  )
}

function SnapshotCell({
  cell,
  schoolName,
}: {
  cell: RowCell
  schoolName: string
}) {
  if (cell.kind === 'loading') {
    return (
      <div className="rr-snapshot-cell is-loading" aria-live="polite">
        <span className="rr-snapshot-mobile-school">{schoolName}</span>
        <span className="rr-snapshot-loading-line" aria-hidden="true" />
        <span className="rr-snapshot-status">Finding information…</span>
      </div>
    )
  }

  if (cell.kind === 'empty') {
    return (
      <div className="rr-snapshot-cell is-missing">
        <span className="rr-snapshot-mobile-school">{schoolName}</span>
        <p className="rr-snapshot-result">No information yet</p>
        <span className="rr-snapshot-status">Needs checking</span>
      </div>
    )
  }

  if (cell.kind === 'lights') {
    const hasConcern = cell.lights.some(light => light.tone === 'red')
    const needsChecking = !hasConcern && cell.lights.some(light => light.tone === 'amber')
    return (
      <div className={`rr-snapshot-cell${hasConcern || needsChecking ? ' is-mixed' : ''}`}>
        <span className="rr-snapshot-mobile-school">{schoolName}</span>
        <p className="rr-snapshot-result">{cell.lights.map(light => light.label).join(' · ')}</p>
        {(hasConcern || needsChecking) && (
          <span className="rr-snapshot-status">
            {hasConcern ? 'Trade-off' : 'Needs checking'}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="rr-snapshot-cell">
      <span className="rr-snapshot-mobile-school">{schoolName}</span>
      <p className="rr-snapshot-result">{cell.primary}</p>
      {cell.sub && <small>{cell.sub}</small>}
      <EvidenceMeta source={cell.source} checkedAt={cell.checkedAt} />
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
        {rows.map(row => (
          <SortableRow
            key={row.id}
            row={row}
            schools={schools}
            gridTemplateColumns={gridTemplateColumns}
            onRemove={row.removable ? onRemove : null}
            removing={pendingRemoveId === row.id}
            isDragEnabled={Boolean(onReorderRows)}
          />
        ))}
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
      data-comparison-row-id={row.id}
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
          <span className="rr-cmp-dim-label">{row.label}</span>
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
  if (cell.kind === 'loading') {
    return (
      <div className="rr-cmp-cell-loading" role="status">
        <span className="rr-cmp-loading-line" aria-hidden="true" />
        <span>Finding information…</span>
      </div>
    )
  }
  if (cell.kind === 'empty') {
    return <div className="rr-cmp-cell-empty">Needs checking</div>
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
      <EvidenceMeta source={cell.source} checkedAt={cell.checkedAt} />
    </>
  )
}

function EvidenceMeta({
  source,
  checkedAt,
}: {
  source?: string
  checkedAt?: string
}) {
  if (!source && !checkedAt) return null
  let checkedLabel: string | null = null
  if (checkedAt) {
    const date = new Date(checkedAt)
    if (!Number.isNaN(date.getTime())) {
      checkedLabel = `Checked ${new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date)}`
    }
  }
  return (
    <div className="rr-cmp-cell-evidence">
      {source ? (
        <a href={source} target="_blank" rel="noreferrer">Source</a>
      ) : (
        <span>Nana school data</span>
      )}
      {checkedLabel && <span> · {checkedLabel}</span>}
    </div>
  )
}
