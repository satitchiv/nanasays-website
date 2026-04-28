'use client'

import './assistant.css'
import { useState, useRef } from 'react'

const navy   = '#1B3252'
const teal   = '#34C3A0'
const border = '#E2E8F0'
const muted  = '#6B7280'

const SCHOOLS = {
  Thailand: [
    { slug: 'nist-international-school',                         name: 'NIST International School' },
    { slug: 'bangkok-patana-school',                             name: 'Bangkok Patana School' },
    { slug: 'international-school-bangkok',                      name: 'International School Bangkok (ISB)' },
    { slug: 'harrow-international-school-bangkok',               name: 'Harrow International School Bangkok' },
    { slug: 'shrewsbury-international-school-bangkok-riverside', name: 'Shrewsbury International School Bangkok' },
    { slug: 'wellington-college-international-school-bangkok',   name: 'Wellington College Bangkok' },
    { slug: 'kings-college-international-school-bangkok',        name: "King's College Bangkok" },
    { slug: 'bromsgrove-international-school-thailand',          name: 'Bromsgrove International School Thailand' },
    { slug: 'ekamai-international-school',                       name: 'Ekamai International School' },
    { slug: 'garden-international-school-bangkok',               name: 'Garden International School Bangkok' },
    { slug: 'bangkok-christian-international-school',            name: 'Bangkok Christian International School' },
  ],
  Switzerland: [
    { slug: 'institut-le-rosey',                        name: 'Institut Le Rosey' },
    { slug: 'aiglon-college',                           name: 'Aiglon College' },
    { slug: 'zurich-international-school',              name: 'Zurich International School' },
    { slug: 'college-alpin-beau-soleil',                name: 'Collège Alpin Beau Soleil' },
    { slug: 'st-georges-international-school',          name: "St. George's International School" },
    { slug: 'la-garenne-international-school',          name: 'La Garenne International School' },
    { slug: 'tasis-the-american-school-in-switzerland', name: 'TASIS Switzerland' },
    { slug: 'leysin-american-school-in-switzerland',    name: 'Leysin American School' },
  ],
  'United Kingdom': [
    { slug: 'charterhouse-school',             name: 'Charterhouse School' },
    { slug: 'cheltenham-ladies-college',       name: "Cheltenham Ladies' College" },
    { slug: 'oundle-school',                   name: 'Oundle School' },
    { slug: 'clifton-college',                 name: 'Clifton College' },
    { slug: 'haileybury',                      name: 'Haileybury' },
    { slug: 'wellington-college',              name: 'Wellington College' },
    { slug: 'sevenoaks-school',                name: 'Sevenoaks School' },
    { slug: 'acs-international-school-cobham', name: 'ACS International School Cobham' },
    { slug: 'tasis-england',                   name: 'TASIS England' },
    { slug: 'dwight-school-london',            name: 'Dwight School London' },
  ],
}

const ALL_SCHOOLS = Object.values(SCHOOLS).flat()
const DEFAULT_SLUG = 'nist-international-school'

const SUGGESTED = [
  'What are our current tuition fees?',
  'What are our latest IB results?',
  'How does our admissions process work?',
  'Do we offer any scholarships?',
  'How do we compare to Harrow Bangkok?',
]

type CardType = 'fees' | 'admissions' | 'results' | 'general'
type Source   = { label: string; url: string }
type CardSpec = {
  hero?:  { eyebrow?: string; stat: string; caption?: string }
  alerts?: { color: 'yellow' | 'red' | 'green' | 'blue'; label: string; text: string }[]
  rows?:  { key: string; val: string }[]
  steps?: { num: number; title: string; desc: string }[]
}
type Message  = {
  role: 'user' | 'assistant'
  text?: string
  facts?: string
  signals?: string | null
  intelligence?: string | null
  sources?: Source[]
  structured?: any
  card?: CardSpec | null
  cardType?: CardType
  loading?: boolean
}

// ── Card designer types ───────────────────────────────────────────────────────
function uid() { return '_' + Math.random().toString(36).slice(2, 9) }

const FONT_SCALE = { small: 0.75, medium: 1, large: 1.35 } as const
type FontSize = keyof typeof FONT_SCALE

type EditBlock =
  | { id: string; type: 'hero';  eyebrow: string; stat: string; caption: string }
  | { id: string; type: 'alert'; color: 'yellow'|'red'|'green'|'blue'; label: string; text: string }
  | { id: string; type: 'rows';  items: { key: string; val: string }[] }
  | { id: string; type: 'news';  text: string; source: string }
  | { id: string; type: 'tip';   text: string }

type CardEditState = {
  blocks:    EditBlock[]
  fontSize:  FontSize
  factsText: string
  snapshot:  { blocks: EditBlock[]; fontSize: FontSize; factsText: string } | null
}

