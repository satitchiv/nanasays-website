'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { renderMd } from './NanaBubble'

export type ResearchVerdictForUi = {
  id: string
  input_hash: string
  verdict_json: unknown
  body_markdown: string
  generated_at: string
  cache_status?: 'current' | 'stale'
}

type RankedSchool = {
  slug?: string
  name?: string
  rank?: number
  summary?: string
  strengths?: string[]
  reservations?: string[]
  // v3 additions (R2 + R4 + R7):
  is_path_winner_for?: ('A' | 'B' | 'C')[]
  coverage_below_threshold?: boolean
}

type VerdictJson = {
  headline?: string
  confidence?: 'low' | 'medium' | 'high'
  decision_model?: string
  decision_factors?: string[]
  ranked_schools?: RankedSchool[]
  best_for_child?: string
  dissenting_view?: string
  evidence_gaps?: string[]
  sources?: Array<{ url?: string }>
  // v3 additions — all optional; v2 cached records pass through unchanged.
  paths?: Record<'A' | 'B' | 'C', unknown>
  couldnt_compare?: unknown[]
  brief_tensions?: unknown[]
  same_winner_across_paths?: { winner_slug: string; paths: ('A' | 'B' | 'C')[] }
  default_path?: 'A' | 'B' | 'C' | null   // R7-SHOULD-1 + R9: null when all paths needs_research
}

type Props = {
  verdict: ResearchVerdictForUi | null
  sessionId?: string | null
  // R4-MUST-2 + v3: lens scope dropped from verdict identity. Prop removed.
  childName?: string | null
}

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

