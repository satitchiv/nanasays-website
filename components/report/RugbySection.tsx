// ── Types — mirrors extract-rugby.js output schema ───────────────────────────

type Programme = {
  gender?: 'boys' | 'girls' | 'mixed' | string | null
  team_levels?: string[] | null
  age_groups?: string[] | null
  notes?: string | null
  fixtures_per_term?: string | null
}

type Coach = {
  name?: string | null
  role?: string | null
  title?: string | null
  notable?: string | null
  credentials?: string | null
}

type DMTSeason = {
  season: string
  rank: number
  total_ranked?: number | null
  is_final?: boolean | null
  won?: number | null
  played?: number | null
  merit_points?: number | null
}

type DMTRanking = {
  current_rank?: number | null
  rank_3y_avg?: number | null
  rank_history?: DMTSeason[] | null
  dmt_seasons_played?: number | null
}

type SocsSeason = {
  season: string
  rank: number
  total?: number | null
  is_live?: boolean | null
}

type SocsTable = {
  performance?: SocsSeason[] | null
  all_comers?: SocsSeason[] | null
}

type CupResult = {
  tournament?: string | null
  year?: number | string | null
  division?: string | null
  result?: string | null
  note?: string | null
  source?: string | null
}

type Alumni = {
  name?: string | null
  known_for?: string | null
  achievement?: string | null
  years?: string | null
  current_role?: string | null
}

type PathwayPlayer = {
  name?: string | null
  level?: string | null
  club?: string | null
  notes?: string | null
  year_group?: string | null
  season?: string | null
}

type AcademyZone = {
  name?: string | null
  notes?: string | null
  description?: string | null
  external_partner?: string | null
}

// school_teams_visible can be { value, evidence } or a bare number
type TeamsVisible = { value?: number | null } | number | null

