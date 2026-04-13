'use client'

import { useState } from 'react'

export default function ArticleShareChip({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_) {}
  }

  return (
    <button
      onClick={share}
      style={{
        marginLeft: 'auto',
        background: 'none',
        border: 'none',
        padding: 0,
        fontSize: 11,
        color: 'var(--muted)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {copied ? 'Copied!' : 'Share'}
    </button>
  )
}
