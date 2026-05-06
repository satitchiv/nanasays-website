'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ChildSelector, { type ChildOption } from './ChildSelector'
import ChildBriefTab, { type ChildSummary, type FamilyPreferences } from './ChildBriefTab'
import ResearchRoomChat, { type ChatState } from './ResearchRoomChat'
import ComparisonView from './ComparisonView'
import type { ComparisonData } from './comparison-placeholder'
import type { Session, ResearchMessage } from '@/lib/nana/types'
import './research-room.css'

type Tab = 'brief' | 'compare' | 'verdict' | 'partner'

type Props = {
  childOptions: ChildOption[]
  childSummaries?: ChildSummary[]
  familyPreferences?: FamilyPreferences
  initialActiveChildId?: string | null
  comparisonData?: ComparisonData
  initialSession?: Session | null
  initialMessages?: ResearchMessage[]
}

const TAB_ORDER: Tab[] = ['brief', 'compare', 'verdict', 'partner']

const TAB_LABELS: Record<Tab, string> = {
  brief: 'Child brief',
  compare: 'Comparison',
  verdict: 'Verdict',
  partner: 'Partner brief',
}

const PLACEHOLDER_COPY: Record<Tab, { sub: string }> = {
  brief: {
    sub: 'Coming in slice 3 — list of children, the active editor, "+ Add child", soft archive.',
  },
  compare: {
    sub: 'Coming in slice 2 — your shortlist rendered side-by-side from school_structured_data, two lens tabs (child fit + Raw).',
  },
  verdict: {
    sub: 'Coming in slice 7 — per-lens essay (ranking + dissenting view + sources), shared lenses with Comparison.',
  },
  partner: {
    sub: 'Coming in slice 7 — one brief per child with tone toggles, copy email / print / share affordances.',
  },
}

const SCROLL_DURATION_MS = 450

