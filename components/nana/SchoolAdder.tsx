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

type Hit = { slug: string; name: string; region: string | null; country: string | null }

export default function SchoolAdder({
  childId,
  excludeSlugs,
  variant = 'inline',
}: {
  childId:        string | null
  excludeSlugs:   string[]
  variant?:       'inline' | 'compact'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    setError(null)
    try {
      const res = await fetch('/api/research-room/shortlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', child_id: childId, school_slug: slug }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const code = typeof j?.code === 'string' ? j.code : 'request_failed'
        // Codex t12 P1: surface the error inline. The previous
        // `onError?.()` swallow path silently no-op'd at both call
        // sites, leaving the user thinking nothing had happened.
        if (code === 'payment_required') {
          setError('Adding schools is a paid-tier feature.')
        } else if (code === 'invalid_payload') {
          setError("Couldn't add that school (invalid input).")
        } else if (code === 'unauthorized') {
          setError('Please sign in again to add schools.')
        } else {
          setError(`Couldn't add the school (${code}).`)
        }
        return
      }
      setOpen(false)
      router.refresh()
    } catch (e) {
      console.error('[SchoolAdder add school]', e)
      setError('Network error adding the school. Try again.')
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
          error={error}
          onDismissError={() => setError(null)}
          onPick={handlePick}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

// Normalize school name for grouping: lowercase + collapse whitespace.
// Names like "Reed's School" and "Reed's School " collapse to one key.
function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Pick the "primary" record from a duplicate-name group. Heuristic
// (chosen because the database has dups like Reed's where one entry
// has incorrect region):
//   1. Prefer a slug that ends in `-uk` if any (treated as canonical
//      UK record by the data team).
//   2. Else prefer the entry with both region + country populated.
//   3. Else prefer the entry with country populated.
//   4. Else shortest slug (the un-numbered base slug).
function pickPrimary(entries: Hit[]): Hit {
  const ukSuffix = entries.find(e => e.slug.endsWith('-uk'))
  if (ukSuffix) return ukSuffix
  const both = entries.find(e => e.region && e.country)
  if (both) return both
  const country = entries.find(e => e.country)
  if (country) return country
  return [...entries].sort((a, b) => a.slug.length - b.slug.length || a.slug.localeCompare(b.slug))[0]
}

type Group = { name: string; primary: Hit; alternates: Hit[] }

function groupByName(hits: Hit[]): Group[] {
  const map = new Map<string, Hit[]>()
  for (const h of hits) {
    const key = normName(h.name)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(h)
  }
  // Stable order: by name (for display), entries already came pre-sorted by name asc.
  const out: Group[] = []
  Array.from(map.values()).forEach((entries: Hit[]) => {
    const primary = pickPrimary(entries)
    const alternates = entries.filter((e: Hit) => e.slug !== primary.slug)
    out.push({ name: primary.name, primary, alternates })
  })
  return out
}

function SchoolAddPopup({
  excludeSlugs,
  error,
  onDismissError,
  onPick,
  onClose,
}: {
  excludeSlugs:    string[]
  error:           string | null
  onDismissError:  () => void
  onPick:          (slug: string) => void
  onClose:         () => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  // Codex t12 T1.3: groups with >1 entry are collapsed by default;
  // user clicks a toggle to reveal alternates. Don't silently hide.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
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

  // Build a flat list of "selectable" entries respecting expand state.
  // Each entry knows its hit + group context for rendering. Keyboard
  // nav and activeIdx index into this flat list.
  type FlatEntry = {
    hit:              Hit
    group:            Group
    isPrimary:        boolean
    isOnlyMember:     boolean
  }
  const groups = groupByName(hits)
  const flat: FlatEntry[] = []
  for (const group of groups) {
    flat.push({ hit: group.primary, group, isPrimary: true, isOnlyMember: group.alternates.length === 0 })
    if (expandedGroups.has(normName(group.name))) {
      for (const alt of group.alternates) {
        flat.push({ hit: alt, group, isPrimary: false, isOnlyMember: false })
      }
    }
  }

  function toggleGroup(name: string) {
    const k = normName(name)
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(flat.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      if (flat[activeIdx]) {
        e.preventDefault()
        onPick(flat[activeIdx].hit.slug)
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
        onChange={e => { setQuery(e.target.value); onDismissError() }}
        onKeyDown={handleKey}
        placeholder="Search schools by name…"
        className="rr-cmp-add-input"
        autoComplete="off"
        spellCheck={false}
      />
      {error && (
        <div className="rr-cmp-add-error" role="alert">
          {error}
          <button type="button" className="rr-cmp-add-error-dismiss" onClick={onDismissError} aria-label="Dismiss error">×</button>
        </div>
      )}
      <div className="rr-cmp-add-results" role="listbox">
        {query.trim().length < 2 && !error && (
          <div className="rr-cmp-add-hint">Type 2+ characters to search.</div>
        )}
        {query.trim().length >= 2 && loading && flat.length === 0 && (
          <div className="rr-cmp-add-hint">Searching…</div>
        )}
        {query.trim().length >= 2 && !loading && flat.length === 0 && (
          <div className="rr-cmp-add-hint">No matches. (Already-shortlisted schools are filtered out.)</div>
        )}
        {flat.map((entry, i) => {
          const { hit, group, isPrimary } = entry
          const isExpanded = expandedGroups.has(normName(group.name))
          const altCount = group.alternates.length
          return (
            <div
              key={hit.slug}
              className={`rr-cmp-add-row${isPrimary ? '' : ' rr-cmp-add-row--alt'}`}
            >
              <button
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                className={`rr-cmp-add-result${i === activeIdx ? ' is-active' : ''}`}
                onClick={() => onPick(hit.slug)}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span className="rr-cmp-add-result-name">{hit.name}</span>
                {(hit.region || hit.country) ? (
                  <span className="rr-cmp-add-result-meta">
                    {[hit.region, hit.country].filter(Boolean).join(' · ')}
                  </span>
                ) : (
                  !isPrimary && <span className="rr-cmp-add-result-meta">no location data</span>
                )}
              </button>
              {/* Group expand toggle — only on the primary row of a
                  multi-entry group. Lets the parent see + pick from
                  the alternates instead of silently hiding them. */}
              {isPrimary && altCount > 0 && (
                <button
                  type="button"
                  className="rr-cmp-add-group-toggle"
                  aria-label={isExpanded ? `Hide ${altCount} other record${altCount === 1 ? '' : 's'}` : `Show ${altCount} other record${altCount === 1 ? '' : 's'}`}
                  onClick={(ev) => { ev.stopPropagation(); toggleGroup(group.name) }}
                  title={isExpanded ? 'Collapse alternates' : `${altCount} other record${altCount === 1 ? '' : 's'} match this name`}
                >
                  {isExpanded ? '▴' : `▾ +${altCount}`}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
