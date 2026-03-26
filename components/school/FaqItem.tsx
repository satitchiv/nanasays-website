'use client'

import { useState } from 'react'

interface FaqItemProps {
  question: string
  answer: string
  defaultOpen?: boolean
}

export default function FaqItem({ question, answer, defaultOpen = false }: FaqItemProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          padding: '16px 0', fontSize: 16, fontWeight: 600, color: open ? 'var(--navy)' : 'var(--body)',
          cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 16, lineHeight: 1.5, fontFamily: 'inherit',
        }}
      >
        {question}
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5"
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{
          fontSize: 15, color: '#556', lineHeight: 1.8, paddingBottom: 16,
        }}>
          {answer}
        </div>
      )}
    </div>
  )
}
