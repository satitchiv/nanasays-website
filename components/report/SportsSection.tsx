/**
 * <SportsSection> — V3 data table + V1 flair mix.
 *
 * Visual flair additions (from mockup-sports-flair.html):
 *   - Sport tier cards (Major / Academy / Optional) — colour-coded
 *   - Featured national competitions as trophy cards above the table
 *   - Per-sport "deep-dive" cards for each Major and Academy sport
 *   - "Other sports" chip row for remaining sports
 *   - Coach avatar grid with "Pro" badge for notable coaches
 *   - Facility icon grid
 *
 * Data: school_structured_data.sports_profile (JSONB).
 * Compact mode hides deep tables and per-sport cards.
 */

type Achievement = {
  title?: string
  year?: number | null
  level?: 'school' | 'county' | 'regional' | 'national' | 'international' | 'professional' | null
}

type DirectorOfSport = { name?: string | null; title?: string | null; email?: string | null; phone?: string | null }
type Coach = { name?: string; role?: string | null; sport?: string | null; notable?: string | null }
type Competition = {
  sport?: string; name?: string
  scope?: 'national' | 'regional' | 'county' | 'school' | null
  featured?: boolean; hosted_by_school?: boolean
}
type SportCategories = { major?: string[]; academy?: string[]; optional?: string[] }
type Scholarships = { available?: boolean; level_required?: string | null; entry_points?: string[]; notes?: string | null }
type AlumniSociety = { name?: string; sport?: string | null; description?: string | null }
type ExternalVenue = { name?: string; sport?: string | null; purpose?: string | null }
type TeamsBySport = { sport?: string; gender?: 'boys' | 'girls' | 'mixed' | null; team_levels?: string[]; team_count?: number | null }
type Opponent = { name?: string; fixture_count_observed?: number | null }
type SportsTour = { destination?: string; sport?: string; year?: number | null; notes?: string | null }

export type SportsProfile = {
  signature_sports?: string[]
  sports_offered?: string[]
  sport_categories?: SportCategories | null
  director_of_sport?: DirectorOfSport | null
  coaching_staff?: Coach[]
  facilities?: string[]
  signature_equipment?: string[]
  external_venues?: ExternalVenue[]
  competitions_entered?: Competition[]
  scholarships?: Scholarships | null
  recent_achievements?: Achievement[]
  teams_by_sport?: TeamsBySport[]
  typical_opponents?: Opponent[]
  competitive_tier?: string | null
  fixture_volume?: string | null
  sports_tours?: SportsTour[]
  alumni_sport_societies?: AlumniSociety[]
  sixth_form_sport_rules?: string[]
  athletics_records_note?: string | null
  news_activity_signal?: string | null
  team_count_approx?: { boys?: number | null; girls?: number | null; mixed?: number | null } | null
  fixtures_per_year_approx?: number | null
  representative_honours?: string | null
  notes?: string
  source_urls?: string[]
}

type Props = {
  sports: SportsProfile | null
  compact?: boolean
  /**
   * When true, render only the content inside a plain <div id="sports"> —
   * no outer <section className="block"> card and no top-level <h2> title.
   * Used when SportsSection is nested inside a parent section (e.g. the
   * unified "Sports & Athletics" block) that already supplies the heading.
   * Default false → standalone rendering.
   */
  headless?: boolean
}

/* ─── Sport → emoji map (for per-sport cards + featured comps + facilities) */
const SPORT_EMOJI: Record<string, string> = {
  'rugby union': '🏉', rugby: '🏉', 'rugby sevens': '🏉',
  cricket: '🏏',
  hockey: '🏑', 'hockey indoor': '🏑', 'hockey sevens': '🏑', 'hockey sixes': '🏑',
  tennis: '🎾',
  netball: '🏐',
  football: '⚽', soccer: '⚽',
  golf: '⛳',
  swimming: '🏊',
  athletics: '🏃',
  skiing: '⛷️', 'ski racing': '⛷️',
  basketball: '🏀',
  squash: '🎯',
  badminton: '🏸',
  'cross country': '🏃',
  'beach volleyball': '🏐',
  rowing: '🚣',
  biathlon: '🎯',
  fencing: '🤺',
  equestrian: '🏇',
  sailing: '⛵',
  polo: '🐎',
}

