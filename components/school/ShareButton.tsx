'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  schoolName: string
  schoolSlug: string
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '11px 16px', fontSize: 13, fontWeight: 600,
  color: '#1B3252', textDecoration: 'none',
  borderBottom: '1px solid #f3f4f6',
}

export default function ShareButton({ schoolName, schoolSlug }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const url  = `https://nanasays.school/schools/${schoolSlug}`
  const text = `${schoolName} — International School\n${url}`

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_) {}
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.12)', color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
          padding: '11px 18px', borderRadius: 8, fontSize: 13,
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        {copied ? 'Copied!' : 'Share'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0,
          background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          minWidth: 180, zIndex: 100, overflow: 'hidden',
        }}>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank" rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            style={rowStyle}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
            </svg>
            WhatsApp
          </a>
          <a
            href={`https://line.me/R/msg/text/?${encodeURIComponent(text)}`}
            target="_blank" rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            style={rowStyle}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#06C755">
              <path d="M12 2C6.477 2 2 6.032 2 11c0 3.443 2.012 6.457 5.048 8.222L6 22l3.226-1.694C10.05 20.75 11.01 21 12 21c5.523 0 10-4.032 10-9s-4.477-10-10-10zm5.5 12.5h-3.5v-5h1v4h2.5v1zm-5.5 0h-1v-5h1v5zm-2 0h-1v-3.5l-1.5 2-1.5-2V14.5h-1v-5h1l1.5 2 1.5-2h1v5z"/>
            </svg>
            LINE
          </a>
          <button
            onClick={copyLink}
            style={{ ...rowStyle, background: 'none', border: 'none', borderBottom: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}
    </div>
  )
}
