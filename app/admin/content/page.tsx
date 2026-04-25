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
  hashtags: string[] | null
  created_at: string
  source_data: {
    plan_item_id?: string | null
    angle?: string | null
  } | null
  social_pillars: { slug: string; name_en: string } | null
  schools: { name: string | null } | null
}

// Cap concurrent generation jobs. Each job spawns a Puppeteer browser +
// a Claude call, so 3 at a time keeps memory + Claude rate-limit safe.
const MAX_CONCURRENT_JOBS = 3

// Album dropdown options. Items prefixed with `card:` route to the
// card-album generator (template-driven, Claude plans N slides) instead
// of the regular Claude HTML album generator. The `card:` prefix is the
// only signal handleGenerate uses to switch APIs.
const ALBUM_PILLARS = [
  { value: '', label: 'Auto (random album type)' },
  { value: 'school_tour_tips', label: 'School Tour Tips' },
  { value: 'admissions_guide', label: 'Admissions Timeline' },
  { value: 'head_to_head', label: 'School Comparison (4 schools)' },
  { value: 'school_spotlight', label: 'School Spotlight' },
  { value: 'city_roundup', label: 'City Roundup' },
  { value: 'card:glossary', label: '📖 Glossary cards (auto-album)' },
  { value: 'card:tip', label: '💡 School-tour tips (auto-album)' },
]

