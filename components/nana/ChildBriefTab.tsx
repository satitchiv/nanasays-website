'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ONBOARDING_FIELDS,
  getOptionLabel,
  getOptionShortLabel,
} from '@/lib/onboarding-fields'
import type { FunnelState } from '@/lib/children'

export type ChildSummary = {
  id:            string
  name:          string
  date_of_birth: string | null
  child_profile: Record<string, string | null>
  is_archived:   boolean
  funnel_state:  FunnelState
}

// FamilyPreferences kept exported for backward-compat with the page
// component's prop shape; rendered nowhere now (per slice 3.3 polish).
export type FamilyPreferences = Record<string, string | null>

type Props = {
  children: ChildSummary[]
  activeChildId: string | null
  familyPreferences?: FamilyPreferences
  onActiveChildChange?: (id: string) => void
  // Slice 8 Build 7 Phase C followup: parent (ResearchRoom) owns the
  // activeChildId useState. Server-side /api/children POST already wrote
  // active_child_id, but router.refresh() doesn't reset useState — so
  // we hand back the new id here and let ResearchRoom setActiveChildId
  // + router.refresh together. Optional for back-compat; if absent we
  // fall back to a plain router.refresh().
  onChildAdded?: (childId: string) => void
  // rr-8-brief-refresh-auto-jump: parent owns activeTab. When the user
  // clicks "Refresh recommendations" we ask the parent to flip Brief →
  // Comparison so the freshly-recommended shortlist lands on a visible
  // panel. Optional for back-compat / tests.
  onShortlistRefreshed?: () => void
}

const BASICS_FIELDS     = ['child_year', 'child_gender'] as const
// T4.16 Gap B (2026-05-09): ethos_pref + intl_pref slotted into School
// (they're about what kind of school the family wants); phone_pref into
// Priorities (it's a parental philosophy alongside class size + SEN).
// Slice 8 Build 1 (2026-05-14): lgbtq_pref + pastoral_pref added to
// Priorities — they're parental-philosophy fields too, and the onboarding
// form no longer collects them so this is now their only editable surface.
const SCHOOL_FIELDS     = ['home_region', 'boarding_pref', 'budget_range', 'curriculum_pref', 'ethos_pref', 'intl_pref'] as const
const PRIORITY_FIELDS   = ['top_priority', 'class_size_pref', 'sen_need', 'phone_pref', 'lgbtq_pref', 'pastoral_pref'] as const

// Slice 3.4 polish: rich free-text cards. Slice 3 captures (write side);
// slice 4's fit-score lens reads them. JSONB keys are stable so the slice 4
// reader can rely on them without a migration.
const NOTES_CARDS = [
  {
    key: 'personality_notes',
    title: 'Personality',
    subtitle: 'Temperament, social style, how they handle change.',
    placeholder: "What's their energy like in a new group? Quietly observant, or first to introduce themselves?",
  },
  {
    key: 'anchors_notes',
    title: 'Anchors',
    subtitle: 'What grounds them — interests, friendships, weekly rituals.',
    placeholder: 'The things that would have to keep working at any new school — close friends, a sport, a club.',
  },
  {
    key: 'academic_notes',
    title: 'Academic',
    subtitle: 'Strengths, weak spots, accommodations that help.',
    placeholder: 'Where they shine, where they struggle, anything teachers should know on day one.',
  },
  {
    key: 'goals_notes',
    title: 'Goals',
    subtitle: 'Hopes, sport / arts ambitions, university aim.',
    placeholder: "Short-term and long-term — what would make this school the right fit five years in?",
  },
] as const

type NotesKey = typeof NOTES_CARDS[number]['key']
type EditingCard = 'basics' | 'school' | 'priorities' | NotesKey | null

