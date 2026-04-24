import { readValue, readEvidence, isLegacyScalar, methodLabel, type Provenanced } from '@/lib/provenance'

type Coach = { name: string; title?: string; role?: string; notable?: string | null }
type Alumnus = { name: string; known_for?: string }
type CupResult =
  | string
  | { tournament?: string; name?: string; year?: string | number; result?: string; note?: string; source?: string }

// `school_teams_visible` is the first field to adopt the Phase-1 structured
// evidence shape (Provenanced<number>). Legacy scalar values still work via
// readValue()'s backwards-compat branch.
type TennisData = {
  notes?: string | null
  head_coach?: Coach | null
  tennis_coaches?: Coach[] | null
  cup_results?: CupResult[] | null
  courts_indoor?: number | null
  courts_outdoor?: number | null
  lta_accredited?: boolean | null
  lta_accreditation_type?: string | null
  notable_alumni?: Alumnus[] | null
  competitive_tier?: string | null
  competitive_tier_reasoning?: string | null
  indoor_centre_named?: string | null
  academy_scholarship?: boolean | null
  academy_scholarship_notes?: string | null
  school_teams_visible?: number | Provenanced<number> | null
  pathway_to_professional?: string | null
  programme_classification?: string | null
  evidence_urls?: string[] | null
  extracted_at?: string | null
}

type Props = {
  tennis?: TennisData | null
  /**
   * When true, render only the content inside a plain <div id="tennis"> —
   * no outer <section className="block"> card and no top-level <h2> title.
   * Used when TennisSection is nested inside a parent section (e.g. the
   * unified "Sports & Athletics" block) that already supplies the heading.
   * Default false → standalone rendering.
   */
  headless?: boolean
}

const TIER_LABELS: Record<string, { text: string; cls: string }> = {
  'national-elite':    { text: 'National elite',    cls: 'tier-elite' },
  'national-strong':   { text: 'National strong',   cls: 'tier-strong' },
  'national':          { text: 'National',          cls: 'tier-strong' },
  'regional':          { text: 'Regional',          cls: 'tier-regional' },
  'recreational':      { text: 'Recreational',      cls: 'tier-rec' },
}

/**
 * Single source of truth for "would TennisSection render anything useful?".
 * Exported so page.tsx can gate the surrounding "Academy programmes" divider
 * on the same predicate — prevents a lonely divider with nothing under it
 * when a school has a tennis object present but too thin to render.
 */
export function hasMeaningfulTennisData(t: TennisData | null | undefined): boolean {
  if (!t) return false
  if (t.head_coach?.name) return true
  if (t.lta_accredited) return true
  if ((t.cup_results?.length ?? 0) > 0) return true
  if ((t.notable_alumni?.length ?? 0) > 0) return true
  if ((readValue<number>(t.school_teams_visible) ?? 0) >= 10) return true
  return false
}

// Local alias preserves the short internal name used below.
const hasMeaningfulData = hasMeaningfulTennisData

function normaliseCup(c: CupResult) {
  if (typeof c === 'string') return { tournament: c, year: null, result: null, note: null }
  return {
    tournament: c.tournament || c.name || 'Tournament',
    year:       c.year ?? null,
    result:     c.result ?? null,
    note:       c.note ?? null,
  }
}

// "winner" is the headline outcome; anything else (semi-finalist, finalist, runner-up) is secondary.
function resultClass(result: string | null): string {
  if (!result) return ''
  const r = result.toLowerCase()
  if (/winner|champion|won/.test(r)) return 'cup-winner'
  if (/finalist|semi|runner/.test(r)) return 'cup-finalist'
  return 'cup-other'
}

function summariseCups(cups: CupResult[]) {
  // Group wins by tournament so "Youll Cup — 5 wins (2024, 2023, 2014, 2011, 2009)"
  // reads cleaner than five identical lines.
  const wins = cups.map(normaliseCup).filter(c => /winner|champion/i.test(c.result || ''))
  const byTourney = new Map<string, (string | number)[]>()
  for (const w of wins) {
    if (!byTourney.has(w.tournament)) byTourney.set(w.tournament, [])
    if (w.year != null) byTourney.get(w.tournament)!.push(w.year)
  }
  const summaries: Array<{ tournament: string; count: number; years: (string | number)[] }> = []
  for (const [tournament, years] of byTourney.entries()) {
    if (years.length >= 2) summaries.push({ tournament, count: years.length, years: years.sort((a, b) => Number(b) - Number(a)) })
  }
  return summaries
}

