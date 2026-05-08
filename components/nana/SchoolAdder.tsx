'use client'

// Slice 6.6 — in-room school adder. Self-contained button + search
// popup. Owns its own open/close + search state. Used in two places:
// (1) ResearchRoom header next to the active-child pill (compact rail
//     layout — no vertical space for a separate row), and
// (2) ComparisonView's empty state when the user has removed every
//     school (otherwise they'd be stuck without an in-room recovery).
//
// Trust pattern: POST /api/research-room/shortlist {action:'add'} —
// route + RPC re-validate ownership server-side.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Hit = { slug: string; name: string; region: string | null; country: string | null }

export default function SchoolAdder({
  childId,
  excludeSlugs,
  variant = 'inline',
  onError,
}: {
  childId:        string | null
  excludeSlugs:   string[]
  variant?:       'inline' | 'compact'
  onError?:       (msg: string) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Outside click + Escape close the panel.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return
      if (wrapRef.current.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Hide the affordance entirely without a child context — the shortlist
  // is per-child, so the RPC needs a target.
  if (!childId) return null

  async function handlePick(slug: string) {
    if (pending) return
    setPending(true)
    try {
      const res = await fetch('/api/research-room/shortlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', child_id: childId, school_slug: slug }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const code = typeof j?.code === 'string' ? j.code : 'request_failed'
        onError?.(`Could not add the school (${code}).`)
        return
      }
      setOpen(false)
      router.refresh()
    } catch (e) {
      console.error('[SchoolAdder add school]', e)
      onError?.('Network error adding the school.')
    } finally {
      setPending(false)
    }
  }

  const btnClass = variant === 'compact'
    ? 'rr-cmp-add-school-btn rr-cmp-add-school-btn--compact'
    : 'rr-cmp-add-school-btn'

  return (
    <div className="rr-cmp-add-school" ref={wrapRef}>
      <button
        type="button"
        className={btnClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen(o => !o)}
      >
        <span aria-hidden>+</span> Add school
      </button>
      {open && (
        <SchoolAddPopup
          excludeSlugs={excludeSlugs}
          onPick={handlePick}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function SchoolAddPopup({
  excludeSlugs,
  onPick,
  onClose,
}: {
  excludeSlugs: string[]
  onPick:       (slug: string) => void
  onClose:      () => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Validate excludeSlugs once per render so a stray UUID-shaped or
  // bad string can't poison the SQL .not(...) clause. Strings already
  // match ^[a-z0-9-]+$ in production data; this is belt-and-braces.
  const safeExclude = excludeSlugs.filter(s => /^[a-z0-9-]{1,80}$/.test(s))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    const ac = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const { createSupabaseBrowser } = await import('@/lib/supabase-browser')
        const supabase = createSupabaseBrowser()
        let q1 = supabase
          .from('schools')
          .select('slug, name, region, country')
          .ilike('name', `%${q}%`)
        if (safeExclude.length > 0) {
          q1 = q1.not('slug', 'in', `(${safeExclude.join(',')})`)
        }
        const { data, error } = await q1
          .order('name', { ascending: true })
          .limit(8)
          .abortSignal(ac.signal)
        if (error) {
          const looksAborted =
            ac.signal.aborted ||
            /abort/i.test(error.message ?? '') ||
            /abort/i.test((error as { name?: string }).name ?? '')
          if (!looksAborted) console.error('[SchoolAddPopup search]', error)
          return
        }
        setHits((data ?? []) as Hit[])
        setActiveIdx(0)
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, safeExclude.join(',')])

  // Suppress unused-var warning for UUID_RE; kept around in case future
  // call sites need to validate child_id locally.
  void UUID_RE

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      if (hits[activeIdx]) {
        e.preventDefault()
        onPick(hits[activeIdx].slug)
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="rr-cmp-add-popup" role="dialog" aria-label="Add a school to your comparison">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Search schools by name…"
        className="rr-cmp-add-input"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="rr-cmp-add-results" role="listbox">
        {query.trim().length < 2 && (
          <div className="rr-cmp-add-hint">Type 2+ characters to search.</div>
        )}
        {query.trim().length >= 2 && loading && hits.length === 0 && (
          <div className="rr-cmp-add-hint">Searching…</div>
        )}
        {query.trim().length >= 2 && !loading && hits.length === 0 && (
          <div className="rr-cmp-add-hint">No matches. (Already-shortlisted schools are filtered out.)</div>
        )}
        {hits.map((h, i) => (
          <button
            key={h.slug}
            type="button"
            role="option"
            aria-selected={i === activeIdx}
            className={`rr-cmp-add-result${i === activeIdx ? ' is-active' : ''}`}
            onClick={() => onPick(h.slug)}
            onMouseEnter={() => setActiveIdx(i)}
          >
            <span className="rr-cmp-add-result-name">{h.name}</span>
            {(h.region || h.country) && (
              <span className="rr-cmp-add-result-meta">
                {[h.region, h.country].filter(Boolean).join(' · ')}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