function renderVerdictMarkdown(markdown: string): ReactNode[] {
  const blocks = markdown.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  return blocks.map((block, idx) => {
    const h1 = block.match(/^#\s+(.+)$/)
    if (h1) return <h2 key={idx} className="rr-verdict-main-heading">{renderMd(h1[1])}</h2>
    const h2 = block.match(/^##\s+(.+)$/)
    if (h2) return <h3 key={idx} className="rr-verdict-section-heading">{renderMd(h2[1])}</h3>
    const h3 = block.match(/^###\s+(.+)$/)
    if (h3) return <h4 key={idx} className="rr-verdict-school-heading">{renderMd(h3[1])}</h4>
    if (block.includes('\n- ')) {
      const [lead, ...items] = block.split('\n')
      return (
        <div key={idx}>
          {lead && !lead.startsWith('- ') && <p>{renderMd(lead)}</p>}
          <ul className="rr-verdict-list">
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

function readVerdictJson(value: unknown): VerdictJson | null {
  if (!value || typeof value !== 'object') return null
  const v = value as VerdictJson
  return v
}

function confidenceClass(confidence: string | undefined): string {
  if (confidence === 'high') return ' is-high'
  if (confidence === 'low') return ' is-low'
  return ' is-medium'
}

export default function VerdictTab({ verdict, sessionId, childName }: Props) {
  const [localVerdict, setLocalVerdict] = useState<ResearchVerdictForUi | null>(verdict)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLocalVerdict(verdict)
  }, [verdict])

  async function generate(force = false) {
    if (!sessionId || generating) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/research-room/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, force }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.ok) {
        const code = typeof j?.code === 'string' ? j.code : 'request_failed'
        setError(code === 'empty_comparison' ? 'Add schools and comparison rows first.' : `Could not generate verdict (${code}).`)
        return
      }
      setLocalVerdict(j.verdict as ResearchVerdictForUi)
    } catch {
      setError('Network error while generating the verdict.')
    } finally {
      setGenerating(false)
    }
  }

  const body = localVerdict?.body_markdown?.trim() ?? ''
  const generated = formatDate(localVerdict?.generated_at)
  const verdictJson = readVerdictJson(localVerdict?.verdict_json)
  const rankedSchools = (verdictJson?.ranked_schools ?? [])
    .filter(s => typeof s.name === 'string')
    // R3-P1 + R4 hybrid: below-threshold schools appear in their dedicated panel,
    // not in the main ranking. Legacy v2 records (no flag) render unchanged.
    .filter(s => !s.coverage_below_threshold)
  const decisionFactors = (verdictJson?.decision_factors ?? []).filter(f => typeof f === 'string')
  const evidenceGaps = (verdictJson?.evidence_gaps ?? []).filter(g => typeof g === 'string')
  const sourceCount = Array.isArray(verdictJson?.sources) ? verdictJson.sources.length : 0
  const isStale = localVerdict?.cache_status === 'stale'

  return (
    <>
      <div className="rr-view-head">
        <div>
          <div className="rr-view-eyebrow">Verdict</div>
          <h1 className="rr-view-title">
            The decision, <em>with tradeoffs.</em>
          </h1>
          <p className="rr-view-meta">
            {childName ? `${childName}'s` : 'Your'} current shortlist, ranked from all current Research Room evidence.
          </p>
        </div>
        <div className="rr-partner-actions">
          <button type="button" className="rr-brief-action" disabled={!sessionId || generating} onClick={() => generate(Boolean(localVerdict))}>
            {generating ? 'Generating...' : localVerdict ? 'Regenerate' : 'Generate verdict'}
          </button>
        </div>
      </div>

      {error && <div className="rr-chat-error" role="alert">{error}</div>}

      {body && verdictJson && rankedSchools.length > 0 ? (
        <div className="rr-verdict-layout">
          <aside className="rr-verdict-rail" aria-label="Verdict decision factors">
            <div className="rr-verdict-rail-head">
              Decision frame
              <span>full evidence pool</span>
            </div>
            <div className="rr-verdict-factor-list">
              {decisionFactors.slice(0, 7).map((factor, idx) => (
                <div key={idx} className="rr-verdict-factor-row">
                  <span className="rr-verdict-factor-ic">{idx + 1}</span>
                  <span>{factor}</span>
                </div>
              ))}
            </div>
            {isStale && (
              <div className="rr-verdict-stale" role="status">
                Saved verdict shown. Regenerate to refresh the hash.
              </div>
            )}
          </aside>

          <article className="rr-verdict-card rr-verdict-card--essay">
            <div className="rr-verdict-stamp">Evidence-pool verdict</div>
            <h2 className="rr-verdict-main-heading">{renderMd(verdictJson.headline ?? 'Current verdict')}</h2>
            {verdictJson.best_for_child && (
              <p className="rr-verdict-question">{renderMd(verdictJson.best_for_child)}</p>
            )}

            <div className="rr-verdict-ranking" aria-label="Current ranking">
              {rankedSchools.map((school, idx) => (
                <div key={`${school.slug ?? school.name}-${idx}`} className="rr-verdict-rank-row">
                  <span className="rr-verdict-rank-num">{school.rank ?? idx + 1}.</span>
                  <div>
                    <div className="rr-verdict-rank-school">
                      {school.name}
                      {school.summary && <small>{school.summary}</small>}
                    </div>
                    <div className="rr-verdict-rank-signals">
                      {(school.strengths ?? []).slice(0, 2).map((strength, i) => (
                        <span key={`s-${i}`} className="rr-verdict-signal is-strength">{strength}</span>
                      ))}
                      {(school.reservations ?? []).slice(0, 2).map((reservation, i) => (
                        <span key={`r-${i}`} className="rr-verdict-signal is-reservation">{reservation}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rr-verdict-prose">
              {verdictJson.dissenting_view && (
                <p><strong>Dissenting view:</strong> {renderMd(verdictJson.dissenting_view)}</p>
              )}
              {evidenceGaps.length > 0 && (
                <>
                  <h3>Evidence gaps</h3>
                  <ul>
                    {evidenceGaps.slice(0, 5).map((gap, idx) => <li key={idx}>{renderMd(gap)}</li>)}
                  </ul>
                </>
              )}
            </div>

            <div className="rr-verdict-confidence">
              <span>Confidence: <strong className={confidenceClass(verdictJson.confidence)}>{verdictJson.confidence ?? 'medium'}</strong></span>
              <span>Sources: <strong>{sourceCount}</strong></span>
              {/* v3: lens scope dropped — verdict reads all-evidence rows. */}
              {generated && <span>Updated: <strong>{generated}</strong></span>}
            </div>
          </article>
        </div>
      ) : body ? (
        <article className="rr-verdict-card">
          <div className="rr-partner-brief-meta">
            {/* v3: lens scope dropped — verdict reads all-evidence rows. */}
            {generated && <span>{generated}</span>}
          </div>
          <div className="rr-verdict-body">
            {renderVerdictMarkdown(body)}
          </div>
        </article>
      ) : (
        <div className="rr-placeholder-card" role="status">
          <div className="rr-placeholder-eyebrow">No verdict yet</div>
          <div className="rr-placeholder-body">
            Generate a verdict once the comparison has enough rows to rank the shortlist.
          </div>
        </div>
      )}
    </>
  )
}