export default function TennisSection({ tennis, headless = false }: Props) {
  if (!tennis || !hasMeaningfulData(tennis)) return null

  const tier = tennis.competitive_tier ? TIER_LABELS[tennis.competitive_tier] : null
  const totalCourts = (tennis.courts_outdoor ?? 0) + (tennis.courts_indoor ?? 0)
  const showCourts = (tennis.courts_outdoor ?? 0) > 0 || (tennis.courts_indoor ?? 0) > 0 || tennis.indoor_centre_named

  // Wrapper + heading differ based on headless. Anchor id="tennis" is
  // preserved in both modes so TOC links keep working.
  const Wrapper: 'section' | 'div' = headless ? 'div' : 'section'
  const wrapperClass = headless ? 'sport-subsection' : 'block'
  const HeadingTag: 'h3' | 'h2' = headless ? 'h3' : 'h2'
  const headingClass = headless ? 'sport-subsection-title' : 'block-title'
  const headingText = headless ? '🎾 Tennis' : '🎾 Tennis programme'
  // Internal block-sub headings ("Coaching", "Facilities", etc.) demote from
  // h3 to h4 when headless so they nest correctly under the h3 Tennis heading.
  const SubTag: 'h3' | 'h4' = headless ? 'h4' : 'h3'

  return (
    <Wrapper className={wrapperClass} id="tennis">
      <HeadingTag className={headingClass}>{headingText}</HeadingTag>

      {/* Header strip — tier / LTA / scholarship badges */}
      <div className="insp-meta-strip tennis-strip">
        {tier && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Tier</span>
            <span className={`tennis-badge ${tier.cls}`}>{tier.text}</span>
          </div>
        )}
        {tennis.lta_accredited && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">LTA</span>
            <span className="tennis-badge tennis-lta">
              ✓ Accredited{tennis.lta_accreditation_type ? ` — ${tennis.lta_accreditation_type}` : ''}
            </span>
          </div>
        )}
        {tennis.academy_scholarship && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Scholarship</span>
            <span className="tennis-badge tennis-schol">Available</span>
          </div>
        )}
        {tennis.programme_classification && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Programme</span>
            <span className="insp-meta-value">{tennis.programme_classification}</span>
          </div>
        )}
        {(() => {
          const teams = readValue<number>(tennis.school_teams_visible)
          if (!teams || teams <= 0) return null
          const evidence = readEvidence(tennis.school_teams_visible)
          const legacy = isLegacyScalar(tennis.school_teams_visible)
          const tooltip = legacy
            ? 'Legacy value — no provenance recorded'
            : evidence
            ? `${methodLabel(evidence.method)} · ${evidence.url ?? '(no URL)'}`
            : 'No provenance'
          return (
            <div className="insp-meta-item">
              <span className="insp-meta-label">Teams</span>
              <span className="insp-meta-value" title={tooltip}>
                {teams}
                {evidence?.method === 'deterministic_counter' && (
                  <span className="tennis-provenance-tick" aria-label="Counted from source">
                    {' '}✓
                  </span>
                )}
                {legacy && (
                  <span className="tennis-provenance-warn" aria-label="Legacy — no source">
                    {' '}~
                  </span>
                )}
              </span>
            </div>
          )
        })()}
      </div>

      {/* Summary — the juicy notes paragraph */}
      {tennis.notes && (
        <div className="insp-summary-box">
          <div className="insp-summary-label">Programme summary</div>
          <p className="insp-summary-text">{tennis.notes}</p>
        </div>
      )}

      {/* Coaching */}
      {(tennis.head_coach?.name || (tennis.tennis_coaches?.length ?? 0) > 0) && (
        <>
          <SubTag className="block-sub">Coaching</SubTag>
          <ul className="tennis-list">
            {tennis.head_coach?.name && (
              <li>
                <strong>{tennis.head_coach.name}</strong>
                {(tennis.head_coach.title || tennis.head_coach.role) && <> — {tennis.head_coach.title || tennis.head_coach.role}</>}
                {tennis.head_coach.notable && <span className="tennis-muted"> · {tennis.head_coach.notable}</span>}
                <span className="tennis-tag">Head coach</span>
              </li>
            )}
            {tennis.tennis_coaches?.filter(c => c.name && c.name !== tennis.head_coach?.name).map((c, i) => (
              <li key={i}>
                <strong>{c.name}</strong>
                {(c.title || c.role) && <> — {c.title || c.role}</>}
                {c.notable && <span className="tennis-muted"> · {c.notable}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Facilities */}
      {showCourts && (
        <>
          <SubTag className="block-sub">Facilities</SubTag>
          <div className="tennis-facility-grid">
            {(tennis.courts_outdoor ?? 0) > 0 && (
              <div className="tennis-facility-item">
                <div className="tennis-facility-num">{tennis.courts_outdoor}</div>
                <div className="tennis-facility-lbl">Outdoor courts</div>
              </div>
            )}
            {(tennis.courts_indoor ?? 0) > 0 && (
              <div className="tennis-facility-item">
                <div className="tennis-facility-num">{tennis.courts_indoor}</div>
                <div className="tennis-facility-lbl">Indoor courts</div>
              </div>
            )}
            {totalCourts > 0 && (tennis.courts_outdoor ?? 0) > 0 && (tennis.courts_indoor ?? 0) > 0 && (
              <div className="tennis-facility-item">
                <div className="tennis-facility-num">{totalCourts}</div>
                <div className="tennis-facility-lbl">Total</div>
              </div>
            )}
            {tennis.indoor_centre_named && (
              <div className="tennis-facility-item tennis-facility-named">
                <div className="tennis-facility-lbl">Indoor centre</div>
                <div className="tennis-facility-named-txt">{tennis.indoor_centre_named}</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Competitive record */}
      {(tennis.cup_results?.length ?? 0) > 0 && (
        <>
          <SubTag className="block-sub">Competitive record</SubTag>
          {summariseCups(tennis.cup_results!).length > 0 && (
            <div className="tennis-cup-summary">
              {summariseCups(tennis.cup_results!).map((s, i) => (
                <div key={i} className="tennis-cup-summary-item">
                  <span className="tennis-cup-summary-count">{s.count}×</span>
                  <span className="tennis-cup-summary-name">{s.tournament} winner</span>
                  <span className="tennis-cup-summary-years">({s.years.join(', ')})</span>
                </div>
              ))}
            </div>
          )}
          <ul className="tennis-cup-list">
            {tennis.cup_results!.map((c, i) => {
              const n = normaliseCup(c)
              return (
                <li key={i} className="tennis-cup-row">
                  <span className="tennis-cup-tournament">{n.tournament}</span>
                  {n.year != null && <span className="tennis-cup-year">{n.year}</span>}
                  {n.result && <span className={`tennis-cup-result ${resultClass(n.result)}`}>{n.result}</span>}
                  {n.note && <span className="tennis-muted">· {n.note}</span>}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* Alumni & pathway */}
      {((tennis.notable_alumni?.length ?? 0) > 0 || tennis.pathway_to_professional) && (
        <>
          <SubTag className="block-sub">Alumni & pathway</SubTag>
          {(tennis.notable_alumni?.length ?? 0) > 0 && (
            <ul className="tennis-list">
              {tennis.notable_alumni!.map((a, i) => (
                <li key={i}>
                  <strong>{a.name}</strong>
                  {a.known_for && <> — {a.known_for}</>}
                </li>
              ))}
            </ul>
          )}
          {tennis.pathway_to_professional && (
            <p className="tennis-pathway">{tennis.pathway_to_professional}</p>
          )}
        </>
      )}

      {/* Scholarship detail */}
      {tennis.academy_scholarship && tennis.academy_scholarship_notes && (
        <>
          <SubTag className="block-sub">Scholarship detail</SubTag>
          <p className="tennis-schol-notes">{tennis.academy_scholarship_notes}</p>
        </>
      )}

      {/* Why this tier? (collapsible) */}
      {tennis.competitive_tier_reasoning && (
        <details className="tennis-details">
          <summary>Why this tier?</summary>
          <p className="tennis-reasoning">{tennis.competitive_tier_reasoning}</p>
        </details>
      )}

      {/* Sources (collapsible) */}
      {((tennis.evidence_urls?.length ?? 0) > 0 || tennis.extracted_at) && (
        <details className="tennis-details">
          <summary>Sources{tennis.extracted_at ? ` · last refreshed ${new Date(tennis.extracted_at).toLocaleDateString('en-GB')}` : ''}</summary>
          {(tennis.evidence_urls?.length ?? 0) > 0 && (
            <ul className="tennis-sources">
              {tennis.evidence_urls!.map((u, i) => (
                <li key={i}><a href={u} target="_blank" rel="noopener noreferrer">{u}</a></li>
              ))}
            </ul>
          )}
        </details>
      )}
    </Wrapper>
  )
}
