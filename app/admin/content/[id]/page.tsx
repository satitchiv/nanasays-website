'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const NAVY = '#1B3252'
const TEAL = '#34C3A0'

type Post = {
  id: string
  status: string
  post_type: string | null
  slide_count: number | null
  copy_en: string | null
  copy_th: string | null
  copy_th_generated_at: string | null
  copy_th_model: string | null
  hashtags: string[] | null
  image_url: string | null
  image_urls: string[] | null
  image_alt_en: string | null
  channel_slug: string | null
  link_url: string | null
  pick_reasons: Record<string, string> | null
  source_data: Record<string, unknown> | null
  generator_model: string | null
  generator_backend: string | null
  requires_branded_content_disclosure: boolean
  created_at: string
  social_pillars: { slug: string; name_en: string } | null
  schools: { id: string; name: string; slug: string; verified_at: string | null; is_partner: boolean | null } | null
}

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string>('')
  const [slideIndex, setSlideIndex] = useState(0)
  const [showReasons, setShowReasons] = useState(false)
  const [showSource, setShowSource] = useState(false)
  // Local drafts for the caption editor. Initialised from the post on load
  // and synced back on save. Dirty = draft !== saved; Save button only
  // appears when something has actually changed.
  const [draftEn, setDraftEn] = useState('')
  const [draftTh, setDraftTh] = useState('')
  const [savingCaption, setSavingCaption] = useState(false)
  const [translating, setTranslating] = useState(false)
  // Two regenerate modes: short (punchy) and long (3-5 paragraph).
  // We track both separately so spinners are accurate per button.
  const [regenerating, setRegenerating] = useState<null | 'short' | 'long'>(null)

  async function load() {
    const { data } = await supabase
      .from('social_posts')
      .select(`
        id, status, post_type, slide_count, copy_en, copy_th, copy_th_generated_at, copy_th_model, hashtags,
        image_url, image_urls, image_alt_en, channel_slug, link_url,
        pick_reasons, source_data, generator_model, generator_backend,
        requires_branded_content_disclosure, created_at,
        social_pillars(slug, name_en),
        schools(id, name, slug, verified_at, is_partner)
      `)
      .eq('id', id)
      .single()
    const p = data as unknown as Post
    setPost(p)
    setDraftEn(p?.copy_en || '')
    setDraftTh(p?.copy_th || '')
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  async function act(action: 'approve' | 'reject' | 'edit') {
    if ((action === 'reject' || action === 'edit') && !note.trim()) {
      setMessage('✗ Please enter a note explaining why.')
      return
    }
    setWorking(true)
    setMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/admin/content/api/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ post_id: id, note: note.trim() || null }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `${action} failed`)
      setMessage(`✓ ${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Edit requested'}`)
      await load()
      setNote('')
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : 'failed'}`)
    } finally {
      setWorking(false)
    }
  }

  async function downloadBlob(url: string, filename: string) {
    const proxyUrl = `/api/download-image?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
    const a = document.createElement('a')
    a.href = proxyUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function downloadAllAsZip(urls: string[]) {
    const res = await fetch('/api/download-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, filename: 'nanasays-social' }),
    })
    if (!res.ok) { setMessage('ZIP download failed'); return }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'nanasays-social.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  }

  async function copyCaption() {
    if (!post) return
    // Build the full clipboard payload: EN caption + TH caption (if present)
    // + hashtags. Each caption gets the website signature stamped on it if
    // not already there (handles legacy posts produced before the signature
    // was added to the generators).
    const en = appendWebsiteSignature(post.copy_en || '')
    const th = appendWebsiteSignature(post.copy_th || '')
    const tags = (post.hashtags || []).map(h => `#${h}`).join(' ')
    const text = [en, th, tags].filter(s => s && s.trim()).join('\n\n')
    if (!text.trim()) {
      setMessage('✗ Nothing to copy — this post has no caption yet.')
      return
    }
    try {
      await copyTextToClipboard(text)
      const parts = []
      if (en) parts.push('EN')
      if (th) parts.push('TH')
      if (tags) parts.push('hashtags')
      setMessage(`✓ Copied ${parts.join(' + ')} to clipboard`)
    } catch (err) {
      setMessage(`✗ Copy failed — ${err instanceof Error ? err.message : 'clipboard unavailable'}`)
    }
  }

  // Mirrors scripts/social-media-planner/caption-signature.js. Stamps the
  // website URL at the bottom if not already present — covers legacy posts.
  function appendWebsiteSignature(text: string): string {
    if (!text || !text.trim()) return text
    if (/nanasays\.school/i.test(text)) return text
    return `${text.trim()}\n\nWebsite: nanasays.school`
  }

  async function saveCaption() {
    if (!post) return
    const body: Record<string, string> = {}
    if (draftEn !== (post.copy_en || '')) body.copy_en = draftEn
    if (draftTh !== (post.copy_th || '')) body.copy_th = draftTh
    if (!Object.keys(body).length) return
    setSavingCaption(true)
    setMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/admin/content/api/post/${id}/caption`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(body),
      })
      const resp = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(resp.error || 'Save failed')
      setMessage('✓ Caption saved')
      await load()
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSavingCaption(false)
    }
  }

  // Regenerate copy_en via Claude. Two modes:
  //   short — punchy 200-400 char rewrite (default)
  //   long  — 3-5 paragraph 600-1200 char editorial version
  // Server reads the saved copy_en + post context and rewrites in NanaSays
  // voice. If the user has unsaved EN edits we ask them to save first so
  // Claude has the right starting point — same nudge as Regenerate Thai.
  async function handleRegenerateEn(length: 'short' | 'long') {
    if (!post) return
    if (draftEn !== (post.copy_en || '')) {
      setMessage('✗ Save your English edit first, then regenerate.')
      return
    }
    setRegenerating(length)
    setMessage(`Regenerating ${length === 'long' ? 'long' : 'short'} caption… (~15s)`)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/admin/content/api/post/${id}/regenerate-caption`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ length }),
      })
      const resp = await res.json().catch(() => ({}))
      if (!res.ok || !resp.ok) throw new Error(resp.error || `Regenerate failed (${res.status})`)
      setDraftEn(resp.copy_en)
      setMessage(`✓ ${length === 'long' ? 'Long' : 'Short'} English caption generated. Thai caption is now stale — regenerate it if you want them in sync.`)
      await load()
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : 'Regenerate failed'}`)
    } finally {
      setRegenerating(null)
    }
  }

  // Translate regenerates copy_th from whatever copy_en is saved in the DB.
  // If the reviewer has edited copy_en without saving, we nudge them to
  // save first so the translation matches the on-screen English.
  async function handleTranslate() {
    if (!post) return
    if (draftEn !== (post.copy_en || '')) {
      setMessage('✗ Save your English edit first, then translate.')
      return
    }
    setTranslating(true)
    setMessage('Translating… (~10s)')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/admin/content/api/post/${id}/translate-caption`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const resp = await res.json().catch(() => ({}))
      if (!res.ok || !resp.ok) throw new Error(resp.error || `Translation failed (${res.status})`)
      setDraftTh(resp.copy_th)
      setMessage('✓ Thai caption generated')
      await load()
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : 'Translation failed'}`)
    } finally {
      setTranslating(false)
    }
  }

  if (loading) return <div style={{ padding: 40, color: '#6B7280' }}>Loading…</div>
  if (!post) return <div style={{ padding: 40, color: '#B91C1C' }}>Post not found.</div>

  const isActionable = post.status === 'pending_review' || post.status === 'edit_requested'
  const isAlbum = post.post_type === 'album'
  const slides: string[] = isAlbum && post.image_urls?.length ? post.image_urls : (post.image_url ? [post.image_url] : [])
  const verifiedAgeDays = post.schools?.verified_at
    ? Math.round((Date.now() - new Date(post.schools.verified_at).getTime()) / 86_400_000)
    : null
  const dirty = draftEn !== (post.copy_en || '') || draftTh !== (post.copy_th || '')

  return (
    <div>
      <Link href="/admin/content" style={{ color: NAVY, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
        ← Back to queue
      </Link>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 560px) 1fr', gap: 32, marginTop: 16 }}>

        {/* ── Image / slides column ── */}
        <div>
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            {slides.length > 0 ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slides[slideIndex]}
                  alt={post.image_alt_en || ''}
                  style={{ width: '100%', display: 'block' }}
                />
                {/* Slide navigator for albums */}
                {isAlbum && slides.length > 1 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '12px 16px', borderTop: '1px solid #E2E8F0',
                  }}>
                    <button onClick={() => setSlideIndex(i => Math.max(0, i - 1))} disabled={slideIndex === 0}
                      style={navBtn(slideIndex === 0)}>‹ Prev</button>
                    <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>
                      {slideIndex + 1} / {slides.length}
                    </span>
                    <button onClick={() => setSlideIndex(i => Math.min(slides.length - 1, i + 1))} disabled={slideIndex === slides.length - 1}
                      style={navBtn(slideIndex === slides.length - 1)}>Next ›</button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>
                No image rendered yet.
              </div>
            )}
          </div>

          {/* Slide strip for albums */}
          {isAlbum && slides.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {slides.map((url, i) => (
                <button key={i} onClick={() => setSlideIndex(i)} style={{
                  flex: '0 0 64px', height: 64, padding: 0, border: 'none',
                  outline: slideIndex === i ? `3px solid ${TEAL}` : '2px solid #E2E8F0',
                  borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: 'none',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Slide ${i + 1}`} style={{ width: 64, height: 64, objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {slides.length > 0 && (
              <button onClick={() => downloadBlob(slides[slideIndex], `slide-${String(slideIndex + 1).padStart(2, '0')}.png`)}
                style={{ ...downloadBtn, cursor: 'pointer' }}>
                ↓ Download {isAlbum ? `Slide ${slideIndex + 1}` : 'PNG'}
              </button>
            )}
            {isAlbum && slides.length > 1 && (
              <button
                onClick={() => downloadAllAsZip(slides)}
                style={{ ...downloadBtn, cursor: 'pointer' }}
              >
                ↓ Download all {slides.length} slides (ZIP)
              </button>
            )}
            <button onClick={copyCaption} style={{ ...downloadBtn, cursor: 'pointer' }}>
              ⎘ Copy caption
            </button>
          </div>
        </div>

        {/* ── Content column ── */}
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <StatusPill status={post.status} />
            {isAlbum && <Chip text={`📚 ${post.slide_count || slides.length} slides`} color='#E0E7FF' fg='#3730A3' />}
            {post.social_pillars && <Chip text={post.social_pillars.name_en} />}
            {post.channel_slug && <Chip text={post.channel_slug.replace(/_/g, ' ')} muted />}
            {post.generator_backend && <Chip text={`via ${post.generator_backend}`} muted />}
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: NAVY }}>
            {post.schools?.name || post.social_pillars?.name_en || '(no school)'}
          </h1>
          {post.schools && (
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
              <a href={`/schools/${post.schools.slug}`} target="_blank" style={{ color: '#3730A3' }}>View school page →</a>
              {verifiedAgeDays !== null && (
                <> · <span style={{ color: verifiedAgeDays > 180 ? '#B91C1C' : verifiedAgeDays > 90 ? '#92400E' : '#065F46' }}>
                  data verified {verifiedAgeDays} day{verifiedAgeDays !== 1 ? 's' : ''} ago
                </span></>
              )}
            </div>
          )}

          {post.requires_branded_content_disclosure && (
            <div style={{ padding: '10px 14px', background: '#FEF7E0', color: '#92400E', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
              ⚠ This school is a paid partner. Add Meta's Branded Content tag when posting.
            </div>
          )}

          <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0', marginBottom: 16 }}>
            {/* English caption — editable */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: '#6B7280' }}>CAPTION · ENGLISH</span>
              {dirty && (
                <button onClick={saveCaption} disabled={savingCaption} style={{
                  padding: '4px 12px', fontSize: 11, fontWeight: 700,
                  background: savingCaption ? '#94A3B8' : TEAL, color: '#fff',
                  border: 'none', borderRadius: 5, cursor: savingCaption ? 'not-allowed' : 'pointer',
                }}>{savingCaption ? 'Saving…' : '✓ Save changes'}</button>
              )}
            </div>
            <textarea
              value={draftEn}
              onChange={e => setDraftEn(e.target.value)}
              rows={Math.max(4, Math.min(14, draftEn.split('\n').length + 1))}
              style={{
                width: '100%', padding: 10, border: '1px solid #E2E8F0', borderRadius: 6,
                fontSize: 14, lineHeight: 1.6, color: '#1F2937', fontFamily: 'inherit',
                resize: 'vertical', boxSizing: 'border-box',
                background: draftEn !== (post.copy_en || '') ? '#FFFBEB' : '#fff',
              }}
            />
            {/* Regenerate EN row — short or long mode, both call Claude. */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => handleRegenerateEn('short')}
                disabled={!!regenerating || !draftEn.trim()}
                title="Rewrite the English caption in NanaSays voice — punchy, 200-400 chars."
                style={regenButtonStyle(regenerating === 'short')}
              >
                {regenerating === 'short' ? '⏳ Regenerating…' : '🔄 Regenerate EN'}
              </button>
              <button
                onClick={() => handleRegenerateEn('long')}
                disabled={!!regenerating || !draftEn.trim()}
                title="Rewrite as a long editorial caption (3-5 paragraphs, 600-1200 chars)."
                style={regenButtonStyle(regenerating === 'long')}
              >
                {regenerating === 'long' ? '⏳ Writing long version…' : '📝 Long version'}
              </button>
              <span style={{ fontSize: 11, color: '#94A3B8', alignSelf: 'center', marginLeft: 'auto' }}>
                {draftEn.length} chars
              </span>
            </div>
            {post.hashtags?.length ? (
              <div style={{ marginTop: 12, fontSize: 13, color: '#3730A3' }}>
                {post.hashtags.map(h => `#${h}`).join(' ')}
              </div>
            ) : null}

            {/* Thai caption — editable + on-demand generator */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: '#6B7280' }}>CAPTION · THAI</span>
                  {post.copy_th_generated_at && (
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>
                      translated {relativeTime(post.copy_th_generated_at)}
                      {post.copy_th_model ? ` · ${post.copy_th_model}` : ''}
                    </span>
                  )}
                </div>
                <button onClick={handleTranslate} disabled={translating || !post.copy_en} style={{
                  padding: '4px 12px', fontSize: 11, fontWeight: 600,
                  background: translating ? '#F3F4F6' : '#fff',
                  color: translating ? '#94A3B8' : '#4338CA',
                  border: '1px solid #E2E8F0', borderRadius: 5,
                  cursor: (translating || !post.copy_en) ? 'not-allowed' : 'pointer',
                }}>
                  {translating ? '⏳ Translating…' : post.copy_th ? '🔄 Regenerate Thai' : '🇹🇭 Generate Thai'}
                </button>
              </div>
              {draftTh ? (
                <textarea
                  value={draftTh}
                  onChange={e => setDraftTh(e.target.value)}
                  rows={Math.max(4, Math.min(14, draftTh.split('\n').length + 1))}
                  style={{
                    width: '100%', padding: 10, border: '1px solid #E2E8F0', borderRadius: 6,
                    fontSize: 14, lineHeight: 1.6, color: '#1F2937', fontFamily: 'inherit',
                    resize: 'vertical', boxSizing: 'border-box',
                    background: draftTh !== (post.copy_th || '') ? '#FFFBEB' : '#fff',
                  }}
                />
              ) : (
                <div style={{ padding: '12px 10px', fontSize: 13, color: '#94A3B8', fontStyle: 'italic', background: '#F9FAFB', borderRadius: 6 }}>
                  No Thai translation yet. Click &quot;Generate Thai&quot; to create one.
                </div>
              )}
            </div>
          </div>

          <Collapsible title="Why these picks?" open={showReasons} onToggle={() => setShowReasons(!showReasons)}>
            {post.pick_reasons && Object.entries(post.pick_reasons).map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, color: '#4B5563', marginBottom: 6 }}>
                <strong style={{ color: NAVY }}>{k}:</strong> {v}
              </div>
            ))}
          </Collapsible>

          <Collapsible title="Raw source data (audit)" open={showSource} onToggle={() => setShowSource(!showSource)}>
            <pre style={{ fontSize: 11, background: '#F9FAFB', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 320, color: '#374151', margin: 0 }}>
              {JSON.stringify(post.source_data, null, 2)}
            </pre>
          </Collapsible>

          {/* Review actions */}
          {isActionable ? (
            <div style={{ marginTop: 24, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Review</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Note (required for Reject / Request edit)"
                rows={3}
                style={{ width: '100%', padding: 10, border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => act('approve')} disabled={working} style={btnStyle(TEAL, working)}>✓ Approve</button>
                <button onClick={() => act('edit')} disabled={working} style={btnStyle('#5B21B6', working)}>↻ Request edit</button>
                <button onClick={() => act('reject')} disabled={working} style={btnStyle('#B91C1C', working)}>✕ Reject</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 24, padding: 14, background: '#F9FAFB', borderRadius: 8, fontSize: 13, color: '#6B7280' }}>
              Post is <strong>{post.status}</strong>. No actions available.
            </div>
          )}

          {message && (
            <div style={{
              marginTop: 16, padding: '10px 14px', borderRadius: 6, fontSize: 13,
              background: message.startsWith('✓') ? '#E8FAF6' : '#fdecea',
              color: message.startsWith('✓') ? '#065F46' : '#B91C1C',
            }}>{message}</div>
          )}
        </div>
      </div>
    </div>
  )
}

