'use client'

import Link from 'next/link'

export default function NanaHandleLocked({ slug }: { slug: string }) {
  return (
    <Link
      href={`/unlock?from=/schools/${slug}/report`}
      aria-label="Unlock Nana"
      style={{
        position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)',
        background: '#fdfcf7', border: '1px solid #DDD4C0', borderRight: 'none',
        borderRadius: '14px 0 0 14px', padding: '18px 14px',
        boxShadow: '-4px 0 16px rgba(27,50,82,0.06)',
        cursor: 'pointer', zIndex: 80, writingMode: 'vertical-rl',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        textDecoration: 'none', opacity: 0.85,
      }}
    >
      <span style={{ fontSize: 13, writingMode: 'horizontal-tb' }}>🔒</span>
      <span style={{
        fontFamily: "'Nunito Sans', sans-serif", fontSize: 11, fontWeight: 800,
        color: '#1B3252', letterSpacing: '0.18em',
      }}>ASK NANA</span>
    </Link>
  )
}
