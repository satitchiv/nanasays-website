'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const NAVY = '#1B3252'
const TEAL = '#34C3A0'
const INDIGO = '#4338CA'

type PlanItem = {
  id: string
  batch_id: string
  scheduled_for: string | null
  post_type: string
  pillar_slug: string
  school_id: string | null
  school_ids: string[] | null
  channel_slug: string | null
  angle: string | null
  reasoning: string | null
  status: string
  generated_post_id: string | null
  error_message: string | null
  created_at: string
  created_by: string | null
  design_family: string | null
  // Strategy brief fields
  headline: string | null
  audience: string | null
  pain_point: string | null
  key_insight: string | null
  proof_points: string[] | null
  reader_takeaway: string | null
  visual_direction: string | null
  hashtags: string[] | null
  risk_flags: string[] | null
}

export default function PlanPage() {
  const [items, setItems] = useState<PlanItem[]>([])
  const [schoolNames, setSchoolNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [planning, setPlanning] = useState(false)
  // Set of plan-item IDs currently being kicked off. Once the server returns,
  // the item's DB status is 'generating', so we drop it from this set and rely
  // on polling to reflect live state. Multiple items can be in this set at once.
  const [startingIds, setStartingIds] = useState<Set<string>>(new Set())
  const [regenerating, setRegenerating] = useState<string | null>(null) // "<id>:<mode>"
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [count, setCount] = useState(3)
  const [startDate, setStartDate] = useState(nextMondayISO())
  const [message, setMessage] = useState('')
  const [log, setLog] = useState('')

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const headers = await authHeader()
    const res = await fetch('/admin/content/api/plan/list', { headers })
    const resp = await res.json()
    if (resp.ok) {
      setItems(resp.items || [])
      setSchoolNames(resp.schoolNames || {})
    } else if (!silent) {
      setMessage(`Failed to load: ${resp.error}`)
    }
    if (!loading) {/* noop to quiet linter */}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Live polling: while any item is 'generating' or 'queued', refresh every
  // 5s so the UI shows status transitions + queue advancement live.
  useEffect(() => {
    const anyActive = items.some(i => i.status === 'generating' || i.status === 'queued')
    if (!anyActive) return
    const timer = setInterval(() => { load(true) }, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  // Compute queue position for each queued item (1-indexed among queued by created_at)
  const queuedIds = items.filter(i => i.status === 'queued')
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(i => i.id)
  const queuePosition = new Map(queuedIds.map((id, idx) => [id, idx + 1]))

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handlePlan() {
    setPlanning(true)
    setLog('')
    setMessage('Planning… ~30 seconds.')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
      const res = await fetch('/admin/content/api/plan/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({ count, startDate }),
      })
      const resp = await res.json()
      if (resp.log || resp.stdout) setLog([resp.log, resp.stdout].filter(Boolean).join('\n'))
      if (resp.ok) {
        setMessage(`✓ Plan created: ${resp.items?.length || 0} items`)
        // Auto-expand new items so user sees full brief
        setExpanded(new Set((resp.items || []).map((i: PlanItem) => i.id)))
        await load()
      } else {
        setMessage(`❌ ${resp.error || 'Plan failed'}`)
      }
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setPlanning(false)
    }
  }

  // Kicks off a generation in the background. Returns immediately after the
  // server acknowledges the spawn. Status polling (above) shows live progress.
  // Guards against double-fire: if we're already starting this id, return early.
  async function handleGenerateItem(id: string) {
    if (startingIds.has(id)) return // client-side guard against rapid double-click
    setStartingIds(prev => new Set(prev).add(id))
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
      const res = await fetch('/admin/content/api/plan/execute-item', {
        method: 'POST',
        headers,
        body: JSON.stringify({ plan_item_id: id }),
      })
      const resp = await res.json()
      if (resp.ok) {
        if (resp.alreadyClaimed) {
          setMessage(`ℹ︎ Already ${resp.status}. No new job started.`)
        } else if (resp.status === 'queued') {
          setMessage(`✓ Queued ${id.slice(0, 8)}… (will start when current one finishes)`)
        } else {
          setMessage(`✓ Started ${id.slice(0, 8)}… (running in background, ~10-20 min). You can close this tab.`)
        }
      } else {
        setMessage(`❌ ${resp.error || 'Failed to start'}`)
      }
      await load(true)
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setStartingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // Enqueues every planned item. The server's queue runs one at a time
  // (ALBUM_CONCURRENCY=1 by default), so these will execute sequentially in
  // background processes with no extra UI wait.
  async function handleGenerateAll() {
    const planned = items.filter(i => i.status === 'planned')
    if (!planned.length) { setMessage('Nothing to generate'); return }
    if (!confirm(`Start ${planned.length} albums? They'll run one at a time in background (~${planned.length * 15} min total). You can close this tab.`)) return
    setMessage(`Queueing ${planned.length} albums…`)
    // Fire sequentially so the DB accurately reflects generating vs queued
    for (const item of planned) {
      await handleGenerateItem(item.id)
    }
    setMessage(`✓ All ${planned.length} albums queued. First is running; the rest will run in order.`)
  }

  async function handleRegenerate(id: string, field: 'all' | 'headline') {
    setRegenerating(`${id}:${field}`)
    setMessage(field === 'headline' ? 'Getting a fresh headline…' : 'Regenerating full brief… ~30s')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
      const res = await fetch(`/admin/content/api/plan/item/${id}/regenerate`, {
        method: 'POST', headers, body: JSON.stringify({ field }),
      })
      const resp = await res.json()
      if (resp.ok) {
        setMessage(field === 'headline' ? `✓ New headline: "${resp.item?.headline}"` : '✓ Fresh brief ready')
        await load()
      } else {
        setMessage(`❌ ${resp.error}`)
      }
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setRegenerating(null)
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this plan item?')) return
    const headers = await authHeader()
    const res = await fetch(`/admin/content/api/plan/item/${id}`, { method: 'DELETE', headers })
    const resp = await res.json()
    if (resp.ok) {
      setMessage('Removed')
      await load()
    } else {
      setMessage(`❌ ${resp.error}`)
    }
  }

  async function handleDesignFamilyChange(id: string, value: string) {
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
      const res = await fetch(`/admin/content/api/plan/item/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ design_family: value }),
      })
      const resp = await res.json().catch(() => ({}))
      if (resp.ok) {
        setMessage(`✓ cover template set to ${value}`)
        await load(true)
      } else {
        setMessage(`❌ ${resp.error || `Request failed (${res.status})`}`)
      }
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'Failed to update template'}`)
    }
  }

  async function handleEditField(id: string, field: string, currentValue: string | null) {
    const next = prompt(`Edit ${field.replace(/_/g, ' ')}:`, currentValue || '')
    if (next === null || next === currentValue) return
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
      const res = await fetch(`/admin/content/api/plan/item/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ [field]: next }),
      })

      let resp: { ok?: boolean; error?: string } = {}
      try {
        resp = await res.json()
      } catch {
        const text = await res.text().catch(() => '')
        resp = { ok: false, error: text || `Request failed (${res.status})` }
      }

      if (resp.ok) {
        setMessage(`✓ ${field.replace(/_/g, ' ')} updated`)
        await load()
      } else {
        setMessage(`❌ ${resp.error || `Request failed (${res.status})`}`)
      }
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'Failed to update field'}`)
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>Content plan</h1>
      <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px' }}>
        A content brief for every planned post — headline, audience, insight, proof points — that you can review, edit, and regenerate before committing production time.
      </p>

      {/* Planner controls */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={labelStyle}>How many posts?</label>
            <input
              type="number" min={1} max={10} value={count}
              onChange={e => setCount(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Week starts</label>
            <input
              type="date" value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button onClick={handlePlan} disabled={planning} style={primaryBtn(planning)}>
            {planning ? 'Planning…' : '✨ Plan the week'}
          </button>
          {items.some(i => i.status === 'planned') && (
            <button onClick={handleGenerateAll} style={secondaryBtn(false)}>
              ⚡ Generate all ({items.filter(i => i.status === 'planned').length})
            </button>
          )}
          {items.some(i => i.status === 'generating' || i.status === 'queued') && (
            <span style={{ fontSize: 12, color: '#D97706', fontWeight: 600, padding: '9px 0' }}>
              ⏳ {items.filter(i => i.status === 'generating').length} running · {items.filter(i => i.status === 'queued').length} queued
            </span>
          )}
        </div>
        {message && <div style={{ marginTop: 12, fontSize: 13, color: message.startsWith('❌') ? '#B91C1C' : NAVY }}>{message}</div>}
        {log && (
          <pre style={{ marginTop: 12, padding: 10, background: '#0F172A', color: '#D1FAE5', fontSize: 11, borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>{log}</pre>
        )}
      </div>

      {/* Plan list */}
      {loading ? (
        <div style={{ padding: 40, color: '#6B7280' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 40, background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 10, textAlign: 'center', color: '#6B7280' }}>
          No planned items. Click <strong>Plan the week</strong> above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(item => (
            <PlanItemCard
              key={item.id}
              item={item}
              schoolNames={schoolNames}
              isExpanded={expanded.has(item.id)}
              toggleExpand={() => toggleExpand(item.id)}
              starting={startingIds.has(item.id)}
              regeneratingAll={regenerating === `${item.id}:all`}
              regeneratingHeadline={regenerating === `${item.id}:headline`}
              queuePosition={queuePosition.get(item.id)}
              onGenerate={() => handleGenerateItem(item.id)}
              onRegenerateAll={() => handleRegenerate(item.id, 'all')}
              onRegenerateHeadline={() => handleRegenerate(item.id, 'headline')}
              onRemove={() => handleRemove(item.id)}
              onEditField={(field, v) => handleEditField(item.id, field, v)}
              onChangeDesignFamily={(v) => handleDesignFamilyChange(item.id, v)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PlanItemCard({
  item, schoolNames, isExpanded, toggleExpand,
  starting, regeneratingAll, regeneratingHeadline, queuePosition,
  onGenerate, onRegenerateAll, onRegenerateHeadline, onRemove, onEditField,
  onChangeDesignFamily,
}: {
  item: PlanItem
  schoolNames: Record<string, string>
  isExpanded: boolean
  toggleExpand: () => void
  starting: boolean
  regeneratingAll: boolean
  regeneratingHeadline: boolean
  queuePosition: number | undefined
  onGenerate: () => void
  onRegenerateAll: () => void
  onRegenerateHeadline: () => void
  onRemove: () => void
  onEditField: (field: string, currentValue: string | null) => void
  onChangeDesignFamily: (value: string) => void
}) {
  const isGenerating = item.status === 'generating' || starting
  const isQueued = item.status === 'queued'
  const schoolLabel = item.school_id
    ? schoolNames[item.school_id] || item.school_id.slice(0, 8)
    : item.school_ids?.length
      ? `${item.school_ids.length} schools: ${item.school_ids.map(sid => schoolNames[sid] || sid.slice(0, 8)).join(' · ')}`
      : null

  const statusColor =
    item.status === 'planned'    ? '#6B7280' :
    item.status === 'queued'     ? '#4338CA' :
    item.status === 'generating' ? '#D97706' :
    item.status === 'generated'  ? TEAL :
    item.status === 'failed'     ? '#B91C1C' : '#6B7280'

  const statusLabel =
    item.status === 'queued' && queuePosition
      ? `queued · #${queuePosition}`
      : item.status

  return (
    <div style={{
      background: '#fff', borderRadius: 10,
      border: `1px solid ${item.status === 'failed' ? '#FCA5A5' : isGenerating ? '#D97706' : isQueued ? INDIGO : isExpanded ? NAVY : '#E2E8F0'}`,
      overflow: 'hidden',
    }}>
      {/* Collapsed header — always visible */}
      <div style={{ padding: 14, cursor: 'pointer' }} onClick={toggleExpand}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
          <span style={{ color: '#94A3B8', fontSize: 11 }}>{isExpanded ? '▼' : '▶'}</span>
          <strong style={{ color: NAVY }}>{item.scheduled_for || 'unscheduled'}</strong>
          <span>·</span>
          <span style={{ fontFamily: 'ui-monospace, monospace', background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>
            📚 {item.pillar_slug}
          </span>
          <span style={{ color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
          {item.risk_flags?.length ? <span style={{ color: '#B91C1C', fontWeight: 700 }}>⚠ {item.risk_flags.length} risk{item.risk_flags.length > 1 ? 's' : ''}</span> : null}
        </div>

        {/* Headline — the hook */}
        <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, lineHeight: 1.3, marginBottom: 6 }}>
          {item.headline || <span style={{ color: '#94A3B8', fontWeight: 400, fontStyle: 'italic' }}>(no headline — click Regenerate)</span>}
        </div>

        {/* Takeaway — what reader should do */}
        {item.reader_takeaway && (
          <div style={{ fontSize: 13, color: TEAL, fontWeight: 600 }}>
            → {item.reader_takeaway}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: '0 14px 14px 14px', borderTop: '1px solid #F1F5F9' }}>
          {schoolLabel && (
            <Field label="School(s)" value={schoolLabel} />
          )}

          <Field label="Audience" value={item.audience} onEdit={() => onEditField('audience', item.audience)} />

          <Field label="Pain point" value={item.pain_point} onEdit={() => onEditField('pain_point', item.pain_point)} />

          <Field
            label="💡 Key insight"
            value={item.key_insight}
            onEdit={() => onEditField('key_insight', item.key_insight)}
            highlight
          />

          {item.proof_points?.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={fieldLabelStyle}>Proof points</div>
              <ul style={{ margin: '4px 0 0 20px', padding: 0, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
                {item.proof_points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          ) : null}

          {item.angle && <Field label="Angle (internal)" value={item.angle} onEdit={() => onEditField('angle', item.angle)} small />}
          {item.visual_direction && <Field label="Visual direction" value={item.visual_direction} onEdit={() => onEditField('visual_direction', item.visual_direction)} small />}

          <div style={{ marginTop: 10 }}>
            <div style={fieldLabelStyle}>Cover template</div>
            <select
              value={item.design_family || 'auto'}
              onChange={(e) => onChangeDesignFamily(e.target.value)}
              style={{
                marginTop: 4,
                padding: '6px 10px',
                border: '1px solid #D1D5DB',
                borderRadius: 6,
                fontSize: 13,
                color: NAVY,
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="auto">Auto — Claude generates cover</option>
              <option value="premium_data_desk">Premium Data Desk</option>
            </select>
          </div>

          {item.hashtags?.length ? (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {item.hashtags.map(h => (
                <span key={h} style={{ fontSize: 11, background: '#EEF2FF', color: INDIGO, padding: '3px 8px', borderRadius: 10, fontWeight: 600 }}>
                  #{h}
                </span>
              ))}
            </div>
          ) : null}

          {item.risk_flags?.length ? (
            <div style={{ marginTop: 12, padding: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', marginBottom: 4 }}>⚠ RISKS TO VERIFY</div>
              <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: 12, color: '#991B1B' }}>
                {item.risk_flags.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          ) : null}

          {item.reasoning && (
            <div style={{ marginTop: 12, padding: 8, background: '#F8FAFC', borderRadius: 6, fontSize: 12, color: '#64748B', fontStyle: 'italic' }}>
              💭 Why now: {item.reasoning}
            </div>
          )}

          {item.error_message && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#B91C1C', padding: 8, background: '#FEF2F2', borderRadius: 6 }}>
              Error: {item.error_message}
            </div>
          )}

          {item.generated_post_id && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              <Link href={`/admin/content/${item.generated_post_id}`} style={{ color: TEAL, fontWeight: 600 }}>
                → View generated post
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Action buttons — always visible at the bottom */}
      <div style={{ padding: 10, borderTop: '1px solid #F1F5F9', display: 'flex', gap: 6, flexWrap: 'wrap', background: '#FAFBFC' }}>
        {isGenerating ? (
          <span style={{ fontSize: 12, color: '#D97706', fontWeight: 700, padding: '6px 10px' }}>
            ⏳ Generating in background… (~10-20 min)
          </span>
        ) : isQueued ? (
          <>
            <span style={{ fontSize: 12, color: INDIGO, fontWeight: 700, padding: '6px 10px' }}>
              ⏸ Queued{queuePosition ? ` · position #${queuePosition}` : ''} — will start when the current one finishes
            </span>
            <button onClick={onRemove} style={actionBtn(false, '#B91C1C')}>🗑 Remove from queue</button>
          </>
        ) : (
          <>
            {(item.status === 'planned' || item.status === 'failed') && (
              <button onClick={onGenerate} disabled={starting} style={actionBtn(starting, TEAL)}>
                {starting ? '… starting' : '✨ Generate'}
              </button>
            )}
            {item.status !== 'generated' && (
              <>
                <button onClick={onRegenerateAll} disabled={regeneratingAll} style={actionBtn(regeneratingAll, NAVY)}>
                  {regeneratingAll ? '…' : '↻ Regenerate all'}
                </button>
                <button onClick={onRegenerateHeadline} disabled={regeneratingHeadline} style={actionBtn(regeneratingHeadline, INDIGO)}>
                  {regeneratingHeadline ? '…' : '↻ Regenerate headline'}
                </button>
              </>
            )}
            <button onClick={onRemove} style={actionBtn(false, '#B91C1C')}>
              🗑 Remove
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onEdit, highlight, small }: {
  label: string
  value: string | null
  onEdit?: () => void
  highlight?: boolean
  small?: boolean
}) {
  if (!value) return null
  return (
    <div style={{ marginTop: 10 }}>
      <div style={fieldLabelStyle}>
        {label}
        {onEdit && (
          <button
            onClick={onEdit}
            style={{ marginLeft: 8, fontSize: 10, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >edit</button>
        )}
      </div>
      <div style={{
        fontSize: small ? 12 : 13,
        color: highlight ? NAVY : '#334155',
        fontWeight: highlight ? 600 : 400,
        lineHeight: 1.5,
        padding: highlight ? '6px 10px' : 0,
        background: highlight ? '#F0FDFA' : 'transparent',
        borderLeft: highlight ? `3px solid ${TEAL}` : 'none',
        borderRadius: highlight ? 4 : 0,
      }}>
        {value}
      </div>
    </div>
  )
}

function nextMondayISO() {
  const d = new Date()
  const day = d.getDay()
  const diff = (8 - day) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

const labelStyle = { display: 'block', fontSize: 11, color: '#6B7280', marginBottom: 4, fontWeight: 600 } as const
const inputStyle = { padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 14, background: '#fff' } as const
const fieldLabelStyle = { fontSize: 10, color: '#6B7280', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 2 }

function tabStyle(active: boolean) {
  return {
    padding: '10px 16px', fontSize: 14, fontWeight: 700,
    color: active ? NAVY : '#6B7280', textDecoration: 'none',
    borderBottom: active ? `3px solid ${TEAL}` : '3px solid transparent',
    marginBottom: -1, cursor: active ? 'default' : 'pointer',
  } as const
}
function primaryBtn(disabled: boolean) {
  return {
    padding: '9px 16px', background: disabled ? '#94A3B8' : TEAL, color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  } as const
}
function secondaryBtn(disabled: boolean) {
  return {
    padding: '9px 16px', background: disabled ? '#94A3B8' : NAVY, color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  } as const
}
function actionBtn(disabled: boolean, color = '#334155') {
  return {
    padding: '6px 10px', fontSize: 12, fontWeight: 600, color,
    background: '#fff', border: `1px solid ${color === '#334155' ? '#CBD5E1' : color}`, borderRadius: 5,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  } as const
}
