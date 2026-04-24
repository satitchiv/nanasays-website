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

type PostRow = {
  id: string
  status: string
  post_type: string | null
  slide_count: number | null
  school_id: string | null
  channel_slug: string | null
  image_url: string | null
  copy_en: string | null
  copy_th: string | null
  copy_th_generated_at: string | null
  created_at: string
  source_data: {
    plan_item_id?: string | null
    angle?: string | null
  } | null
  social_pillars: { slug: string; name_en: string } | null
  schools: { name: string | null } | null
}

const ALBUM_PILLARS = [
  { value: '', label: 'Auto (random album type)' },
  { value: 'school_tour_tips', label: 'School Tour Tips' },
  { value: 'admissions_guide', label: 'Admissions Timeline' },
  { value: 'head_to_head', label: 'School Comparison (4 schools)' },
  { value: 'school_spotlight', label: 'School Spotlight' },
  { value: 'city_roundup', label: 'City Roundup' },
]

export default function QueuePage() {
  const [posts, setPosts] = useState<PostRow[]>([])
  const [filter, setFilter] = useState<'pending_review' | 'approved' | 'rejected' | 'all'>('pending_review')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genCount, setGenCount] = useState(1)
  const [genType, setGenType] = useState<'album' | 'single'>('album')
  const [genPillar, setGenPillar] = useState('')
  const [message, setMessage] = useState<string>('')
  const [genLog, setGenLog] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  // Post IDs currently mid-translation. Drives button spinner + disabled
  // state. Multiple cards can translate in parallel (different IDs).
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    let q = supabase
      .from('social_posts')
      .select('id, status, post_type, slide_count, school_id, channel_slug, image_url, copy_en, copy_th, copy_th_generated_at, created_at, source_data, social_pillars(slug, name_en), schools(name)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (filter !== 'all') q = q.eq('status', filter)
    const { data } = await q
    setPosts((data || []) as unknown as PostRow[])
    setSelected(new Set())
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function handleGenerate() {
    setGenerating(true)
    setGenLog('')
    setMessage(`Generating… may take 30–90 seconds.`)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const body: Record<string, unknown> = { count: genCount, type: genType }
      if (genPillar) body.overrides = { pillar_slug: genPillar }

      const res = await fetch('/admin/content/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(body),
      })
      const resp = await res.json()

      // Always show the log so we can debug failures
      if (resp.log || resp.stdout || resp.stderr) {
        setGenLog([resp.log, resp.stderr].filter(Boolean).join('\n---\n'))
      }

      if (!res.ok) {
        setMessage(`✗ ${resp.error || 'Generator failed'}`)
        if (resp.stderr) setGenLog(resp.stderr + '\n' + (resp.stdout || ''))
        return
      }

      if (resp.generated === 0) {
        setMessage(`✗ Generator ran but created 0 drafts. Failed: ${resp.failed}. See log below.`)
      } else {
        setMessage(`✓ Generated ${resp.generated} draft${resp.generated !== 1 ? 's' : ''}. Failed: ${resp.failed}.`)
      }
      await load()
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setGenerating(false)
    }
  }

  async function handleTranslate(postId: string) {
    setTranslatingIds(prev => new Set(prev).add(postId))
    setMessage(`Translating… (~10s)`)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/admin/content/api/post/${postId}/translate-caption`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const resp = await res.json().catch(() => ({}))
      if (!res.ok || !resp.ok) {
        setMessage(`✗ ${resp.error || `Translation failed (${res.status})`}`)
        return
      }
      // Splice the new Thai caption into local state so the card updates
      // without waiting for a full reload round-trip.
      setPosts(prev => prev.map(p => p.id === postId
        ? { ...p, copy_th: resp.copy_th, copy_th_generated_at: resp.copy_th_generated_at }
        : p))
      setMessage(`✓ Thai caption generated`)
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : 'Translation failed'}`)
    } finally {
      setTranslatingIds(prev => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selected.size === posts.length) setSelected(new Set())
    else setSelected(new Set(posts.map(p => p.id)))
  }

  async function handleDelete() {
    if (!selected.size) return
    if (!confirm(`Delete ${selected.size} post${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/admin/content/api/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ ids: Array.from(selected) }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Delete failed')
      setMessage(`✓ Deleted ${selected.size} post${selected.size > 1 ? 's' : ''}.`)
      await load()
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : 'delete failed'}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>

        {/* Left: filters + select actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['pending_review', 'approved', 'rejected', 'all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600,
                background: filter === f ? NAVY : '#fff',
                color: filter === f ? '#fff' : NAVY,
                border: `1px solid ${filter === f ? NAVY : '#E2E8F0'}`,
                borderRadius: 6, cursor: 'pointer',
              }}>
                {f === 'pending_review' ? 'Pending' : f === 'approved' ? 'Approved' : f === 'rejected' ? 'Rejected' : 'All'}
              </button>
            ))}
          </div>

          {/* Select / delete row — only shown when there are posts */}
          {posts.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={selectAll} style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600,
                background: '#F6F8FA', color: '#6B7280',
                border: '1px solid #E2E8F0', borderRadius: 5, cursor: 'pointer',
              }}>
                {selected.size === posts.length ? 'Deselect all' : `Select all (${posts.length})`}
              </button>
              {selected.size > 0 && (
                <button onClick={handleDelete} disabled={deleting} style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 700,
                  background: deleting ? '#94A3B8' : '#B91C1C', color: '#fff',
                  border: 'none', borderRadius: 5, cursor: deleting ? 'not-allowed' : 'pointer',
                }}>
                  {deleting ? 'Deleting…' : `Delete ${selected.size} selected`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: generate panel */}
        <div style={{ background: '#fff', padding: '12px 16px', borderRadius: 8, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 320 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['album', 'single'] as const).map(t => (
              <button key={t} onClick={() => setGenType(t)} style={{
                flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 700,
                background: genType === t ? NAVY : '#F6F8FA',
                color: genType === t ? '#fff' : '#6B7280',
                border: `1px solid ${genType === t ? NAVY : '#E2E8F0'}`,
                borderRadius: 5, cursor: 'pointer',
              }}>
                {t === 'album' ? '📚 Album (carousel)' : '🖼 Single post'}
              </button>
            ))}
          </div>

          {genType === 'album' && (
            <select value={genPillar} onChange={e => setGenPillar(e.target.value)} style={{
              padding: '7px 10px', fontSize: 13, border: '1px solid #E2E8F0',
              borderRadius: 5, color: NAVY, background: '#fff',
            }}>
              {ALBUM_PILLARS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>Count</label>
            <input type="number" min={1} max={5} value={genCount}
              onChange={e => setGenCount(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 5))}
              style={{ width: 52, padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: 4, fontSize: 13 }}
              disabled={generating}
            />
            <button onClick={handleGenerate} disabled={generating} style={{
              flex: 1, padding: '8px 14px', fontSize: 13, fontWeight: 700,
              background: generating ? '#94A3B8' : TEAL, color: '#fff',
              border: 'none', borderRadius: 5, cursor: generating ? 'not-allowed' : 'pointer',
            }}>
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div style={{
          marginBottom: genLog ? 0 : 20, padding: '12px 16px', borderRadius: genLog ? '6px 6px 0 0' : 6, fontSize: 14,
          background: message.startsWith('✓') ? '#E8FAF6' : message.startsWith('✗') ? '#fdecea' : '#FEF7E0',
          color: message.startsWith('✓') ? '#065F46' : message.startsWith('✗') ? '#B91C1C' : '#92400E',
        }}>{message}</div>
      )}

      {/* Generator log — shown when there's a failure or debug info */}
      {genLog && (
        <pre style={{
          marginBottom: 20, padding: '10px 16px', borderRadius: '0 0 6px 6px',
          background: '#1e1e1e', color: '#d4d4d4', fontSize: 11, lineHeight: 1.5,
          overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          border: '1px solid #333',
        }}>{genLog}</pre>
      )}

      {/* Queue grid */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>Loading…</div>
      ) : posts.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#6B7280', background: '#fff', borderRadius: 10, border: '1px dashed #CBD5E1' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: NAVY }}>Nothing in this queue</div>
          <div style={{ fontSize: 13 }}>Click <strong>Generate</strong> to create drafts.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {posts.map(p => (
            <div key={p.id} style={{ position: 'relative' }}>
              {/* Selection checkbox */}
              <div
                onClick={e => { e.preventDefault(); toggleSelect(p.id) }}
                style={{
                  position: 'absolute', top: 8, left: 8, zIndex: 10,
                  width: 22, height: 22, borderRadius: 5,
                  background: selected.has(p.id) ? '#B91C1C' : 'rgba(255,255,255,0.9)',
                  border: `2px solid ${selected.has(p.id) ? '#B91C1C' : '#CBD5E1'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                }}
              >
                {selected.has(p.id) && <span style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>✓</span>}
              </div>

              <Link href={`/admin/content/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                  background: '#fff', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                  border: selected.has(p.id) ? '2px solid #B91C1C' : '1px solid #E2E8F0',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseOver={e => { if (!selected.has(p.id)) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.06)' }}}
                onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                >
                  <div style={{ position: 'relative' }}>
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '1/1', background: '#F6F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 13 }}>
                        Rendering…
                      </div>
                    )}
                    {p.post_type === 'album' && p.slide_count && (
                      <div style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'rgba(27,50,82,0.85)', color: '#fff',
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                      }}>
                        📚 {p.slide_count} slides
                      </div>
                    )}
                  </div>

                  <div style={{ padding: 14 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <StatusPill status={p.status} />
                      {p.social_pillars && <Chip text={p.social_pillars.name_en} />}
                      {p.channel_slug && <Chip text={p.channel_slug.replace(/_/g, ' ')} muted />}
                      {p.source_data?.plan_item_id && (
                        <span title={p.source_data.angle || 'from plan'} style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                          background: '#EEF2FF', color: '#4338CA', whiteSpace: 'nowrap',
                        }}>📋 from plan</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, marginBottom: 4 }}>
                      {p.schools?.name || p.social_pillars?.name_en || '(no school)'}
                    </div>
                    <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5, maxHeight: 54, overflow: 'hidden' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', marginRight: 6, letterSpacing: 0.4 }}>EN</span>
                      {p.copy_en?.slice(0, 110) || '(no copy)'}{p.copy_en && p.copy_en.length > 110 ? '…' : ''}
                    </div>

                    {p.copy_th && (
                      <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5, maxHeight: 54, overflow: 'hidden', marginTop: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', marginRight: 6, letterSpacing: 0.4 }}>TH</span>
                        {p.copy_th.slice(0, 110)}{p.copy_th.length > 110 ? '…' : ''}
                      </div>
                    )}

                    {p.copy_en && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleTranslate(p.id) }}
                        disabled={translatingIds.has(p.id)}
                        style={{
                          marginTop: 10,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          border: '1px solid #E2E8F0',
                          borderRadius: 5,
                          background: translatingIds.has(p.id) ? '#F3F4F6' : '#fff',
                          color: translatingIds.has(p.id) ? '#94A3B8' : '#4338CA',
                          cursor: translatingIds.has(p.id) ? 'wait' : 'pointer',
                        }}
                      >
                        {translatingIds.has(p.id)
                          ? '⏳ Translating…'
                          : p.copy_th ? '🔄 Regenerate Thai' : '🇹🇭 Generate Thai'}
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending_review: { bg: '#FEF7E0', fg: '#92400E', label: 'Pending' },
    approved:       { bg: '#E8FAF6', fg: '#065F46', label: 'Approved' },
    rejected:       { bg: '#fdecea', fg: '#B91C1C', label: 'Rejected' },
    edit_requested: { bg: '#EDE9FE', fg: '#5B21B6', label: 'Edit requested' },
    published:      { bg: '#DBEAFE', fg: '#1E40AF', label: 'Published' },
    archived:       { bg: '#F3F4F6', fg: '#4B5563', label: 'Archived' },
  }
  const s = map[status] || { bg: '#F3F4F6', fg: '#4B5563', label: status }
  return <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: 11, fontWeight: 600, background: s.bg, color: s.fg, borderRadius: 10 }}>{s.label}</span>
}

function Chip({ text, muted }: { text: string; muted?: boolean }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: 11, fontWeight: 600, background: muted ? '#F3F4F6' : '#E0E7FF', color: muted ? '#6B7280' : '#3730A3', borderRadius: 10, textTransform: 'capitalize' }}>{text}</span>
}