function makeNewBlock(type: EditBlock['type']): EditBlock {
  const id = uid()
  if (type === 'alert') return { id, type: 'alert', color: 'blue', label: 'Note', text: 'Click to edit this alert' }
  if (type === 'rows')  return { id, type: 'rows',  items: [{ key: 'Label', val: 'Value' }] }
  if (type === 'news')  return { id, type: 'news',  text: 'News headline or summary', source: 'Source, date' }
  if (type === 'tip')   return { id, type: 'tip',   text: 'Click to add a tip here' }
  return { id, type: 'hero', eyebrow: 'Eyebrow', stat: 'Stat', caption: 'Caption' }
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode {
  const paragraphs = text.split(/\n{2,}/)
  return paragraphs.map((para, pi) => {
    const lines = para.split('\n')
    const isBullet   = lines.every(l => /^[•\-\*]\s/.test(l.trim()) || !l.trim())
    const isNumbered = lines.every(l => /^\d+\.\s/.test(l.trim()) || !l.trim())

    if (isBullet && lines.some(l => l.trim())) {
      return (
        <ul key={pi} style={{ paddingLeft: 20, margin: '4px 0 8px', listStyleType: 'disc' }}>
          {lines.filter(l => l.trim()).map((l, li) => (
            <li key={li} style={{ marginBottom: 4 }}>{inlineMd(l.replace(/^[•\-\*]\s/, ''))}</li>
          ))}
        </ul>
      )
    }
    if (isNumbered && lines.some(l => l.trim())) {
      return (
        <ol key={pi} style={{ paddingLeft: 20, margin: '4px 0 8px' }}>
          {lines.filter(l => l.trim()).map((l, li) => (
            <li key={li} style={{ marginBottom: 4 }}>{inlineMd(l.replace(/^\d+\.\s/, ''))}</li>
          ))}
        </ol>
      )
    }
    return (
      <p key={pi} style={{ margin: '0 0 8px' }}>
        {lines.map((line, li) => (
          <span key={li}>{inlineMd(line)}{li < lines.length - 1 && <br />}</span>
        ))}
      </p>
    )
  })
}

function inlineMd(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('*')  && p.endsWith('*'))  return <em key={i}>{p.slice(1, -1)}</em>
    return p
  })
}

// ── Parse signals into individual items ───────────────────────────────────────
function parseSignals(text: string): { text: string; source: string }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  return lines.map(line => {
    const clean = line.replace(/^[•\-\*]\s*/, '')
    const dashIdx = clean.lastIndexOf(' — ')
    if (dashIdx > 0) {
      return { text: clean.slice(0, dashIdx).trim(), source: clean.slice(dashIdx + 3).trim() }
    }
    return { text: clean, source: '' }
  }).filter(s => s.text)
}

// ── Parse numbered steps ──────────────────────────────────────────────────────
function parseSteps(text: string): { num: string; title: string; desc: string }[] | null {
  const re = /\*\*Step (\d+)\s*[—\-–]+\s*([^*:]+)\*\*[:\s]+([^\n]+)/g
  const matches: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) matches.push(m)
  if (matches.length < 2) return null
  return matches.map(r => ({ num: r[1], title: r[2].trim(), desc: r[3].trim() }))
}

// ── Extract fee range from facts text ────────────────────────────────────────
function extractFeeFromText(facts: string): { min: number; max: number; currency: string } | null {
  const m = facts.match(/([A-Z]{2,3})\s+([\d,]+)\s+(?:to|–|-|–)\s+(?:[A-Z]{2,3}\s+)?([\d,]+)/i)
  if (!m) return null
  const min = parseInt(m[2].replace(/,/g, ''))
  const max = parseInt(m[3].replace(/,/g, ''))
  if (isNaN(min) || isNaN(max) || min <= 0 || max <= 0) return null
  return { min, max, currency: m[1].toUpperCase() }
}

// ── Structured data rows per card type ───────────────────────────────────────
function buildDataRows(structured: any, cardType: CardType = 'general'): { key: string; val: string }[] {
  if (!structured) return []
  const rows: { key: string; val: string }[] = []
  const cur = structured.fees_currency || ''

  if (cardType === 'fees') {
    if (structured.fees_min || structured.fees_max)
      rows.push({ key: 'Annual fees', val: `${cur} ${[structured.fees_min, structured.fees_max].filter(Boolean).join(' – ')}`.trim() })
    if (structured.curriculum?.length)
      rows.push({ key: 'Curriculum', val: structured.curriculum.join(', ') })
    if (structured.grade_levels?.grades?.length)
      rows.push({ key: 'Year groups', val: structured.grade_levels.grades.join(', ') })
  } else if (cardType === 'results') {
    if (structured.curriculum?.length)
      rows.push({ key: 'Curriculum', val: structured.curriculum.join(', ') })
    if (structured.accreditations?.length)
      rows.push({ key: 'Accreditations', val: structured.accreditations.join(', ') })
    if (structured.languages?.length)
      rows.push({ key: 'Languages', val: structured.languages.join(', ') })
  } else {
    if (structured.curriculum?.length)
      rows.push({ key: 'Curriculum', val: structured.curriculum.join(', ') })
    if (structured.languages?.length)
      rows.push({ key: 'Languages', val: structured.languages.join(', ') })
    if (structured.accreditations?.length)
      rows.push({ key: 'Accreditations', val: structured.accreditations.join(', ') })
    if (structured.grade_levels?.grades?.length)
      rows.push({ key: 'Year groups', val: structured.grade_levels.grades.join(', ') })
    if (structured.facilities?.length)
      rows.push({ key: 'Facilities', val: structured.facilities.slice(0, 5).join(', ') })
  }
  return rows
}

