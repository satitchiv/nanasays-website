'use client'

import { useState, type ReactNode } from 'react'

type Tab = 'facts' | 'nav'

type Props = {
  factsTab: ReactNode
  navTab: ReactNode
}

const TAB_ID = {
  facts: 'sidebar-tab-facts',
  nav:   'sidebar-tab-nav',
}
const PANEL_ID = {
  facts: 'sidebar-panel-facts',
  nav:   'sidebar-panel-nav',
}

/* Sidebar with two tabs: Quick Facts (default) and On this page (TOC).
   Both panels mount; the inactive one uses `hidden` (not just display:none)
   so screen readers also skip it. SchoolPageNav's IntersectionObserver
   observes page sections outside this component, so it keeps tracking
   regardless of which tab is active. */
export default function SidebarTabs({ factsTab, navTab }: Props) {
  const [tab, setTab] = useState<Tab>('facts')

  return (
    <div className="ns-sidebar-tabs">
      <div className="ns-sidebar-tabstrip" role="tablist" aria-label="Sidebar sections">
        <button
          id={TAB_ID.facts}
          type="button"
          role="tab"
          aria-selected={tab === 'facts'}
          aria-controls={PANEL_ID.facts}
          tabIndex={tab === 'facts' ? 0 : -1}
          className={tab === 'facts' ? 'is-active' : ''}
          onClick={() => setTab('facts')}
        >
          Quick Facts
        </button>
        <button
          id={TAB_ID.nav}
          type="button"
          role="tab"
          aria-selected={tab === 'nav'}
          aria-controls={PANEL_ID.nav}
          tabIndex={tab === 'nav' ? 0 : -1}
          className={tab === 'nav' ? 'is-active' : ''}
          onClick={() => setTab('nav')}
        >
          On this page
        </button>
      </div>
      <div
        id={PANEL_ID.facts}
        role="tabpanel"
        aria-labelledby={TAB_ID.facts}
        hidden={tab !== 'facts'}
        className="ns-sidebar-tabpanel"
      >
        {factsTab}
      </div>
      <div
        id={PANEL_ID.nav}
        role="tabpanel"
        aria-labelledby={TAB_ID.nav}
        hidden={tab !== 'nav'}
        className="ns-sidebar-tabpanel"
      >
        {navTab}
      </div>
    </div>
  )
}