const COMP_DESCRIPTIONS: Record<string, string> = {
  // Football
  'ISFA Cup': 'Independent Schools FA Cup — the main knockout cup for independent school football, equivalent to a national FA Cup for schools',
  'HMC Football': 'Headmasters\' Conference — top tier of independent school fixtures, playing against the strongest schools in the country',
  'National Schools Cup': 'Open national knockout competition for all school types — winning this puts a school among the best in England',
  // Rugby
  'National Schools Rugby': 'RFU-backed national schools knockout — top-tier competition played at Allianz Stadium (Twickenham)',
  'HMC Rugby': 'Headmasters\' Conference league — fixtures against elite independent school rugby programs',
  'Daily Mail Cup': 'National rugby knockout for schools — one of the most prestigious school rugby trophies in England',
  'Daily Mail RWC Schools': 'National Rugby World Cup Schools festival — high-profile national competition',
  'Surrey Schools Cup': 'Surrey county rugby knockout — county-level competition, step below national',
  'Surrey County Cup': 'County-level knockout cup — strong regional competition',
  // Cricket
  'HMC Cricket': 'Headmasters\' Conference cricket — playing against top independent school teams nationally',
  'National Schools T20': 'ECB-backed national T20 schools competition — national level',
  'Surrey Schools Cricket': 'Surrey county cricket for schools — county competition',
  // Hockey
  'ISHC Cup': 'Independent Schools Hockey Council national cup — top national competition for school hockey',
  'HMC Hockey': 'Headmasters\' Conference hockey — elite tier fixtures against the strongest school teams',
  'National Schools Hockey': 'National Schools Hockey Championship — played at national level',
  // Tennis
  'LTA Schools Tennis': 'LTA-backed national schools tennis — organised by the Lawn Tennis Association, national level',
  'National Schools Tennis': 'National Schools Tennis Championships — top schools compete nationally',
  // Athletics & Cross Country
  'National Schools Athletics': 'National Schools Athletics Championships — top athletes from across England compete',
  'National Schools Cross Country': 'National Schools Cross Country Championships — national level competition',
  'Surrey Schools Athletics': 'Surrey county athletics championships',
  // Swimming
  'National Schools Swimming': 'National Schools Swimming Championships — elite school swimming competition',
  // Ski
  'British Schools Ski Championships': 'Main national competitive skiing event for UK school pupils',
  'BSSS Cup': 'British Schools Ski and Snowboard Championships — the national school skiing competition',
  // Golf
  'ISGA': 'Independent Schools Golf Association — national school golf competition',
}

function compDescription(name?: string): string | null {
  if (!name) return null
  const exact = COMP_DESCRIPTIONS[name]
  if (exact) return exact
  const lower = name.toLowerCase()
  for (const [key, desc] of Object.entries(COMP_DESCRIPTIONS)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return desc
  }
  return null
}

function emojiFor(sport?: string | null): string {
  if (!sport) return '🏆'
  return SPORT_EMOJI[sport.toLowerCase()] || '🏆'
}

function initials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.replace(/^(Mr|Mrs|Ms|Miss|Dr|Rev)\.?\s+/i, '').split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function facilityEmoji(label: string): string {
  const l = label.toLowerCase()
  if (/cricket|pitchvision|bowling|net/.test(l)) return '🏏'
  if (/pool|swim/.test(l)) return '🏊'
  if (/tennis/.test(l)) return '🎾'
  if (/squash/.test(l)) return '🎯'
  if (/gym|fitness/.test(l)) return '🏋️'
  if (/astroturf|astro|rugby pitch|pitch/.test(l)) return '⚽'
  if (/netball/.test(l)) return '🏐'
  if (/sports centre|sports hall|hall/.test(l)) return '🏟️'
  if (/ski|slope/.test(l)) return '⛷️'
  if (/studio|dance/.test(l)) return '💃'
  return '📍'
}

