'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  // UX iteration Phase 2 (2026-05-24): LLM-generated round-up paragraphs.
  // Mirror of the server type's optional field. Rendered by the panel
  // below, falls back to `reasoning` when absent (LLM failure or pre-
  // Phase-2 cached verdicts).
  advisor_roundup?: string[]
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
    // Codex r2 P2 #1: tri-state (boolean | null) — null when no region filter
    // in play, so the renderer omits the pill instead of saying "Outside filter".
    inside_filter?:  boolean | null
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
  // UX iteration Phase 1 (2026-05-23): parent's free-text quote, trimmed +
  // length-capped server-side. Null when goals_notes was empty.
  goals_quote?: string | null
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

  // Codex r2 P2 #2: only synthesize a complement percentage when at least
  // one side is known. Previously `boarders_pct ?? 0` + `day_pct ?? (100 -
  // boarders)` produced 100% day when both were missing, fabricating a fact.
  // Now: if BOTH are null, leave both null and hide the card. If ONE is
  // known, derive the other as 100 - known. If both are known, use both.
  const rawBoarders = facts?.students?.boarders_pct ?? null
  const rawDay      = facts?.students?.day_pct ?? null
  const knownBoarders = rawBoarders != null ? rawBoarders : (rawDay != null ? 100 - rawDay : null)
  const knownDay      = rawDay != null      ? rawDay      : (rawBoarders != null ? 100 - rawBoarders : null)
  const boardersPct   = knownBoarders ?? 0    // for bar width only — gated on `hasBoardingMix` below
  const dayPct        = knownDay ?? 0
  const hasBoardingMix = knownBoarders != null || knownDay != null

  const rawIntl = facts?.students?.intl_pct ?? null
  const intlPct = rawIntl ?? 0                // for bar width only — gated on `hasIntlMix` below
  const ukPct   = Math.max(0, 100 - intlPct)
  const hasIntlMix = rawIntl != null

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
            {/* Codex r2 P2 #1: only render the pill when there IS a region filter.
                inside_filter is null when home_region is absent / 'anywhere' / 'overseas'. */}
            {facts.location.inside_filter !== null && facts.location.inside_filter !== undefined && (
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

      {/* Advisor's full take — LLM-generated round-up (UX iteration Phase 2,
          2026-05-24). Falls back to deterministic reasoning[] when LLM call
          failed or hadn't run yet (cached verdicts predating this slice). */}
      {(() => {
        const paragraphs = path.advisor_roundup ?? path.reasoning ?? []
        if (paragraphs.length === 0) return null
        const isLlmRoundup = (path.advisor_roundup?.length ?? 0) > 0
        return (
          <section className="rr-vb3-section is-narrative">
            <div className="rr-vb3-section-head">
              <span className="rr-vb3-section-icon">★</span>
              <h3>{isLlmRoundup
                ? `Advisor's full take on ${childName ? `${childName}'s` : `your child's`} fit`
                : `Why this fits ${childName ? `${childName}'s` : `your child's`} brief`}</h3>
              <span className="rr-vb3-section-sub">{isLlmRoundup ? 'long-form' : 'advisor’s take'}</span>
            </div>
            <div className="rr-vb3-narrative">
              {paragraphs.map((p, i) => <p key={i}>{renderMd(p)}</p>)}
            </div>
          </section>
        )
      })()}

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

      {/* Community shape — only render when at least one mix card has real data.
          Codex r2 P2 #2: previously this section fabricated 100% day when both
          boarder + day percentages were null. Now gated on hasBoardingMix /
          hasIntlMix so a school with no community data hides the whole section. */}
      {facts && (hasBoardingMix || hasIntlMix) && (
        <section className="rr-vb3-section">
          <div className="rr-vb3-section-head">
            <h3>Community shape</h3>
            <span className="rr-vb3-section-sub">Who&apos;s on site</span>
          </div>
          <div className="rr-vb3-mix-grid">
            {hasBoardingMix && (
              <div className="rr-vb3-mix-card">
                <div className="rr-vb3-mix-label">Boarding / day mix</div>
                <div className="rr-vb3-mix-value">
                  {knownBoarders != null ? `${Math.round(knownBoarders)}%` : '—'} boarders
                </div>
                <div className="rr-vb3-mix-detail">
                  {knownDay != null ? `${Math.round(knownDay)}%` : '—'} day
                  {facts.students?.total_label && <> · {facts.students.total_label} total pupils</>}
                </div>
                <div className="rr-vb3-mix-bar" aria-label="Boarding vs day split">
                  <span className="rr-vb3-mix-bar-fill is-board" style={{ width: `${boardersPct}%` }} />
                  <span className="rr-vb3-mix-bar-fill is-day"   style={{ width: `${dayPct}%` }} />
                </div>
              </div>
            )}
            {hasIntlMix && (
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
  // Codex r1 P1 #2 follow-up (2026-05-23): SSR pre-fetch was removed to fix a
  // hash-mismatch class of bug. That meant on refresh, the cached verdict from
  // the DB wasn't auto-loaded — parents had to click Generate to see their
  // own existing verdict. This client-side hydration on mount fires POST
  // `force: false`, which the route handles as cache-first: returns the
  // cached row if hash matches, regenerates only if missing or stale. Fast on
  // cache hit; slower only when there's genuinely no cached verdict yet.
  // Guarded with autoHydrateAttemptedRef so it fires exactly once per mount.
  const autoHydrateAttemptedRef = useRef(false)

  useEffect(() => {
    setLocalVerdict(verdict)
  }, [verdict])

  const verdictJson = useMemo(() => readVerdictJson(localVerdict?.verdict_json), [localVerdict])

  // Sync the active path to the server-computed default once verdict lands.
  useEffect(() => {
    if (verdictJson?.paths) setSelectedPath(pickInitialPath(verdictJson))
    else setSelectedPath(null)
  }, [verdictJson])

  // Auto-hydrate from cache on mount when there's no verdict already loaded.
  // See autoHydrateAttemptedRef comment above. Fires once per mount, only
  // when sessionId is present and we don't already have a verdict in state.
  useEffect(() => {
    if (autoHydrateAttemptedRef.current) return
    if (!sessionId || localVerdict) return
    autoHydrateAttemptedRef.current = true
    generate(false)
    // generate() is intentionally invoked here without being in the dep list —
    // it's a stable closure over sessionId/generating; we want exactly one
    // hydration attempt per mount, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

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
              // 3.1 (2026-05-23): child name in title when known, so the verdict
              // page anchors the parent in WHO this is about. Falls back to the
              // generic "pick the one that fits" framing if no childName prop.
              ? (childName
                  ? <>Three honest paths for <em>{childName}</em></>
                  : <>Three honest paths, <em>pick the one that fits.</em></>)
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
          {/* 3.2 (2026-05-23): Expanded brief callout — replaces the small
              chip strip with a richer card showing eyebrow + meta line + chip
              grid + the parent's goals_notes quote (when present). Renderer
              still consumes brief_chips[] + goals_quote from the verdict JSON
              so the data contract is unchanged; only the wrapper structure
              changed. */}
          {((verdictJson.brief_chips?.length ?? 0) > 0 || verdictJson.goals_quote) && (
            <section className="rr-verdict-brief-strip rr-verdict-brief-expanded" aria-label={`${childName ?? 'Child'}'s brief`}>
              <div className="rr-verdict-brief-expanded-head">
                <span className="rr-verdict-brief-strip-head">Brief that drives this verdict</span>
                {childName && (
                  <span className="rr-verdict-brief-expanded-meta">{childName}&apos;s brief</span>
                )}
              </div>
              {(verdictJson.brief_chips?.length ?? 0) > 0 && (
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
              )}
              {verdictJson.goals_quote && (
                <blockquote className="rr-verdict-brief-quote">
                  <span className="rr-verdict-brief-quote-mark" aria-hidden="true">&ldquo;</span>
                  <p>{verdictJson.goals_quote}</p>
                </blockquote>
              )}
            </section>
          )}

          {/* Selector tiles */}
          {/* Consensus banner: when the same school wins multiple paths, surface
              it as a positive signal above the tiles (Codex r4 follow-up — the
              same_winner_across_paths field was populated server-side but not
              rendered, making the duplicate look like UI redundancy instead of
              the strong-fit signal it actually is). */}
          {verdictJson.same_winner_across_paths && verdictJson.same_winner_across_paths.paths.length >= 2 && (() => {
            const slug = verdictJson.same_winner_across_paths.winner_slug
            const name = verdictJson.school_facts?.[slug]?.name ?? slug
            const paths = verdictJson.same_winner_across_paths.paths.join(' + ')
            return (
              <div className="rr-verdict-consensus" role="status">
                <span className="rr-verdict-consensus-badge">Strong consensus</span>
                <span className="rr-verdict-consensus-body">
                  <strong>{name}</strong> wins paths <strong>{paths}</strong> — same school satisfies multiple framings.
                </span>
              </div>
            )
          })()}

          <div className="rr-verdict-selector" role="tablist" aria-label="Verdict paths">
            {(['A', 'B', 'C'] as PathKey[]).map(letter => {
              const path = verdictJson.paths![letter]
              const isActive = selectedPath === letter
              const winnerSlug = path?.winner_slug
              const winnerName = (winnerSlug && verdictJson.school_facts?.[winnerSlug]?.name)
                ?? winnerSlug
                ?? '—'
              const isNeedsResearch = path?.path_status === 'needs_research'
              // Same-winner consolidation: list of OTHER paths whose winner is
              // the same school as this tile's winner. Surfaced as a small
              // "Also Path X" line in the tile, so parents see the consensus
              // signal at the tile level too (the consensus banner above the
              // tiles repeats this at the section level).
              const alsoPaths: PathKey[] = (winnerSlug && verdictJson.same_winner_across_paths?.winner_slug === winnerSlug)
                ? verdictJson.same_winner_across_paths.paths.filter(p => p !== letter)
                : []
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
                  {alsoPaths.length > 0 && (
                    <div className="rr-verdict-tile-also">Also wins Path {alsoPaths.join(' + Path ')}</div>
                  )}
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
