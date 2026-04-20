/**
 * <ReportNav> — Side TOC (desktop, sticky) + Mobile TOC (collapsible).
 *
 * Mirrors the mockup. The section ids the links point to must match the component
 * section ids: key-facts, curriculum, destinations, admissions, fees, pastoral,
 * community, daily-life, recent, reg-status, financial, inspection, safeguarding,
 * fit, questions, glossary, sources.
 */

type TocItem = { href: string; label: string }
type TocGroup = { label: string; items: TocItem[] }

const DEFAULT_GROUPS: TocGroup[] = [
  {
    label: 'Part 1 — At a glance',
    items: [
      { href: '#key-facts',     label: 'Key facts' },
      { href: '#curriculum',    label: 'Curriculum & results' },
      { href: '#destinations',  label: 'Destinations' },
      { href: '#admissions',    label: 'Admissions' },
      { href: '#fees',          label: 'Fees & true cost' },
      { href: '#pastoral',      label: 'Pastoral & facilities' },
      { href: '#community',     label: 'Student community' },
      { href: '#daily-life',    label: 'Daily life' },
      { href: '#recent',        label: 'Last 12 months' },
    ],
  },
  {
    label: 'Part 2 — Deep',
    items: [
      { href: '#reg-status',    label: 'Regulatory status' },
      { href: '#financial',     label: 'Financial health' },
      { href: '#inspection',    label: 'Inspection record' },
      { href: '#safeguarding',  label: 'Safeguarding' },
      { href: '#fit',           label: 'Parent fit' },
      { href: '#questions',     label: '5 tour questions' },
      { href: '#glossary',      label: 'Glossary' },
      { href: '#sources',       label: 'Sources' },
    ],
  },
]

export function SideTOC() {
  return (
    <nav className="side-toc" aria-label="On this page">
      <div className="side-toc-title">On this page</div>
      <ul>
        <li><a href="#top">↑ Top — verdict</a></li>
        {DEFAULT_GROUPS.map((g) => (
          <div key={g.label}>
            <li className="toc-part">{g.label}</li>
            {g.items.map((i) => <li key={i.href}><a href={i.href}>{i.label}</a></li>)}
          </div>
        ))}
      </ul>
    </nav>
  )
}

export function MobileTOC() {
  return (
    <details className="mobile-toc">
      <summary>
        Jump to section
        <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>— tap to expand</span>
      </summary>
      <div className="mobile-toc-body">
        {DEFAULT_GROUPS.map((g) => (
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