const downloadBtn: React.CSSProperties = {
  flex: 1, textAlign: 'center', padding: '10px 14px',
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6,
  color: NAVY, fontSize: 13, fontWeight: 600,
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 14px', fontSize: 13, fontWeight: 700,
    background: disabled ? '#F3F4F6' : NAVY, color: disabled ? '#9CA3AF' : '#fff',
    border: 'none', borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

function Collapsible({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <button onClick={onToggle} style={{ background: 'none', border: 'none', padding: '8px 0', fontSize: 12, fontWeight: 600, color: '#6B7280', cursor: 'pointer', textAlign: 'left' }}>
        {open ? '▼' : '▶'} {title}
      </button>
      {open && <div style={{ paddingLeft: 14 }}>{children}</div>}
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
  return <span style={{ display: 'inline-block', padding: '3px 10px', fontSize: 11, fontWeight: 600, background: s.bg, color: s.fg, borderRadius: 12 }}>{s.label}</span>
}

function Chip({ text, muted, color, fg }: { text: string; muted?: boolean; color?: string; fg?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', fontSize: 11, fontWeight: 600,
      background: color || (muted ? '#F3F4F6' : '#E0E7FF'),
      color: fg || (muted ? '#6B7280' : '#3730A3'),
      borderRadius: 12, textTransform: 'capitalize',
    }}>{text}</span>
  )
}

function btnStyle(bg: string, disabled: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '10px 14px',
    background: disabled ? '#94A3B8' : bg, color: '#fff',
    border: 'none', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 700,
  }
}

// Clipboard with fallback. The modern `navigator.clipboard` API requires a
// secure context (HTTPS or localhost). Our dev share is a plain-HTTP
// Tailscale IP (`http://100.100.120.57:3000`), where `navigator.clipboard`
// is undefined. The fallback uses a temp <textarea> + `document.execCommand('copy')`
// which still works on non-secure origins.
async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof window !== 'undefined' && window.navigator.clipboard?.writeText) {
    try {
      await window.navigator.clipboard.writeText(text)
      return
    } catch {
      // Some browsers throw even when the API is present (no permission etc).
      // Fall through to the legacy method.
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

function regenButtonStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 600, padding: '4px 10px',
    background: active ? '#F3F4F6' : '#fff',
    color: active ? '#94A3B8' : '#4338CA',
    border: '1px solid #E2E8F0', borderRadius: 5,
    cursor: active ? 'wait' : 'pointer',
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}
