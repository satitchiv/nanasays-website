'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ONBOARDING_FIELDS, getOptionShortLabel } from '@/lib/onboarding-fields'

export type ChildSummary = {
  id:            string
  name:          string
  date_of_birth: string | null
  is_archived:   boolean
}

export type FamilyPreferences = Record<string, string | null>

type Props = {
  children: ChildSummary[]
  activeChildId: string | null
  familyPreferences?: FamilyPreferences
  onActiveChildChange?: (id: string) => void
}

// Brief tab — list children + add / edit / archive. Slice 3.1 ships
// basic CRUD; the rich child_profile JSONB editor (interests, fragility
// flags, etc.) is added in slice 4 alongside the fit-score work.
export default function ChildBriefTab({
  children,
  activeChildId,
  familyPreferences,
  onActiveChildChange,
}: Props) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(name: string, dob: string) {
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

  async function handleEdit(id: string, name: string, dob: string) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/children/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, date_of_birth: dob || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update')
      setEditingId(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  async function handleArchive(id: string, name: string) {
    if (!confirm(`Archive ${name}? Their research history stays readable but they'll be hidden from the dropdown.`)) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/children/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to archive')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }

  const hasFamilyPrefs = familyPreferences && Object.values(familyPreferences).some(v => v != null && v !== '')

  return (
    <div className="rr-brief-wrap">
      {hasFamilyPrefs && familyPreferences && (
        <FamilyPreferencesCard preferences={familyPreferences} />
      )}

      <div className="rr-brief-head">
        <div>
          <div className="rr-brief-eyebrow">My children</div>
          <h2 className="rr-brief-title">
            {children.length === 0
              ? 'Add a child to get started.'
              : `${children.length} ${children.length === 1 ? 'child' : 'children'} on the roster.`}
          </h2>
          <p className="rr-brief-meta">
            Each child gets their own comparison table, lens history, and partner brief. Switch between them via the dropdown in the top bar.
          </p>
        </div>
      </div>

      {error && <div className="rr-brief-error" role="alert">{error}</div>}

      <div className="rr-brief-list">
        {children.map(c => (
          <ChildRow
            key={c.id}
            child={c}
            isActive={c.id === activeChildId}
            isEditing={editingId === c.id}
            busy={busy}
            onSetActive={() => onActiveChildChange?.(c.id)}
            onStartEdit={() => setEditingId(c.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={(name, dob) => handleEdit(c.id, name, dob)}
            onArchive={() => handleArchive(c.id, c.name)}
          />
        ))}

        {adding ? (
          <ChildForm
            initialName=""
            initialDob=""
            busy={busy}
            submitLabel="Add child"
            onCancel={() => { setAdding(false); setError(null) }}
            onSave={handleAdd}
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
    </div>
  )
}

function ChildRow({
  child,
  isActive,
  isEditing,
  busy,
  onSetActive,
  onStartEdit,
  onCancelEdit,
  onSave,
  onArchive,
}: {
  child: ChildSummary
  isActive: boolean
  isEditing: boolean
  busy: boolean
  onSetActive: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (name: string, dob: string) => void
  onArchive: () => void
}) {
  if (isEditing) {
    return (
      <ChildForm
        initialName={child.name}
        initialDob={child.date_of_birth ?? ''}
        busy={busy}
        submitLabel="Save"
        onCancel={onCancelEdit}
        onSave={onSave}
      />
    )
  }

  return (
    <div className={`rr-brief-row${isActive ? ' is-active' : ''}`}>
      <div className="rr-brief-row-main">
        <div className="rr-brief-row-name">{child.name}</div>
        {child.date_of_birth && (
          <div className="rr-brief-row-meta">DOB · {child.date_of_birth}</div>
        )}
      </div>
      <div className="rr-brief-row-actions">
        {!isActive && (
          <button
            type="button"
            className="rr-brief-action rr-brief-action-ghost"
            onClick={onSetActive}
            disabled={busy}
          >
            Set active
          </button>
        )}
        {isActive && (
          <span className="rr-brief-active-tag">Active</span>
        )}
        <button
          type="button"
          className="rr-brief-action rr-brief-action-ghost"
          onClick={onStartEdit}
          disabled={busy}
        >
          Edit
        </button>
        <button
          type="button"
          className="rr-brief-action rr-brief-action-danger"
          onClick={onArchive}
          disabled={busy}
        >
          Archive
        </button>
      </div>
    </div>
  )
}

function ChildForm({
  initialName,
  initialDob,
  busy,
  submitLabel,
  onCancel,
  onSave,
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

function FamilyPreferencesCard({ preferences }: { preferences: FamilyPreferences }) {
  return (
    <div className="rr-brief-prefs">
      <div className="rr-brief-prefs-head">
        <div>
          <div className="rr-brief-eyebrow">Family preferences</div>
          <p className="rr-brief-prefs-meta">
            Your onboarding answers. New children inherit these as defaults; per-child overrides come in slice 4.
          </p>
        </div>
        <Link href="/onboarding" className="rr-brief-action rr-brief-action-ghost">
          Edit →
        </Link>
      </div>
      <dl className="rr-brief-prefs-grid">
        {ONBOARDING_FIELDS.map(f => {
          const value = preferences[f.field] ?? null
          return (
            <div key={f.field} className="rr-brief-prefs-row">
              <dt>{f.short}</dt>
              <dd>{getOptionShortLabel(f.field, value)}</dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
