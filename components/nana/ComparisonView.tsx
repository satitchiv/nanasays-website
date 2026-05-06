'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PLACEHOLDER_DATA,
  type ComparisonData,
  type ComparisonRow,
  type RowCell,
  type SchoolColumn,
} from './comparison-placeholder'

type Lens = 'child' | 'raw'

type Props = {
  data?: ComparisonData
  activeChildName?: string | null
}

// Slice 5: rows whose id starts with `cmp-` came from comparison_rows
// (added via "+ Add as row"). Those are removable via undo_add_row.
// Canonical rows (fees, oxbridge, etc.) keep their stable string ids.
function isCustomRow(rowId: string): boolean {
  return rowId.startsWith('cmp-')
}
function customRowDbId(rowId: string): string {
  return rowId.replace(/^cmp-/, '')
}

export default function ComparisonView({ data = PLACEHOLDER_DATA, activeChildName = null }: Props) {
  const [lens, setLens] = useState<Lens>('child')
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const router = useRouter()
  const { schools, rows } = data
  const childLensLabel = activeChildName ? `${activeChildName} fit` : 'Child fit'

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
            aria-selected={lens === 'child'}
            className={`rr-cmp-lens-tab${lens === 'child' ? ' is-active' : ''}`}
            onClick={() => setLens('child')}
          >
            {childLensLabel}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lens === 'raw'}
            className={`rr-cmp-lens-tab${lens === 'raw' ? ' is-active' : ''}`}
            onClick={() => setLens('raw')}
          >
            Raw comparison
          </button>
          <span className="rr-cmp-lens-hint">
            Both lenses show the same data in slice 2 — child-weighted re-ranking lands in slice 4.
          </span>
        </div>
        <div className="rr-cmp-stats">
          {rows.length} rows · {schools.length} schools
          <br />
          <strong>{lens === 'child' ? childLensLabel : 'Raw'}</strong> active
        </div>
      </div>

      <div className="rr-cmp-table-wrap">
        <div className="rr-cmp-table" style={{ gridTemplateColumns }}>
          <div className="rr-cmp-corner">
            <div className="rr-cmp-corner-eyebrow">Comparing</div>
            <div className="rr-cmp-corner-title">
              {schools.length} schools, <em>{rows.length} dimensions</em>
            </div>
            <div className="rr-cmp-corner-meta">read-only · slice 2</div>
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
              onRemove={isCustomRow(row.id) ? handleRemoveRow : null}
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