function levelPill(level?: string | null): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, padding: '2px 8px',
    borderRadius: 10, letterSpacing: '.05em', textTransform: 'uppercase', marginLeft: 8,
  }
  if (!level) return { ...base, background: 'var(--off)', color: 'var(--muted)' }
  switch (level) {
    case 'international':
    case 'professional':
      return { ...base, background: '#EBF4FF', color: '#1e5ea8' }
    case 'national':
      return { ...base, background: 'var(--teal-bg)', color: 'var(--teal-dk)' }
    case 'regional':
    case 'county':
      return { ...base, background: '#FEF3C7', color: '#D97706' }
    default:
      return { ...base, background: 'var(--off)', color: 'var(--muted)' }
  }
}

function extractHonoursForSport(sport: string, rep?: string | null): string[] {
  if (!rep) return []
  const target = sport.toLowerCase()
  const entries = rep.split(/\),\s*/).map((e, i, arr) => i < arr.length - 1 ? e + ')' : e)
  return entries.filter(entry => {
    const e = entry.toLowerCase()
    return e.includes(target) ||
      (target.includes('rugby') && e.includes('rugby')) ||
      (target.includes('hockey') && e.includes('hockey')) ||
      (target.includes('tennis') && e.includes('tennis')) ||
      (target.includes('cricket') && e.includes('cricket')) ||
      (target.includes('ski') && e.includes('ski')) ||
      (target === 'golf' && e.includes('golf'))
  })
}

/* Aggregate per-sport data: teams + competitions + coach + alumni for one sport.
 * Handles related sport aliases (e.g. "Rugby" matches "Rugby Union" + "Rugby Sevens"). */
function aggregateBySport(sport: string, p: SportsProfile) {
  const norm = (s?: string | null) => (s || '').toLowerCase().trim()
  const target = norm(sport)
  const related = (s?: string | null) => {
    const n = norm(s)
    if (!n) return false
    if (n === target) return true
    // Rugby umbrella catches Rugby Sevens + Rugby Union
    if (target === 'rugby' && (n.includes('rugby'))) return true
    if (target.includes('rugby') && n.includes('rugby')) return true
    // Hockey umbrella
    if (target === 'hockey' && n.includes('hockey')) return true
    return n.includes(target) || target.includes(n)
  }

  const teamEntries = (p.teams_by_sport || []).filter(t => related(t.sport))
  const totalTeamLevels = teamEntries.reduce((s, e) => s + (e.team_count ?? e.team_levels?.length ?? 0), 0)

  const competitions = (p.competitions_entered || []).filter(c => related(c.sport))
  const nationalCompCount = competitions.filter(c => c.scope === 'national').length

  const coach = (p.coaching_staff || []).find(c => related(c.sport) && (c.notable || c.name))
    || (p.coaching_staff || []).find(c => related(c.sport))

  const alumni = (p.recent_achievements || []).filter(a => {
    const title = norm(a.title)
    return title.includes(target) || (target === 'rugby' && title.includes('rugby')) || (target === 'hockey' && title.includes('hockey'))
      || (target === 'tennis' && title.includes('tennis'))
      || (target === 'cricket' && title.includes('cricket'))
      || (target === 'skiing' && (title.includes('ski') || title.includes('olympic') && title.includes('ski')))
      || (target === 'ski racing' && (title.includes('ski')))
      || (target === 'golf' && title.includes('golf'))
  }).slice(0, 3)

  const facility = (p.facilities || []).find(f => related(f.split(/\s+/)[0]))

  const venue = (p.external_venues || []).find(v => related(v.sport))

  const honoursAlumni = extractHonoursForSport(sport, p.representative_honours)

  return { teamEntries, totalTeamLevels, competitions, nationalCompCount, coach, alumni, facility, venue, honoursAlumni }
}

