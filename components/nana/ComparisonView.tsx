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

type Lens = 'general' | 'child_fit'

// Slice 6 close — minimal lens shape consumed by the picker dropdown.
// Mirrors the SavedLens type in ResearchRoom (kept loose here to avoid
// a cross-component type cycle).
type LensListItem = {
  id:             string
  lens_name:      string
  base_lens_kind: Lens
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
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const { schools, rows: rawRows } = data
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
  function switchLens(next: Lens) {
    const baseChanged = next !== lens
    if (baseChanged) {
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      if (next === 'general') params.delete('lens')
      else params.set('lens', next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    }
    if (activeLensId && onSwitchActiveLens) {
      void onSwitchActiveLens(null)
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
        <Link href="/schools" className="rr-cmp-empty-cta">
          Browse schools →
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
        <div className="rr-cmp-stats">
          {rows.length} rows · {schools.length} schools
          <br />
          <strong>{activeLens ? activeLens.lens_name : (lens === 'general' ? 'General' : childLensLabel)}</strong> active
        </div>
      </div>

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

      <div className="rr-cmp-table-wrap">
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
              <div key={s.slug} className="rr-cmp-head">
                <div className="rr-cmp-head-rank">
                  No. <strong>{String(i + 1).padStart(2, '0')}</strong>
                </div>
                <div className="rr-cmp-head-name">{s.name}</div>
                <div className="rr-cmp-head-meta">{s.meta}</div>
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
