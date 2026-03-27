'use client'

import { useEffect, useState } from 'react'

export interface FilterState {
  stage: Set<string>       // early_years | primary | secondary | all_through
  curriculum: Set<string>  // ib | british | american | cambridge | montessori
  budget: string           // all | under_10k | 10_25k | over_25k
  boarding: boolean
  scholarship: boolean
  sen: boolean
  eal: boolean
}

export const EMPTY_FILTERS: FilterState = {
  stage: new Set(),
  curriculum: new Set(),
  budget: 'all',
  boarding: false,
  scholarship: false,
  sen: false,
  eal: false,
}

export function countActiveFilters(f: FilterState): number {
  return (
    f.stage.size +
    f.curriculum.size +
    (f.budget !== 'all' ? 1 : 0) +
    (f.boarding ? 1 : 0) +
    (f.scholarship ? 1 : 0) +
    (f.sen ? 1 : 0) +
    (f.eal ? 1 : 0)
  )
}

interface Props {
  open: boolean
  onClose: () => void
  filters: FilterState
  onChange: (f: FilterState) => void
  matchCount: number
}

export default function FilterDrawer({ open, onClose, filters, onChange, matchCount }: Props) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  function toggleSet(key: 'stage' | 'curriculum', value: string) {
    const next = new Set(filters[key])
    next.has(value) ? next.delete(value) : next.add(value)
    onChange({ ...filters, [key]: next })
  }

  function clearAll() {
    onChange({
      stage: new Set(),
      curriculum: new Set(),
      budget: 'all',
      boarding: false,
      scholarship: false,
      sen: false,
      eal: false,
    })
  }

  const activeCount = countActiveFilters(filters)

  // Panel styles — bottom drawer on mobile, left-overlay on desktop
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '82vh',
        borderRadius: '18px 18px 0 0',
        zIndex: 1000,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.28s cubic-bezier(0.32,0,0.67,0)',
        boxShadow: '0 -8px 40px rgba(0,0,0,.18)',
      }
    : {
        position: 'fixed',
        top: 60,
        left: 0,
        width: 320,
        height: 'calc(100vh - 60px)',
        zIndex: 1000,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s cubic-bezier(0.32,0,0.67,0)',
        boxShadow: '4px 0 32px rgba(0,0,0,.14)',
        borderRight: '1px solid #eee',
      }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,.4)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s',
        }}
      />

      {/* Panel */}
      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
          borderBottom: '1px solid #eee',
          flexShrink: 0,
        }}>
          {isMobile && (
            <div style={{
              width: 36, height: 4, background: '#ddd', borderRadius: 2,
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            }} />
          )}
          <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 16, color: '#1B3252' }}>
            Filter Schools
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {activeCount > 0 && (
              <button onClick={clearAll} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: '#34C3A0', fontWeight: 700,
                fontFamily: "'Nunito Sans', sans-serif",
                padding: 0,
              }}>
                Clear all
              </button>
            )}
            <button onClick={onClose} style={{
              background: 'none', border: '1px solid #ddd', borderRadius: 8,
              width: 30, height: 30, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#555',
            }}>
              ×
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0 8px' }}>

          <Section title="Stage">
            {[
              { value: 'early_years', label: 'Early Years', sub: 'Ages 2–5' },
              { value: 'primary', label: 'Primary', sub: 'Ages 5–11' },
              { value: 'secondary', label: 'Secondary', sub: 'Ages 11–18' },
              { value: 'all_through', label: 'All-Through', sub: 'Nursery to 18' },
            ].map(opt => (
              <CheckRow
                key={opt.value}
                label={opt.label}
                sub={opt.sub}
                checked={filters.stage.has(opt.value)}
                onChange={() => toggleSet('stage', opt.value)}
              />
            ))}
          </Section>

          <Section title="Curriculum">
            {[
              { value: 'ib', label: 'IB (International Baccalaureate)' },
              { value: 'british', label: 'British / IGCSE / A-Level' },
              { value: 'american', label: 'American / AP' },
              { value: 'cambridge', label: 'Cambridge' },
              { value: 'montessori', label: 'Montessori' },
            ].map(opt => (
              <CheckRow
                key={opt.value}
                label={opt.label}
                checked={filters.curriculum.has(opt.value)}
                onChange={() => toggleSet('curriculum', opt.value)}
              />
            ))}
          </Section>

          <Section title="Annual Fees">
            {[
              { value: 'all', label: 'Any budget' },
              { value: 'under_10k', label: 'Under $10,000' },
              { value: '10_25k', label: '$10,000 – $25,000' },
              { value: 'over_25k', label: 'Over $25,000' },
            ].map(opt => (
              <RadioRow
                key={opt.value}
                label={opt.label}
                checked={filters.budget === opt.value}
                onChange={() => onChange({ ...filters, budget: opt.value })}
              />
            ))}
          </Section>

          <Section title="School Options">
            {[
              { key: 'boarding' as const, label: 'Boarding available', sub: 'School offers residential boarding' },
              { key: 'scholarship' as const, label: 'Scholarships available', sub: 'Financial support offered' },
              { key: 'sen' as const, label: 'SEN Support', sub: 'Special educational needs provision' },
              { key: 'eal' as const, label: 'EAL Support', sub: 'English as an additional language' },
            ].map(opt => (
              <ToggleRow
                key={opt.key}
                label={opt.label}
                sub={opt.sub}
                checked={filters[opt.key]}
                onChange={() => onChange({ ...filters, [opt.key]: !filters[opt.key] })}
              />
            ))}
          </Section>

        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid #eee',
          flexShrink: 0,
          background: '#fff',
        }}>
          <button onClick={onClose} style={{
            width: '100%',
            padding: '13px 0',
            background: '#1B3252',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontFamily: 'Nunito, sans-serif',
            fontWeight: 900,
            fontSize: 14,
            cursor: 'pointer',
          }}>
            Show {matchCount} school{matchCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '16px 20px 4px', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{
        fontSize: 10, fontWeight: 800, color: '#9CA3AF', letterSpacing: '0.12em',
        textTransform: 'uppercase', fontFamily: "'Nunito Sans', sans-serif",
        marginBottom: 10,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </div>
    </div>
  )
}

function CheckRow({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px',
      cursor: 'pointer', borderRadius: 8,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        border: checked ? 'none' : '2px solid #D1D5DB',
        background: checked ? '#34C3A0' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .15s',
      }}>
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ display: 'none' }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1B3252', fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.3 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: "'Nunito Sans', sans-serif", marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
    </label>
  )
}

function RadioRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px',
      cursor: 'pointer', borderRadius: 8,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        border: checked ? '5px solid #34C3A0' : '2px solid #D1D5DB',
        background: '#fff',
        transition: 'all .15s',
      }} />
      <input type="radio" checked={checked} onChange={onChange} style={{ display: 'none' }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: '#1B3252', fontFamily: "'Nunito Sans', sans-serif" }}>
        {label}
      </span>
    </label>
  )
}

function ToggleRow({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, padding: '10px 4px', cursor: 'pointer', borderRadius: 8,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1B3252', fontFamily: "'Nunito Sans', sans-serif", lineHeight: 1.3 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: "'Nunito Sans', sans-serif", marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
      {/* Toggle pill */}
      <div style={{
        width: 40, height: 22, borderRadius: 11, flexShrink: 0,
        background: checked ? '#34C3A0' : '#E5E7EB',
        position: 'relative', transition: 'background .2s',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,.2)',
          transition: 'left .2s',
        }} />
      </div>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ display: 'none' }} />
    </label>
  )
}
