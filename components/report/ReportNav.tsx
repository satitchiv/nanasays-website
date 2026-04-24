'use client'

import { useEffect, useState } from 'react'

type TocItem  = { href: string; label: string }
type TocGroup = { label: string; items: TocItem[] }

const DEFAULT_GROUPS: TocGroup[] = [
  {
    label: 'Quick verdict',
    items: [
      { href: '#fit',           label: 'Is this school right for us?' },
      { href: '#key-facts',     label: 'Key facts' },
      { href: '#recent',        label: 'Last 12 months' },
    ],
  },
  {
    label: 'Academics & outcomes',
    items: [
      { href: '#curriculum',    label: 'Curriculum & results' },
      { href: '#destinations',  label: 'University destinations' },
      { href: '#admissions',    label: 'Admissions' },
    ],
  },
  {
    label: 'Life at school',
    items: [
      { href: '#school-life',   label: "What's it like here?" },
      { href: '#pastoral',      label: 'Pastoral & wellbeing' },
      { href: '#community',     label: 'Student community' },
      { href: '#daily-life',    label: 'Daily life' },
    ],
  },
  {
    label: 'Sports & Athletics',
    items: [
      { href: '#sports',        label: 'Sport & athletics' },
      { href: '#tennis',        label: '🎾 Tennis' },
    ],
  },
  {
    label: 'Costs & access',
    items: [
      { href: '#fees',          label: 'Fees & true cost' },
      { href: '#scholarships',  label: 'Scholarships & aid' },
      { href: '#location',      label: 'Location & getting here' },
    ],
  },
  {
    label: 'Due diligence',
    items: [
      { href: '#reg-status',    label: 'Regulatory status' },
      { href: '#financial',     label: 'Financial health' },
      { href: '#inspection',    label: 'Inspection record' },
      { href: '#safeguarding',  label: 'Safeguarding' },
      { href: '#crime',         label: 'Local safety' },
      { href: '#questions',     label: '5 questions to ask on tour' },
      { href: '#glossary',      label: 'Glossary' },
      { href: '#sources',       label: 'Sources' },
    ],
  },
]

const ALL_ITEMS = DEFAULT_GROUPS.flatMap(g => g.items)

/**
 * Filter TOC groups to only items whose target #id exists in the DOM.
 * Prevents dangling links for conditional sections (e.g. #tennis on a
 * school without meaningful tennis data). Groups emptied by the filter
 * are dropped entirely. Runs client-side only; SSR renders the full
 * list so the nav doesn't flash empty on first paint.
 */
function useFilteredGroups(): TocGroup[] {
  const [groups, setGroups] = useState<TocGroup[]>(DEFAULT_GROUPS)

  useEffect(() => {
    const filtered: TocGroup[] = DEFAULT_GROUPS
      .map(g => ({ ...g, items: g.items.filter(i => document.getElementById(i.href.slice(1))) }))
      .filter(g => g.items.length > 0)
    setGroups(filtered)
  }, [])

  return groups
}

function useActiveSection() {
  const [active, setActive] = useState<string>('')

  useEffect(() => {
    const ids = ALL_ITEMS.map(i => i.href.slice(1))
    const els = ids.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    if (!els.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActive(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    )

    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return active
}

export function SideTOC() {
  const active = useActiveSection()
  const groups = useFilteredGroups()

  return (
    <nav className="side-toc" aria-label="On this page">
      <div className="side-toc-title">On this page</div>
      <ul>
        <li><a href="#top">↑ Top — verdict</a></li>
        {groups.map((g) => (
          <div key={g.label}>
            <li className="toc-part">{g.label}</li>
            {g.items.map((i) => (
              <li key={i.href}>
                <a
                  href={i.href}
                  className={active === i.href.slice(1) ? 'toc-active' : ''}
                >
                  {i.label}
                </a>
              </li>
            ))}
          </div>
        ))}
      </ul>
    </nav>
  )
}

export function MobileTOC() {
  const groups = useFilteredGroups()
  return (
    <details className="mobile-toc">
      <summary>
        Jump to section
        <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>— tap to expand</span>
      </summary>
      <div className="mobile-toc-body">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="grp">{g.label}</div>
            <ul>
              {g.items.map((i) => <li key={i.href}><a href={i.href}>{i.label}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}
