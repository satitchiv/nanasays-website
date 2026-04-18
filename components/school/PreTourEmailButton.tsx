'use client'

import { useState } from 'react'

interface Props {
  slug: string
  schoolName: string
}

export default function PreTourEmailButton({ slug, schoolName }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [email, setEmail]   = useState('')
  const [copied, setCopied] = useState(false)
  const [open, setOpen]     = useState(false)

  async function generate() {
    setState('loading')
    setOpen(true)
    try {
      const res  = await fetch('/api/pretour-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ slug }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setEmail(data.email)
      setState('done')
    } catch {
      setState('error')
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <button
        onClick={generate}
        disabled={state === 'loading'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: state === 'loading' ? 'var(--off)' : 'var(--navy)',
          color: state === 'loading' ? 'var(--muted)' : '#fff',
          border: '1px solid var(--border)',
          padding: '12px 22px', borderRadius: 8, fontSize: 14,
          fontWeight: 700, textDecoration: 'none', cursor: state === 'loading' ? 'wait' : 'pointer',
          transition: 'opacity 0.15s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
        {state === 'loading' ? 'Generating…' : 'Generate Pre-Tour Email'}
      </button>

      {open && (
        <div style={{
          marginTop: 16,
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#fff',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--off)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
              Pre-Tour Questions — {schoolName}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {state === 'done' && (
                <button
                  onClick={copy}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 12px',
                    borderRadius: 6, border: '1px solid var(--border)',
                    background: copied ? '#e6f4ea' : '#fff',
                    color: copied ? '#1a7a3c' : 'var(--navy)',
                    cursor: 'pointer',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy email'}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 12, padding: '5px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: '#fff',
                  color: 'var(--muted)', cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: 16 }}>
            {state === 'loading' && (
              <div style={{ color: 'var(--muted)', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>
                Pulling school data and generating your questions…
              </div>
            )}
            {state === 'error' && (
              <div style={{ color: '#c00', fontSize: 14 }}>
                Something went wrong. Please try again.
              </div>
            )}
            {state === 'done' && (
              <pre style={{
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontSize: 13, lineHeight: 1.7,
                fontFamily: 'inherit', margin: 0,
                color: 'var(--navy)',
              }}>
                {email}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
