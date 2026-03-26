'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const RegisterModal = dynamic(() => import('./RegisterModal'), { ssr: false })

export default function RegisterButton({
  label = 'Register your school',
  variant = 'teal',
}: {
  label?: string
  variant?: 'teal' | 'outline'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '16px 36px', borderRadius: 11, fontSize: 15, fontWeight: 800,
          color: variant === 'teal' ? '#fff' : 'rgba(255,255,255,.8)',
          background: variant === 'teal' ? 'var(--teal)' : 'transparent',
          border: variant === 'teal' ? 'none' : '1.5px solid rgba(255,255,255,.25)',
          cursor: 'pointer', fontFamily: 'var(--font-nunito), Nunito, sans-serif',
          letterSpacing: '0.01em',
          boxShadow: variant === 'teal' ? '0 6px 24px rgba(52,195,160,.35)' : 'none',
        }}
      >
        {label}
      </button>
      {open && <RegisterModal onClose={() => setOpen(false)} />}
    </>
  )
}
