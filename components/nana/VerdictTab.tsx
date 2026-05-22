'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { renderMd } from './NanaBubble'
import './verdict-tab-v3.css'

export type ResearchVerdictForUi = {
  id: string
  input_hash: string
  verdict_json: unknown
  body_markdown: string
  generated_at: string
  cache_status?: 'current' | 'stale'
}

type PathKey = 'A' | 'B' | 'C'

type PathEvidenceItem = {
  row?:          string
  value?:        string
  source_url?:   string
  source_label?: string
}

type PathCostItem = {
  label?:  string
  detail?: string
}

type PathOverlay = {
  framing?:        string
  framingLong?:    string
  winner_slug?:    string
  path_status?:    'winner' | 'fallback' | 'needs_research'
  reasoning?:      string[]
  evidence?:       PathEvidenceItem[]
  costs?:          PathCostItem[]
  considerations?: string[]
  status_note?:    string
}

type CouldntCompareSchool = {
  slug?:                     string
  name?:                     string
  comparison_rows_filled?:   number
  comparison_rows_total?:    number
  coverage_pct?:             number
  brief_match_summary?:      string
  budget_warning?:           string
  critical_missing_rows?:    string[]
  highest_leverage_action?:  string
}

type BriefChip = {
  key?:        string
  value?:      string
  is_anchor?:  boolean
}

type SchoolFactsForUi = {
  slug?:       string
  name?:       string
  meta?:       string
  grades?: {
    a_level_label?: string | null
    gcse_label?:    string | null
    ib_label?:      string | null
  }
  location?: {
    town?:           string | null
    region_label?:   string | null
    inside_filter?:  boolean
    maps_embed?:     string | null
    maps_external?:  string | null
    heathrow_miles?: number | null
  }
  students?: {
    total_label?:        string | null
    boarders_pct_label?: string | null
    day_pct_label?:      string | null
    intl_pct_label?:     string | null
    boarders_pct?:       number | null
    day_pct?:            number | null
    intl_pct?:           number | null
  }
  coed?:        string | null
  curriculum?:  string | null
  fees?: {
    annual_label?: string | null
    in_budget?:    'fits' | 'partial' | 'over' | null
  }
}

type RankedSchool = {
  slug?: string
  name?: string
  rank?: number
  summary?: string
  strengths?: string[]
  reservations?: string[]
  is_path_winner_for?: PathKey[]
  coverage_below_threshold?: boolean
}

type VerdictJson = {
  format?: string
  headline?: string
  confidence?: 'low' | 'medium' | 'high'
  decision_model?: string
  decision_factors?: string[]
  ranked_schools?: RankedSchool[]
  best_for_child?: string
  dissenting_view?: string
  evidence_gaps?: string[]
  sources?: Array<{ url?: string }>
  // v3 additions:
  paths?: Record<PathKey, PathOverlay>
  couldnt_compare?: CouldntCompareSchool[]
  brief_tensions?: unknown[]
  same_winner_across_paths?: { winner_slug: string; paths: PathKey[] }
  default_path?: PathKey | null
  school_facts?: Record<string, SchoolFactsForUi>
  brief_chips?: BriefChip[]
}

