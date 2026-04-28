'use client'
import { useState } from 'react'

interface Alumna {
  name: string
  known_for: string
}

interface Props {
  alumni: Alumna[]
}

const VISIBLE = 6

export default function AlumniSection({ alumni }: Props) {
  const [expanded, setExpanded] = useState(false)

  // Filter out broken markdown-link entries (name starts with '[')
  const clean = alumni.filter(a => a.name && !a.name.startsWith('[') && !a.known_for?.startsWith('http'))
  if (clean.length === 0) return null

  const visible = expanded ? clean : clean.slice(0, VISIBLE)
  const hidden = clean.length - VISIBLE

  return (
    <div style={{ marginBottom: 52 }}>
      <h2 style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
        color: 'var(--teal-dk)', marginBottom: 18, paddingBottom: 10,
        borderBottom: '2px solid var(--border)', fontWeight: 800,
        fontFamily: 'var(--font-nunito), Nunito, sans-serif',
      }}>
        Notable Alumni
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
        {visible.map((a, i) => (
          <div key={i} style={{
            background: 'var(--off)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 3 }}>
              {a.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              {a.known_for}
            </div>
          </div>
        ))}
      </div>

      {!expanded && hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 10, fontSize: 13, fontWeight: 600,
            color: 'var(--teal-dk)', background: 'none', border: 'none',
            cursor: 'pointer', padding: 0, textDecoration: 'underline',
            textDecorationColor: 'rgba(0,128,110,0.3)',
          }}
        >
          +{hidden} more notable alumni
        </button>
      )}
    </div>
  )
}
