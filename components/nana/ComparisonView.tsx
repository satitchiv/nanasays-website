'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  EMPTY_DATA,
  type ComparisonData,
  type ComparisonRow,
  type RowCell,
  type SchoolColumn,
} from './comparison-placeholder'

type Lens = 'general' | 'child_fit'

type Props = {
  data?: ComparisonData
  activeChildName?: string | null
  lens?: Lens
  // Round-4 fix (Codex F3): when the server-side load throws, the page
  // sets this string and we surface it as a banner instead of falling
  // through to demo schools.
  loadError?: string | null
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
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const { schools, rows } = data
  const childLensLabel = activeChildName ? `${activeChildName} fit` : 'Child fit'

  // Slice 5.5a: lens switch via URL param. The server reads searchParams.lens
  // in page.tsx and re-fetches the right rows. router.replace keeps history
  // tidy (no per-click entry); cloning the existing search params preserves
  // anything already on the URL (e.g. future ?ref=, ?from=, etc.).
  function switchLens(next: Lens) {
    if (next === lens) return
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === 'general') params.delete('lens')
    else params.set('lens', next)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
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
            aria-selected={lens === 'general'}
            className={`rr-cmp-lens-tab${lens === 'general' ? ' is-active' : ''}`}
            onClick={() => switchLens('general')}
          >
            General comparison
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lens === 'child_fit'}
            className={`rr-cmp-lens-tab${lens === 'child_fit' ? ' is-active' : ''}`}
            onClick={() => switchLens('child_fit')}
          >
            {childLensLabel}
          </button>
        </div>
        <div className="rr-cmp-stats">
          {rows.length} rows · {schools.length} schools
          <br />
          <strong>{lens === 'general' ? 'General' : childLensLabel}</strong> active
        </div>
      </div>

      <div className="rr-cmp-table-wrap">
        <div className="rr-cmp-table" style={{ gridTemplateColumns }}>
          <div className="rr-cmp-corner">
            <div className="rr-cmp-corner-eyebrow">Comparing</div>
            <div className="rr-cmp-corner-title">
              {schools.length} schools, <em>{rows.length} dimensions</em>
            </div>
            <div className="rr-cmp-corner-meta">{lens === 'general' ? 'General lens' : `${childLensLabel} lens`}</div>
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

          {rows.map((row) => (
            <RowCells
              key={row.id}
              row={row}
              schools={schools}
              onRemove={row.removable ? handleRemoveRow : null}
              removing={pendingRemoveId === row.id}
            />
          ))}
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

function RowCells({
  row,
  schools,
  onRemove,
  removing,
}: {
  row: ComparisonRow
  schools: SchoolColumn[]
  onRemove: ((rowId: string) => void) | null
  removing: boolean
}) {
  return (
    <>
      <div className="rr-cmp-dim">
        <div className="rr-cmp-dim-name">
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
    </>
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
