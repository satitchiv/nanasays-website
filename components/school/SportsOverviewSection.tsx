interface TeamsBySport {
  sport: string
  gender: string
  team_count: number
  team_levels?: string[]
}

interface Achievement {
  year: number
  level: string
  title: string
}

interface Coach {
  name: string
  role: string
  sport?: string
  notable?: string
}

interface DirectorOfSport {
  name: string
  title?: string
}

interface SportsProfile {
  notes?: string
  total_teams?: number
  sports_list?: string[]
  signature_sports?: string[] | { name: string; teams?: number }[]
  teams_by_sport?: TeamsBySport[]
  sports_offered?: string[]
  facilities?: string[]
  recent_achievements?: Achievement[]
  coaching_staff?: Coach[]
  director_of_sport?: DirectorOfSport
  competitive_tier?: string
  representative_honours?: string
  team_count_approx?: { boys?: number; girls?: number; mixed?: number }
}

interface Props {
  sportsProfile: SportsProfile | null
  sportsFacilities: string[] | null
}

const TIER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'national-elite': { bg: '#f5f3ff', border: '#8b5cf6', text: '#5b21b6' },
  'national-strong': { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
  regional: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  local: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
}

const LEVEL_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  international: { bg: '#5b21b6', text: '#fff', label: 'International' },
  national: { bg: '#0369a1', text: '#fff', label: 'National' },
  regional: { bg: '#047857', text: '#fff', label: 'Regional' },
  county: { bg: '#92400e', text: '#fff', label: 'County' },
}

function getSigName(s: string | { name: string }): string {
  return typeof s === 'string' ? s : s.name
}

export default function SportsOverviewSection({ sportsProfile, sportsFacilities }: Props) {
  if (!sportsProfile && (!sportsFacilities || sportsFacilities.length === 0)) return null

  const notes = sportsProfile?.notes ?? ''
  const teamsBySport = sportsProfile?.teams_by_sport ?? []
  const sportsOffered = sportsProfile?.sports_offered ?? []
  const sigSports = (sportsProfile?.signature_sports ?? []).map(getSigName)
  const facilities = sportsProfile?.facilities ?? sportsFacilities ?? []
  const achievements = (sportsProfile?.recent_achievements ?? [])
    .filter(a => a.level === 'national' || a.level === 'international')
    .slice(0, 4)
  const coaches = (sportsProfile?.coaching_staff ?? []).filter(c => c.notable).slice(0, 3)
  const director = sportsProfile?.director_of_sport
  const tier = sportsProfile?.competitive_tier ?? ''

  const totalTeams = sportsProfile?.team_count_approx?.girls
    ?? sportsProfile?.team_count_approx?.boys
    ?? sportsProfile?.total_teams
    ?? (teamsBySport.length > 0 ? teamsBySport.reduce((s, t) => s + t.team_count, 0) : null)
  const totalSports = teamsBySport.length || sportsOffered.length || null

  // Sports not in the teams_by_sport detailed list
  const extraSports = sportsOffered.filter(s => !teamsBySport.find(t => t.sport.toLowerCase() === s.toLowerCase()))

  const tierStyle = tier && TIER_COLORS[tier.toLowerCase().replace(/\s+/g, '-')]

  if (!totalTeams && teamsBySport.length === 0 && facilities.length === 0) return null

  return (
    <div style={{ marginBottom: 52 }}>
      <h2 style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
        color: 'var(--teal-dk)', marginBottom: 18, paddingBottom: 10,
        borderBottom: '2px solid var(--border)', fontWeight: 800,
        fontFamily: 'var(--font-nunito), Nunito, sans-serif',
      }}>
        Sports Programme
      </h2>

      {/* Headline + tier badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        {totalTeams ? (
          <div>
            <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 48, fontWeight: 900, color: 'var(--navy)', lineHeight: 1 }}>
              {totalTeams}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              teams{totalSports ? ` across ${totalSports} sports` : ''}
            </div>
          </div>
        ) : notes ? (
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
            {notes.split('.')[0]}.
          </p>
        ) : null}
        {tierStyle && (
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '5px 12px', borderRadius: 100, flexShrink: 0, marginTop: 6,
            background: tierStyle.bg, border: `1px solid ${tierStyle.border}`, color: tierStyle.text,
          }}>
            {tier.replace(/-/g, ' ')}
          </div>
        )}
      </div>

      {/* Signature sports */}
      {sigSports.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            Signature Sports
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sigSports.map(s => (
              <span key={s} style={{
                fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 100,
                background: 'var(--navy)', color: '#fff',
              }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Teams breakdown grid */}
      {teamsBySport.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            Teams by Sport
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
            {teamsBySport.map(t => (
              <div key={t.sport} style={{
                background: 'var(--off)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t.sport}</div>
                <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 22, fontWeight: 900, color: 'var(--navy)', lineHeight: 1, marginTop: 2 }}>
                  {t.team_count}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>teams</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other sports offered */}
      {extraSports.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            Also Offered
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {extraSports.map(s => (
              <span key={s} style={{
                fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 100,
                background: 'var(--off)', color: 'var(--text)', border: '1px solid var(--border)',
              }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* National/international achievements */}
      {achievements.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            Recent Highlights
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {achievements.map((a, i) => {
              const badge = LEVEL_BADGE[a.level]
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {badge && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '2px 7px', borderRadius: 4, background: badge.bg, color: badge.text,
                      flexShrink: 0, marginTop: 2,
                    }}>
                      {badge.label}
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>
                    {a.title}
                    <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>{a.year}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Notable coaching staff */}
      {coaches.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            Notable Coaches
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {coaches.map((c, i) => (
              <div key={i} style={{
                background: 'var(--off)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{c.role}</div>
                {c.notable && <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, lineHeight: 1.4 }}>{c.notable}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Facilities */}
      {facilities.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            Facilities
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {facilities.slice(0, 10).map((f, i) => (
              <span key={i} style={{
                fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 100,
                background: 'var(--off)', color: 'var(--text)', border: '1px solid var(--border)',
              }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Director of Sport */}
      {director?.name && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          Director of Sport: <span style={{ fontWeight: 700, color: 'var(--text)' }}>{director.name}</span>
        </div>
      )}
    </div>
  )
}