// ── PDF ───────────────────────────────────────────────────────────────────────
function savePDF(schoolName: string, facts: string, signals: string | null | undefined, intelligence: string | null | undefined, sources: Source[] | undefined) {
  const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const sourcesHtml = sources?.length
    ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #E2E8F0;">${sources.map(s => `<a href="${s.url}" style="display:block;font-size:11px;color:#34C3A0;text-decoration:none;margin-bottom:3px;">↗ ${s.label}</a>`).join('')}</div>`
    : ''
  const signalsHtml = signals
    ? `<div style="margin-top:14px;padding:12px 14px;background:#f0fdf8;border-left:3px solid #34C3A0;border-radius:4px;"><div style="font-size:9px;font-weight:700;color:#34A27A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">World Signals</div><div style="font-size:13px;line-height:1.65;color:#1B3252;white-space:pre-wrap;">${signals}</div></div>`
    : ''
  const intelHtml = intelligence
    ? `<div style="margin-top:12px;padding:12px 14px;background:#1B325208;border-radius:4px;"><div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Tip</div><div style="font-size:13px;line-height:1.65;color:#1B3252;white-space:pre-wrap;">${intelligence}</div></div>`
    : ''
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>NanaSays — ${schoolName}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#1B3252;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style>
  </head><body style="padding:40px 48px;max-width:720px;margin:0 auto;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #1B3252;">
      <div><div style="font-size:10px;font-weight:700;color:#34C3A0;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">NanaSays Intelligence</div><div style="font-size:20px;font-weight:800;color:#1B3252;">${schoolName}</div></div>
      <div style="font-size:11px;color:#94A3B8;">${now}</div>
    </div>
    <div style="font-size:13px;line-height:1.72;color:#1B3252;white-space:pre-wrap;">${facts}</div>
    ${sourcesHtml}${signalsHtml}${intelHtml}
    <div style="margin-top:32px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:10px;color:#94A3B8;">Generated by NanaSays Intelligence Assistant · nanasays.school</div>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html); w.document.close(); w.focus()
  setTimeout(() => { w.print(); w.close() }, 400)
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function DataRows({ rows }: { rows: { key: string; val: string }[] }) {
  if (!rows.length) return null
  return (
    <div style={{ background: '#fff', padding: '2px 18px', borderLeft: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: i < rows.length - 1 ? `1px solid #F1F5F9` : 'none', alignItems: 'flex-start' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', minWidth: 140, paddingTop: 1 }}>{r.key}</span>
          <span style={{ fontSize: 13, color: navy, fontWeight: 500, lineHeight: 1.45 }}>{r.val}</span>
        </div>
      ))}
    </div>
  )
}

function Alert({ color, label, children }: { color: 'yellow' | 'red' | 'green' | 'blue'; label: string; children: React.ReactNode }) {
  const map = {
    yellow: { bg: '#FFFBEB', border: '#F59E0B', text: '#78350F' },
    red:    { bg: '#FEF2F2', border: '#EF4444', text: '#7F1D1D' },
    green:  { bg: '#F0FDF8', border: '#34C3A0', text: '#065F46' },
    blue:   { bg: '#EFF6FF', border: '#3B82F6', text: '#1e3a8a' },
  }
  const c = map[color]
  return (
    <div style={{ padding: '10px 18px', background: c.bg, borderLeft: `3px solid ${c.border}`, color: c.text, fontSize: 13, lineHeight: 1.5 }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 3, opacity: 0.7 }}>{label}</div>
      {children}
    </div>
  )
}