function SportCard({ sport, tier, profile }: { sport: string; tier: 'major' | 'academy'; profile: SportsProfile }) {
  const { teamEntries, totalTeamLevels, competitions, nationalCompCount, coach, alumni, facility, venue, honoursAlumni } = aggregateBySport(sport, profile)
  return (
    <div className={`sport-card ${tier}`}>
      <span className="sport-emoji">{emojiFor(sport)}</span>
      <div className="sport-name">
        {sport}
        <span className={`sport-tier-tag ${tier}`}>{tier === 'major' ? 'Major' : 'Academy'}</span>
      </div>

      {(totalTeamLevels > 0 || competitions.length > 0) && (
        <div className="sport-stat-row">
          {totalTeamLevels > 0 && (
            <div className="sport-stat">
              <div className="num">{totalTeamLevels}</div>
              <div className="lbl">{totalTeamLevels === 1 ? 'Team level' : 'Team levels'}</div>
            </div>
          )}
          {competitions.length > 0 && (
            <div className="sport-stat">
              <div className="num">{competitions.length}</div>
              <div className="lbl">{nationalCompCount > 0 ? `Comps · ${nationalCompCount} national` : 'Competitions'}</div>
            </div>
          )}
        </div>
      )}

      {competitions.length > 0 && (
        <div className="sport-block">
          <div className="label">Competitions</div>
          <div className="value">
            {competitions.map(c => c.name).filter(Boolean).join(' · ')}
          </div>
        </div>
      )}

      {coach && coach.name && (
        <div className="sport-block">
          <div className="label">Notable coach</div>
          <div className="value">
            <strong>{coach.name}</strong>
            {coach.notable && <> — {coach.notable}</>}
            {!coach.notable && coach.role && <> — {coach.role}</>}
          </div>
        </div>
      )}

      {facility && (
        <div className="sport-block">
          <div className="label">Facility</div>
          <div className="value">{facility}</div>
        </div>
      )}

      {venue && (
        <div className="sport-block">
          <div className="label">Partner venue</div>
          <div className="value"><strong>{venue.name}</strong>{venue.purpose && <> · <em style={{ color: 'var(--muted)' }}>{venue.purpose}</em></>}</div>
        </div>
      )}

      {(honoursAlumni.length > 0 || alumni.length > 0) && (
        <div className="sport-block">
          <div className="label">Notable alumni</div>
          <div className="value">
            {honoursAlumni.length > 0
              ? honoursAlumni.map((h, i) => {
                  const m = h.match(/^(.+?)\s*\((.+)\)$/)
                  return (
                    <span key={i}>
                      {i > 0 ? ' · ' : ''}
                      <strong>{m ? m[1].trim() : h}</strong>
                      {m && <span style={{ color: 'var(--muted)', fontSize: 12 }}> ({m[2].trim()})</span>}
                    </span>
                  )
                })
              : alumni.map((a, i) => <span key={i}>{i > 0 ? ' · ' : ''}<strong>{(a.title || '').split(' — ')[0].split(' - ')[0]}</strong></span>)
            }
          </div>
        </div>
      )}
    </div>
  )
}

