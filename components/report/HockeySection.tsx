import type { HockeyArchiveData, SocsPerfRow, SocsAcRow, IshcMatch } from '@/lib/hockey-archives'

// ── Types — mirrors extract-batch-sports.js hockey schema ────────────────────

type Coach = {
  name?: string | null
  role?: string | null
  title?: string | null
  notable?: string | null
}

type Alumni = {
  name?: string | null
  achievement?: string | null
  notes?: string | null
}

type CupResult = {
  tournament?: string | null
  year?: number | string | null
  result?: string | null
  gender?: string | null
  notes?: string | null
  source?: string | null
}

type TeamsBySport = {
  sport?: string | null
  team_count?: number | null
  team_levels?: string[] | null
}

type RecentAchievement = {
  year?: number | string | null
  title?: string | null
  sport?: string | null
}

export type HockeyData = {
  not_found?: boolean | null
  competitive_tier?: string | null
  competitive_tier_reasoning?: string | null
  notes?: string | null
  evidence_urls?: string[] | null
  extracted_at?: string | null

  head_coach?: Coach | null
  hockey_coaches?: Coach[] | null
  coaching_staff?: Coach[] | null

  boys_programme?: boolean | null
  girls_programme?: boolean | null
  astroturf_pitches?: number | null
  grass_pitches?: number | null
  facilities_notes?: string | null
  programme_classification?: string | null

  academy_scholarship?: boolean | null
  academy_scholarship_notes?: string | null

  notable_alumni?: Alumni[] | null
  cup_results?: CupResult[] | null
  school_teams_visible?: number | { value?: number | null } | null

  // cross-cutting fields from sports_profile (optionally present)
  recent_achievements?: RecentAchievement[] | null
  teams_by_sport?: TeamsBySport[] | null
  typical_opponents?: string[] | null
  competitions_entered?: string[] | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hasMeaningfulHockeyData(h: HockeyData | null | undefined): boolean {
  if (!h || h.not_found) return false
  if (h.head_coach?.name) return true
  if ((h.hockey_coaches?.length ?? 0) > 0) return true
  if ((h.cup_results?.length ?? 0) > 0) return true
  if ((h.notable_alumni?.length ?? 0) > 0) return true
  if (teamsCount(h) >= 3) return true
  if (h.competitive_tier && h.competitive_tier !== 'unknown') return true
  return false
}

function teamsCount(h: HockeyData): number {
  const t = h.school_teams_visible
  if (t == null) return 0
  if (typeof t === 'number') return t
  return (t as any).value ?? 0
}

const TIER_META: Record<string, { text: string; bg: string; border: string; badge: string }> = {
  'national-elite':  { text: 'National elite',  bg: '#ede9fe', border: '#8b5cf6', badge: '#5b21b6' },
  'national-strong': { text: 'National strong', bg: '#e0f2fe', border: '#0369a1', badge: '#0369a1' },
  'regional':        { text: 'Regional',        bg: '#dcfce7', border: '#047857', badge: '#047857' },
  'local':           { text: 'Local',           bg: '#fef3c7', border: '#92400e', badge: '#92400e' },
}

function fmtSeason(s: string): string {
  return s.replace('20', '').replace('-20', '–').replace('-', '–')
}

function cupRowClass(result: string | null | undefined): string {
  if (!result) return ''
  const r = result.toLowerCase()
  if (/winner|champion|won/.test(r)) return 'hockey-cup-win'
  if (/finalist|runner/.test(r))     return 'hockey-cup-finalist'
  if (/semi/.test(r))                return 'hockey-cup-semi'
  return 'hockey-cup-other'
}

function cupIcon(result: string | null | undefined): string {
  if (!result) return '🏑'
  const r = result.toLowerCase()
  if (/winner|champion|won/.test(r)) return '🏆'
  if (/finalist|runner/.test(r))     return '🥈'
  if (/semi/.test(r))                return '🎖️'
  return '🏑'
}

function bracketClass(m: IshcMatch, schoolName: string): string {
  if (!m.winner) return 'hockey-bracket-bye'
  const sn = schoolName.toLowerCase()
  const won = m.winner.toLowerCase().includes(sn.split(' ')[0])
  return won ? 'hockey-bracket-win' : 'hockey-bracket-loss'
}

// ── SOCS sub-components ───────────────────────────────────────────────────────

function SocsPerfTable({ rows, label, color, bg }: {
  rows: SocsPerfRow[]
  label: string
  color: string
  bg: string
}) {
  if (!rows.length) return null
  return (
    <div className="hockey-socs-block" style={{ borderLeft: `3px solid ${color}`, background: bg }}>
      <div className="hockey-socs-label" style={{ color }}>{label}</div>
      <table className="hockey-socs-table">
        <thead>
          <tr>
            <th>Season</th>
            <th>Rank (Performance)</th>
            <th>Win %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.is_final ? '' : 'hockey-socs-live-row'}>
              <td className="hockey-td-season">
                {fmtSeason(r.season)}
                {!r.is_final && <span className="hockey-live-dot"> ⚡</span>}
              </td>
              <td className="hockey-td-rank">
                #{r.rank}<span className="hockey-td-of"> / {r.total}</span>
              </td>
              <td className="hockey-td-pct">{r.win_pct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  hockey?: HockeyData | null
  sportsProfile?: any
  archives?: HockeyArchiveData | null
  schoolName?: string
  headless?: boolean
}

export default function HockeySection({
  hockey,
  sportsProfile,
  archives,
  schoolName = '',
  headless = false,
}: Props) {
  if (!hockey || !hasMeaningfulHockeyData(hockey)) return null

  const tier      = hockey.competitive_tier ? TIER_META[hockey.competitive_tier] : null
  const teams     = teamsCount(hockey)
  const coaches   = hockey.hockey_coaches ?? hockey.coaching_staff ?? []
  const headCoach = hockey.head_coach
  const otherCoaches = coaches.filter(c => c.name && c.name !== headCoach?.name)

  const hasCups      = (hockey.cup_results?.length ?? 0) > 0
  const hasAlumni    = (hockey.notable_alumni?.length ?? 0) > 0
  const hasScholar   = hockey.academy_scholarship || !!hockey.academy_scholarship_notes
  const hasFacility  = !!hockey.facilities_notes

  // SOCS data from archives
  const perfRows = archives?.socsPerformance ?? []
  const acRows   = archives?.socsAllComers ?? []
  const girlsPerf = perfRows.filter(r => r.division.toLowerCase().includes('girls'))
  const boysPerf  = perfRows.filter(r => r.division.toLowerCase().includes('boys'))
  const hasSocs   = girlsPerf.length > 0 || boysPerf.length > 0

  // ISHC current season matches
  const ishcMatches  = archives?.ishcCurrentSeason ?? []
  const hasIshcLive  = ishcMatches.length > 0

  // Recent achievements — from sports_profile or hockey object
  const allAchievements: RecentAchievement[] = (
    sportsProfile?.recent_achievements ?? hockey.recent_achievements ?? []
  ).filter((a: RecentAchievement) =>
    !a.sport || a.sport?.toLowerCase().includes('hockey')
  )

  // Teams by sport — hockey-specific rows (from sports_profile or hockey)
  const teamsBySport: TeamsBySport[] = (
    sportsProfile?.teams_by_sport ?? hockey.teams_by_sport ?? []
  ).filter((t: TeamsBySport) =>
    t.sport?.toLowerCase().includes('hockey')
  )

  // Opponents + competitions
  // competitions_entered and typical_opponents may be string[] or object[] in the DB
  function toStr(v: any): string {
    if (!v) return ''
    if (typeof v === 'string') return v
    return v.name ?? v.title ?? JSON.stringify(v)
  }
  const opponents: string[]    = (sportsProfile?.typical_opponents ?? hockey.typical_opponents ?? []).map(toStr).filter(Boolean)
  const competitions: string[] = (sportsProfile?.competitions_entered ?? hockey.competitions_entered ?? []).map(toStr).filter(Boolean)

  const Wrapper   = headless ? 'div'     : 'section' as const
  const wrapClass = headless ? 'sport-subsection' : 'block'
  const H         = headless ? 'h3'      : 'h2' as const
  const hCls      = headless ? 'sport-subsection-title' : 'block-title'
  const Sub       = headless ? 'h4'      : 'h3' as const

  return (
    <Wrapper className={wrapClass} id="hockey">
      <H className={hCls}>🏑 Hockey programme</H>

      {/* ── Tier badge strip ── */}
      <div
        className="hockey-tier-strip"
        style={tier ? { background: tier.bg, borderLeft: `4px solid ${tier.border}` } : undefined}
      >
        <div className="hockey-tier-left">
          {tier && (
            <span className="hockey-tier-badge" style={{ background: tier.badge }}>
              {tier.text}
            </span>
          )}
          <span className="hockey-tier-sport">Field Hockey</span>
        </div>
        <div className="hockey-meta-pills">
          {(hockey.boys_programme && hockey.girls_programme) && (
            <span className="hockey-meta-pill">Boys &amp; Girls programme</span>
          )}
          {hockey.boys_programme && !hockey.girls_programme && (
            <span className="hockey-meta-pill">Boys programme</span>
          )}
          {hockey.girls_programme && !hockey.boys_programme && (
            <span className="hockey-meta-pill">Girls programme</span>
          )}
          {teams > 0 && (
            <span className="hockey-meta-pill">{teams} total teams</span>
          )}
          {(hockey.astroturf_pitches ?? 0) > 0 && (
            <span className="hockey-meta-pill">{hockey.astroturf_pitches} astroturf pitch{hockey.astroturf_pitches === 1 ? '' : 'es'}</span>
          )}
          {hockey.programme_classification && (
            <span className="hockey-meta-pill">{hockey.programme_classification}</span>
          )}
        </div>
      </div>

      {/* ── Programme overview ── */}
      {hockey.notes && (
        <div className="insp-summary-box">
          <div className="insp-summary-label">Programme overview</div>
          <p className="insp-summary-text">{hockey.notes}</p>
        </div>
      )}

      {/* ── Recent achievements ── */}
      {allAchievements.length > 0 && (
        <div className="hockey-section-block">
          <Sub className="block-sub">Recent hockey achievements</Sub>
          <ul className="hockey-achieve-list">
            {allAchievements.slice(0, 6).map((a, i) => (
              <li key={i} className="hockey-achieve-item">
                {a.year && <span className="hockey-achieve-year">{a.year}</span>}
                {a.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── SOCS national rankings ── */}
      {hasSocs && (
        <div className="hockey-section-block">
          <Sub className="block-sub">
            SOCS national rankings
            <span className="hockey-sub-note"> Performance League (win %) across all UK independent schools</span>
          </Sub>
          <div className="hockey-socs-grid">
            <SocsPerfTable rows={girlsPerf} label="Girls 1st XI" color="#be185d" bg="#fdf2f8" />
            <SocsPerfTable rows={boysPerf}  label="Boys 1st XI"  color="#1d4ed8" bg="#eff6ff" />
          </div>
          {acRows.length > 0 && (
            <div className="hockey-ac-strip">
              <span className="hockey-ac-label">All Comers (cumulative LP):</span>
              {acRows.map((r, i) => (
                <span key={i} className={`hockey-ac-pill${r.is_final ? '' : ' hockey-ac-live'}`}>
                  {r.division.replace('Girls-', 'Girls ').replace('Boys-', 'Boys ')} {fmtSeason(r.season)} #{r.rank}/{r.total}
                  {!r.is_final && ' ⚡'}
                </span>
              ))}
            </div>
          )}
          <p className="hockey-socs-note">⚡ = live season · Source: schoolshockey.co.uk</p>
        </div>
      )}

      {/* ── Teams breakdown ── */}
      {teamsBySport.length > 0 && (
        <div className="hockey-section-block">
          <Sub className="block-sub">
            Teams
            <span className="hockey-sub-note"> by format and age group</span>
          </Sub>
          {teamsBySport.map((t, i) => (
            <div key={i} className="hockey-team-block">
              <div className="hockey-team-header">
                <span className="hockey-team-sport">{t.sport}</span>
                {t.team_count != null && (
                  <span className="hockey-team-badge">{t.team_count} teams</span>
                )}
              </div>
              <div className="hockey-team-chips">
                {(t.team_levels ?? []).slice(0, 20).map((lv, j) => (
                  <span key={j} className="hockey-team-chip">{lv}</span>
                ))}
                {(t.team_levels?.length ?? 0) > 20 && (
                  <span className="hockey-team-more">+{t.team_levels!.length - 20} more</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Facilities ── */}
      {hasFacility && (
        <div className="hockey-section-block">
          <Sub className="block-sub">Facilities</Sub>
          <p className="rugby-muted">{hockey.facilities_notes}</p>
        </div>
      )}

      {/* ── Scholarship banner ── */}
      {hasScholar && (
        <div className="hockey-scholar-banner">
          <span className="hockey-scholar-icon">🎓</span>
          <div>
            <strong>Sports Scholarship available</strong>
            {hockey.academy_scholarship_notes && (
              <div className="hockey-scholar-notes">{hockey.academy_scholarship_notes}</div>
            )}
          </div>
        </div>
      )}

      {/* ── Cup results ── */}
      {hasCups && (
        <div className="hockey-section-block">
          <Sub className="block-sub">Cup &amp; national competition results</Sub>
          <div className="hockey-cups-list">
            {hockey.cup_results!.map((c, i) => (
              <div key={i} className={`hockey-cup-row ${cupRowClass(c.result)}`}>
                <span className="hockey-cup-icon">{cupIcon(c.result)}</span>
                <div className="hockey-cup-info">
                  <span className="hockey-cup-name">
                    {c.tournament}{c.notes ? ` — ${c.notes}` : ''}
                  </span>
                  <span className="hockey-cup-meta">
                    {c.year != null && <>{c.year} </>}
                    {c.gender && (
                      <span className={`hockey-g-tag ${c.gender === 'girls' ? 'hockey-girls-tag' : 'hockey-boys-tag'}`}>
                        {c.gender.charAt(0).toUpperCase() + c.gender.slice(1)}
                      </span>
                    )}
                    {c.result && (
                      <span className="hockey-cup-result-text">
                        {' '}{c.result.charAt(0).toUpperCase() + c.result.slice(1)}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="hockey-cups-note">
            ISHC = Inspiresport Independent Schools Hockey Championship — national knockout at U13/U15/U19 level.
            Finals Day at Nottingham Hockey Centre. Source: ishcltd.com
          </p>
        </div>
      )}

      {/* ── ISHC current season bracket ── */}
      {hasIshcLive && (
        <div className="hockey-section-block">
          <Sub className="block-sub">
            ISHC current season bracket
            <span className="hockey-sub-note"> live results</span>
          </Sub>
          <div className="hockey-bracket-list">
            {ishcMatches.map((m, i) => {
              const cls = bracketClass(m, schoolName)
              const isBye = !m.winner
              return (
                <div key={i} className={`hockey-bracket-row ${cls}`}>
                  <span className="hockey-bracket-round">
                    {m.age_group} {m.cup_or_plate.toUpperCase()} {m.round}
                  </span>
                  <span className="hockey-bracket-match">
                    {m.home} vs {m.away}
                  </span>
                  <span className="hockey-bracket-result">
                    {isBye
                      ? 'BYE / pending'
                      : m.winner
                        ? `${m.winner} win${m.score ? ` ${m.score}` : ''}`
                        : '—'}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="hockey-socs-note">Source: ishcltd.com/draw-results</p>
        </div>
      )}

      {/* ── Competitions entered ── */}
      {competitions.length > 0 && (
        <div className="hockey-section-block">
          <Sub className="block-sub">Competitions entered</Sub>
          <div className="hockey-comps-list">
            {competitions.map((c, i) => (
              <span key={i} className="hockey-comp-pill">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Notable alumni ── */}
      {hasAlumni && (
        <div className="hockey-section-block">
          <Sub className="block-sub">Notable alumni — international representation</Sub>
          <div className="hockey-alumni-grid">
            {hockey.notable_alumni!.map((a, i) => (
              <div key={i} className="hockey-alumni-card">
                <div className="hockey-alumni-name">{a.name}</div>
                {a.achievement && <div className="hockey-alumni-ach">{a.achievement}</div>}
                {a.notes && <div className="hockey-alumni-ach">{a.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Coaching staff ── */}
      {(headCoach?.name || otherCoaches.length > 0) && (
        <div className="hockey-section-block">
          <Sub className="block-sub">Coaching staff</Sub>
          {headCoach?.name && (
            <div className="hockey-head-coach-card">
              <div className="hockey-hc-header">
                <span className="hockey-hc-name">{headCoach.name}</span>
                {(headCoach.title || headCoach.role) && (
                  <span className="hockey-hc-title">{headCoach.title ?? headCoach.role}</span>
                )}
              </div>
              {headCoach.notable && (
                <div className="hockey-hc-notable">{headCoach.notable}</div>
              )}
            </div>
          )}
          {otherCoaches.length > 0 && (
            <div className="hockey-coach-list">
              {otherCoaches.slice(0, 10).map((c, i) => (
                <div key={i} className="hockey-coach-row">
                  <span className="hockey-coach-name">{c.name}</span>
                  <span className="hockey-coach-role">
                    {c.role}
                    {c.notable && <em> · {c.notable}</em>}
                  </span>
                </div>
              ))}
              {otherCoaches.length > 10 && (
                <div className="rugby-muted">+{otherCoaches.length - 10} more coaches</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Fixture circuit ── */}
      {opponents.length > 0 && (
        <div className="hockey-section-block">
          <Sub className="block-sub">
            Fixture circuit
            <span className="hockey-sub-note"> most-played opponents</span>
          </Sub>
          <div className="hockey-opponent-chips">
            {opponents.slice(0, 15).map((o, i) => (
              <span key={i} className="hockey-opponent-chip">{o}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Why this tier? ── */}
      {hockey.competitive_tier_reasoning && (
        <details className="rugby-details">
          <summary>Why {tier?.text ?? hockey.competitive_tier}?</summary>
          <p className="rugby-reasoning">{hockey.competitive_tier_reasoning}</p>
        </details>
      )}

      {/* ── Sources ── */}
      {((hockey.evidence_urls?.length ?? 0) > 0 || hockey.extracted_at) && (
        <details className="rugby-details">
          <summary>
            Sources
            {hockey.extracted_at
              ? ` · last refreshed ${new Date(hockey.extracted_at).toLocaleDateString('en-GB')}`
              : ''}
          </summary>
          {(hockey.evidence_urls?.length ?? 0) > 0 && (
            <ul className="rugby-sources">
              {hockey.evidence_urls!.map((u, i) => (
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
