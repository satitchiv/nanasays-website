'use client'

import { useState, useEffect, useRef } from 'react'
import './visit-notes.css'

export default function VisitNotes({ slug }: { slug: string }) {
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/visit-notes/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.content) setContent(data.content)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [slug])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value)
    setStatus('idle')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(e.target.value), 1200)
  }

  async function save(value: string) {
    setStatus('saving')
    try {
      const res = await fetch(`/api/visit-notes/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value }),
      })
      setStatus(res.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (!loaded) return null

  return (
    <section className="visit-notes">
      <div className="visit-notes-header">
        <h3 className="visit-notes-title">My notes</h3>
        <span className={`visit-notes-status visit-notes-status--${status}`}>
          {status === 'saving' && 'Saving…'}
          {status === 'saved' && '✓ Saved'}
          {status === 'error' && 'Error saving'}
        </span>
      </div>
      <textarea
        className="visit-notes-textarea"
        value={content}
        onChange={handleChange}
        placeholder="Jot down anything from your visit, things to ask, gut feelings… saved automatically."
        rows={5}
      />
    </section>
  )
}
