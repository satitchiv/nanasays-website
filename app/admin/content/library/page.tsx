'use client'

// Library tab — browseable view of the 81-SVG asset library. Fetches
// /asset-library/manifest.json (emitted by scripts/build-asset-preview.js)
// and renders a filterable grid native-React. We render natively (not an
// iframe of the static preview) because Next.js ships X-Frame-Options: DENY,
// which blocks the iframe even on same-origin loads.
//
// To refresh after adding/editing SVGs:
//   node scripts/build-asset-preview.js

import { useEffect, useMemo, useState } from 'react'

const NAVY = '#1B3252'
const TEAL = '#34C3A0'

type Asset = {
  slug: string
  file: string
  title: string
  description: string
  style: 'woodcut' | 'linebase'
  kind: string
  pillar_tags: string[]
  injection_roles: string[]
  safety_flags?: { safe_for_school_specific_posts?: boolean }
}

type Manifest = { version: number; created: string; assets: Asset[] }

export default function LibraryPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [styleFilter, setStyleFilter] = useState<'all' | 'woodcut' | 'linebase'>('all')
  const [pillarFilter, setPillarFilter] = useState('all')
  const [safeFilter, setSafeFilter] = useState<'all' | 'safe' | 'generic'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/asset-library/manifest.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Manifest>
      })
      .then(data => {
        const sorted = [...(data.assets || [])].sort((a, b) => {
          if (a.style !== b.style) return a.style < b.style ? -1 : 1
          return a.slug < b.slug ? -1 : 1
        })
        setAssets(sorted)
        setLoading(false)
      })
      .catch(e => {
        setErr(e.message || 'Failed to load manifest. Run `node scripts/build-asset-preview.js`.')
        setLoading(false)
      })
  }, [])

  const allPillars = useMemo(
    () => [...new Set(assets.flatMap(a => a.pillar_tags || []).filter(t => t !== '*'))].sort(),
    [assets],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter(a => {
      if (styleFilter !== 'all' && a.style !== styleFilter) return false
      if (pillarFilter !== 'all') {
        const pillars = a.pillar_tags || []
        if (!pillars.includes(pillarFilter) && !pillars.includes('*')) return false
      }
      if (safeFilter !== 'all') {
        const safe = !!a.safety_flags?.safe_for_school_specific_posts
        if (safeFilter === 'safe' && !safe) return false
        if (safeFilter === 'generic' && safe) return false
      }
      if (q && !`${a.slug} ${a.title}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [assets, styleFilter, pillarFilter, safeFilter, search])

  const byStyle = useMemo(() => {
    return filtered.reduce<Record<string, Asset[]>>((acc, a) => {
      acc[a.style] = acc[a.style] || []
      acc[a.style].push(a)
      return acc
    }, {})
  }, [filtered])

  if (loading) {
    return <div style={{ padding: 40, color: '#6B7280' }}>Loading library…</div>
  }
  if (err) {
    return (
      <div style={{ padding: 24, background: '#fdecea', border: '1px solid #FCA5A5', borderRadius: 8, color: '#B91C1C' }}>
        <strong>Could not load asset library.</strong>
        <div style={{ marginTop: 6, fontSize: 13 }}>{err}</div>
        <div style={{ marginTop: 10, fontSize: 12, color: '#7F1D1D' }}>
          Run <code style={{ background: '#FEE2E2', padding: '1px 6px', borderRadius: 3 }}>node scripts/build-asset-preview.js</code> from the repo root, then refresh.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: 0 }}>Asset library</h1>
        <span style={{ fontSize: 13, color: '#6B7280' }}>{assets.length} SVGs · woodcut + linebase</span>
      </div>
      <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px', maxWidth: 720 }}>
        Brand-owned illustrations. Use as full-bleed backgrounds (18-30% opacity), corner ornaments, or hero objects on asset-first post types.
        School-safe assets are abstract enough to layer behind a named school&apos;s post; generic-only assets must stay on non-school content.
      </p>

      {/* Filter bar */}
      <div style={{
        background: '#fff', padding: '12px 16px', borderRadius: 8, border: '1px solid #E2E8F0',
        display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20,
      }}>
        <Field label="Style">
          <select value={styleFilter} onChange={e => setStyleFilter(e.target.value as 'all' | 'woodcut' | 'linebase')} style={selectStyle}>
            <option value="all">All ({assets.length})</option>
            <option value="woodcut">Woodcut ({assets.filter(a => a.style === 'woodcut').length})</option>
            <option value="linebase">Linebase ({assets.filter(a => a.style === 'linebase').length})</option>
          </select>
        </Field>
        <Field label="Pillar">
          <select value={pillarFilter} onChange={e => setPillarFilter(e.target.value)} style={selectStyle}>
            <option value="all">All pillars</option>
            {allPillars.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="School posts">
          <select value={safeFilter} onChange={e => setSafeFilter(e.target.value as 'all' | 'safe' | 'generic')} style={selectStyle}>
            <option value="all">Any</option>
            <option value="safe">School-safe only</option>
            <option value="generic">Generic only</option>
          </select>
        </Field>
        <Field label="Search">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="slug or title…" style={{ ...selectStyle, minWidth: 180 }} />
        </Field>
        <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 'auto' }}>
          Showing {filtered.length} / {assets.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#6B7280', background: '#fff', borderRadius: 10, border: '1px dashed #CBD5E1' }}>
          No assets match these filters.
        </div>
      ) : (
        ['woodcut', 'linebase'].map(style => {
          const list = byStyle[style] || []
          if (!list.length) return null
          return (
            <section key={style} style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY, margin: '0 0 12px', textTransform: 'capitalize' }}>
                {style} <span style={{ color: TEAL, fontWeight: 700, fontSize: 13, marginLeft: 6 }}>{list.length}</span>
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                {list.map(a => <Card key={a.slug} a={a} />)}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}

function Card({ a }: { a: Asset }) {
  const safe = !!a.safety_flags?.safe_for_school_specific_posts
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ aspectRatio: '1/1', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, borderBottom: '1px solid #F1F5F9' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/asset-library/${a.style}/${a.slug}.svg`} alt={a.title} loading="lazy" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ font: '600 11px ui-monospace, SF Mono, Menlo, monospace', color: '#94A3B8', marginBottom: 3, wordBreak: 'break-all' }}>{a.slug}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{a.title}</div>
        <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.4, marginBottom: 8, maxHeight: 44, overflow: 'hidden' }}>{a.description}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(a.pillar_tags || []).slice(0, 3).map(p => (
            <span key={p} style={tagStyle('#E0E7FF', '#3730A3')}>{p}</span>
          ))}
          {(a.injection_roles || []).map(r => (
            <span key={r} style={tagStyle('#F3F4F6', '#6B7280')}>{r.replace(/_/g, ' ')}</span>
          ))}
          {safe
            ? <span style={tagStyle('#E8FAF6', '#065F46')}>school-safe</span>
            : <span style={tagStyle('#FEF7E0', '#92400E')}>generic only</span>}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 5,
  fontSize: 13, color: NAVY, background: '#fff',
}

function tagStyle(bg: string, fg: string): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, whiteSpace: 'nowrap',
    background: bg, color: fg,
  }
}