export type RugbyData = {
  competitive_tier?: string | null
  competitive_tier_reasoning?: string | null
  notes?: string | null
  evidence_urls?: string[] | null
  extracted_at?: string | null

  // Coaching
  head_coach?: Coach | null
  coaching_staff?: Coach[] | null

  // Programmes — array, each has gender
  programmes?: Programme[] | null

  // Facilities — string array from extractor
  facilities?: string[] | null

  // Rankings
  dmt_ranking?: DMTRanking | null
  socs?: SocsTable | null

  // Teams
  school_teams_visible?: TeamsVisible

  // Cup results
  cup_results?: CupResult[] | null

  // Alumni & pathway
  notable_alumni?: Alumni[] | null
  current_pathway_players?: PathwayPlayer[] | null
  pathway_to_professional?: string | null

  // Academy / scholarship
  academy_zone?: AcademyZone | null
  academy_scholarship?: string | null
  academy_scholarship_notes?: string | null
  scholarship_offered?: boolean | null
  scholarship_notes?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hasMeaningfulRugbyData(r: RugbyData | null | undefined): boolean {
  if (!r) return false
  if (r.head_coach?.name) return true
  if ((r.coaching_staff?.length ?? 0) > 0) return true
  if (r.dmt_ranking?.current_rank != null) return true
  if ((r.cup_results?.length ?? 0) > 0) return true
  if ((r.notable_alumni?.length ?? 0) > 0) return true
  if (teamsCount(r) >= 3) return true
  if (r.competitive_tier && r.competitive_tier !== 'unknown') return true
  return false
}

function teamsCount(r: RugbyData): number {
  const t = r.school_teams_visible
  if (t == null) return 0
  if (typeof t === 'number') return t
  return t.value ?? 0
}

function resultClass(result: string | null | undefined): string {
  if (!result) return 'cup-other'
  const r = result.toLowerCase()
  if (/winner|champion|won/.test(r)) return 'cup-winner'
  if (/finalist|semi|runner/.test(r)) return 'cup-finalist'
  return 'cup-other'
}

const TIER_LABELS: Record<string, { text: string; cls: string }> = {
  'national-elite':  { text: 'National elite',  cls: 'tier-elite' },
  'national-strong': { text: 'National strong', cls: 'tier-strong' },
  'regional':        { text: 'Regional',        cls: 'tier-regional' },
  'standard':        { text: 'Standard',        cls: 'tier-rec' },
}

function fmtSeason(s: string): string {
  return s.replace('20', '').replace('-20', '–').replace('-', '–')
}

function topPct(rank: number, total: number): string {
  return `Top ${Math.round((rank / total) * 100)}%`
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  rugby?: RugbyData | null
  headless?: boolean
}

export default function RugbySection({ rugby, headless = false }: Props) {
  if (!rugby || !hasMeaningfulRugbyData(rugby)) return null

  const tier = rugby.competitive_tier ? TIER_LABELS[rugby.competitive_tier] : null
  const dmt  = rugby.dmt_ranking
  const hasDMT = dmt?.current_rank != null

  // Current season = first entry in rank_history (extractor sorts desc)
  const currentSeason = dmt?.rank_history?.[0]
  const teamsVisible  = teamsCount(rugby)

  // Split programmes by gender
  const progs = rugby.programmes ?? []
  const boysProg  = progs.find(p => p.gender === 'boys')
  const girlsProg = progs.find(p => p.gender === 'girls')

  // Lead coach = head_coach, rest from coaching_staff (excluding head)
  const headCoach    = rugby.head_coach
  const otherCoaches = (rugby.coaching_staff ?? []).filter(
    c => c.name && c.name !== headCoach?.name
  )

  const hasFacilities = (rugby.facilities?.length ?? 0) > 0
  const hasAlumni     = (rugby.notable_alumni?.length ?? 0) > 0 || !!rugby.pathway_to_professional
  const hasPathway    = (rugby.current_pathway_players?.length ?? 0) > 0
  const hasSocs       = !!(rugby.socs?.performance?.length || rugby.socs?.all_comers?.length)
  const hasScholarship = rugby.scholarship_offered || !!rugby.academy_scholarship || !!rugby.academy_scholarship_notes

  const az = rugby.academy_zone?.name || rugby.academy_zone?.external_partner
    ? rugby.academy_zone : null

  const Wrapper    = headless ? 'div'  : 'section' as const
  const wrapClass  = headless ? 'sport-subsection' : 'block'
  const H          = headless ? 'h3'   : 'h2' as const
  const hCls       = headless ? 'sport-subsection-title' : 'block-title'
  const Sub        = headless ? 'h4'   : 'h3' as const

  return (
    <Wrapper className={wrapClass} id="rugby">
      <H className={hCls}>🏉 Rugby programme</H>

      {/* ── Meta strip ── */}
      <div className="insp-meta-strip rugby-strip">
        {tier && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Tier</span>
            <span className={`rugby-badge ${tier.cls}`}>{tier.text}</span>
          </div>
        )}
        {teamsVisible > 0 && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Teams</span>
            <span className="insp-meta-value">{teamsVisible}</span>
          </div>
        )}
        {(rugby.scholarship_offered || !!rugby.academy_scholarship) && (
          <div className="insp-meta-item">
            <span className="rugby-badge-schol">Scholarship available</span>
          </div>
        )}
      </div>

      {/* ── DMT card ── */}
      {hasDMT && currentSeason && (
        <div className="rugby-dmt-card">
          <div className="rugby-dmt-header">
            <span className="rugby-dmt-label">Daily Mail Trophy</span>
            <span className="rugby-dmt-status">
              {currentSeason.is_final ? 'Final table' : 'Live — in season'}
            </span>
          </div>
          <div className="rugby-dmt-stats">
            <div className="rugby-dmt-stat">
              <div className="rugby-dmt-num">{dmt!.current_rank}</div>
              <div className="rugby-dmt-lbl">
                Rank of {currentSeason.total_ranked}
                {' · '}<span className="rugby-dmt-season-inline">{fmtSeason(currentSeason.season)}</span>
              </div>
            </div>
            {currentSeason.total_ranked && (
              <div className="rugby-dmt-stat">
                <div className="rugby-dmt-num">{topPct(dmt!.current_rank!, currentSeason.total_ranked)}</div>
                <div className="rugby-dmt-lbl">Nationally</div>
              </div>
            )}
          </div>

          {/* Year-by-year history pills */}
          {(dmt!.rank_history?.length ?? 0) > 0 && (
            <div className="rugby-dmt-history">
              {dmt!.rank_history!.map((h, i) => (
                <div key={i} className={`rugby-dmt-history-pill${h.season === currentSeason.season ? ' current' : ''}`}>
                  <span className="rugby-dmt-history-season">{fmtSeason(h.season)}</span>
                  <span className="rugby-dmt-history-rank">#{h.rank}</span>
                  {!h.is_final && <span className="rugby-dmt-history-live">live</span>}
                </div>
              ))}
              {dmt!.rank_3y_avg != null && (
                <div className="rugby-dmt-history-pill avg">
                  <span className="rugby-dmt-history-season">3yr avg</span>
                  <span className="rugby-dmt-history-rank">#{Math.round(dmt!.rank_3y_avg)}</span>
                </div>
              )}
            </div>
          )}

          {rugby.notes && (
            <p className="rugby-dmt-note">{rugby.notes}</p>
          )}
        </div>
      )}

      {/* ── SOCS rankings (shown when extractor populates socs field) ── */}
      {hasSocs && (
        <div className="rugby-socs-grid">
          {(rugby.socs!.performance?.length ?? 0) > 0 && (
            <div className="rugby-socs-block">
              <div className="rugby-socs-label">SOCS Performance</div>
              <div className="rugby-socs-pills">
                {rugby.socs!.performance!.map((s, i) => (
                  <div key={i} className="rugby-socs-pill">
                    <span className="rugby-socs-season">{fmtSeason(s.season)}</span>
                    <span className="rugby-socs-rank">#{s.rank}</span>
                    {s.total && <span className="rugby-socs-total">/ {s.total}</span>}
                    {s.is_live && <span className="rugby-socs-live">live</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(rugby.socs!.all_comers?.length ?? 0) > 0 && (
            <div className="rugby-socs-block">
              <div className="rugby-socs-label">SOCS All Comers</div>
              <div className="rugby-socs-pills">
                {rugby.socs!.all_comers!.map((s, i) => (
                  <div key={i} className="rugby-socs-pill">
                    <span className="rugby-socs-season">{fmtSeason(s.season)}</span>
                    <span className="rugby-socs-rank">#{s.rank}</span>
                    {s.total && <span className="rugby-socs-total">/ {s.total}</span>}
                    {s.is_live && <span className="rugby-socs-live">live</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Programme summary ── */}
      {rugby.notes && (
        <div className="insp-summary-box">
          <div className="insp-summary-label">Programme summary</div>
          <p className="insp-summary-text">{rugby.notes}</p>
        </div>
      )}

      {/* ── Programmes ── */}
      {(boysProg || girlsProg) && (
        <>
          <Sub className="block-sub">Programmes</Sub>
          <div className="rugby-programmes">
            {boysProg && (
              <div className="rugby-prog-block">
                <div className="rugby-prog-gender">Boys</div>
                {(boysProg.team_levels?.length ?? 0) > 0 && (
                  <div className="rugby-prog-formats">
                    {boysProg.team_levels!.slice(0, 6).map((t, i) => (
                      <span key={i} className="rugby-format-pill">{t}</span>
                    ))}
                    {(boysProg.team_levels?.length ?? 0) > 6 && (
                      <span className="rugby-format-pill">+{boysProg.team_levels!.length - 6} more</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {girlsProg && (
              <div className="rugby-prog-block rugby-prog-block--girls">
                <div className="rugby-prog-gender">Girls</div>
                {(girlsProg.team_levels?.length ?? 0) > 0 && (
                  <div className="rugby-prog-formats">
                    {girlsProg.team_levels!.map((t, i) => (
                      <span key={i} className="rugby-format-pill">{t}</span>
                    ))}
                  </div>
                )}
                {girlsProg.notes && (
                  <p className="rugby-muted" style={{marginTop: '6px', fontSize: '13px'}}>{girlsProg.notes}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Coaching ── */}
      {(headCoach?.name || otherCoaches.length > 0) && (
        <>
          <Sub className="block-sub">Coaching</Sub>
          <ul className="rugby-list">
            {headCoach?.name && (
              <li>
                <strong>{headCoach.name}</strong>
                {(headCoach.title || headCoach.role) && (
                  <> &mdash; {headCoach.title ?? headCoach.role}</>
                )}
                {headCoach.notable && (
                  <span className="rugby-muted"> · {headCoach.notable}</span>
                )}
              </li>
            )}
            {otherCoaches.slice(0, 8).map((c, i) => (
              <li key={i}>
                <strong>{c.name}</strong>
                {c.role && <> &mdash; {c.role}</>}
                {c.notable && <span className="rugby-muted"> · {c.notable}</span>}
              </li>
            ))}
            {otherCoaches.length > 8 && (
              <li className="rugby-muted">+{otherCoaches.length - 8} more coaches</li>
            )}
          </ul>
        </>
      )}

      {/* ── Academy zone ── */}
      {az && (az.name || az.external_partner) && (
        <>
          <Sub className="block-sub">Academy zone</Sub>
          <div className="rugby-pathway-box">
            <strong>{az.name ?? az.external_partner}</strong>
            {az.description && <> — {az.description}</>}
            {az.notes && <> {az.notes}</>}
          </div>
        </>
      )}

      {/* ── Facilities ── */}
      {hasFacilities && (
        <>
          <Sub className="block-sub">Facilities</Sub>
          <p className="rugby-muted rugby-facility-note">
            {rugby.facilities!.join(' · ')}
          </p>
        </>
      )}

      {/* ── Competitive record ── */}
      {(rugby.cup_results?.length ?? 0) > 0 && (
        <>
          <Sub className="block-sub">Competitive record</Sub>
          <ul className="rugby-cup-list">
            {rugby.cup_results!.map((c, i) => (
              <li key={i} className="rugby-cup-row">
                <span className="rugby-cup-tournament">{c.tournament}</span>
                {c.division && <span className="rugby-cup-division">{c.division}</span>}
                {c.year != null && <span className="rugby-cup-year">{c.year}</span>}
                {c.result && (
                  <span className={`rugby-cup-result ${resultClass(c.result)}`}>{c.result}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Alumni & pathway ── */}
      {hasAlumni && (
        <>
          <Sub className="block-sub">Alumni &amp; pathway</Sub>
          {(rugby.notable_alumni?.length ?? 0) > 0 && (
            <ul className="rugby-list">
              {rugby.notable_alumni!.map((a, i) => (
                <li key={i}>
                  <strong>{a.name}</strong>
                  {(a.known_for ?? a.achievement) && (
                    <> — {a.known_for ?? a.achievement}</>
                  )}
                  {a.years && <span className="rugby-muted"> ({a.years})</span>}
                </li>
              ))}
            </ul>
          )}
          {rugby.pathway_to_professional && (
            <div className="rugby-pathway-box">{rugby.pathway_to_professional}</div>
          )}
        </>
      )}

      {/* ── Current pathway players ── */}
      {hasPathway && (
        <>
          <Sub className="block-sub">Current pathway players</Sub>
          <ul className="rugby-list">
            {rugby.current_pathway_players!.map((p, i) => (
              <li key={i}>
                <strong>{p.name}</strong>
                {p.level && <span className="rugby-muted"> · {p.level}</span>}
                {p.club && <> — {p.club}</>}
                {p.notes && <span className="rugby-muted"> · {p.notes}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Scholarship ── */}
      {hasScholarship && (
        <>
          <Sub className="block-sub">Scholarship</Sub>
          <div className="rugby-pathway-box">
            {rugby.academy_scholarship_notes ?? rugby.scholarship_notes ?? rugby.academy_scholarship}
          </div>
        </>
      )}

      {/* ── Why this tier? ── */}
      {rugby.competitive_tier_reasoning && (
        <details className="rugby-details">
          <summary>Why this tier?</summary>
          <p className="rugby-reasoning">{rugby.competitive_tier_reasoning}</p>
        </details>
      )}

      {/* ── Sources ── */}
      {((rugby.evidence_urls?.length ?? 0) > 0 || rugby.extracted_at) && (
        <details className="rugby-details">
          <summary>
            Sources
            {rugby.extracted_at
              ? ` · last refreshed ${new Date(rugby.extracted_at).toLocaleDateString('en-GB')}`
              : ''}
          </summary>
          {(rugby.evidence_urls?.length ?? 0) > 0 && (
            <ul className="rugby-sources">
              {rugby.evidence_urls!.map((u, i) => (
                <li key={i}>
                  <a href={u} target="_blank" rel="noopener noreferrer">{u}</a>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </Wrapper>
  )
}
