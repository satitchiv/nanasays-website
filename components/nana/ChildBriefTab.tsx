'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FAMILY_FIELDS,
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

export type FamilyPreferences = Record<string, string | null>

type Props = {
  children: ChildSummary[]
  activeChildId: string | null
  familyPreferences?: FamilyPreferences
  onActiveChildChange?: (id: string) => void
}

const BASICS_FIELDS   = ['child_year', 'child_gender'] as const
const PRIORITY_FIELDS = ['top_priority', 'class_size_pref', 'sen_need'] as const

export default function ChildBriefTab({
  children,
  activeChildId,
  familyPreferences,
  onActiveChildChange: _onActiveChildChange,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [editingMeta, setEditingMeta] = useState(false)
  const [editingCard, setEditingCard] = useState<'basics' | 'priorities' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeChild = children.find(c => c.id === activeChildId) ?? null
  const hasChildren = children.length > 0

  return (
    <div className="rr-brief-wrap">
      {familyPreferences && (
        <FamilyPreferencesCard preferences={familyPreferences} />
      )}

      {!hasChildren ? (
        <EmptyChildrenState
          adding={adding}
          busy={busy}
          error={error}
          setAdding={setAdding}
          setBusy={setBusy}
          setError={setError}
        />
      ) : activeChild ? (
        <ActiveChildPanel
          child={activeChild}
          editingCard={editingCard}
          editingMeta={editingMeta}
          adding={adding}
          busy={busy}
          error={error}
          setError={setError}
          setBusy={setBusy}
          setEditingMeta={setEditingMeta}
          setEditingCard={setEditingCard}
          setAdding={setAdding}
        />
      ) : null}
    </div>
  )
}

// ─── Active child panel ──────────────────────────────────────────────────

function ActiveChildPanel({
  child, editingCard, editingMeta, adding, busy, error,
  setError, setBusy, setEditingMeta, setEditingCard, setAdding,
}: {
  child: ChildSummary
  editingCard: 'basics' | 'priorities' | null
  editingMeta: boolean
  adding: boolean
  busy: boolean
  error: string | null
  setError: (s: string | null) => void
  setBusy: (b: boolean) => void
  setEditingMeta: (b: boolean) => void
  setEditingCard: (c: 'basics' | 'priorities' | null) => void
  setAdding: (b: boolean) => void
}) {
  const router = useRouter()
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
    <section className="rr-cb-panel">
      <header className="rr-cb-head">
        <div className="rr-cb-head-main">
          <div className="rr-brief-eyebrow">Child brief · the lens for everything</div>
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
              <h1 className="rr-cb-title">{child.name}</h1>
              <p className="rr-cb-meta">
                {metaParts.length > 0 ? `${metaParts.join(' · ')}. ` : ''}
                Edit any field — recommendations re-run for this child only.
              </p>
            </>
          )}
        </div>
        <div className="rr-cb-actions">
          {!editingMeta && !adding && (
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
                className="rr-brief-action rr-brief-action-ghost"
                onClick={() => setAdding(true)}
                disabled={busy}
              >
                + Add child
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

      {adding && (
        <ChildMetaForm
          initialName=""
          initialDob=""
          busy={busy}
          submitLabel="Add child"
          onCancel={() => { setAdding(false); setError(null) }}
          onSave={addChild}
        />
      )}

      {error && <div className="rr-brief-error" role="alert">{error}</div>}

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
          title="Priorities"
          fields={PRIORITY_FIELDS}
          values={child.child_profile ?? {}}
          editing={editingCard === 'priorities'}
          busy={busy}
          onStartEdit={() => setEditingCard('priorities')}
          onCancelEdit={() => setEditingCard(null)}
          onSave={patchProfile}
        />
      </div>
    </section>
  )
}

// ─── Empty state when no children yet ────────────────────────────────────

function EmptyChildrenState({
  adding, busy, error,
  setAdding, setBusy, setError,
}: {
  adding: boolean
  busy: boolean
  error: string | null
  setAdding: (b: boolean) => void
  setBusy: (b: boolean) => void
  setError: (s: string | null) => void
}) {
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

  return (
    <section className="rr-cb-empty">
      <div className="rr-brief-eyebrow">My children</div>
      <h2 className="rr-cb-empty-title">Add your first child to get started.</h2>
      <p className="rr-cb-empty-meta">
        Each child gets their own comparison table, lens history, and partner brief.
      </p>
      {error && <div className="rr-brief-error" role="alert">{error}</div>}
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
          className="rr-brief-action rr-brief-action-primary"
          onClick={() => { setAdding(true); setError(null) }}
        >
          + Add first child
        </button>
      )}
    </section>
  )
}

// ─── Profile card (Basics, Priorities) ───────────────────────────────────

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

// ─── Child meta form (name + DOB — used for add + edit) ──────────────────

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

// ─── Family preferences card ─────────────────────────────────────────────

function FamilyPreferencesCard({ preferences }: { preferences: FamilyPreferences }) {
  return (
    <section className="rr-brief-prefs">
      <div className="rr-brief-prefs-head">
        <div>
          <div className="rr-brief-eyebrow">Family settings</div>
          <p className="rr-brief-prefs-meta">
            Apply to every child. Per-child overrides live in each child&apos;s panel below.
          </p>
        </div>
        <Link href="/onboarding" className="rr-brief-action rr-brief-action-ghost">
          Edit →
        </Link>
      </div>
      <dl className="rr-brief-prefs-grid">
        {FAMILY_FIELDS.map(f => {
          const value = preferences[f.field] ?? null
          return (
            <div key={f.field} className="rr-brief-prefs-row">
              <dt>{f.short}</dt>
              <dd>{getOptionShortLabel(f.field, value)}</dd>
            </div>
          )
        })}
      </dl>
    </section>
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
