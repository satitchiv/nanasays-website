'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ONBOARDING_FIELDS,
  getOptionLabel,
  getOptionShortLabel,
} from '@/lib/onboarding-fields'

export type ChildSummary = {
  id:            string
  name:          string
  date_of_birth: string | null
  child_profile: Record<string, string | null>
  is_archived:   boolean
}

// FamilyPreferences kept exported for backward-compat with the page
// component's prop shape; rendered nowhere now (per slice 3.3 polish).
export type FamilyPreferences = Record<string, string | null>

type Props = {
  children: ChildSummary[]
  activeChildId: string | null
  familyPreferences?: FamilyPreferences
  onActiveChildChange?: (id: string) => void
}

const BASICS_FIELDS     = ['child_year', 'child_gender'] as const
const SCHOOL_FIELDS     = ['home_region', 'boarding_pref', 'budget_range', 'curriculum_pref'] as const
const PRIORITY_FIELDS   = ['top_priority', 'class_size_pref', 'sen_need'] as const

export default function ChildBriefTab({
  children,
  activeChildId,
  onActiveChildChange,
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
      router.refresh()
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

  return (
    <div className="rr-brief-wrap">
      <header className="rr-brief-tab-head">
        <div className="rr-brief-eyebrow">Child brief · the lens for everything</div>
        <p className="rr-brief-tab-meta">
          Each child has their own answers to the 9 questions. Edit any field — the recommender re-runs for that child.
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
  )
}

// ─── Child panel — one per child, fully self-contained ───────────────────

function ChildPanel({
  child, isActive, busy, setBusy, setError, onSetActive,
}: {
  child: ChildSummary
  isActive: boolean
  busy: boolean
  setBusy: (b: boolean) => void
  setError: (s: string | null) => void
  onSetActive: () => void
}) {
  const router = useRouter()
  const [editingMeta, setEditingMeta] = useState(false)
  const [editingCard, setEditingCard] = useState<'basics' | 'school' | 'priorities' | null>(null)

  const yearLabel = getOptionShortLabel('child_year', child.child_profile?.child_year ?? null)
  const ageLabel = ageFromDOB(child.date_of_birth)
  const metaParts: string[] = []
  if (yearLabel && yearLabel !== '—') metaParts.push(yearLabel)
  if (ageLabel != null) metaParts.push(`age ${ageLabel}`)

  async function patchProfile(patch: Record<string, string>) {
    setBusy(true); setError(null)
    try {
      const merged = { ...(child.child_profile ?? {}), ...patch, onboarding_complete: true }
      const res = await fetch(`/api/children/${child.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ child_profile: merged }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update')
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

  return (
    <section className={`rr-cb-panel${isActive ? ' is-active' : ''}`}>
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
          values={child.child_profile ?? {}}
          editing={editingCard === 'basics'}
          busy={busy}
          onStartEdit={() => setEditingCard('basics')}
          onCancelEdit={() => setEditingCard(null)}
          onSave={patchProfile}
        />
        <ProfileCard
          title="School"
          fields={SCHOOL_FIELDS}
          values={child.child_profile ?? {}}
          editing={editingCard === 'school'}
          busy={busy}
          onStartEdit={() => setEditingCard('school')}
          onCancelEdit={() => setEditingCard(null)}
          onSave={patchProfile}
        />
        <ProfileCard
          title="Priorities"
          fields={PRIORITY_FIELDS}
          values={child.child_profile ?? {}}
          editing={editingCard === 'priorities'}
          busy={busy}
          onStartEdit={() => setEditingCard('priorities')}
          onCancelEdit={() => setEditingCard(null)}
          onSave={patchProfile}
        />
        <PlaceholderCard
          title="Personality"
          subtitle="Temperament · Social style · Boarding readiness"
          note="Filled via chat in slice 5 — Nana asks short questions and extracts the answers."
        />
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

function PlaceholderCard({ title, subtitle, note }: {
  title: string; subtitle: string; note: string
}) {
  return (
    <div className="rr-cb-card rr-cb-card-stub">
      <div className="rr-cb-card-h">
        <span>{title}</span>
        <span className="rr-cb-stub-tag">slice 5</span>
      </div>
      <div className="rr-cb-stub-sub">{subtitle}</div>
      <div className="rr-cb-stub-note">{note}</div>
    </div>
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
