'use client'

// Card builder — form for creating a template-based card post.
// V1 ships with the Glossary template only. Adding a template later is:
//   1. drop a new entry into TEMPLATES below
//   2. (already done server-side) add the template render fn to scripts/.../card-templates/

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const NAVY = '#1B3252'
const TEAL = '#34C3A0'

type Asset = {
  slug: string
  title: string
  style: 'woodcut' | 'linebase'
  pillar_tags?: string[]
}

type FieldDef = {
  key: string
  label: string
  required: boolean
  max?: number
  multiline?: boolean
  placeholder?: string
}

type Template = {
  slug: string
  label: string
  description: string
  fields: FieldDef[]
}

const TEMPLATES: Template[] = [
  {
    slug: 'glossary',
    label: 'Glossary card',
    description: 'Define one school term — EN + TH + plain-language definition + icon.',
    fields: [
      { key: 'term_en',    label: 'Term (English)', required: true,  max: 60,  placeholder: 'IB Diploma' },
      { key: 'term_th',    label: 'Term (Thai)',    required: false, max: 60,  placeholder: 'ประกาศนียบัตรไอบี' },
      { key: 'definition', label: 'Definition',     required: true,  max: 240, multiline: true, placeholder: 'A 2-year pre-university programme. Students take 6 subjects, write a 4,000-word essay…' },
      { key: 'counter',    label: 'Series counter (optional)', required: false, max: 20, placeholder: '04 of 50' },
    ],
  },
]

