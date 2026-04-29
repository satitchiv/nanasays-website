'use client'

import { useState, useEffect } from 'react'
import './shortlist-button.css'

export default function ShortlistButton({ slug }: { slug: string }) {
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/shortlist')
      .then(r => r.ok ? r.json() : { slugs: [] })
      .then(data => {
        setSaved(Array.isArray(data.slugs) && data.slugs.includes(slug))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [slug])

  async function toggle() {
    const wasSaved = saved
    setSaved(!wasSaved)
    const res = await fetch(
      wasSaved ? `/api/shortlist?slug=${encodeURIComponent(slug)}` : '/api/shortlist',
      {
        method: wasSaved ? 'DELETE' : 'POST',
        headers: wasSaved ? undefined : { 'Content-Type': 'application/json' },
        body: wasSaved ? undefined : JSON.stringify({ slug }),
      }
    )
    if (!res.ok) setSaved(wasSaved)
  }

  if (loading) return null

  return (
    <button
      className={`shortlist-btn${saved ? ' shortlist-btn--saved' : ''}`}
      onClick={toggle}
      aria-label={saved ? 'Remove from shortlist' : 'Save to shortlist'}
    >
      {saved ? '★ Saved to shortlist' : '☆ Save to shortlist'}
    </button>
  )
}
