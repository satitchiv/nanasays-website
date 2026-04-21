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
}

export default function PlanPage() {
  const [items, setItems] = useState<PlanItem[]>([])
  const [schoolNames, setSchoolNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [planning, setPlanning] = useState(false)
  const [executing, setExecuting] = useState<string | null>(null) // id currently executing
  const [count, setCount] = useState(3)
  const [startDate, setStartDate] = useState(nextMondayISO())
  const [message, setMessage] = useState('')
  const [log, setLog] = useState('')

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  async function load() {
    setLoading(true)
    const headers = await authHeader()
    const res = await fetch('/admin/content/api/plan/list', { headers })
    const resp = await res.json()
    if (resp.ok) {
      setItems(resp.items || [])
      setSchoolNames(resp.schoolNames || {})
    } else {
      setMessage(`Failed to load: ${resp.error}`)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handlePlan() {
    setPlanning(true)
    setLog('')
    setMessage('Planning… 15–30 seconds.')
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

  async function handleGenerateItem(id: string) {
    setExecuting(id)
    setMessage(`Generating ${id.slice(0, 8)}… up to 90 seconds.`)
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
      const res = await fetch('/admin/content/api/plan/execute-item', {
        method: 'POST',
        headers,
        body: JSON.stringify({ plan_item_id: id }),
      })
      const resp = await res.json()
      if (resp.ok) {
        setMessage(`✓ Generated. Post ${resp.item?.generated_post_id?.slice(0, 8)}…`)
      } else {
        setMessage(`❌ ${resp.error || 'Failed'}`)
      }
      await load()
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally {
      setExecuting(null)
    }
  }

  async function handleGenerateAll() {
    const planned = items.filter(i => i.status === 'planned')
    if (!planned.length) { setMessage('Nothing to generate'); return }
    if (!confirm(`Generate ${planned.length} posts sequentially? This may take ${planned.length * 60}+ seconds.`)) return
    for (const item of planned) {
      await handleGenerateItem(item.id)
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this plan item?')) return
    const headers = await authHeader()
    const res = await fetch(`/admin/content/api/plan/item/${id}`, { method: 'DELETE', headers })
    const resp = await res.json()
    if (resp.ok) {
      setMessage(`Removed`)
      await load()
    } else {
      setMessage(`❌ ${resp.error}`)
    }
  }

  async function handleEditAngle(id: string, current: string | null) {
    const next = prompt('New angle (editorial focus):', current || '')
    if (next === null || next === current) return
    const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
    const res = await fetch(`/admin/content/api/plan/item/${id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ angle: next }),
    })
    const resp = await res.json()
    if (resp.ok) { setMessage('✓ Angle updated'); await load() } else { setMessage(`❌ ${resp.error}`) }
  }

  return (
    <div>
      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid #E2E8F0` }}>
        <Link href="/admin/content" style={tabStyle(false)}>Queue</Link>
        <span style={tabStyle(true)}>Plan</span>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>Content plan</h1>
      <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px' }}>
        Plan a week of content before generating. Claude sees your recent posts and proposes distinct pillar + school + angle combos so nothing repeats.
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
            <button onClick={handleGenerateAll} disabled={!!executing} style={secondaryBtn(!!executing)}>
              {executing ? 'Executing…' : `⚡ Generate all (${items.filter(i => i.status === 'planned').length})`}
            </button>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <PlanItemCard
              key={item.id}
              item={item}
              schoolNames={schoolNames}
              executing={executing === item.id}
              disabled={!!executing && executing !== item.id}
              onGenerate={() => handleGenerateItem(item.id)}
              onEditAngle={() => handleEditAngle(item.id, item.angle)}
              onRemove={() => handleRemove(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PlanItemCard({ item, schoolNames, executing, disabled, onGenerate, onEditAngle, onRemove }: {
  item: PlanItem
  schoolNames: Record<string, string>
  executing: boolean
  disabled: boolean
  onGenerate: () => void
  onEditAngle: () => void
  onRemove: () => void
}) {
  const schoolLabel = item.school_id
    ? schoolNames[item.school_id] || item.school_id.slice(0, 8)
    : item.school_ids?.length
      ? item.school_ids.map(sid => schoolNames[sid] || sid.slice(0, 8)).join(' · ')
      : null

  const statusColor =
    item.status === 'planned'    ? '#6B7280' :
    item.status === 'generating' ? '#D97706' :
    item.status === 'generated'  ? TEAL :
    item.status === 'failed'     ? '#B91C1C' : '#6B7280'

  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: 14,
      border: `1px solid ${item.status === 'failed' ? '#FCA5A5' : '#E2E8F0'}`,
      opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
            <strong style={{ color: NAVY }}>{item.scheduled_for || 'unscheduled'}</strong>
            <span>·</span>
            <span style={{ fontFamily: 'ui-monospace, monospace', background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>
              📚 {item.pillar_slug}
            </span>
            <span style={{ color: statusColor, fontWeight: 700 }}>{item.status}</span>
          </div>
          {schoolLabel && (
            <div style={{ fontSize: 14, color: NAVY, fontWeight: 600, marginBottom: 4 }}>{schoolLabel}</div>
          )}
          {item.angle && (
            <div style={{ fontSize: 13, color: '#334155', marginBottom: 4 }}>
              <span style={{ color: '#6B7280' }}>angle:</span> {item.angle}
            </div>
          )}
          {item.reasoning && (
            <div style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic' }}>{item.reasoning}</div>
          )}
          {item.error_message && (
            <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 6 }}>Error: {item.error_message}</div>
          )}
          {item.generated_post_id && (
            <div style={{ fontSize: 12, marginTop: 6 }}>
              <Link href={`/admin/content/${item.generated_post_id}`} style={{ color: TEAL }}>→ View generated post</Link>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {item.status === 'planned' || item.status === 'failed' ? (
            <button onClick={onGenerate} disabled={disabled} style={actionBtn(disabled, TEAL)}>
              {executing ? '…' : 'Generate'}
            </button>
          ) : null}
          {item.status === 'planned' && (
            <button onClick={onEditAngle} disabled={disabled} style={actionBtn(disabled)}>Edit</button>
          )}
          {item.status !== 'generating' && (
            <button onClick={onRemove} disabled={disabled} style={actionBtn(disabled, '#B91C1C')}>Remove</button>
          )}
        </div>
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

function tabStyle(active: boolean) {
  return {
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 700,
    color: active ? NAVY : '#6B7280',
    textDecoration: 'none',
    borderBottom: active ? `3px solid ${TEAL}` : '3px solid transparent',
    marginBottom: -1,
    cursor: active ? 'default' : 'pointer',
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