export default function ResearchRoom({
  childOptions,
  childSummaries = [],
  familyPreferences,
  initialActiveChildId = null,
  comparisonData,
  initialSession   = null,
  initialMessages  = [],
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('compare')
  const [chatState, setChatState] = useState<ChatState>('default')
  const [buildMode, setBuildMode] = useState(false)
  const [activeChildId, setActiveChildId] = useState<string | null>(initialActiveChildId)

  // Persist the active child to parent_profiles + refresh server data
  // so the comparison table re-fetches per the new child's shortlist.
  // Failures revert local state to keep UI consistent with DB truth.
  async function handleActiveChildChange(nextChildId: string) {
    if (nextChildId === activeChildId) return
    const prev = activeChildId
    setActiveChildId(nextChildId)  // optimistic
    try {
      const res = await fetch('/api/active-child', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ child_id: nextChildId }),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) {
      console.error('[handleActiveChildChange]', e)
      setActiveChildId(prev)  // revert on failure
    }
  }

  const pagerRef = useRef<HTMLDivElement | null>(null)
  // Token-based suppression for IntersectionObserver during programmatic
  // scrolls. Each scrollPagerToTab call increments scrollTokenRef; only the
  // most-recent call's timeout actually unsuppresses.
  const scrollTokenRef = useRef(0)
  const isProgrammaticScroll = useRef(false)
  const suppressionTimeoutRef = useRef<number | null>(null)
  // Mirror of activeTab so async timers can read the latest value without
  // re-creating the closure.
  const activeTabRef = useRef<Tab>(activeTab)
  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  const handleToggleBuildMode = () => {
    const next = !buildMode
    setBuildMode(next)
    setChatState(next ? 'focus' : 'default')
  }

  const handleCollapseChat = () => setChatState('closed')
  const handleExpandDefault = () => setChatState('default')
  const handleToggleFocus = () =>
    setChatState((s) => (s === 'focus' ? 'default' : 'focus'))

  const scrollPagerToTab = (tab: Tab) => {
    const pager = pagerRef.current
    if (!pager) return
    const idx = TAB_ORDER.indexOf(tab)
    if (idx < 0) return

    const token = ++scrollTokenRef.current
    isProgrammaticScroll.current = true
    if (suppressionTimeoutRef.current !== null) {
      window.clearTimeout(suppressionTimeoutRef.current)
    }

    pager.scrollTo({ left: pager.clientWidth * idx, behavior: 'smooth' })

    suppressionTimeoutRef.current = window.setTimeout(() => {
      // Stale timeout — a newer scroll has started. Let that one finish.
      if (token !== scrollTokenRef.current) return
      isProgrammaticScroll.current = false
      suppressionTimeoutRef.current = null

      // Corrective: derive the actually-visible tab from scrollLeft and snap
      // state to it. Handles cases where a user swipe interrupted the
      // programmatic scroll mid-flight.
      const width = Math.max(1, pager.clientWidth)
      const idxNow = Math.round(pager.scrollLeft / width)
      const correctedTab = TAB_ORDER[idxNow]
      if (correctedTab && correctedTab !== activeTabRef.current) {
        setActiveTab(correctedTab)
      }
    }, SCROLL_DURATION_MS)
  }

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab)
    scrollPagerToTab(tab)
  }

  // Initial scroll position: jump (no animation) to the default active tab so
  // the pager renders with Comparison centered, not Brief.
  useLayoutEffect(() => {
    const pager = pagerRef.current
    if (!pager) return
    const idx = TAB_ORDER.indexOf(activeTab)
    pager.scrollLeft = pager.clientWidth * idx
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-anchor scrollLeft to the active tab whenever the pager's width changes
  // (window resize, orientation change, desktop chat width changes). Without
  // this, the active tab drifts after layout.
  useEffect(() => {
    const pager = pagerRef.current
    if (!pager || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const width = pager.clientWidth
      if (width <= 0) return
      const idx = TAB_ORDER.indexOf(activeTabRef.current)
      pager.scrollLeft = width * idx
    })
    observer.observe(pager)
    return () => observer.disconnect()
  }, [])

  // Sync activeTab with scroll position (mobile thumb-swipe).
  useEffect(() => {
    const pager = pagerRef.current
    if (!pager) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScroll.current) return
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.55) {
            const tab = entry.target.getAttribute('data-tab') as Tab | null
            if (tab) setActiveTab(tab)
          }
        }
      },
      { root: pager, threshold: [0.55] },
    )
    pager.querySelectorAll('[data-tab]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Cleanup: cancel any pending suppression timeout on unmount.
  useEffect(() => {
    return () => {
      if (suppressionTimeoutRef.current !== null) {
        window.clearTimeout(suppressionTimeoutRef.current)
      }
    }
  }, [])

  const activeChild =
    activeChildId != null
      ? childSummaries.find((c) => c.id === activeChildId) ?? null
      : null

  const shellClass = [
    'rr-shell',
    chatState === 'closed' ? 'rr-shell-chat-closed' : '',
    chatState === 'focus' ? 'rr-shell-chat-focus' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="rr-app">
      <header className="rr-top">
        <div className="rr-top-in">
          <Link href="/" className="rr-brand-link" aria-label="Nanasays home">
            <svg className="rr-brand-mark" aria-hidden="true">
              <use href="#ic-nana" />
            </svg>
            <span className="rr-brand-text">
              nana<em>says</em>
            </span>
            <span className="rr-brand-sub">research room</span>
          </Link>

          <nav className="rr-tabs" aria-label="Research room sections">
            {TAB_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                className={`rr-tab${activeTab === t ? ' is-active' : ''}${t === 'compare' ? ' rr-tab-privileged' : ''}`}
                onClick={() => handleTabClick(t)}
                aria-current={activeTab === t ? 'page' : undefined}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>

          <div className="rr-top-meta">
            <ChildSelector
              childOptions={childOptions}
              activeChildId={activeChildId}
              onChange={handleActiveChildChange}
            />
          </div>

          <Link href="/my-reports" className="rr-cta rr-cta-ghost rr-top-cta">
            ← My reports
          </Link>
        </div>
      </header>

      <div className={shellClass}>
        <main className="rr-main">
          <div className="rr-view-pager" ref={pagerRef}>
            {TAB_ORDER.map((t) => (
              <section
                key={t}
                className={`rr-view-page${activeTab === t ? ' is-active' : ''}`}
                data-tab={t}
                aria-hidden={activeTab !== t ? 'true' : undefined}
              >
                <div className="rr-view">
                  {t === 'compare' ? (
                    <>
                      <div className="rr-view-head">
                        <div>
                          <div className="rr-view-eyebrow">Comparison · the canonical view</div>
                          <h1 className="rr-view-title">
                            Side by side, <em>through your child&rsquo;s eyes.</em>
                          </h1>
                          <p className="rr-view-meta">
                            Two lenses to start: <strong>{activeChild ? `${activeChild.name} fit` : 'Child fit'}</strong> (child-weighted) and{' '}
                            <strong>Raw comparison</strong> (neutral). Slice 2 ships the
                            read-only table — child weighting + chat-driven rows land later.
                          </p>
                        </div>
                      </div>
                      {activeChild && (
                        <div className="rr-cmp-showing-for" role="status">
                          Showing <strong>{activeChild.name}&rsquo;s</strong> matches
                        </div>
                      )}
                      <ComparisonView data={comparisonData} activeChildName={activeChild?.name ?? null} />
                    </>
                  ) : t === 'brief' ? (
                    <ChildBriefTab
                      children={childSummaries}
                      activeChildId={activeChildId}
                      familyPreferences={familyPreferences}
                      onActiveChildChange={handleActiveChildChange}
                    />
                  ) : (
                    <>
                      <div className="rr-view-head">
                        <div>
                          <div className="rr-view-eyebrow">{TAB_LABELS[t]}</div>
                          <h1 className="rr-view-title">
                            {TAB_LABELS[t]} · <em>placeholder.</em>
                          </h1>
                          <p className="rr-view-meta">{PLACEHOLDER_COPY[t].sub}</p>
                        </div>
                      </div>

                      <div className="rr-placeholder-card" role="status">
                        <div className="rr-placeholder-eyebrow">Slice 1 · shell only</div>
                        <div className="rr-placeholder-body">
                          The four tabs and the chat states work. Swipe left/right on
                          mobile to flip between tabs. Real content appears in later
                          slices.
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>
            ))}
          </div>
        </main>

        <ResearchRoomChat
          state={chatState}
          buildMode={buildMode}
          onCollapse={handleCollapseChat}
          onExpandDefault={handleExpandDefault}
          onToggleFocus={handleToggleFocus}
          onToggleBuildMode={handleToggleBuildMode}
          shortlistSlugs={comparisonData?.schools.map(s => s.slug) ?? []}
          initialSession={initialSession}
          initialMessages={initialMessages}
        />
      </div>
    </div>
  )
}