type Props = {
  verdict: ResearchVerdictForUi | null
  sessionId?: string | null
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

function readVerdictJson(value: unknown): VerdictJson | null {
  if (!value || typeof value !== 'object') return null
  return value as VerdictJson
}

// Legacy v2 body-markdown renderer — kept as a fallback path for any cached
// row that doesn't carry the v3 fields (paths/school_facts/brief_chips).
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

const TILE_TAGLINE_FALLBACKS: Record<PathKey, string> = {
  A: 'If sport is the priority',
  B: 'If you want both, equal weight',
  C: 'If your location filter is firm',
}

function pickInitialPath(verdictJson: VerdictJson): PathKey {
  // Prefer the server-computed default_path. Otherwise pick the first path
  // that has a real winner (path_status === 'winner'). Last resort: 'B'
  // (the balanced/middle path) so the first paint is a neutral choice.
  if (verdictJson.default_path) return verdictJson.default_path
  const paths = verdictJson.paths
  if (paths) {
    for (const key of ['A', 'B', 'C'] as PathKey[]) {
      if (paths[key]?.path_status === 'winner' && paths[key]?.winner_slug) return key
    }
  }
  return 'B'
}

function renderPathDetail(
  pathKey:    PathKey,
  path:       PathOverlay,
  facts:      SchoolFactsForUi | undefined,
  childName:  string | null | undefined,
): ReactNode {
  const accentClass = `is-path-${pathKey.toLowerCase()}`
  const schoolName = facts?.name ?? path.winner_slug ?? '—'
  const meta       = facts?.meta ?? ''
  const isWinner   = path.path_status === 'winner'

  const boardersPct = facts?.students?.boarders_pct ?? 0
  const dayPct      = facts?.students?.day_pct ?? Math.max(0, 100 - boardersPct)
  const intlPct     = facts?.students?.intl_pct ?? 0
  const ukPct       = Math.max(0, 100 - intlPct)

  return (
    <article className={`rr-vb3-detail ${accentClass}`}>
      <div className="rr-vb3-eyebrow">Path {pathKey} · {path.framing ?? TILE_TAGLINE_FALLBACKS[pathKey]}</div>
      <h2 className="rr-vb3-school">{schoolName}</h2>
      {meta && <div className="rr-vb3-meta">{meta}</div>}
      {!isWinner && path.status_note && (
        <p className="rr-vb3-status-note" role="status">{path.status_note}</p>
      )}

      {/* Fact ribbon */}
      {facts && (
        <div className="rr-vb3-ribbon">
          <div className="rr-vb3-ribbon-cell">
            <div className="rr-vb3-ribbon-label">A-level A*–A</div>
            <div className="rr-vb3-ribbon-value">
              {facts.grades?.a_level_label ?? '—'}
              {facts.grades?.gcse_label && <small>{facts.grades.gcse_label}</small>}
              {!facts.grades?.gcse_label && facts.grades?.ib_label && <small>{facts.grades.ib_label}</small>}
            </div>
          </div>
          <div className="rr-vb3-ribbon-cell">
            <div className="rr-vb3-ribbon-label">Type</div>
            <div className="rr-vb3-ribbon-value">
              {facts.coed ?? '—'}
              {facts.curriculum && <small>{facts.curriculum}</small>}
            </div>
          </div>
          <div className="rr-vb3-ribbon-cell">
            <div className="rr-vb3-ribbon-label">Fees / year</div>
            <div className="rr-vb3-ribbon-value">
              {facts.fees?.annual_label ?? '—'}
              {facts.fees?.in_budget && (
                <span className={`rr-vb3-pill is-${facts.fees.in_budget}`}>
                  {facts.fees.in_budget === 'fits' ? 'Fits' : facts.fees.in_budget === 'partial' ? 'Partial' : 'Over'}
                </span>
              )}
            </div>
          </div>
          <div className="rr-vb3-ribbon-cell">
            <div className="rr-vb3-ribbon-label">From Heathrow</div>
            <div className="rr-vb3-ribbon-value">
              {facts.location?.heathrow_miles != null ? `${facts.location.heathrow_miles} mi` : '—'}
            </div>
          </div>
          <div className="rr-vb3-ribbon-cell">
            <div className="rr-vb3-ribbon-label">Students</div>
            <div className="rr-vb3-ribbon-value">
              {facts.students?.total_label ?? '—'}
              {facts.students?.boarders_pct_label && <small>{facts.students.boarders_pct_label} boarders</small>}
            </div>
          </div>
        </div>
      )}

      {/* Map embed (only when we have coordinates) */}
      {facts?.location?.maps_embed && (
        <div className="rr-vb3-map-block">
          <iframe
            className="rr-vb3-map"
            src={facts.location.maps_embed}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map of ${schoolName}`}
          />
          <div className="rr-vb3-map-caption">
            {facts.location.town && <strong>{facts.location.town}</strong>}
            {facts.location.region_label && <> · {facts.location.region_label}</>}
            {facts.location.inside_filter !== undefined && (
              <span className={`rr-vb3-pill ${facts.location.inside_filter ? 'is-inside' : 'is-outside'}`}>
                {facts.location.inside_filter ? 'Inside filter' : 'Outside filter'}
              </span>
            )}
            {facts.location.maps_external && (
              <>{' · '}<a href={facts.location.maps_external} target="_blank" rel="noopener">open in Google Maps</a></>
            )}
          </div>
        </div>
      )}

      {/* Narrative — promoted panel */}
      {(path.reasoning?.length ?? 0) > 0 && (
        <section className="rr-vb3-section is-narrative">
          <div className="rr-vb3-section-head">
            <span className="rr-vb3-section-icon">★</span>
            <h3>Why this fits {childName ? `${childName}'s` : `your child's`} brief</h3>
            <span className="rr-vb3-section-sub">advisor&apos;s take</span>
          </div>
          <div className="rr-vb3-narrative">
            {path.reasoning!.map((p, i) => <p key={i}>{renderMd(p)}</p>)}
          </div>
        </section>
      )}

      {/* Evidence */}
      {(path.evidence?.length ?? 0) > 0 && (
        <section className="rr-vb3-section is-evidence">
          <div className="rr-vb3-section-head">
            <span className="rr-vb3-section-icon">✓</span>
            <h3>Why we picked this — evidence we used</h3>
            <span className="rr-vb3-section-sub">{path.evidence!.length} citation{path.evidence!.length === 1 ? '' : 's'}</span>
          </div>
          <ul className="rr-vb3-evidence-list">
            {path.evidence!.map((e, i) => (
              <li key={i}>
                <span>
                  {e.row && <span className="rr-vb3-evidence-row">{e.row}:</span>}{' '}
                  {e.value}
                  {(e.source_url || e.source_label) && (
                    <span className="rr-vb3-evidence-cite">
                      → {e.source_url
                        ? <a href={e.source_url} target="_blank" rel="noopener">{e.source_label ?? e.source_url}</a>
                        : e.source_label}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Honest costs */}
      {(path.costs?.length ?? 0) > 0 && (
        <section className="rr-vb3-section is-cost">
          <div className="rr-vb3-section-head">
            <span className="rr-vb3-section-icon">!</span>
            <h3>Honest costs of this path</h3>
            <span className="rr-vb3-section-sub">
              {path.costs!.length} item{path.costs!.length === 1 ? '' : 's'}
            </span>
          </div>
          <ul className="rr-vb3-cost-list">
            {path.costs!.map((c, i) => (
              <li key={i}>
                {c.label && <strong>{c.label}.</strong>} {c.detail && renderMd(c.detail)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Community shape — only if we have the data */}
      {facts && (boardersPct > 0 || dayPct > 0 || intlPct > 0) && (
        <section className="rr-vb3-section">
          <div className="rr-vb3-section-head">
            <h3>Community shape</h3>
            <span className="rr-vb3-section-sub">Who&apos;s on site</span>
          </div>
          <div className="rr-vb3-mix-grid">
            {(boardersPct > 0 || dayPct > 0) && (
              <div className="rr-vb3-mix-card">
                <div className="rr-vb3-mix-label">Boarding / day mix</div>
                <div className="rr-vb3-mix-value">{facts.students?.boarders_pct_label ?? '—'} boarders</div>
                <div className="rr-vb3-mix-detail">
                  {facts.students?.day_pct_label ?? `${Math.round(dayPct)}%`} day
                  {facts.students?.total_label && <> · {facts.students.total_label} total pupils</>}
                </div>
                <div className="rr-vb3-mix-bar" aria-label="Boarding vs day split">
                  <span className="rr-vb3-mix-bar-fill is-board" style={{ width: `${boardersPct}%` }} />
                  <span className="rr-vb3-mix-bar-fill is-day"   style={{ width: `${dayPct}%` }} />
                </div>
              </div>
            )}
            {intlPct > 0 && (
              <div className="rr-vb3-mix-card">
                <div className="rr-vb3-mix-label">International students</div>
                <div className="rr-vb3-mix-value">{facts.students?.intl_pct_label ?? '—'} international</div>
                <div className="rr-vb3-mix-detail">
                  {Math.round(ukPct)}% UK · weekend community varies by international share
                </div>
                <div className="rr-vb3-mix-bar" aria-label="International vs UK split">
                  <span className="rr-vb3-mix-bar-fill is-intl" style={{ width: `${intlPct}%` }} />
                  <span className="rr-vb3-mix-bar-fill is-day"  style={{ width: `${ukPct}%` }} />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Considerations */}
      {(path.considerations?.length ?? 0) > 0 && (
        <section className="rr-vb3-section is-consider">
          <div className="rr-vb3-section-head">
            <span className="rr-vb3-section-icon">?</span>
            <h3>Things to think about before deciding</h3>
          </div>
          <ul className="rr-vb3-consider-list">
            {path.considerations!.map((c, i) => <li key={i}>{renderMd(c)}</li>)}
          </ul>
        </section>
      )}
    </article>
  )
}

function renderCouldntCompare(items: CouldntCompareSchool[]): ReactNode {
  if (!items.length) return null
  return (
    <section className="rr-verdict-couldnt">
      <div className="rr-verdict-couldnt-head">
        <h3>Schools we couldn&apos;t compare yet</h3>
        <span className="rr-verdict-couldnt-tag">≥50% table coverage needed to rank</span>
      </div>
      <p className="rr-verdict-couldnt-intro">
        These schools are on your shortlist but the comparison table has too few cells filled
        to compare them fairly.
      </p>
      {items.map((s, idx) => (
        <div key={s.slug ?? idx} className="rr-verdict-couldnt-item">
          <div className="rr-verdict-couldnt-name">{s.name ?? s.slug ?? 'Unknown'}</div>
          <div className="rr-verdict-couldnt-meta">
            Comparison table: {s.comparison_rows_filled ?? 0} of {s.comparison_rows_total ?? 0} cells filled
            {s.coverage_pct != null && <> ({Math.round(s.coverage_pct)}%)</>} · Below the 50% threshold
          </div>
          <p className="rr-verdict-couldnt-body">
            {s.brief_match_summary && (
              <>
                <span className="rr-verdict-couldnt-tag-match">brief match</span>
                {s.brief_match_summary}
              </>
            )}
            {s.budget_warning && (
              <>
                {' '}
                <span className="rr-verdict-couldnt-tag-warn">budget warning</span>
                {s.budget_warning}
              </>
            )}
            {(s.critical_missing_rows?.length ?? 0) > 0 && (
              <> {' '}Critical missing rows: {s.critical_missing_rows!.join(', ')}.</>
            )}
          </p>
          {s.highest_leverage_action && (
            <p className="rr-verdict-couldnt-body"><strong>Next step.</strong> {s.highest_leverage_action}</p>
          )}
        </div>
      ))}
    </section>
  )
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
  const [selectedPath, setSelectedPath] = useState<PathKey | null>(null)

  useEffect(() => {
    setLocalVerdict(verdict)
  }, [verdict])

  const verdictJson = useMemo(() => readVerdictJson(localVerdict?.verdict_json), [localVerdict])

  // Sync the active path to the server-computed default once verdict lands.
  useEffect(() => {
    if (verdictJson?.paths) setSelectedPath(pickInitialPath(verdictJson))
    else setSelectedPath(null)
  }, [verdictJson])

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
  const isStale = localVerdict?.cache_status === 'stale'
  const isV3 = Boolean(verdictJson?.paths && verdictJson?.school_facts)
  const sourceCount = Array.isArray(verdictJson?.sources) ? verdictJson.sources.length : 0

  return (
    <>
      <div className="rr-view-head">
        <div>
          <div className="rr-view-eyebrow">Verdict</div>
          <h1 className="rr-view-title">
            {isV3
              ? <>Three honest paths, <em>pick the one that fits.</em></>
              : <>The decision, <em>with tradeoffs.</em></>}
          </h1>
          <p className="rr-view-meta">
            {childName ? `${childName}'s` : 'Your'} brief, ranked from all current Research Room evidence.
            {isV3 && ' Tap a path to see what fits, what costs you, and what to look at next.'}
          </p>
        </div>
        <div className="rr-partner-actions">
          <button type="button" className="rr-brief-action" disabled={!sessionId || generating} onClick={() => generate(Boolean(localVerdict))}>
            {generating ? 'Generating...' : localVerdict ? 'Regenerate' : 'Generate verdict'}
          </button>
        </div>
      </div>

      {isStale && (
        <div className="rr-verdict-stale" role="status">
          Saved verdict shown. Regenerate to refresh.
        </div>
      )}
      {error && <div className="rr-chat-error" role="alert">{error}</div>}

      {isV3 && verdictJson && selectedPath ? (
        <>
          {/* Brief chip strip */}
          {(verdictJson.brief_chips?.length ?? 0) > 0 && (
            <section className="rr-verdict-brief-strip" aria-label={`${childName ?? 'Child'}'s brief`}>
              <div className="rr-verdict-brief-strip-head">Brief that drives this verdict</div>
              <div className="rr-verdict-brief-chips">
                {verdictJson.brief_chips!.map((chip, idx) => (
                  <span
                    key={idx}
                    className={`rr-verdict-brief-chip${chip.is_anchor ? ' is-anchor' : ''}`}
                  >
                    <span className="rr-verdict-brief-chip-k">{chip.key}</span>
                    <span className="rr-verdict-brief-chip-v">{chip.value}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Selector tiles */}
          <div className="rr-verdict-selector" role="tablist" aria-label="Verdict paths">
            {(['A', 'B', 'C'] as PathKey[]).map(letter => {
              const path = verdictJson.paths![letter]
              const isActive = selectedPath === letter
              const winnerSlug = path?.winner_slug
              const winnerName = (winnerSlug && verdictJson.school_facts?.[winnerSlug]?.name)
                ?? winnerSlug
                ?? '—'
              const isNeedsResearch = path?.path_status === 'needs_research'
              return (
                <button
                  key={letter}
                  role="tab"
                  aria-selected={isActive}
                  className={[
                    'rr-verdict-tile',
                    `is-tile-${letter.toLowerCase()}`,
                    isActive ? 'is-active' : '',
                    isNeedsResearch ? 'is-disabled' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => !isNeedsResearch && setSelectedPath(letter)}
                  disabled={isNeedsResearch}
                  type="button"
                >
                  <div className="rr-verdict-tile-head">
                    <span className="rr-verdict-tile-letter">{letter}</span>
                    <span className="rr-verdict-tile-frame">{path?.framing ?? TILE_TAGLINE_FALLBACKS[letter]}</span>
                  </div>
                  <div className="rr-verdict-tile-school">{isNeedsResearch ? 'Not enough evidence yet' : winnerName}</div>
                  {isNeedsResearch && path?.status_note
                    ? <p className="rr-verdict-tile-stub">{path.status_note}</p>
                    : path?.framingLong
                      ? <p className="rr-verdict-tile-tagline">{path.framingLong}</p>
                      : null}
                </button>
              )
            })}
          </div>

          {/* Active path detail */}
          {(() => {
            const activePath = verdictJson.paths![selectedPath]
            if (!activePath) return null
            const facts = activePath.winner_slug
              ? verdictJson.school_facts?.[activePath.winner_slug]
              : undefined
            return renderPathDetail(selectedPath, activePath, facts, childName)
          })()}

          {/* Couldn't compare yet */}
          {verdictJson.couldnt_compare && renderCouldntCompare(verdictJson.couldnt_compare)}

          {/* Confidence footer */}
          <div className="rr-verdict-confidence">
            <span>Confidence: <strong className={confidenceClass(verdictJson.confidence)}>{verdictJson.confidence ?? 'medium'}</strong></span>
            <span>Sources: <strong>{sourceCount}</strong></span>
            {generated && <span>Updated: <strong>{generated}</strong></span>}
          </div>
        </>
      ) : body ? (
        // Legacy v2 fallback — body_markdown rendering for any cached row that
        // doesn't have v3 fields yet. Will go away when the migration deletes
        // all v2 rows.
        <article className="rr-verdict-card">
          <div className="rr-partner-brief-meta">
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
