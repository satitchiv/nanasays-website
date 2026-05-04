'use client'

import { useEffect, useState } from 'react'

type TocItem  = { href: string; label: string }
type TocGroup = { label: string; items: TocItem[] }

/* Order mirrors physical page scroll order so the active highlight tracks
   straight down as the user scrolls. Don't reorder for thematic neatness —
   it must match the actual first-occurrence anchor order in
   app/schools/[slug]/page.tsx and any nested report components. */
const DEFAULT_GROUPS: TocGroup[] = [
  {
    label: 'Quick view',
    items: [
      { href: '#location',     label: 'Location' },
      { href: '#scorecard',    label: 'Scorecard' },
      { href: '#key-details',  label: 'Key details' },
    ],
  },
  {
    label: 'Costs & checks',
    items: [
      { href: '#scholarships', label: 'Scholarships & aid' },
      { href: '#isi',          label: 'ISI inspection' },
      { href: '#fees',         label: 'Fees' },
    ],
  },
  {
    label: 'About & entry',
    items: [
      { href: '#about',        label: 'About' },
      { href: '#academic',     label: 'Academic results' },
      { href: '#admissions',   label: 'Admissions' },
    ],
  },
  {
    label: 'Outcomes',
    items: [
      { href: '#why-choose',   label: 'Why choose' },
      { href: '#destinations', label: 'Destinations' },
    ],
  },
  {
    label: 'Life at school',
    items: [
      { href: '#boarding',     label: 'Boarding' },
      { href: '#school-day',   label: 'School day' },
      { href: '#student-life', label: 'Student life' },
      { href: '#facilities',   label: 'Facilities' },
      { href: '#wellbeing',    label: 'Wellbeing' },
      { href: '#demographics', label: 'Demographics' },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '#curriculum',   label: 'Curriculum by stage' },
      { href: '#background',   label: 'School background' },
      { href: '#sports',       label: 'Sport overview' },
      { href: '#alumni',       label: 'Notable alumni' },
      { href: '#faq',          label: 'FAQ' },
      { href: '#similar',      label: 'Similar schools' },
    ],
  },
]

const ALL_ITEMS = DEFAULT_GROUPS.flatMap(g => g.items)

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

export default function SchoolPageNav() {
  const active = useActiveSection()
  const groups = useFilteredGroups()

  return (
    <nav className="school-page-nav" aria-label="On this page">
      <ul>
        {groups.map((g) => (
          <li key={g.label} className="grp">
            <div className="grp-label">{g.label}</div>
            <ul>
              {g.items.map((i) => (
                <li key={i.href}>
                  <a
                    href={i.href}
                    className={active === i.href.slice(1) ? 'is-active' : ''}
                  >
                    {i.label}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}