export default function ChildBriefTab({
  children,
  activeChildId,
  onActiveChildChange,
  onChildAdded,
  onShortlistRefreshed,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function addChild(name: string, dob: string) {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, date_of_birth: dob || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to add child')
      setAdding(false)
      // Phase C followup: defer activation + refresh to the parent if
      // it provided onChildAdded (it sets activeChildId optimistically
      // so Phase C's fullscreen gate fires on the new child). Falls
      // back to plain router.refresh() for back-compat.
      const newId = typeof json?.child?.id === 'string' ? json.child.id : null
      if (newId && onChildAdded) {
        onChildAdded(newId)
      } else {
        router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  if (children.length === 0) {
    return (
      <div className="rr-brief-wrap">
        <EmptyChildrenState
          adding={adding}
          busy={busy}
          error={error}
          setAdding={setAdding}
          onSave={addChild}
          onClearError={() => setError(null)}
        />
      </div>
    )
  }

  // Phase 3 (Verdict v3 UX iteration, 2026-05-24): jump-to-child sidebar
  // becomes useful at 2+ children — single-child households would see an
  // empty rail. Hidden via the .has-sidebar class toggle below.
  const showSidebar = children.length >= 2

  return (
    <div className={`rr-brief-wrap${showSidebar ? ' rr-cb-sidebar-layout has-sidebar' : ''}`}>
      <div className="rr-cb-cards-col">
        <header className="rr-brief-tab-head">
          <div className="rr-brief-eyebrow">Child brief · the lens for everything</div>
          <p className="rr-brief-tab-meta">
            Each child has their own answers. Edit any field — the recommender re-runs for that child.
          </p>
        </header>

        {error && <div className="rr-brief-error" role="alert">{error}</div>}

        {children.map(c => (
          <ChildPanel
            key={c.id}
            child={c}
            isActive={c.id === activeChildId}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            onSetActive={() => onActiveChildChange?.(c.id)}
            onShortlistRefreshed={onShortlistRefreshed}
          />
        ))}

        {adding ? (
          <ChildMetaForm
            initialName=""
            initialDob=""
            busy={busy}
            submitLabel="Add child"
            onCancel={() => { setAdding(false); setError(null) }}
            onSave={addChild}
          />
        ) : (
          <button
            type="button"
            className="rr-brief-add-btn"
            onClick={() => { setAdding(true); setError(null) }}
            disabled={busy}
          >
            + Add child
          </button>
        )}
      </div>

      {showSidebar && (
        <ChildBriefSidebar
          children={children}
          activeChildId={activeChildId}
          onJumpToChild={(id) => {
            onActiveChildChange?.(id)
            document.getElementById(`child-brief-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          onAddChild={() => { setAdding(true); setError(null) }}
          addDisabled={busy || adding}
        />
      )}
    </div>
  )
}

// ─── Sidebar — Phase 3 (2026-05-24) ──────────────────────────────────────
//
// Sticky middle column. Lists every child with name + year + status pill,
// click to scroll-into-view + set active. At 1300px viewport collapses to
// name + status dot (drops year sub-label + pill). At 1000px collapses to
// initials-only rail. Hidden entirely for single-child households (see
// `showSidebar` gate above).

function ChildBriefSidebar({
  children,
  activeChildId,
  onJumpToChild,
  onAddChild,
  addDisabled,
}: {
  children:      ChildSummary[]
  activeChildId: string | null
  onJumpToChild: (childId: string) => void
  onAddChild:    () => void
  addDisabled:   boolean
}) {
  return (
    <aside className="rr-cb-sidebar" aria-label="Jump to child">
      <div className="rr-cb-sidebar-head">Jump to child</div>
      <ul className="rr-cb-sidebar-list">
        {children.map(c => {
          // FunnelState values: 'onboarding' | 'interview' | 'comparison'.
          // 'comparison' means the child has cleared interview + reached the
          // research/comparison stage (likely has a usable shortlist + verdict),
          // so it's the "active" state in sidebar terms.
          const status: 'active' | 'draft' | 'archived' =
            c.is_archived ? 'archived'
            : c.funnel_state === 'comparison' ? 'active'
            : 'draft'
          const initials = c.name.split(/[\s-]+/).map(p => p[0] ?? '').join('').slice(0, 2).toUpperCase() || '?'
          // Codex r1 #3: reuse existing ageFromDOB helper — handles invalid
          // and future dates safely (returns null instead of NaN/negative).
          const ageYears = ageFromDOB(c.date_of_birth)
          // Codex r1 #1: 'is-active' previously collided between status='active'
          // (every comparison-stage child) and "this is the selected child"
          // (activeChildId === c.id). Rename the selected modifier to
          // 'is-selected' so non-selected active-status children don't get the
          // selected styling.
          const isSelected = activeChildId === c.id
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`rr-cb-sidebar-item is-status-${status}${isSelected ? ' is-selected' : ''}`}
                onClick={() => onJumpToChild(c.id)}
                data-initials={initials}
                title={c.name}
                // Codex r1 #2: initials-only mode (1000px) hides the visible
                // name. aria-label keeps the button announceable to screen
                // readers regardless of viewport.
                aria-label={c.name}
                aria-current={isSelected ? 'true' : undefined}
              >
                <span className="rr-cb-sidebar-name">{c.name}</span>
                {ageYears != null && <span className="rr-cb-sidebar-sub">age {ageYears}</span>}
                <span className={`rr-cb-sidebar-pill is-${status}`}>{status}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="rr-cb-sidebar-foot">
        <button
          type="button"
          className="rr-cb-sidebar-add"
          onClick={onAddChild}
          disabled={addDisabled}
        >
          + Add child
        </button>
      </div>
    </aside>
  )
}

// ─── Child panel — one per child, fully self-contained ───────────────────

function ChildPanel({
  child, isActive, busy, setBusy, setError, onSetActive, onShortlistRefreshed,
}: {
  child: ChildSummary
  isActive: boolean
  busy: boolean
  setBusy: (b: boolean) => void
  setError: (s: string | null) => void
  onSetActive: () => void
  onShortlistRefreshed?: () => void
}) {
  const router = useRouter()
  const [editingMeta, setEditingMeta] = useState(false)
  const [editingCard, setEditingCard] = useState<EditingCard>(null)
  // Optimistic override: after a Save, display the just-saved patch locally
  // until the server-rendered prop catches up. Otherwise the card briefly
  // flashes the OLD value between form-collapse and router.refresh()
  // resolving (~100-300ms perceptible flicker). Cleared automatically once
  // every key in the override matches the incoming prop.
  const [savedOverride, setSavedOverride] = useState<Record<string, string> | null>(null)
  const effectiveProfile: Record<string, string | null> = {
    ...(child.child_profile ?? {}),
    ...(savedOverride ?? {}),
  }
  useEffect(() => {
    if (!savedOverride) return
    const allMatch = Object.entries(savedOverride).every(
      ([k, v]) => (child.child_profile?.[k] ?? '') === v,
    )
    if (allMatch) setSavedOverride(null)
  }, [child.child_profile, savedOverride])

  const yearLabel = getOptionShortLabel('child_year', effectiveProfile.child_year ?? null)
  const ageLabel = ageFromDOB(child.date_of_birth)
  const metaParts: string[] = []
  if (yearLabel && yearLabel !== '—') metaParts.push(yearLabel)
  if (ageLabel != null) metaParts.push(`age ${ageLabel}`)

  async function patchProfile(patch: Record<string, string>) {
    setBusy(true); setError(null)
    try {
      // Codex round-2 P2: build the PATCH body from `effectiveProfile`
      // (which includes any in-flight savedOverride), not the raw stale
      // prop. Otherwise two quick saves before router.refresh() resolves
      // would clobber the first save's field, since this endpoint does a
      // full child_profile JSONB replace.
      const merged = { ...effectiveProfile, ...patch, onboarding_complete: true }
      const res = await fetch(`/api/children/${child.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ child_profile: merged }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update')
      // Hold the patched values locally until the server prop catches up,
      // then collapse the form. Eliminates the OLD-value flicker between
      // setEditingCard(null) and router.refresh() resolving.
      setSavedOverride(prev => ({ ...(prev ?? {}), ...patch }))
      setEditingCard(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  async function patchMeta(name: string, dob: string) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/children/${child.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, date_of_birth: dob || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update')
      setEditingMeta(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  async function archive() {
    if (!confirm(`Archive ${child.name}? Their research history stays readable but they'll be hidden from the dropdown.`)) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/children/${child.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to archive')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  async function refreshRecommendations() {
    if (!confirm(`Refresh ${child.name}'s recommendations? Their current shortlist will be replaced with a fresh top 6 based on the latest profile.`)) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/children/${child.id}/refresh-recommendations`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to refresh recommendations')
      router.refresh()
      onShortlistRefreshed?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  return (
    // id used by Phase 3 sidebar's scrollIntoView (2026-05-24). scroll-margin
    // is set on .rr-cb-panel in research-room.css so the sticky top nav
    // doesn't cover the header on smooth-scroll.
    <section id={`child-brief-${child.id}`} className={`rr-cb-panel${isActive ? ' is-active' : ''}`}>
      <header className="rr-cb-head">
        <div className="rr-cb-head-main">
          {editingMeta ? (
            <ChildMetaForm
              initialName={child.name}
              initialDob={child.date_of_birth ?? ''}
              busy={busy}
              submitLabel="Save"
              onCancel={() => setEditingMeta(false)}
              onSave={patchMeta}
            />
          ) : (
            <>
              <div className="rr-cb-name-row">
                <h2 className="rr-cb-title">{child.name}</h2>
                {isActive ? (
                  <span className="rr-brief-active-tag">Active</span>
                ) : (
                  <button
                    type="button"
                    className="rr-brief-action rr-brief-action-ghost"
                    onClick={onSetActive}
                    disabled={busy}
                  >
                    Set active
                  </button>
                )}
              </div>
              <p className="rr-cb-meta">
                {metaParts.length > 0 ? `${metaParts.join(' · ')}. ` : ''}
                Edit any field — recommendations re-run for this child only.
              </p>
            </>
          )}
        </div>
        <div className="rr-cb-actions">
          {!editingMeta && (
            <>
              <button
                type="button"
                className="rr-brief-action rr-brief-action-emphasis"
                onClick={refreshRecommendations}
                disabled={busy}
                title={`Replace ${child.name}'s shortlist with a fresh top 6 based on the latest profile`}
              >
                ↻ Refresh recommendations
              </button>
              <button
                type="button"
                className="rr-brief-action rr-brief-action-ghost"
                onClick={() => setEditingMeta(true)}
                disabled={busy}
              >
                Edit name / DOB
              </button>
              <button
                type="button"
                className="rr-brief-action rr-brief-action-danger"
                onClick={archive}
                disabled={busy}
              >
                Archive
              </button>
            </>
          )}
        </div>
      </header>

      <div className="rr-cb-grid">
        <ProfileCard
          title="Basics"
          fields={BASICS_FIELDS}
          values={effectiveProfile}
          editing={editingCard === 'basics'}
          busy={busy}
          onStartEdit={() => setEditingCard('basics')}
          onCancelEdit={() => setEditingCard(null)}
          onSave={patchProfile}
        />
        <ProfileCard
          title="School"
          fields={SCHOOL_FIELDS}
          values={effectiveProfile}
          editing={editingCard === 'school'}
          busy={busy}
          onStartEdit={() => setEditingCard('school')}
          onCancelEdit={() => setEditingCard(null)}
          onSave={patchProfile}
        />
        <ProfileCard
          title="Priorities"
          fields={PRIORITY_FIELDS}
          values={effectiveProfile}
          editing={editingCard === 'priorities'}
          busy={busy}
          onStartEdit={() => setEditingCard('priorities')}
          onCancelEdit={() => setEditingCard(null)}
          onSave={patchProfile}
        />
      </div>

      <div className="rr-cb-notes-head">
        <span className="rr-cb-notes-eyebrow">In their own words</span>
        <span className="rr-cb-notes-meta">
          Optional rich notes. Slice 4&rsquo;s fit-score lens reads these — leave blank if nothing comes to mind.
        </span>
      </div>
      <div className="rr-cb-notes-grid">
        {NOTES_CARDS.map(card => (
          <NotesCard
            key={card.key}
            title={card.title}
            subtitle={card.subtitle}
            placeholder={card.placeholder}
            value={(effectiveProfile[card.key] as string | null | undefined) ?? null}
            editing={editingCard === card.key}
            busy={busy}
            onStartEdit={() => setEditingCard(card.key)}
            onCancelEdit={() => setEditingCard(null)}
            onSave={(text) => patchProfile({ [card.key]: text })}
          />
        ))}
      </div>
    </section>
  )
}

// ─── Empty state when 0 children ─────────────────────────────────────────

function EmptyChildrenState({
  adding, busy, error, setAdding, onSave, onClearError,
}: {
  adding: boolean
  busy: boolean
  error: string | null
  setAdding: (b: boolean) => void
  onSave: (name: string, dob: string) => void
  onClearError: () => void
}) {
  return (
    <section className="rr-cb-empty">
      <div className="rr-brief-eyebrow">My children</div>
      <h2 className="rr-cb-empty-title">Add your first child to get started.</h2>
      <p className="rr-cb-empty-meta">
        Each child gets their own preferences, comparison table, and partner brief.
      </p>
      {error && <div className="rr-brief-error" role="alert">{error}</div>}
      {adding ? (
        <ChildMetaForm
          initialName=""
          initialDob=""
          busy={busy}
          submitLabel="Add child"
          onCancel={() => { setAdding(false); onClearError() }}
          onSave={onSave}
        />
      ) : (
        <button
          type="button"
          className="rr-brief-action rr-brief-action-primary"
          onClick={() => { setAdding(true); onClearError() }}
        >
          + Add first child
        </button>
      )}
    </section>
  )
}

// ─── Profile card (one per slot in the 4-card grid) ──────────────────────

function ProfileCard({
  title, fields, values, editing, busy,
  onStartEdit, onCancelEdit, onSave,
}: {
  title: string
  fields: readonly string[]
  values: Record<string, string | null>
  editing: boolean
  busy: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (patch: Record<string, string>) => void
}) {
  return (
    <div className="rr-cb-card">
      <div className="rr-cb-card-h">
        <span>{title}</span>
        {!editing && (
          <button
            type="button"
            className="rr-cb-edit"
            onClick={onStartEdit}
            disabled={busy}
            aria-label={`Edit ${title}`}
          >
            edit ↻
          </button>
        )}
      </div>
      {editing ? (
        <ProfileCardForm
          fields={fields}
          values={values}
          busy={busy}
          onCancel={onCancelEdit}
          onSave={onSave}
        />
      ) : (
        fields.map(fieldName => {
          const def = ONBOARDING_FIELDS.find(f => f.field === fieldName)
          if (!def) return null
          const value = values[fieldName] ?? null
          return (
            <div key={fieldName} className="rr-cb-row">
              <div className="rr-cb-k">{def.short}</div>
              <div className="rr-cb-v">{getOptionShortLabel(fieldName, value)}</div>
            </div>
          )
        })
      )}
    </div>
  )
}

function ProfileCardForm({
  fields, values, busy, onCancel, onSave,
}: {
  fields: readonly string[]
  values: Record<string, string | null>
  busy: boolean
  onCancel: () => void
  onSave: (patch: Record<string, string>) => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) {
      const v = values[f]
      if (v) init[f] = v
    }
    return init
  })

  return (
    <form
      className="rr-cb-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(draft)
      }}
    >
      {fields.map(fieldName => {
        const def = ONBOARDING_FIELDS.find(f => f.field === fieldName)
        if (!def) return null
        return (
          <div key={fieldName} className="rr-cb-form-row">
            <label className="rr-cb-form-label" htmlFor={`profile-${fieldName}`}>
              {def.short}
            </label>
            <select
              id={`profile-${fieldName}`}
              className="rr-cb-form-select"
              value={draft[fieldName] ?? ''}
              onChange={(e) => setDraft(d => ({ ...d, [fieldName]: e.target.value }))}
            >
              <option value="" disabled>Choose…</option>
              {def.options.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {getOptionLabel(fieldName, opt.value)}
                </option>
              ))}
            </select>
          </div>
        )
      })}
      <div className="rr-cb-form-actions">
        <button
          type="button"
          className="rr-brief-action rr-brief-action-ghost"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rr-brief-action rr-brief-action-primary"
          disabled={busy}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

// ─── Notes card (free-text rich card — slice 3.4) ────────────────────────

function NotesCard({
  title, subtitle, placeholder, value, editing, busy,
  onStartEdit, onCancelEdit, onSave,
}: {
  title:       string
  subtitle:    string
  placeholder: string
  value:       string | null
  editing:     boolean
  busy:        boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave:      (text: string) => void
}) {
  return (
    <div className="rr-cb-card rr-cb-card-notes">
      <div className="rr-cb-card-h">
        <span>{title}</span>
        {!editing && (
          <button
            type="button"
            className="rr-cb-edit"
            onClick={onStartEdit}
            disabled={busy}
            aria-label={`Edit ${title}`}
          >
            {value ? 'edit ↻' : '+ add'}
          </button>
        )}
      </div>
      <div className="rr-cb-notes-sub">{subtitle}</div>
      {editing ? (
        <NotesCardForm
          initial={value ?? ''}
          placeholder={placeholder}
          busy={busy}
          onCancel={onCancelEdit}
          onSave={onSave}
        />
      ) : value ? (
        <p className="rr-cb-notes-text">{value}</p>
      ) : (
        <p className="rr-cb-notes-empty">{placeholder}</p>
      )}
    </div>
  )
}

function NotesCardForm({
  initial, placeholder, busy, onCancel, onSave,
}: {
  initial:     string
  placeholder: string
  busy:        boolean
  onCancel:    () => void
  onSave:      (text: string) => void
}) {
  const [draft, setDraft] = useState(initial)
  return (
    <form
      className="rr-cb-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(draft.trim())
      }}
    >
      <textarea
        className="rr-cb-notes-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        rows={5}
        maxLength={2000}
        autoFocus
      />
      <div className="rr-cb-form-actions">
        <button
          type="button"
          className="rr-brief-action rr-brief-action-ghost"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rr-brief-action rr-brief-action-primary"
          disabled={busy}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

// ─── Child meta form (name + DOB) ────────────────────────────────────────

function ChildMetaForm({
  initialName, initialDob, busy, submitLabel, onCancel, onSave,
}: {
  initialName: string
  initialDob: string
  busy: boolean
  submitLabel: string
  onCancel: () => void
  onSave: (name: string, dob: string) => void
}) {
  const [name, setName] = useState(initialName)
  const [dob, setDob] = useState(initialDob)

  return (
    <form
      className="rr-brief-form"
      onSubmit={(e) => {
        e.preventDefault()
        const n = name.trim()
        if (!n) return
        onSave(n, dob.trim())
      }}
    >
      <label className="rr-brief-field">
        <span className="rr-brief-field-label">Name</span>
        <input
          className="rr-brief-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Maya"
          maxLength={80}
          autoFocus
          required
        />
      </label>
      <label className="rr-brief-field">
        <span className="rr-brief-field-label">Date of birth (optional)</span>
        <input
          className="rr-brief-input"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
        />
      </label>
      <div className="rr-brief-form-actions">
        <button
          type="button"
          className="rr-brief-action rr-brief-action-ghost"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rr-brief-action rr-brief-action-primary"
          disabled={busy || !name.trim()}
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function ageFromDOB(dob: string | null): number | null {
  if (!dob) return null
  const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1
  }
  return age >= 0 && age < 100 ? age : null
}