export default function SportsSection({ sports, compact = false, headless = false }: Props) {
  if (!sports) return null

  const sig = Array.isArray(sports.signature_sports) ? sports.signature_sports : []
  const all = Array.isArray(sports.sports_offered) ? sports.sports_offered : []
  const teamsBySport = Array.isArray(sports.teams_by_sport) ? sports.teams_by_sport : []
  const opponents = Array.isArray(sports.typical_opponents) ? sports.typical_opponents : []
  const achievements = Array.isArray(sports.recent_achievements) ? sports.recent_achievements : []
  const facilities = Array.isArray(sports.facilities) ? sports.facilities : []
  const tours = Array.isArray(sports.sports_tours) ? sports.sports_tours : []
  const dos = sports.director_of_sport || null
  const coaches = Array.isArray(sports.coaching_staff) ? sports.coaching_staff : []
  const competitions = Array.isArray(sports.competitions_entered) ? sports.competitions_entered : []
  const cats = sports.sport_categories || null
  const schol = sports.scholarships || null
  const societies = Array.isArray(sports.alumni_sport_societies) ? sports.alumni_sport_societies : []
  const equipment = Array.isArray(sports.signature_equipment) ? sports.signature_equipment : []
  const venues = Array.isArray(sports.external_venues) ? sports.external_venues : []
  const sixthRules = Array.isArray(sports.sixth_form_sport_rules) ? sports.sixth_form_sport_rules : []

  const teamCount = sports.team_count_approx
  const totalTeams = (teamCount?.boys ?? 0) + (teamCount?.girls ?? 0) + (teamCount?.mixed ?? 0)

  const hasSomething =
    sig.length || all.length || dos?.name ||
    facilities.length || achievements.length ||
    teamsBySport.length || opponents.length ||
    competitions.length || coaches.length ||
    sports.representative_honours || sports.competitive_tier
  if (!hasSomething) return null

  const shownAchievements = compact ? achievements.slice(0, 3) : achievements
  const featuredCompetitions = competitions.filter(c => c.featured || c.scope === 'national').slice(0, 4)
  const remainingCompetitions = competitions.filter(c => !c.featured && c.scope !== 'national')
  const compactCompetitions = compact ? featuredCompetitions.slice(0, 3) : competitions
  const nationalCompCount = competitions.filter(c => c.scope === 'national').length

  // Assemble per-sport cards (V3 flair) — Major + Academy only
  const majorSports = cats?.major || []
  const academySports = cats?.academy || []
  const featuredSports = [
    ...majorSports.map(s => ({ name: s, tier: 'major' as const })),
    ...academySports.map(s => ({ name: s, tier: 'academy' as const })),
  ]
  const featuredSportNames = new Set(featuredSports.map(s => s.name.toLowerCase()))
  const otherSports = all.filter(s => !featuredSportNames.has(s.toLowerCase()))

  const sortedRemainingComps = [...remainingCompetitions].sort((a, b) => {
    const rank = (s?: string | null) => s === 'regional' ? 1 : s === 'county' ? 2 : s === 'school' ? 3 : 4
    return rank(a.scope) - rank(b.scope)
  })

  // Wrapper + heading differ based on headless. Anchor id="sports" is
  // preserved in both modes so TOC links keep working.
  const Wrapper: 'section' | 'div' = headless ? 'div' : 'section'
  const wrapperClass = headless ? 'sport-subsection' : 'block'

  return (
    <Wrapper className={wrapperClass} id="sports">
      {!headless && <h2 className="block-title">Sport & athletics</h2>}

      {/* ─── Headline stats row ─── */}
      <div className="fin-callout">
        {all.length > 0 && (
          <div className="fin-stat">
            <div className="fin-stat-label">Sports offered</div>
            <div className="fin-stat-value">{all.length}</div>
          </div>
        )}
        {totalTeams > 0 && (
          <div className="fin-stat">
            <div className="fin-stat-label">Teams total</div>
            <div className="fin-stat-value">{totalTeams}</div>
          </div>
        )}
        {competitions.length > 0 && (
          <div className="fin-stat">
            <div className="fin-stat-label">Competitions entered</div>
            <div className="fin-stat-value">
              {competitions.length}
              {nationalCompCount > 0 && (
                <small style={{ fontSize: 11, fontWeight: 500, marginLeft: 4 }}>
                  ({nationalCompCount} national)
                </small>
              )}
            </div>
          </div>
        )}
        {sports.fixtures_per_year_approx != null && (
          <div className="fin-stat">
            <div className="fin-stat-label">Fixtures / year</div>
            <div className="fin-stat-value">
              {sports.fixtures_per_year_approx.toLocaleString()}
              <small style={{ fontSize: 11, fontWeight: 500, marginLeft: 4 }}>est.</small>
            </div>
          </div>
        )}
      </div>

      {/* ─── V1 Sport tier cards ─── */}
      {cats && (cats.major?.length || cats.academy?.length || cats.optional?.length) && (
        <>
          <h3 className="block-sub">How the school tiers its sports</h3>
          <div className="sport-tiers">
            {!!cats.major?.length && (
              <div className="sport-tier major">
                <div className="tier-label">★ Major sports</div>
                <div className="tier-list">
                  {cats.major.map((s, i) => <span key={i}>{s}</span>)}
                </div>
              </div>
            )}
            {!!cats.academy?.length && (
              <div className="sport-tier academy">
                <div className="tier-label">◆ Academy (high-performance)</div>
                <div className="tier-list">
                  {cats.academy.map((s, i) => <span key={i}>{s}</span>)}
                </div>
              </div>
            )}
            {!compact && !!cats.optional?.length && (
              <div className="sport-tier optional">
                <div className="tier-label">· Optional</div>
                <div className="tier-list">
                  {cats.optional.map((s, i) => <span key={i}>{s}</span>)}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Signature sports pills (only if no tier breakdown) ─── */}
      {sig.length > 0 && !cats?.major?.length && (
        <>
          <h3 className="block-sub">Signature sports</h3>
          <div className="uni-list">
            {sig.map((s, i) => <span key={i} className="uni-pill oxbridge">★ {s}</span>)}
          </div>
        </>
      )}

      {/* ─── V1 Featured national competitions (trophy cards) ─── */}
      {featuredCompetitions.length > 0 && (
        <>
          <h3 className="block-sub">Featured national competitions</h3>
          <div className="featured-comps">
            {featuredCompetitions.map((c, i) => (
              <div key={i} className={`featured-comp ${c.hosted_by_school ? 'hosts' : ''}`}>
                <span className="emoji">{emojiFor(c.sport)}</span>
                <div className="comp-info">
                  <div className="sport-label">{c.sport}</div>
                  <div className="name">{c.name}</div>
                  <span className="tag">
                    {c.scope && c.scope.charAt(0).toUpperCase() + c.scope.slice(1)}
                    {c.featured && ' · Featured'}
                    {c.hosted_by_school && ' · Hosted'}
                  </span>
                  {compDescription(c.name) && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, lineHeight: 1.4 }}>{compDescription(c.name)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── V3 Per-sport deep-dive cards (for Major + Academy sports) ─── */}
      {!compact && featuredSports.length > 0 && (
        <>
          <h3 className="block-sub">Sport-by-sport breakdown</h3>
          <div className="sport-cards">
            {featuredSports.map(({ name, tier }) => (
              <SportCard key={name} sport={name} tier={tier} profile={sports} />
            ))}
          </div>

          {/* Other sports chip row */}
          {otherSports.length > 0 && (
            <div className="other-sports">
              <span className="other-label">Also offered:</span>
              {otherSports.map((s, i) => <span key={i} className="chip">{s}</span>)}
            </div>
          )}
        </>
      )}

      {/* ─── All competitions table ─── */}
      {!compact && competitions.length > 0 && (
        <>
          <h3 className="block-sub">All competitions entered</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            Scope tells you the level: National = top-tier for that sport in the UK; Regional = county/area level; County = local county competition.
            Not sure if a competition is prestigious? Check the &ldquo;What is it?&rdquo; column.
          </p>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Sport</th>
                <th>Competition</th>
                <th>Scope</th>
                <th>What is it?</th>
              </tr>
            </thead>
            <tbody>
              {[...competitions]
                .sort((a, b) => {
                  const rank = (s?: string | null) => s === 'national' ? 0 : s === 'regional' ? 1 : s === 'county' ? 2 : 3
                  return rank(a.scope) - rank(b.scope)
                })
                .map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700, color: 'var(--navy)' }}>{c.sport || '—'}</td>
                  <td>
                    {c.name || '—'}
                    {c.hosted_by_school && <span style={{ color: 'var(--amber)', fontWeight: 700, marginLeft: 6, fontSize: 11 }}>★ hosted</span>}
                    {(c.featured || c.scope === 'national') && <span style={{ color: 'var(--teal-dk)', fontWeight: 700, marginLeft: 6, fontSize: 11 }}>★ featured</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.scope && <span style={levelPill(c.scope)}>{c.scope}</span>}</td>
                  <td style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
                    {compDescription(c.name) || (
                      c.scope === 'national' ? 'National-level competition' :
                      c.scope === 'regional' ? 'Regional competition covering multiple counties' :
                      c.scope === 'county' ? 'County-level competition' :
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {compact && compactCompetitions.length > 0 && competitions.length > compactCompetitions.length && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: -4 }}>
          + {competitions.length - compactCompetitions.length} more competitions in the full report
        </p>
      )}

      {/* ─── Teams by sport table (full mode only) ─── */}
      {!compact && teamsBySport.length > 0 && (
        <>
          <h3 className="block-sub">Team depth by sport</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            Parsed from the published fixture calendar. Shows how many distinct team levels
            the school fields per sport — a signal of genuine squad depth versus a marketing list.
          </p>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Sport</th>
                <th>Gender</th>
                <th>Team levels fielded</th>
                <th style={{ textAlign: 'right' }}># teams</th>
              </tr>
            </thead>
            <tbody>
              {teamsBySport.map((t, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700, color: 'var(--navy)' }}>
                    {sig.includes(t.sport || '') && <span style={{ color: 'var(--teal-dk)' }}>★ </span>}
                    {t.sport || '—'}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{t.gender || '—'}</td>
                  <td style={{ fontSize: 13 }}>{(t.team_levels || []).join(', ')}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{t.team_count ?? (t.team_levels || []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ─── Typical opponents (full mode) ─── */}
      {!compact && opponents.length > 0 && (
        <>
          <h3 className="block-sub">Who they play against</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            The single most useful signal for competitive tier. Schools that play Dulwich, Hampton,
            Charterhouse and similar opponents are operating at a different standard than schools
            whose fixture list is mostly local feeder schools.
          </p>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Opponent school</th>
                <th style={{ textAlign: 'right' }}>Fixtures observed</th>
              </tr>
            </thead>
            <tbody>
              {opponents.map((o, i) => (
                <tr key={i}>
                  <td>{o.name || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {o.fixture_count_observed != null ? o.fixture_count_observed : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ─── Competitive tier benchmark callout (after opponents so context is clear) ─── */}
      {sports.competitive_tier && (
        <div className="translate" style={{ marginTop: 16 }}>
          <p><strong>Competitive standard:</strong> {sports.competitive_tier}</p>
          {sports.fixture_volume && (
            <p>
              <strong>Fixture volume (all sports combined):</strong>{' '}
              {sports.fixture_volume.replace(/^Estimated\s+/i, '')}
            </p>
          )}
        </div>
      )}

      {/* ─── V1 Coaching staff avatar grid ─── */}
      {!compact && coaches.length > 0 && (
        <>
          <h3 className="block-sub">Coaching staff</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            Named coaches beyond the Director. Pro or international playing history is a strong
            investment signal — schools with high-profile coaches are usually serious about the sport.
          </p>
          <div className="coach-grid">
            {coaches.map((c, i) => {
              const isPro = /\b(pro|professional|international|olymp|england|wales|scotland|ireland|former)\b/i.test(
                [c.notable, c.role].filter(Boolean).join(' ')
              )
              return (
                <div key={i} className={`coach-card ${isPro ? 'pro' : ''}`}>
                  <div className="avatar">{initials(c.name)}</div>
                  <div className="info">
                    <div className="name">
                      {c.name || '—'}
                      {isPro && <span className="badge">Pro</span>}
                    </div>
                    <div className="role">
                      {c.sport && <>{c.sport}</>}
                      {c.role && <> · {c.role}</>}
                      {c.notable && <> · {c.notable}</>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ─── Scholarships ─── */}
      {!compact && schol?.available && (
        <>
          <h3 className="block-sub">Sport scholarships</h3>
          <p>
            <strong>Available at entry.</strong>
            {schol.level_required && <> Level required: <em>{schol.level_required}</em>.</>}
            {schol.entry_points && schol.entry_points.length > 0 && (
              <> Entry points: {schol.entry_points.join(', ')}.</>
            )}
          </p>
          {schol.notes && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{schol.notes}</p>}
        </>
      )}

      {/* ─── Notable athletes / alumni ─── */}
      {(achievements.length > 0 || sports.representative_honours) && (
        <>
          <h3 className="block-sub">
            Notable athletes & alumni
            {compact && achievements.length > shownAchievements.length && (
              <small style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, marginLeft: 6 }}>
                — top 3 shown
              </small>
            )}
          </h3>
          {sports.representative_honours && (
            <div className="sport-alumni-named">
              {sports.representative_honours.split(/\),\s*/).map((entry, i, arr) => {
                const full = i < arr.length - 1 ? entry + ')' : entry
                const m = full.match(/^(.+?)\s*\((.+)\)$/)
                return (
                  <div key={i} className="sport-alumni-item">
                    <strong>{m ? m[1].trim() : full}</strong>
                    {m && <span style={{ color: 'var(--muted)', fontSize: 13 }}> — {m[2].trim()}</span>}
                  </div>
                )
              })}
            </div>
          )}
          {!sports.representative_honours && achievements.length > 0 && (
            <ul>
              {shownAchievements.map((a, i) => (
                <li key={i}>
                  <strong>{a.title || '—'}</strong>
                  {a.year && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{a.year}</span>}
                  {a.level && <span style={levelPill(a.level)}>{a.level}</span>}
                </li>
              ))}
            </ul>
          )}
          {compact && achievements.length > shownAchievements.length && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: -4 }}>
              + {achievements.length - shownAchievements.length} more in the full report
            </p>
          )}
        </>
      )}

      {/* ─── V1 Facility icon grid ─── */}
      {!compact && facilities.length > 0 && (
        <>
          <h3 className="block-sub">Sporting facilities</h3>
          <div className="facility-grid">
            {facilities.map((f, i) => (
              <div key={i} className="facility-item">
                <div className="facility-label">{f}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── Signature equipment (full mode) ─── */}
      {!compact && equipment.length > 0 && (
        <>
          <h3 className="block-sub">Signature equipment & tech</h3>
          <ul>
            {equipment.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </>
      )}

      {/* ─── External venues (full mode) ─── */}
      {!compact && venues.length > 0 && (
        <>
          <h3 className="block-sub">External training venues & partnerships</h3>
          <ul>
            {venues.map((v, i) => (
              <li key={i}>
                <strong>{v.name || '—'}</strong>
                {v.sport && <> — {v.sport}</>}
                {v.purpose && <> <em style={{ color: 'var(--muted)' }}>({v.purpose})</em></>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ─── Alumni sport societies (full mode) ─── */}
      {!compact && societies.length > 0 && (
        <>
          <h3 className="block-sub">Alumni sport societies</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            Indicator of active pupil-alumni sport community, not just a static hall of fame.
          </p>
          <ul>
            {societies.map((s, i) => (
              <li key={i}>
                <strong>{s.name || '—'}</strong>
                {s.sport && <> — {s.sport}</>}
                {s.description && <> · {s.description}</>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ─── Sports tours (full mode) ─── */}
      {!compact && tours.length > 0 && (
        <>
          <h3 className="block-sub">Sports tours</h3>
          <ul>
            {tours.map((t, i) => (
              <li key={i}>
                <strong>{t.destination || '—'}</strong>
                {t.sport && <> — {t.sport}</>}
                {t.year && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{t.year}</span>}
                {t.notes && <> · <em style={{ color: 'var(--muted)' }}>{t.notes}</em></>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ─── Sixth Form sport rules (full mode) ─── */}
      {!compact && sixthRules.length > 0 && (
        <>
          <h3 className="block-sub">Sixth Form sport rules</h3>
          <ul>
            {sixthRules.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </>
      )}

      {/* ─── Director of Sport (full mode) ─── */}
      {!compact && dos?.name && (
        <>
          <h3 className="block-sub">Director of Sport</h3>
          <p>
            <strong>{dos.name}</strong>
            {dos.title && <> — {dos.title}</>}
            {dos.email && dos.email !== 'available via contact form' && (
              <> · <a href={`mailto:${dos.email}`}>{dos.email}</a></>
            )}
            {dos.phone && <> · {dos.phone}</>}
          </p>
        </>
      )}

      {/* ─── Athletics records note (full mode, small) ─── */}
      {!compact && sports.athletics_records_note && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12 }}>
          <strong>Athletics records:</strong> <em>{sports.athletics_records_note}</em>
        </p>
      )}

      {/* ─── News activity signal (full mode, subtle) ─── */}
      {!compact && sports.news_activity_signal && (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          <strong>News feed signal:</strong> <em>{sports.news_activity_signal}</em>
        </p>
      )}

      {/* ─── Notes / honest gap statement ─── */}
      {!compact && sports.notes && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
          <em>{sports.notes}</em>
        </p>
      )}
    </Wrapper>
  )
}
