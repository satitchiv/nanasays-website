'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { renderMd } from './NanaBubble'

export type PartnerBrief = {
  id: string
  tone: string
  body_markdown: string | null
  generated_at: string | null
  share_token?: string | null
}

type Props = {
  brief: PartnerBrief | null
  childId?: string | null
  sessionId?: string | null
  childName?: string | null
}

type Section = 'opening' | 'why_it_matters' | 'tradeoffs' | 'questions' | 'next_step'

const SECTION_OPTIONS: Array<{ value: Section; label: string }> = [
  { value: 'opening',        label: 'Opening' },
  { value: 'why_it_matters', label: 'Why this matters' },
  { value: 'tradeoffs',      label: 'Tradeoffs' },
  { value: 'questions',      label: 'Questions to ask' },
  { value: 'next_step',      label: 'Next step' },
]

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return null
  }
}

function renderBriefMarkdown(markdown: string): ReactNode[] {
  const blocks = markdown.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  return blocks.map((block, idx) => {
    const heading = block.match(/^###\s+(.+)$/)
    if (heading) {
      return <h2 key={idx} className="rr-partner-brief-heading">{renderMd(heading[1])}</h2>
    }
    if (block.includes('\n- ')) {
      const [lead, ...items] = block.split('\n')
      return (
        <div key={idx}>
          {lead && !lead.startsWith('- ') && <p>{renderMd(lead)}</p>}
          <ul className="rr-pb-list">
            {(lead.startsWith('- ') ? [lead, ...items] : items).map((item, i) => (
              <li key={i}>{renderMd(item.replace(/^-\s+/, ''))}</li>
            ))}
          </ul>
        </div>
      )
    }
    return <p key={idx}>{renderMd(block)}</p>
  })
}

function friendlyTone(tone: string | null | undefined): string {
  if (!tone) return 'Warm'
  return tone.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function PartnerBriefTab({ brief, childId, sessionId, childName }: Props) {
  const [localBrief, setLocalBrief] = useState<PartnerBrief | null>(brief)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(brief?.body_markdown?.trim() ?? '')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [section, setSection] = useState<Section>('why_it_matters')
  const [addition, setAddition] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const body = localBrief?.body_markdown?.trim() ?? ''
  const generated = formatDate(localBrief?.generated_at)

  useEffect(() => {
    setLocalBrief(brief)
    setDraft(brief?.body_markdown?.trim() ?? '')
  }, [brief])

  async function copyBrief() {
    if (!body) return
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  async function saveDraft() {
    if (!childId || saving) return
    setSaving(true)
    setEditError(null)
    try {
      const res = await fetch('/api/research-room/partner-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', child_id: childId, body_markdown: draft }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.ok) {
        setEditError(typeof j?.code === 'string' ? `Could not save (${j.code}).` : 'Could not save.')
        return
      }
      setLocalBrief(j.brief as PartnerBrief)
      setDraft((j.brief?.body_markdown ?? '').trim())
      setEditing(false)
    } catch {
      setEditError('Network error while saving.')
    } finally {
      setSaving(false)
    }
  }

  async function generateFromVerdict() {
    if (!childId || !sessionId || generating) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch('/api/research-room/partner-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_from_verdict', child_id: childId, session_id: sessionId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.ok) {
        const code = typeof j?.code === 'string' ? j.code : 'request_failed'
        setGenerateError(code === 'missing_verdict' ? 'Generate a verdict first.' : `Could not generate brief (${code}).`)
        return
      }
      setLocalBrief(j.brief as PartnerBrief)
      setDraft((j.brief?.body_markdown ?? '').trim())
      setEditing(false)
      setAddOpen(false)
    } catch {
      setGenerateError('Network error while generating the brief.')
    } finally {
      setGenerating(false)
    }
  }

  async function appendSection() {
    const trimmed = addition.trim()
    if (!childId || adding || !trimmed) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/research-room/partner-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'append_section',
          child_id: childId,
          section,
          body_markdown: trimmed,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.ok) {
        setAddError(typeof j?.code === 'string' ? `Could not add section (${j.code}).` : 'Could not add section.')
        return
      }
      setLocalBrief(j.brief as PartnerBrief)
      setDraft((j.brief?.body_markdown ?? '').trim())
      setAddition('')
      setAddOpen(false)
    } catch {
      setAddError('Network error while adding section.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <div className="rr-view-head">
        <div>
          <div className="rr-view-eyebrow">Partner brief</div>
          <h1 className="rr-view-title">
            A note for <em>the other parent.</em>
          </h1>
          <p className="rr-view-meta">
            {childName ? `${childName}'s` : 'Your'} decision notes, kept separate from the comparison table.
          </p>
        </div>
        <div className="rr-partner-actions">
          <button type="button" className="rr-brief-action" disabled={!childId || !sessionId || generating}
                  onClick={generateFromVerdict}>
            {generating ? 'Generating...' : body ? 'Regenerate from verdict' : 'Generate partner brief'}
          </button>
          <button type="button" className="rr-brief-action" disabled={!childId || saving} onClick={() => { setEditing(true); setEditError(null) }}>
            {body ? 'Edit partner brief' : 'Start brief'}
          </button>
          <button type="button" className="rr-brief-action" disabled={!childId || adding} onClick={() => { setAddOpen(v => !v); setAddError(null) }}>
            Add section...
          </button>
          <button type="button" className="rr-brief-action" disabled={!body} onClick={copyBrief}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="rr-brief-action" disabled={!body} onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      {generateError && <div className="rr-chat-error" role="alert">{generateError}</div>}

      {editing && (
        <form
          className="rr-partner-editor"
          onSubmit={e => { e.preventDefault(); saveDraft() }}
        >
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="rr-partner-textarea"
            rows={12}
            maxLength={64000}
            disabled={saving}
            aria-label="Partner brief text"
          />
          <div className="rr-partner-form-actions">
            <button type="submit" className="rr-brief-action" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" className="rr-brief-action" disabled={saving}
                    onClick={() => { setEditing(false); setDraft(body); setEditError(null) }}>
              Cancel
            </button>
            {editError && <span className="rr-partner-error" role="alert">{editError}</span>}
          </div>
        </form>
      )}

      {addOpen && !editing && (
        <form
          className="rr-partner-editor rr-partner-editor--compact"
          onSubmit={e => { e.preventDefault(); appendSection() }}
        >
          <div className="rr-partner-section-options" role="radiogroup" aria-label="Brief section">
            {SECTION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`rr-partner-section-chip${section === opt.value ? ' is-active' : ''}`}
                onClick={() => setSection(opt.value)}
                aria-pressed={section === opt.value}
                disabled={adding}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <textarea
            value={addition}
            onChange={e => setAddition(e.target.value)}
            className="rr-partner-textarea"
            rows={5}
            maxLength={2400}
            disabled={adding}
            placeholder="Write the note to add..."
            aria-label="Text to add to partner brief"
          />
          <div className="rr-partner-form-actions">
            <button type="submit" className="rr-brief-action" disabled={adding || addition.trim().length === 0}>
              {adding ? 'Adding...' : 'Add'}
            </button>
            <button type="button" className="rr-brief-action" disabled={adding}
                    onClick={() => { setAddOpen(false); setAddition(''); setAddError(null) }}>
              Cancel
            </button>
            {addError && <span className="rr-partner-error" role="alert">{addError}</span>}
          </div>
        </form>
      )}

      {!editing && body ? (
        <div className="rr-pb-wrap">
          <article className="rr-pb-card">
            <div className="rr-pb-head">
              <div>
                <div className="rr-pb-stamp">A letter from your research advisor</div>
                <div className="rr-pb-to">To <em>your partner</em>,</div>
                <div className="rr-pb-meta">
                  {generated ? `${generated} · ` : ''}{childName ? `${childName} · ` : ''}{friendlyTone(localBrief?.tone)} tone
                </div>
              </div>
            </div>
            <div className="rr-pb-tone" aria-label="Partner brief tone">
              <span className="rr-pb-tone-label">Tone</span>
              <span className="rr-pb-tone-chip is-active">{friendlyTone(localBrief?.tone)}</span>
              <span className="rr-pb-tone-chip">Just the decision</span>
              <span className="rr-pb-tone-chip">Evidence-heavy</span>
              <span className="rr-pb-tone-chip">Skeptical</span>
            </div>
            <div className="rr-pb-letter">
              {renderBriefMarkdown(body)}
            </div>
            <div className="rr-pb-foot">
              <div className="rr-pb-sig">- You &amp; <em>Nana</em></div>
              <button type="button" className="rr-brief-action" onClick={copyBrief}>
                {copied ? 'Copied' : 'Copy note'}
              </button>
            </div>
          </article>
        </div>
      ) : !editing ? (
        <div className="rr-placeholder-card" role="status">
          <div className="rr-placeholder-eyebrow">No partner brief yet</div>
          <div className="rr-placeholder-body">
            Start a draft or add a section when you are ready to turn the research into a parent-to-parent note.
          </div>
        </div>
      ) : null}
    </>
  )
}
