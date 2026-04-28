// ── Types — mirrors extract-batch-sports.js football schema ──────────────────

type Coach = {
  name?: string | null
  role?: string | null
  title?: string | null
  notable?: string | null
}

type Alumni = {
  name?: string | null
  achievement?: string | null
}

type CupResult = {
  tournament?: string | null
  year?: number | string | null
  result?: string | null
  source?: string | null
}

type SocsSeason = {
  season?: string | null
  rank?: number | null
  total?: number | null
  won?: number | null
  drawn?: number | null
  lost?: number | null
  win_pct?: string | null
  is_live?: boolean | null
}

type FootballSocs = {
  boys_u18a_performance?:  SocsSeason[] | null
  girls_u18a_performance?: SocsSeason[] | null
  boys_u15a_performance?:  SocsSeason[] | null
  boys_u18a_all_comers?:   SocsSeason[] | null
}

export type FootballData = {
  not_found?: boolean | null
  competitive_tier?: string | null
  competitive_tier_reasoning?: string | null
  notes?: string | null
  evidence_urls?: string[] | null
  extracted_at?: string | null

  head_coach?: Coach | null
  coaching_staff?: Coach[] | null
  facilities?: string[] | null

  notable_alumni?: Alumni[] | null
  cup_competitions?: CupResult[] | null
  first_xi_results?: Array<{
    opponent?: string | null
    result?: 'W' | 'D' | 'L' | string | null
    score?: string | null
    year?: number | null
  }> | null

  programme_classification?: string | null
  academy_scholarship?: boolean | null
  academy_scholarship_notes?: string | null
  school_teams_visible?: number | { value?: number | null } | null

  socs?: FootballSocs | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function hasMeaningfulFootballData(f: FootballData | null | undefined): boolean {
  if (!f || f.not_found) return false
  if (f.head_coach?.name) return true
  if ((f.coaching_staff?.length ?? 0) > 0) return true
  if ((f.cup_competitions?.length ?? 0) > 0) return true
  if ((f.notable_alumni?.length ?? 0) > 0) return true
  if (teamsCount(f) >= 3) return true
  if (f.competitive_tier && f.competitive_tier !== 'unknown') return true
  if (f.socs && Object.keys(f.socs).some(k => (f.socs as any)[k]?.length > 0)) return true
  return false
}

function teamsCount(f: FootballData): number {
  const t = f.school_teams_visible
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

function fmtSeason(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace('20', '').replace('-20', '–').replace('-', '–')
}

// ── Sub-component: SOCS rankings table ───────────────────────────────────────

function SocsTable({ label, rows }: { label: string; rows: SocsSeason[] }) {
  if (!rows.length) return null
  return (
    <div className="rugby-socs-block">
      <div className="rugby-socs-label">{label}</div>
      <div className="rugby-socs-pills">
        {rows.map((s, i) => (
          <div key={i} className="rugby-socs-pill">
            <span className="rugby-socs-season">{fmtSeason(s.season)}</span>
            <span className="rugby-socs-rank">#{s.rank}</span>
            {s.total != null && <span className="rugby-socs-total">/ {s.total}</span>}
            {s.won != null && (
              <span className="rugby-socs-total"> · W{s.won} D{s.drawn} L{s.lost}</span>
            )}
            {s.is_live && <span className="rugby-socs-live">live</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  football?: FootballData | null
  headless?: boolean
}

export default function FootballSection({ football, headless = false }: Props) {
  if (!football || !hasMeaningfulFootballData(football)) return null

  const tier = football.competitive_tier ? TIER_LABELS[football.competitive_tier] : null
  const teams = teamsCount(football)
  const headCoach    = football.head_coach
  const otherCoaches = (football.coaching_staff ?? []).filter(
    c => c.name && c.name !== headCoach?.name
  )
  const hasSocs     = !!(football.socs && Object.keys(football.socs).some(k => (football.socs as any)[k]?.length > 0))
  const hasCups     = (football.cup_competitions?.length ?? 0) > 0
  const hasAlumni   = (football.notable_alumni?.length ?? 0) > 0
  const hasResults  = (football.first_xi_results?.length ?? 0) > 0
  const hasScholar  = football.academy_scholarship || !!football.academy_scholarship_notes

  const Wrapper   = headless ? 'div'     : 'section' as const
  const wrapClass = headless ? 'sport-subsection' : 'block'
  const H         = headless ? 'h3'      : 'h2' as const
  const hCls      = headless ? 'sport-subsection-title' : 'block-title'
  const Sub       = headless ? 'h4'      : 'h3' as const

  return (
    <Wrapper className={wrapClass} id="football">
      <H className={hCls}>⚽ Football programme</H>

      {/* ── Meta strip ── */}
      <div className="insp-meta-strip rugby-strip">
        {tier && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Tier</span>
            <span className={`rugby-badge ${tier.cls}`}>{tier.text}</span>
          </div>
        )}
        {teams > 0 && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Teams</span>
            <span className="insp-meta-value">{teams}</span>
          </div>
        )}
        {football.programme_classification && (
          <div className="insp-meta-item">
            <span className="insp-meta-label">Classification</span>
            <span className="insp-meta-value">{football.programme_classification}</span>
          </div>
        )}
        {(football.academy_scholarship) && (
          <div className="insp-meta-item">
            <span className="rugby-badge-schol">Scholarship available</span>
          </div>
        )}
      </div>

      {/* ── Programme summary ── */}
      {football.notes && (
        <div className="insp-summary-box">
          <div className="insp-summary-label">Programme summary</div>
          <p className="insp-summary-text">{football.notes}</p>
        </div>
      )}

      {/* ── SOCS rankings ── */}
      {hasSocs && (
        <div className="rugby-socs-grid">
          <SocsTable label="SOCS Performance · Boys U18A"  rows={football.socs!.boys_u18a_performance  ?? []} />
          <SocsTable label="SOCS Performance · Girls U18A" rows={football.socs!.girls_u18a_performance ?? []} />
          <SocsTable label="SOCS Performance · Boys U15A"  rows={football.socs!.boys_u15a_performance  ?? []} />
          <SocsTable label="SOCS All Comers · Boys U18A"   rows={football.socs!.boys_u18a_all_comers   ?? []} />
        </div>
      )}

      {/* ── Cup competitions ── */}
      {hasCups && (
        <>
          <Sub className="block-sub">Cup competitions</Sub>
          <ul className="rugby-cup-list">
            {football.cup_competitions!.map((c, i) => (
              <li key={i} className="rugby-cup-row">
                <span className="rugby-cup-tournament">{c.tournament}</span>
                {c.year != null && <span className="rugby-cup-year">{c.year}</span>}
                {c.result && (
                  <span className={`rugby-cup-result ${resultClass(c.result)}`}>{c.result}</span>
                )}
              </li>
            ))}
          </ul>
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
                {(headCoach.title || headCoach.role) && <> &mdash; {headCoach.title ?? headCoach.role}</>}
                {headCoach.notable && <span className="rugby-muted"> · {headCoach.notable}</span>}
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

      {/* ── First XI results ── */}
      {hasResults && (
        <>
          <Sub className="block-sub">Recent 1st XI results</Sub>
          <ul className="rugby-cup-list">
            {football.first_xi_results!.slice(0, 10).map((r, i) => (
              <li key={i} className="rugby-cup-row">
                <span className={`rugby-cup-result ${r.result === 'W' ? 'cup-winner' : r.result === 'L' ? 'cup-other' : 'cup-finalist'}`}>
                  {r.result}
                </span>
                <span className="rugby-cup-tournament">{r.opponent}</span>
                {r.score && <span className="rugby-cup-division">{r.score}</span>}
                {r.year && <span className="rugby-cup-year">{r.year}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Notable alumni ── */}
      {hasAlumni && (
        <>
          <Sub className="block-sub">Notable alumni</Sub>
          <ul className="rugby-list">
            {football.notable_alumni!.map((a, i) => (
              <li key={i}>
                <strong>{a.name}</strong>
                {a.achievement && <> — {a.achievement}</>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Facilities ── */}
      {(football.facilities?.length ?? 0) > 0 && (
        <>
          <Sub className="block-sub">Facilities</Sub>
          <p className="rugby-muted rugby-facility-note">
            {football.facilities!.join(' · ')}
          </p>
        </>
      )}

      {/* ── Scholarship ── */}
      {hasScholar && (
        <>
          <Sub className="block-sub">Scholarship</Sub>
          <div className="rugby-pathway-box">
            {football.academy_scholarship_notes ?? 'Football scholarships available.'}
          </div>
        </>
      )}

      {/* ── Why this tier? ── */}
      {football.competitive_tier_reasoning && (
        <details className="rugby-details">
          <summary>Why this tier?</summary>
          <p className="rugby-reasoning">{football.competitive_tier_reasoning}</p>
        </details>
      )}

      {/* ── Sources ── */}
      {((football.evidence_urls?.length ?? 0) > 0 || football.extracted_at) && (
        <details className="rugby-details">
          <summary>
            Sources
            {football.extracted_at
              ? ` · last refreshed ${new Date(football.extracted_at).toLocaleDateString('en-GB')}`
              : ''}
          </summary>
          {(football.evidence_urls?.length ?? 0) > 0 && (
            <ul className="rugby-sources">
              {football.evidence_urls!.map((u, i) => (
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