function SourcesBar({ sources, onPDF }: { sources: Source[]; onPDF: () => void }) {
  return (
    <div style={{
      background: '#fff', borderLeft: `1px solid ${border}`, borderRight: `1px solid ${border}`,
      borderBottom: `1px solid ${border}`, borderRadius: '0 0 12px 12px',
      padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' as const }}>
        {sources.map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: teal, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            ↗ {s.label}
          </a>
        ))}
      </div>
      <button onClick={onPDF} style={{
        fontSize: 11, fontWeight: 700, color: navy,
        background: '#F8FAFC', border: `1px solid ${border}`,
        borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        ↓ Save PDF
      </button>
    </div>
  )
}

// ── Card designer — EditableBlock ─────────────────────────────────────────────
function EditableBlock({ block, isFirst, isLast, editable, onMove, onDelete, onUpdateField, onOpenAdd }: {
  block: EditBlock
  isFirst: boolean
  isLast: boolean
  editable: boolean
  onMove?: (dir: -1|1) => void
  onDelete?: () => void
  onUpdateField?: (field: string, val: string) => void
  onOpenAdd?: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const [hovered, setHovered] = useState(false)

  const alertColors: Record<string, { bg: string; bdr: string; text: string }> = {
    yellow: { bg: '#FFFBEB', bdr: '#F59E0B', text: '#78350F' },
    red:    { bg: '#FEF2F2', bdr: '#EF4444', text: '#7F1D1D' },
    green:  { bg: '#F0FDF8', bdr: '#34C3A0', text: '#065F46' },
    blue:   { bg: '#EFF6FF', bdr: '#3B82F6', text: '#1e3a8a' },
  }

  // Editable text span — saves on blur, no re-render during typing
  function EF({ field, children, style }: { field: string; children: string; style?: React.CSSProperties }) {
    if (!editable) return <span style={style}>{children}</span>
    return (
      <span
        contentEditable
        suppressContentEditableWarning
        onBlur={e => onUpdateField?.(field, e.currentTarget.textContent?.trim() || '')}
        style={{ outline: `2px solid ${teal}`, borderRadius: 3, cursor: 'text', minWidth: 6, ...style }}
      >{children}</span>
    )
  }

  let content: React.ReactNode = null

  if (block.type === 'hero') {
    content = (
      <div style={{ background: navy, padding: '18px 20px', color: '#fff' }}>
        {block.eyebrow && (
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
            <EF field="eyebrow">{block.eyebrow}</EF>
          </div>
        )}
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: teal }}>
          <EF field="stat">{block.stat}</EF>
        </div>
        {block.caption && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>
            <EF field="caption">{block.caption}</EF>
          </div>
        )}
      </div>
    )
  } else if (block.type === 'alert') {
    const c = alertColors[block.color] || alertColors.blue
    content = (
      <div style={{ padding: '10px 18px', background: c.bg, borderLeft: `3px solid ${c.bdr}`, color: c.text, fontSize: 13, lineHeight: 1.5 }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 3, opacity: 0.7 }}>
          <EF field="label">{block.label}</EF>
        </div>
        <EF field="text">{block.text}</EF>
      </div>
    )
  } else if (block.type === 'rows') {
    content = (
      <div style={{ background: '#fff', padding: '2px 18px', borderLeft: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>
        {block.items.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: ri < block.items.length - 1 ? '1px solid #F1F5F9' : 'none', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', minWidth: 140, paddingTop: 1 }}>
              <EF field={`rk${ri}`}>{row.key}</EF>
            </span>
            <span style={{ fontSize: 13, color: navy, fontWeight: 500, lineHeight: 1.45 }}>
              <EF field={`rv${ri}`}>{row.val}</EF>
            </span>
          </div>
        ))}
      </div>
    )
  } else if (block.type === 'news') {
    content = (
      <div style={{ background: '#F0FDF8', borderLeft: '1px solid rgba(52,195,160,0.25)', borderRight: '1px solid rgba(52,195,160,0.25)', padding: '12px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#94A3B8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>World Signals — Live News</span>
          <span style={{ flex: 1, height: 1, background: 'rgba(52,195,160,0.2)', display: 'inline-block' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: teal, marginTop: 6, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, color: navy, lineHeight: 1.5 }}>{block.text}</div>
            {block.source && <div style={{ fontSize: 11, color: teal, fontWeight: 600, marginTop: 2 }}>{block.source}</div>}
          </div>
        </div>
      </div>
    )
  } else if (block.type === 'tip') {
    content = (
      <div style={{ background: navy, padding: '12px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: teal, marginBottom: 4 }}>Tip</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55 }}>
          <EF field="text">{block.text}</EF>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => editable && setHovered(true)}
      onMouseLeave={() => editable && setHovered(false)}
    >
      {/* Hover controls */}
      {editable && hovered && (
        <div style={{
          position: 'absolute', top: 6, right: 6, zIndex: 20,
          display: 'flex', gap: 3, alignItems: 'center',
          background: 'rgba(255,255,255,0.95)', border: `1px solid ${border}`,
          borderRadius: 8, padding: '3px 5px',
          boxShadow: '0 2px 8px rgba(27,50,82,0.1)',
        }}>
          <button onClick={() => onMove?.(-1)} disabled={isFirst} title="Move up" style={{ width: 24, height: 24, borderRadius: 5, border: 'none', cursor: isFirst ? 'default' : 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#94A3B8', fontFamily: 'inherit', opacity: isFirst ? 0.3 : 1 }}>↑</button>
          <button onClick={() => onMove?.(1)}  disabled={isLast}  title="Move down" style={{ width: 24, height: 24, borderRadius: 5, border: 'none', cursor: isLast  ? 'default' : 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#94A3B8', fontFamily: 'inherit', opacity: isLast  ? 0.3 : 1 }}>↓</button>
          {block.type !== 'news' && (
            <>
              <div style={{ width: 1, height: 14, background: border, margin: '0 1px' }} />
              <button onClick={onOpenAdd} title="Add block after" style={{ width: 24, height: 24, borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: teal, fontFamily: 'inherit' }}>+</button>
            </>
          )}
          <div style={{ width: 1, height: 14, background: border, margin: '0 1px' }} />
          <button onClick={() => onDelete?.()} title="Delete block" style={{ width: 24, height: 24, borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#EF4444', fontFamily: 'inherit' }}>×</button>
        </div>
      )}
      {content}
    </div>
  )
}

// ── Page component ────────────────────────────────────────────────────────────
export default function DemoAssistantPage() {
  const [slug, setSlug]           = useState(DEFAULT_SLUG)
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [cardViews, setCardViews] = useState<Set<number>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)

  // Card designer state
  const [editStates, setEditStates] = useState<Record<number, CardEditState>>({})
  const [editModes,  setEditModes]  = useState<Set<number>>(new Set())
  const [addDrop, setAddDrop]       = useState<{ msgIdx: number; blockId: string; top: number; left: number } | null>(null)

  const currentSchool = ALL_SCHOOLS.find(s => s.slug === slug)!

  function switchSchool(newSlug: string) {
    setSlug(newSlug); setMessages([]); setInput(''); setCardViews(new Set())
    setEditStates({}); setEditModes(new Set())
  }

  function toggleCard(idx: number) {
    setCardViews(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  // ── Card designer handlers ────────────────────────────────────────────────
  function toEditBlocks(msg: Message): EditBlock[] {
    const blocks: EditBlock[] = []
    const c = msg.card
    if (c?.hero?.stat) blocks.push({ id: uid(), type: 'hero', eyebrow: c.hero.eyebrow || '', stat: c.hero.stat, caption: c.hero.caption || '' })
    c?.alerts?.forEach(al => blocks.push({ id: uid(), type: 'alert', color: al.color, label: al.label, text: al.text }))
    if (c?.steps?.length) blocks.push({ id: uid(), type: 'rows', items: c.steps.map(s => ({ key: `Step ${s.num}`, val: `${s.title}${s.desc ? ': ' + s.desc : ''}` })) })
    if (c?.rows?.length)  blocks.push({ id: uid(), type: 'rows', items: c.rows.map(r => ({ key: r.key, val: r.val })) })
    const sigs = msg.signals ? parseSignals(msg.signals) : []
    sigs.forEach(sig => blocks.push({ id: uid(), type: 'news', text: sig.text, source: sig.source }))
    if (msg.intelligence) blocks.push({ id: uid(), type: 'tip', text: msg.intelligence })
    return blocks
  }

  function openEdit(msgIdx: number, msg: Message) {
    const blocks = toEditBlocks(msg)
    const factsText = msg.facts || ''
    const es: CardEditState = { blocks, fontSize: 'medium', factsText, snapshot: JSON.parse(JSON.stringify({ blocks, fontSize: 'medium', factsText })) }
    setEditStates(prev => ({ ...prev, [msgIdx]: es }))
    setEditModes(prev => { const n = new Set(prev); n.add(msgIdx); return n })
    // Make sure card view is open
    setCardViews(prev => { const n = new Set(prev); n.add(msgIdx); return n })
  }

  function cancelEdit(msgIdx: number) {
    setEditStates(prev => {
      const es = prev[msgIdx]
      if (!es?.snapshot) { const n = { ...prev }; delete n[msgIdx]; return n }
      return { ...prev, [msgIdx]: { ...es, blocks: es.snapshot.blocks, fontSize: es.snapshot.fontSize, factsText: es.snapshot.factsText, snapshot: null } }
    })
    setEditModes(prev => { const n = new Set(prev); n.delete(msgIdx); return n })
  }

  function closeEdit(msgIdx: number) {
    setEditStates(prev => {
      const es = prev[msgIdx]
      if (!es) return prev
      // Keep edited state but clear snapshot
      return { ...prev, [msgIdx]: { ...es, snapshot: null } }
    })
    setEditModes(prev => { const n = new Set(prev); n.delete(msgIdx); return n })
  }

  function setEditFontSize(msgIdx: number, size: FontSize) {
    setEditStates(prev => {
      const es = prev[msgIdx]; if (!es) return prev
      return { ...prev, [msgIdx]: { ...es, fontSize: size } }
    })
  }

  function moveEditBlock(msgIdx: number, blockId: string, dir: -1|1) {
    setEditStates(prev => {
      const es = prev[msgIdx]; if (!es) return prev
      const blocks = [...es.blocks]
      const idx = blocks.findIndex(b => b.id === blockId)
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= blocks.length) return prev
      ;[blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]]
      return { ...prev, [msgIdx]: { ...es, blocks } }
    })
  }

  function deleteEditBlock(msgIdx: number, blockId: string) {
    setEditStates(prev => {
      const es = prev[msgIdx]; if (!es) return prev
      return { ...prev, [msgIdx]: { ...es, blocks: es.blocks.filter(b => b.id !== blockId) } }
    })
    setAddDrop(null)
  }

  function updateEditField(msgIdx: number, blockId: string, field: string, val: string) {
    setEditStates(prev => {
      const es = prev[msgIdx]; if (!es) return prev
      const blocks = es.blocks.map(b => {
        if (b.id !== blockId) return b
        if (field.startsWith('rk') && b.type === 'rows') {
          const items = [...b.items]; items[+field.slice(2)] = { ...items[+field.slice(2)], key: val }; return { ...b, items }
        }
        if (field.startsWith('rv') && b.type === 'rows') {
          const items = [...b.items]; items[+field.slice(2)] = { ...items[+field.slice(2)], val }; return { ...b, items }
        }
        return { ...b, [field]: val }
      })
      return { ...prev, [msgIdx]: { ...es, blocks } }
    })
  }

  function updateEditFacts(msgIdx: number, val: string) {
    setEditStates(prev => {
      const es = prev[msgIdx]; if (!es) return prev
      return { ...prev, [msgIdx]: { ...es, factsText: val } }
    })
  }

  function openAddDropdown(e: React.MouseEvent<HTMLButtonElement>, msgIdx: number, blockId: string) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    // Toggle
    if (addDrop?.blockId === blockId) { setAddDrop(null); return }
    setAddDrop({ msgIdx, blockId, top: rect.bottom + 6, left: Math.max(8, rect.right - 185) })
  }

  function confirmAdd(type: EditBlock['type']) {
    if (!addDrop) return
    const { msgIdx, blockId } = addDrop
    const newBlock = makeNewBlock(type)
    setEditStates(prev => {
      const es = prev[msgIdx]; if (!es) return prev
      const blocks = [...es.blocks]
      const idx = blocks.findIndex(b => b.id === blockId)
      blocks.splice(idx + 1, 0, newBlock)
      return { ...prev, [msgIdx]: { ...es, blocks } }
    })
    setAddDrop(null)
  }

  // ── Chat send ─────────────────────────────────────────────────────────────
  async function send(question: string) {
    if (!question.trim() || loading) return
    setInput(''); setLoading(true)
    setMessages(prev => [...prev, { role: 'user', text: question }, { role: 'assistant', loading: true }])
    try {
      const res  = await fetch('/api/school-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, question }) })
      const data = await res.json()
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'assistant',
          facts:        data.facts || data.answer || data.error || 'No response.',
          signals:      data.signals || null,
          intelligence: data.intelligence || null,
          sources:      data.sources || [],
          structured:   data.structured || null,
          card:         data.card || null,
          cardType:     data.cardType || 'general',
          loading:      false,
        }
        return next
      })
    } catch {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', facts: 'Something went wrong. Please try again.', loading: false }
        return next
      })
    } finally {
      setLoading(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const hasCard = (msg: Message) =>
    !msg.loading && !!msg.facts && (msg.facts.length > 100 || !!msg.signals || !!msg.intelligence)

  return (
    <div
      style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', fontFamily: "'Nunito Sans', -apple-system, sans-serif" }}
      onClick={() => setAddDrop(null)}
    >

      {/* School switcher */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Switch school</label>
          <select value={slug} onChange={e => switchSchool(e.target.value)} style={{
            padding: '7px 12px', borderRadius: 8, border: `1px solid ${border}`,
            fontSize: 13, color: navy, background: '#fff', fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
          }}>
            {Object.entries(SCHOOLS).map(([country, schools]) => (
              <optgroup key={country} label={`── ${country} ──`}>
                {schools.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); setCardViews(new Set()); setEditStates({}); setEditModes(new Set()) }}
            style={{ fontSize: 11, color: muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
            Clear chat
          </button>
        )}
      </div>

      {/* Chat shell */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${border}`, borderRadius: 16, overflow: 'hidden' }}>

        {/* Navy top bar */}
        <div style={{ background: navy, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>School Assistant</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>Powered by NanaSays intelligence</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(52,195,160,0.15)', border: '1px solid rgba(52,195,160,0.35)', borderRadius: 20, padding: '4px 12px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: teal }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{currentSchool.name}</span>
          </div>
        </div>

        {/* Chat messages */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {messages.length === 0 && (
            <div>
              <p style={{ fontSize: 12, color: muted, marginBottom: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Try asking:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SUGGESTED.map(q => (
                  <button key={q} onClick={() => send(q)} style={{
                    padding: '7px 14px', borderRadius: 20, border: `1px solid ${border}`, background: '#fff',
                    fontSize: 13, color: navy, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
                  }}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>

              {/* User bubble */}
              {msg.role === 'user' && (
                <div style={{ maxWidth: '72%', padding: '12px 18px', borderRadius: '18px 18px 4px 18px', background: navy, color: '#fff', fontSize: 14, lineHeight: 1.55 }}>
                  {msg.text}
                </div>
              )}

              {/* Assistant */}
              {msg.role === 'assistant' && (
                <div style={{ maxWidth: '92%', display: 'flex', flexDirection: 'column', gap: 6 }}>

                  {/* Loading */}
                  {msg.loading && (
                    <div style={{ padding: '12px 16px', borderRadius: '4px 16px 16px 16px', background: '#fff', border: `1px solid ${border}` }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {[0,1,2].map(j => (
                          <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: teal, animation: `bounce 1s ease-in-out ${j * 0.2}s infinite` }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── CHAT VIEW ── */}
                  {!msg.loading && msg.facts && !cardViews.has(i) && (
                    <>
                      <div style={{ padding: '14px 18px', borderRadius: '4px 16px 16px 16px', background: '#fff', border: `1px solid ${border}`, fontSize: 14, lineHeight: 1.7, color: navy }}>
                        <div>{renderMarkdown(msg.facts)}</div>
                        {msg.sources && msg.sources.length > 0 && (
                          <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${border}`, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {msg.sources.map((s, si) => (
                              <a key={si} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: teal, textDecoration: 'none' }}>↗ {s.label}</a>
                            ))}
                          </div>
                        )}
                      </div>
                      {hasCard(msg) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
                          <button onClick={() => toggleCard(i)} style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', background: 'none', border: '1px solid #DBEAFE', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                            ⊞ Format as card
                          </button>
                          <button onClick={() => savePDF(currentSchool.name, msg.facts!, msg.signals, msg.intelligence, msg.sources)} style={{ fontSize: 11, color: muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                            Download PDF
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── CARD VIEW ── */}
                  {!msg.loading && msg.facts && cardViews.has(i) && (() => {

                    // ── EDIT MODE ─────────────────────────────────────────
                    if (editModes.has(i)) {
                      const es = editStates[i]
                      if (!es) return null
                      const fs = FONT_SCALE[es.fontSize]

                      return (
                        <div style={{ maxWidth: '100%' }}>

                          {/* Inline toolbar */}
                          <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: '10px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(27,50,82,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#94A3B8' }}>Text Size</span>
                              {(['small', 'medium', 'large'] as const).map(sz => (
                                <button key={sz} onClick={e => { e.stopPropagation(); setEditFontSize(i, sz) }} style={{
                                  padding: '5px 12px', borderRadius: 7, border: `1px solid ${border}`,
                                  background: es.fontSize === sz ? navy : '#F8FAFC',
                                  color: es.fontSize === sz ? '#fff' : '#6B7280',
                                  fontSize: sz === 'small' ? 11 : sz === 'medium' ? 13 : 15,
                                  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                  {sz === 'small' ? 'S' : sz === 'medium' ? 'M' : 'L'}
                                </button>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#94A3B8' }}>Hover blocks to edit</span>
                              <button onClick={e => { e.stopPropagation(); cancelEdit(i) }} style={{ fontSize: 11, fontWeight: 600, color: muted, background: 'none', border: `1px solid ${border}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                              <button onClick={e => { e.stopPropagation(); closeEdit(i) }} style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: navy, border: 'none', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>
                            </div>
                          </div>

                          {/* Tip bar */}
                          <div style={{ fontSize: 11, color: teal, background: '#F0FDF8', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>
                            Click any text on the card to edit it · Hover a block to move, add, or delete it
                          </div>

                          {/* Editable card */}
                          <div style={{ boxShadow: `0 0 0 2px ${teal}, 0 8px 32px rgba(52,195,160,0.15)`, borderRadius: 12, overflow: 'hidden' }}>
                            <div className={`ns-zoom-${es.fontSize[0]}`}>
                              {es.blocks.map((b, bi) => (
                                <EditableBlock
                                  key={b.id}
                                  block={b}
                                  isFirst={bi === 0}
                                  isLast={bi === es.blocks.length - 1}
                                  editable
                                  onMove={dir => moveEditBlock(i, b.id, dir)}
                                  onDelete={() => deleteEditBlock(i, b.id)}
                                  onUpdateField={(field, val) => updateEditField(i, b.id, field, val)}
                                  onOpenAdd={e => openAddDropdown(e, i, b.id)}
                                />
                              ))}
                            </div>

                            {/* Editable facts */}
                            <div style={{ background: '#fff', padding: '14px 18px', borderLeft: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>
                              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#94A3B8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>Your school — facts</span>
                                <span style={{ flex: 1, height: 1, background: border, display: 'inline-block' }} />
                              </div>
                              <div
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={e => updateEditFacts(i, e.currentTarget.textContent?.trim() || '')}
                                style={{ fontSize: 14, color: navy, lineHeight: 1.7, outline: `2px solid ${teal}`, borderRadius: 4, padding: '4px 6px', cursor: 'text', whiteSpace: 'pre-wrap' as const }}
                              >{es.factsText}</div>
                            </div>
                            <SourcesBar sources={msg.sources || []} onPDF={() => savePDF(currentSchool.name, msg.facts!, msg.signals, msg.intelligence, msg.sources)} />
                          </div>
                        </div>
                      )
                    }

                    // ── EDITED CARD (Done, shows saved edits) ─────────────
                    if (editStates[i]) {
                      const es = editStates[i]
                      return (
                        <div style={{ maxWidth: '100%' }}>
                          <button onClick={() => toggleCard(i)} style={{ fontSize: 11, color: muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6, padding: 0 }}>
                            ← Back to chat
                          </button>

                          <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${border}` }}>
                            <div className={`ns-zoom-${es.fontSize[0]}`}>
                              {es.blocks.map((b, bi) => (
                                <EditableBlock
                                  key={b.id} block={b}
                                  isFirst={bi === 0} isLast={bi === es.blocks.length - 1}
                                  editable={false}
                                />
                              ))}
                            </div>
                            <div style={{ background: '#fff', padding: '14px 18px', borderLeft: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>
                              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#94A3B8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>Your school — facts</span>
                                <span style={{ flex: 1, height: 1, background: border, display: 'inline-block' }} />
                              </div>
                              <div style={{ fontSize: 14, color: navy, lineHeight: 1.7, whiteSpace: 'pre-wrap' as const }}>{es.factsText}</div>
                            </div>
                            <SourcesBar sources={msg.sources || []} onPDF={() => savePDF(currentSchool.name, es.factsText, msg.signals, msg.intelligence, msg.sources)} />
                          </div>

                          <div style={{ display: 'flex', gap: 8, marginTop: 6, paddingLeft: 2 }}>
                            <button onClick={() => openEdit(i, msg)} style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: teal, border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                              ✏ Edit / Customise
                            </button>
                            <button onClick={() => savePDF(currentSchool.name, msg.facts!, msg.signals, msg.intelligence, msg.sources)} style={{ fontSize: 11, color: muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                              Download PDF
                            </button>
                          </div>
                        </div>
                      )
                    }

                    // ── ORIGINAL CARD VIEW ────────────────────────────────
                    const card       = msg.card
                    const hasSources = !!(msg.sources && msg.sources.length > 0)
                    const signals    = msg.signals ? parseSignals(msg.signals) : []
                    const hasSignals = signals.length > 0
                    const hasIntel   = !!msg.intelligence
                    const hasHero    = !!card?.hero?.stat
                    const hasAlerts  = !!(card?.alerts?.length)
                    const hasSteps   = !!(card?.steps?.length)
                    const hasRows    = !!(card?.rows?.length)

                    return (
                      <div style={{ maxWidth: '100%' }}>

                        <button onClick={() => toggleCard(i)} style={{ fontSize: 11, color: muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6, padding: 0 }}>
                          ← Back to chat
                        </button>

                        {/* Hero */}
                        {hasHero ? (
                          <div style={{ background: navy, borderRadius: '12px 12px 0 0', padding: '18px 20px', color: '#fff' }}>
                            {card!.hero!.eyebrow && (
                              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                                {card!.hero!.eyebrow}
                              </div>
                            )}
                            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
                              {card!.hero!.stat.split(/(\d[\d,\.%\s]*(?:pts?|points?|%|USD|THB|GBP|steps?)?)/i).map((part, pi) =>
                                /\d/.test(part)
                                  ? <span key={pi} style={{ color: teal }}>{part}</span>
                                  : <span key={pi}>{part}</span>
                              )}
                            </div>
                            {card!.hero!.caption && (
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>{card!.hero!.caption}</div>
                            )}
                          </div>
                        ) : (
                          <div style={{ background: navy, borderRadius: '12px 12px 0 0', padding: '12px 18px' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
                              {currentSchool.name}
                            </div>
                          </div>
                        )}

                        {/* Alerts */}
                        {hasAlerts && card!.alerts!.map((al, ai) => (
                          <Alert key={ai} color={al.color} label={al.label}>{al.text}</Alert>
                        ))}

                        {/* Steps */}
                        {hasSteps && (
                          <div style={{ background: '#fff', padding: '4px 18px', borderLeft: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>
                            {card!.steps!.map((step, si) => (
                              <div key={si} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: si < card!.steps!.length - 1 ? `1px solid #F1F5F9` : 'none', alignItems: 'flex-start' }}>
                                <div style={{ width: 26, height: 26, borderRadius: '50%', background: navy, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                  {step.num}
                                </div>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: navy, marginBottom: 3 }}>{step.title}</div>
                                  <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{step.desc}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Data rows */}
                        {hasRows && <DataRows rows={card!.rows!} />}

                        {/* Summary prose */}
                        <div style={{ background: '#fff', padding: '14px 18px', borderLeft: `1px solid ${border}`, borderRight: `1px solid ${border}`, borderBottom: 'none', borderRadius: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#94A3B8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>Your school — facts</span>
                            <span style={{ flex: 1, height: 1, background: border, display: 'inline-block' }} />
                          </div>
                          <div style={{ fontSize: 14, color: navy, lineHeight: 1.7 }}>{renderMarkdown(msg.facts!)}</div>
                        </div>

                        {/* Signals */}
                        {hasSignals && (
                          <div style={{ background: '#F0FDF8', borderLeft: `1px solid rgba(52,195,160,0.25)`, borderRight: `1px solid rgba(52,195,160,0.25)`, borderBottom: 'none', borderRadius: 0, padding: '12px 18px' }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#94A3B8', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span>World signals — live news</span>
                              <span style={{ flex: 1, height: 1, background: 'rgba(52,195,160,0.2)', display: 'inline-block' }} />
                            </div>
                            {signals.map((sig, si) => (
                              <div key={si} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: si < signals.length - 1 ? `1px solid rgba(52,195,160,0.15)` : 'none', alignItems: 'flex-start' }}>
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: teal, marginTop: 6, flexShrink: 0 }} />
                                <div>
                                  <div style={{ fontSize: 13, color: navy, lineHeight: 1.5 }}>{sig.text}</div>
                                  {sig.source && <div style={{ fontSize: 11, color: teal, fontWeight: 600, marginTop: 2 }}>{sig.source}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Tip */}
                        {hasIntel && (
                          <div style={{ background: navy, borderRadius: hasSources ? 0 : '0 0 12px 12px', padding: '12px 18px' }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: teal, marginBottom: 4 }}>Tip</div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55 }}>{msg.intelligence}</div>
                          </div>
                        )}

                        <SourcesBar
                          sources={msg.sources || []}
                          onPDF={() => savePDF(currentSchool.name, msg.facts!, msg.signals, msg.intelligence, msg.sources)}
                        />

                        {/* Edit button */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, paddingLeft: 2 }}>
                          <button onClick={() => openEdit(i, msg)} style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: teal, border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                            ✏ Edit / Customise
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{ borderTop: `1px solid ${border}`, padding: '14px 20px', display: 'flex', gap: 10, alignItems: 'flex-end', flexShrink: 0, background: '#fff' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Ask anything about ${currentSchool.name}...`}
            rows={1}
            style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: `1px solid ${border}`, fontSize: 14, fontFamily: 'inherit', resize: 'none', outline: 'none', color: navy, lineHeight: 1.5, background: '#F8FAFC' }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            style={{ padding: '11px 22px', borderRadius: 10, border: 'none', background: loading || !input.trim() ? border : teal, color: loading || !input.trim() ? muted : '#fff', fontSize: 14, fontWeight: 700, cursor: loading || !input.trim() ? 'default' : 'pointer', fontFamily: 'inherit' }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Add-block dropdown (fixed position) */}
      {addDrop && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: addDrop.top, left: addDrop.left, zIndex: 9999,
            background: '#fff', border: `1px solid ${border}`, borderRadius: 10,
            boxShadow: '0 8px 24px rgba(27,50,82,0.12)', padding: 6, minWidth: 170,
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#94A3B8', padding: '4px 8px 6px' }}>Insert block after</div>
          {(['alert', 'rows', 'news', 'tip'] as const).map(type => {
            const icons: Record<string, string> = { alert: '◆', rows: '▤', news: '◉', tip: '💡' }
            const names: Record<string, string> = { alert: 'Alert strip', rows: 'Data rows', news: 'News snippet', tip: 'Tip' }
            return (
              <div key={type} onClick={() => confirmAdd(type)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: navy }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F0FDF8')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 14, width: 20, textAlign: 'center' as const }}>{icons[type]}</span>
                {names[type]}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
