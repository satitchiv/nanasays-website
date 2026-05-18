'use client'

// Slice 6.6 — in-room school adder. Self-contained button + search
// popup. Used in two places:
//   (1) ResearchRoom header next to the active-child pill (compact rail
//       layout — no vertical space for a separate row), and
//   (2) ComparisonView's empty state when the user has removed every
//       school (otherwise they'd be stuck without an in-room recovery).
//
// Trust pattern:
//   • Search        → POST /api/research-room/search-schools  (server-side
//                     richness + grouping + canonicalization; uses
//                     service-role to bypass RLS on school_structured_data)
//   • Add school    → POST /api/research-room/shortlist {action:'add'}
//                     The route re-canonicalizes by default; SchoolAdder
//                     passes `skip_canonicalize:true` only when the user
//                     deliberately picks an alternate (group expanded).
//
// 2026-05-18 — moved search+richness from the browser to a server route
// after Codex deep-investigation flagged 8 picker bugs, most material:
// browser anon role gets permission_denied on school_structured_data
// since the 2026-05-03 RLS lockdown, which made the empty richness map
// fall through to the `-uk wins` tiebreaker and return the data-poor
// twin for ~79 duplicate-name UK school groups.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Hit = { slug: string; name: string; region: string | null; country: string | null }
type Group = { name: string; primary: Hit; alternates: Hit[] }

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

  async function handlePick(slug: string, skipCanonicalize: boolean) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/research-room/shortlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:            'add',
          child_id:          childId,
          school_slug:       slug,
          skip_canonicalize: skipCanonicalize,
        }),
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

// Local normalisation purely for the expand-group key. Mirrors the
// server's normName closely enough for keyboard nav / expanded-state
// to stay coherent; we don't need exact parity because the server is
// the source of truth for group membership.
function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
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
  onPick:          (slug: string, skipCanonicalize: boolean) => void
  onClose:         () => void
}) {
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  // Groups with >1 entry are collapsed by default; user clicks a toggle
  // to reveal alternates. Don't silently hide.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Codex r2 P2 #3 + r3 P2: monotonic request id. A fetch that resolves
  // AFTER a newer query started must not overwrite the newer query's
  // groups. Bumped synchronously in onChange (so the gap between
  // setQuery and the effect re-run is covered) and again at the top of
  // every effect run (so prop-driven re-runs invalidate too). Captured
  // in each effect closure; setGroups guarded by reqId match on every
  // write path. setLoading(true) at the timer-fire is unguarded —
  // intentional, cosmetic: a stale timer can briefly flash "Searching…"
  // before the new effect's setLoading lands, but it cannot repopulate
  // stale groups. No separate pick-time check needed — `flat` is
  // recomputed from `groups` every render, so any click can only target
  // rows from the latest setGroups call.
  const reqIdRef = useRef(0)

  // Validate excludeSlugs once per render — belt-and-braces; the route
  // re-validates with the same regex.
  const safeExclude = excludeSlugs.filter(s => /^[a-z0-9-]{1,80}$/.test(s))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    // Codex r3 P2: invalidate any in-flight fetch on EVERY effect
    // re-run (covers prop-driven re-runs like excludeSlugs changing,
    // and the <2-char short-circuit below). Combined with the bump in
    // onChange, every state transition that could produce stale results
    // also produces a new reqId.
    reqIdRef.current += 1
    const myReqId = reqIdRef.current
    const q = query.trim()
    if (q.length < 2) {
      setGroups([])
      setLoading(false)
      return
    }
    const ac = new AbortController()
    // Codex r1 P2 #5: clear previous hits synchronously (also done in
    // onChange) so a click during the debounce window can't act on the
    // wrong result set.
    setGroups([])
    setActiveIdx(0)
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/research-room/search-schools', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ q, excludeSlugs: safeExclude }),
          signal:  ac.signal,
        })
        if (ac.signal.aborted || myReqId !== reqIdRef.current) return
        if (!res.ok) {
          // Don't surface the network error here — the popup is the
          // search affordance, the user will retry by typing again. The
          // add-school error path already handles fetch failures.
          console.warn('[SchoolAddPopup search]', res.status, await res.text().catch(() => ''))
          if (myReqId === reqIdRef.current) setGroups([])
          return
        }
        const json = await res.json() as { ok: true; groups: Group[] } | { ok: false; code: string }
        if (myReqId !== reqIdRef.current) return
        if (!('ok' in json) || !json.ok) {
          console.warn('[SchoolAddPopup search]', (json as { code?: string }).code)
          setGroups([])
          return
        }
        setGroups(json.groups)
        setActiveIdx(0)
      } catch (e) {
        if (ac.signal.aborted) return
        const aborted = (e as { name?: string })?.name === 'AbortError'
        if (!aborted) console.warn('[SchoolAddPopup search]', e)
      } finally {
        if (!ac.signal.aborted && myReqId === reqIdRef.current) setLoading(false)
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

  function pickFlat(entry: FlatEntry) {
    // skip_canonicalize is true when the user deliberately picks an
    // alternate (group expanded). For the primary row, the server
    // already canonicalized — but we still send skip_canonicalize:false
    // so the shortlist route's belt-and-braces fires uniformly
    // regardless of whether a future caller bypasses the search route.
    onPick(entry.hit.slug, !entry.isPrimary)
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
        pickFlat(flat[activeIdx])
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
        onChange={e => {
          // Codex r1 P2 #5 + r3 P2: clear groups, reset active row, AND
          // bump reqIdRef SYNCHRONOUSLY on every keystroke so an in-flight
          // fetch from the previous query that resolves between this
          // onChange and the effect re-run can't pass the
          // `myReqId === reqIdRef.current` check and repopulate stale
          // groups. Effect also bumps on its own re-run (covers prop-
          // driven re-runs like excludeSlugs changing).
          reqIdRef.current += 1
          setQuery(e.target.value)
          setGroups([])
          setActiveIdx(0)
          onDismissError()
        }}
        onKeyDown={handleKey}
        placeholder="Search UK schools by name…"
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
          <div className="rr-cmp-add-hint">No matches in the UK directory. (Already-shortlisted schools are filtered out.)</div>
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
                onClick={() => pickFlat(entry)}
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