export default function QueuePage() {
  const [posts, setPosts] = useState<PostRow[]>([])
  const [filter, setFilter] = useState<'pending_review' | 'approved' | 'rejected' | 'all'>('pending_review')
  const [loading, setLoading] = useState(true)
  // Async generation queue. Each Generate click fires a request without
  // blocking the UI; inFlight tracks how many jobs are currently running
  // so we can show a "X running" badge and cap concurrency.
  const [inFlight, setInFlight] = useState(0)
  const [genCount, setGenCount] = useState(1)
  const [genType, setGenType] = useState<'album' | 'single'>('album')
  const [genPillar, setGenPillar] = useState('')
  const [message, setMessage] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  // Post IDs currently mid-translation. Drives button spinner + disabled
  // state. Multiple cards can translate in parallel (different IDs).
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())
  // Briefly highlight the post you just copied so the action feels confirmed.
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Build the full clipboard payload: EN caption, then TH caption (if present),
  // then a single block of hashtags. The website signature is auto-appended
  // to each caption that doesn't already have it (legacy posts produced
  // before we added the signature get retrofitted on copy).
  function assembleCopyText(p: PostRow): string {
    const en = appendWebsiteSignature(p.copy_en || '')
    const th = appendWebsiteSignature(p.copy_th || '')
    const tags = (p.hashtags || []).map(h => `#${h}`).join(' ')
    return [en, th, tags].filter(s => s && s.trim()).join('\n\n')
  }

  async function handleCopy(p: PostRow) {
    const text = assembleCopyText(p)
    if (!text.trim()) {
      setMessage('✗ Nothing to copy — this post has no caption yet.')
      return
    }
    try {
      await copyTextWithFallback(text)
      setCopiedId(p.id)
      setTimeout(() => setCopiedId(null), 1800)
    } catch (err) {
      setMessage(`✗ Copy failed — ${err instanceof Error ? err.message : 'clipboard error'}`)
    }
  }

  // Stamp the website URL at the bottom of a caption if it isn't already
  // there. Mirrors scripts/social-media-planner/caption-signature.js — kept
  // in sync manually (small enough that a fetch helper would be over-engineered).
  function appendWebsiteSignature(text: string): string {
    if (!text || !text.trim()) return text
    if (/nanasays\.school/i.test(text)) return text
    return `${text.trim()}\n\nWebsite: nanasays.school`
  }

  // Clipboard write with a non-secure-context fallback. The Tailscale dev
  // URL is plain HTTP, where `navigator.clipboard` is undefined.
  async function copyTextWithFallback(text: string): Promise<void> {
    if (typeof window !== 'undefined' && window.navigator.clipboard?.writeText) {
      try {
        await window.navigator.clipboard.writeText(text)
        return
      } catch {
        // Fall through to legacy path
      }
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    try {
      const ok = document.execCommand('copy')
      if (!ok) throw new Error('execCommand returned false')
    } finally {
      document.body.removeChild(ta)
    }
  }

  async function load() {
    setLoading(true)
    let q = supabase
      .from('social_posts')
      .select('id, status, post_type, slide_count, school_id, channel_slug, image_url, copy_en, copy_th, copy_th_generated_at, hashtags, created_at, source_data, social_pillars(slug, name_en), schools(name)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (filter !== 'all') q = q.eq('status', filter)
    const { data } = await q
    setPosts((data || []) as unknown as PostRow[])
    setSelected(new Set())
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  // Auto-refresh the queue while jobs are in flight so newly-completed posts
  // appear without the user reaching for the refresh button. Stops when
  // inFlight returns to 0.
  useEffect(() => {
    if (inFlight === 0) return
    const id = setInterval(() => load(), 5000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight, filter])

  // Fire-and-forget job runner. Each click adds a job; cap at MAX_CONCURRENT_JOBS.
  // The button stays clickable while jobs run so the user can stack work.
  function startJob(label: string, runner: () => Promise<{ ok: boolean; message: string }>) {
    if (inFlight >= MAX_CONCURRENT_JOBS) {
      setMessage(`✗ ${MAX_CONCURRENT_JOBS} jobs already running. Wait for one to finish.`)
      return
    }
    setInFlight(c => c + 1)
    setMessage(`⏳ ${label} started — running in background. Queue refreshes as jobs complete.`)
    ;(async () => {
      try {
        const result = await runner()
        setMessage(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`)
      } catch (err) {
        setMessage(`✗ ${err instanceof Error ? err.message : 'job failed'}`)
      } finally {
        setInFlight(c => c - 1)
        load()
      }
    })()
  }

  function handleGenerate() {
    // Capture current settings so they can change while the job runs.
    const isCardAlbum = genType === 'album' && genPillar.startsWith('card:')

    if (isCardAlbum) {
      const template = genPillar.slice(5)
      const slides = Math.max(3, genCount)
      startJob(`${template} album (${slides} slides)`, async () => {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/admin/content/api/generate-card-album', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ template, count: slides }),
        })
        const resp = await res.json().catch(() => ({}))
        if (!res.ok || !resp.ok) {
          return { ok: false, message: resp.error || `Generator failed (${res.status})` }
        }
        const skipped = (resp.skipped || []).length
        return {
          ok: true,
          message: `${template} album · ${resp.slide_count} slides${skipped ? ` · ${skipped} skipped at validation` : ''}`,
        }
      })
      return
    }

    // Regular Claude album / single flow
    const count = genCount
    const type = genType
    const pillar = genPillar
    startJob(`${type} (count=${count})`, async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const body: Record<string, unknown> = { count, type }
      if (pillar) body.overrides = { pillar_slug: pillar }
      const res = await fetch('/admin/content/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(body),
      })
      const resp = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, message: resp.error || 'Generator failed' }
      }
      if (resp.generated === 0) {
        return { ok: false, message: `0 drafts created · ${resp.failed} failed` }
      }
      return {
        ok: true,
        message: `${resp.generated} draft${resp.generated !== 1 ? 's' : ''} created${resp.failed ? ` · ${resp.failed} failed` : ''}`,
      }
    })
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
            <select
              value={genPillar}
              onChange={e => {
                const v = e.target.value
                setGenPillar(v)
                // Card-album mode wants 5 slides as the sweet spot. If the
                // count is still at the regular-album default (1-2), bump it
                // up so the user doesn't get the bare minimum 3 by accident.
                if (v.startsWith('card:') && genCount < 5) setGenCount(5)
                // Reverting to a regular album: cap to 5 (Claude flow's max).
                if (!v.startsWith('card:') && genCount > 5) setGenCount(5)
              }}
              style={{
                padding: '7px 10px', fontSize: 13, border: '1px solid #E2E8F0',
                borderRadius: 5, color: NAVY, background: '#fff',
              }}
            >
              {ALBUM_PILLARS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          )}

          {(() => {
            const isCardAlbum = genType === 'album' && genPillar.startsWith('card:')
            const minCount = isCardAlbum ? 3 : 1
            const maxCount = isCardAlbum ? 10 : 5
            const atCap = inFlight >= MAX_CONCURRENT_JOBS
            return (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>
                    {isCardAlbum ? 'Slides' : 'Count'}
                  </label>
                  <input type="number" min={minCount} max={maxCount} value={genCount}
                    onChange={e => setGenCount(Math.min(Math.max(parseInt(e.target.value) || minCount, minCount), maxCount))}
                    style={{ width: 52, padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: 4, fontSize: 13 }}
                  />
                  <button onClick={handleGenerate} disabled={atCap} style={{
                    flex: 1, padding: '8px 14px', fontSize: 13, fontWeight: 700,
                    background: atCap ? '#94A3B8' : TEAL, color: '#fff',
                    border: 'none', borderRadius: 5, cursor: atCap ? 'not-allowed' : 'pointer',
                  }}>
                    {inFlight === 0
                      ? 'Generate'
                      : atCap
                        ? `${inFlight}/${MAX_CONCURRENT_JOBS} running — wait`
                        : `+ Add (${inFlight} running)`}
                  </button>
                </div>
                {isCardAlbum && (
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: -4 }}>
                    {minCount}–{maxCount} slides per album. 5–7 is the sweet spot for swipeable carousels.
                  </div>
                )}
              </>
            )
          })()}

          {/* Manual card builder — for one-off cards where you want to control the
              exact term/icon/text. Auto-album generation lives in the dropdown above. */}
          <Link href="/admin/content/card-builder" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '6px 12px', marginTop: 2,
            fontSize: 11, fontWeight: 600,
            background: 'transparent', color: '#6B7280',
            border: 'none', borderRadius: 5,
            textDecoration: 'none',
          }}>
            🃏 Or build one card manually →
          </Link>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 6, fontSize: 14,
          background: message.startsWith('✓') ? '#E8FAF6' : message.startsWith('✗') ? '#fdecea' : '#FEF7E0',
          color: message.startsWith('✓') ? '#065F46' : message.startsWith('✗') ? '#B91C1C' : '#92400E',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span>{message}</span>
          {inFlight > 0 && (
            <span style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 800,
              background: '#1B3252', color: '#fff', borderRadius: 12,
              whiteSpace: 'nowrap', letterSpacing: 0.5,
            }}>
              ⏳ {inFlight} in queue
            </span>
          )}
        </div>
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
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopy(p) }}
                          style={{
                            fontSize: 11, fontWeight: 700,
                            padding: '4px 10px',
                            border: copiedId === p.id ? `1px solid ${TEAL}` : '1px solid #E2E8F0',
                            borderRadius: 5,
                            background: copiedId === p.id ? '#E8FAF6' : (p.status === 'approved' ? TEAL : '#fff'),
                            color: copiedId === p.id ? '#065F46' : (p.status === 'approved' ? '#fff' : NAVY),
                            cursor: 'pointer',
                          }}
                          title="Copy caption + hashtags to clipboard"
                        >
                          {copiedId === p.id ? '✓ Copied' : '📋 Copy caption'}
                        </button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleTranslate(p.id) }}
                          disabled={translatingIds.has(p.id)}
                          style={{
                            fontSize: 11, fontWeight: 600,
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
                      </div>
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