export default function CardBuilderPage() {
  const router = useRouter()
  const [templateSlug, setTemplateSlug] = useState<string>('glossary')
  const [data, setData] = useState<Record<string, string>>({})
  const [iconSlug, setIconSlug] = useState<string>('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [iconSearch, setIconSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string>('')
  // Auto-generate (Claude plans + builds N cards in one click)
  const [autoCount, setAutoCount] = useState(5)
  const [autoRunning, setAutoRunning] = useState(false)
  const [autoResult, setAutoResult] = useState<{ success: number; failed: number; total: number } | null>(null)

  const template = TEMPLATES.find(t => t.slug === templateSlug) || TEMPLATES[0]

  // Load asset library once for the icon picker.
  useEffect(() => {
    fetch('/asset-library/manifest.json')
      .then(r => r.json())
      .then(m => {
        const sorted: Asset[] = [...(m.assets || [])].sort((a, b) =>
          a.style !== b.style ? (a.style < b.style ? -1 : 1) : (a.slug < b.slug ? -1 : 1)
        )
        setAssets(sorted)
      })
      .catch(() => setMessage('✗ Could not load asset library. Run `node scripts/build-asset-preview.js`.'))
  }, [])

  const filteredAssets = useMemo(() => {
    const q = iconSearch.trim().toLowerCase()
    if (!q) return assets
    return assets.filter(a => `${a.slug} ${a.title}`.toLowerCase().includes(q))
  }, [assets, iconSearch])

  const selectedAsset = assets.find(a => a.slug === iconSlug)

  async function handleAutoGenerate() {
    setAutoRunning(true)
    setAutoResult(null)
    setMessage(`Auto-generating ${autoCount} cards… Claude is planning terms + definitions (~30-60s).`)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/admin/content/api/auto-generate-glossary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ count: autoCount }),
      })
      const resp = await res.json().catch(() => ({}))
      if (!res.ok || !resp.ok) {
        setMessage(`✗ ${resp.error || `Auto-generate failed (${res.status})`}`)
        return
      }
      setAutoResult({ success: resp.success, failed: resp.failed, total: resp.total })
      if (resp.success > 0) {
        setMessage(`✓ ${resp.success} card${resp.success !== 1 ? 's' : ''} created.${resp.failed ? ` ${resp.failed} skipped at validation.` : ''} Open the queue to review.`)
      } else {
        setMessage(`✗ All ${resp.total} cards failed validation. See details below.`)
      }
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : 'Auto-generate failed'}`)
    } finally {
      setAutoRunning(false)
    }
  }

  async function handleSubmit() {
    // Client-side validation matching the server
    if (!iconSlug) { setMessage('✗ Pick an icon before generating.'); return }
    for (const f of template.fields) {
      const v = (data[f.key] || '').trim()
      if (f.required && !v) { setMessage(`✗ ${f.label} is required.`); return }
      if (f.max && v.length > f.max) { setMessage(`✗ ${f.label} is too long (max ${f.max}).`); return }
    }

    setSubmitting(true)
    setMessage('Generating card… (~5s)')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const card_data: Record<string, string> = { ...data, icon_slug: iconSlug }
      const res = await fetch('/admin/content/api/generate-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ template_slug: templateSlug, card_data }),
      })
      const resp = await res.json().catch(() => ({}))
      if (!res.ok || !resp.ok) {
        setMessage(`✗ ${resp.error || `Generation failed (${res.status})`}`)
        return
      }
      setMessage(`✓ Card created. Opening detail page…`)
      // Hand off to the detail page so the user can review/approve.
      setTimeout(() => router.push(`/admin/content/${resp.post_id}`), 600)
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : 'Generation failed'}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <Link href="/admin/content" style={{ color: NAVY, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Back to queue</Link>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>Build a card</h1>
      <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 24px' }}>
        Two ways to make cards: let Claude plan + build a batch automatically, or fill the form below for one specific card.
      </p>

      {/* ── Auto-generate panel ── */}
      <div style={{
        background: 'linear-gradient(135deg, #239C80 0%, #34C3A0 100%)',
        color: '#fff',
        padding: 20,
        borderRadius: 10,
        marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>✨ Auto-generate glossary cards</div>
          <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.5 }}>
            Claude picks fresh school terms (avoiding ones you&apos;ve posted recently), writes the EN definition + Thai translation, and matches each to an icon. ~1 min for 5 cards.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Count</label>
          <input
            type="number" min={1} max={10} value={autoCount}
            onChange={e => setAutoCount(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 10))}
            disabled={autoRunning}
            style={{ width: 56, padding: '6px 8px', fontSize: 13, fontWeight: 700, color: NAVY, background: '#fff', border: 'none', borderRadius: 5 }}
          />
          <button onClick={handleAutoGenerate} disabled={autoRunning} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 800,
            background: '#fff', color: NAVY,
            border: 'none', borderRadius: 5,
            cursor: autoRunning ? 'wait' : 'pointer',
            opacity: autoRunning ? 0.7 : 1,
          }}>
            {autoRunning ? '⏳ Planning…' : '✨ Auto-generate'}
          </button>
        </div>
      </div>

      {autoResult && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 20,
          background: autoResult.success > 0 ? '#E8FAF6' : '#fdecea',
          color: autoResult.success > 0 ? '#065F46' : '#B91C1C',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span>
            {autoResult.success > 0 ? '✓' : '✗'} {autoResult.success}/{autoResult.total} cards generated
            {autoResult.failed > 0 && ` · ${autoResult.failed} skipped`}
          </span>
          <Link href="/admin/content" style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>
            Open queue →
          </Link>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}>
          Or build one card manually
        </span>
        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 480px) 1fr', gap: 32 }}>

        {/* ── Form column ── */}
        <div>
          {/* Template picker */}
          <div style={section}>
            <Label>Template</Label>
            <select value={templateSlug} onChange={e => setTemplateSlug(e.target.value)} style={inputStyle}>
              {TEMPLATES.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}
            </select>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>{template.description}</div>
          </div>

          {/* Icon picker */}
          <div style={section}>
            <Label>Icon</Label>
            {selectedAsset ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/asset-library/${selectedAsset.style}/${selectedAsset.slug}.svg`} alt="" style={{ width: 56, height: 56, padding: 6, background: '#F9FAFB', border: '1px solid #E2E8F0', borderRadius: 6 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{selectedAsset.title}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', font: '600 11px ui-monospace, SF Mono, Menlo, monospace' }}>{selectedAsset.slug}</div>
                </div>
                <button onClick={() => setIconPickerOpen(!iconPickerOpen)} style={secondaryBtn}>
                  {iconPickerOpen ? 'Close' : 'Change'}
                </button>
              </div>
            ) : (
              <button onClick={() => setIconPickerOpen(!iconPickerOpen)} style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', color: '#94A3B8' }}>
                {iconPickerOpen ? 'Pick an icon below…' : '+ Choose an icon'}
              </button>
            )}

            {iconPickerOpen && (
              <div style={{ marginTop: 10, border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
                <input
                  type="text"
                  placeholder={`Search ${assets.length} icons by slug or title…`}
                  value={iconSearch}
                  onChange={e => setIconSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: 'none', borderBottom: '1px solid #E2E8F0', fontSize: 13, color: NAVY, outline: 'none' }}
                />
                <div style={{ maxHeight: 320, overflowY: 'auto', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {filteredAssets.map(a => (
                    <button
                      key={a.slug}
                      title={`${a.title} · ${a.slug}`}
                      onClick={() => { setIconSlug(a.slug); setIconPickerOpen(false); setIconSearch('') }}
                      style={{
                        aspectRatio: '1/1', padding: 6, background: '#F9FAFB',
                        border: iconSlug === a.slug ? `2px solid ${TEAL}` : '1px solid #E2E8F0',
                        borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/asset-library/${a.style}/${a.slug}.svg`} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                    </button>
                  ))}
                  {filteredAssets.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                      No icons match.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Field inputs */}
          {template.fields.map(f => (
            <div key={f.key} style={section}>
              <Label>{f.label}{f.required && <span style={{ color: '#B91C1C', marginLeft: 4 }}>*</span>}</Label>
              {f.multiline ? (
                <textarea
                  value={data[f.key] || ''}
                  onChange={e => setData({ ...data, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  rows={3}
                  style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                  maxLength={f.max}
                />
              ) : (
                <input
                  type="text"
                  value={data[f.key] || ''}
                  onChange={e => setData({ ...data, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  style={inputStyle}
                  maxLength={f.max}
                />
              )}
              {f.max && (
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, textAlign: 'right' }}>
                  {(data[f.key] || '').length} / {f.max}
                </div>
              )}
            </div>
          ))}

          <button onClick={handleSubmit} disabled={submitting} style={{
            width: '100%', padding: '12px 18px', marginTop: 8,
            fontSize: 14, fontWeight: 800,
            background: submitting ? '#94A3B8' : TEAL, color: '#fff',
            border: 'none', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer',
          }}>
            {submitting ? 'Generating…' : '✨ Generate card'}
          </button>

          {message && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 6, fontSize: 13,
              background: message.startsWith('✓') ? '#E8FAF6' : message.startsWith('✗') ? '#fdecea' : '#FEF7E0',
              color: message.startsWith('✓') ? '#065F46' : message.startsWith('✗') ? '#B91C1C' : '#92400E',
            }}>{message}</div>
          )}
        </div>

        {/* ── Live preview column ── */}
        <div>
          <div style={{ position: 'sticky', top: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Live preview
            </div>
            <CardPreview templateSlug={templateSlug} cardData={{ ...data, icon_slug: iconSlug }} />
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8, textAlign: 'center' }}>
              Final post will be rendered at 1080×1080 (this preview is 540×540 unscaled).
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// Live preview — re-renders the same layout as the server template.
// Kept intentionally close to the server-side glossary.js so the preview
// matches what gets rendered. (If divergence becomes a problem, we can
// later have the server return the HTML and iframe it — but X-Frame-Options
// makes that awkward, hence this duplication.)
function CardPreview({ templateSlug, cardData }: { templateSlug: string; cardData: Record<string, string> }) {
  if (templateSlug !== 'glossary') return null
  const { term_en, term_th, definition, icon_slug, counter } = cardData
  const chip = counter ? `Glossary · ${counter}` : 'Glossary'
  const iconStyle = icon_slug?.startsWith('woodcut-') ? 'woodcut' : icon_slug?.startsWith('linebase-') ? 'linebase' : null
  return (
    <div style={{
      width: 540, height: 540,
      background: '#FAF7F0',
      padding: 32,
      display: 'flex', flexDirection: 'column',
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 12px 28px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06)',
      fontFamily: 'Nunito Sans, -apple-system, sans-serif',
      color: NAVY,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          background: NAVY, color: '#fff',
          font: '700 11px Nunito Sans', padding: '5px 12px', borderRadius: 12,
          letterSpacing: 0.6, textTransform: 'uppercase',
        }}>{chip}</div>
        <div style={{ font: '900 20px Nunito', letterSpacing: -0.3 }}>
          <span style={{ color: NAVY }}>Nana</span><span style={{ color: TEAL }}>Says</span>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '12px 0' }}>
        {iconStyle ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/asset-library/${iconStyle}/${icon_slug}.svg`} alt="" style={{ width: 200, height: 200 }} />
        ) : (
          <div style={{ width: 200, height: 200, background: '#F1F5F9', border: '2px dashed #CBD5E1', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 13 }}>
            Pick an icon
          </div>
        )}
      </div>
      <div>
        <div style={{ font: '900 60px/1 Nunito', color: NAVY, letterSpacing: -1.8 }}>
          {term_en || 'Term name'}
        </div>
        {term_th && (
          <div style={{ font: '700 22px/1.2 Nunito', color: '#239C80', margin: '8px 0 16px' }}>
            {term_th}
          </div>
        )}
        <div style={{ fontSize: 17, lineHeight: 1.5, color: '#334155', borderTop: `2px solid ${TEAL}`, paddingTop: 14, marginTop: term_th ? 0 : 16 }}>
          {definition || 'Definition appears here.'}
        </div>
      </div>
    </div>
  )
}

const section: React.CSSProperties = { marginBottom: 16 }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: '1px solid #E2E8F0', borderRadius: 6,
  fontSize: 14, color: NAVY, background: '#fff',
  outline: 'none',
}
const secondaryBtn: React.CSSProperties = {
  padding: '6px 12px', fontSize: 12, fontWeight: 700,
  background: '#fff', color: NAVY, border: '1px solid #E2E8F0',
  borderRadius: 5, cursor: 'pointer',
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{children}</div>
}
