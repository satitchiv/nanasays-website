/**
 * <SchoolLifeSection> — "What's it like here?"
 *
 * Surfaces school character, culture, activities, arts, trips, community service,
 * traditions, history, boarding life, sixth form — everything that helps a family
 * get a genuine feel for the school beyond league tables.
 *
 * Data: school_structured_data.school_life (JSONB)
 */

type ArtsMusic = {
  description?: string | null
  highlights?: string[]
}

export type SchoolLife = {
  ethos?: string | null
  signature_programmes?: string[]
  arts_music?: ArtsMusic | null
  activities_clubs?: string[]
  cocurricular_requirement?: string | null
  trips_expeditions?: string[] | null
  sixth_form_life?: string | null
  community_service?: string | null
  school_history?: string | null
  notable_traditions?: string[]
  boarding_life?: string | null
  faith_character?: string | null
  notable_alumni?: (string | { name?: string; known_for?: string; role?: string })[]
  unique_differentiators?: string[]
  day_in_the_life?: string | null
  notes?: string | null
}

type Props = { schoolLife: SchoolLife | null }

export default function SchoolLifeSection({ schoolLife }: Props) {
  if (!schoolLife) return null

  const {
    ethos, signature_programmes, arts_music, activities_clubs,
    cocurricular_requirement, trips_expeditions, sixth_form_life,
    community_service, school_history, notable_traditions,
    boarding_life, faith_character, notable_alumni,
    unique_differentiators, day_in_the_life,
  } = schoolLife

  const hasContent = ethos || signature_programmes?.length || activities_clubs?.length ||
    arts_music?.description || community_service || sixth_form_life || school_history

  if (!hasContent) return null

  return (
    <section className="block" id="school-life">
      <h2 className="block-title">What&apos;s it like here?</h2>

      {/* ── Ethos intro ── */}
      {ethos && (
        <div className="sl-ethos">
          <div className="sl-ethos-icon">💬</div>
          <p className="sl-ethos-text">{ethos}</p>
        </div>
      )}

      {/* ── Unique differentiators ── */}
      {unique_differentiators && unique_differentiators.length > 0 && (
        <>
          <h3 className="block-sub">What sets this school apart</h3>
          <div className="sl-diff-grid">
            {unique_differentiators.map((d, i) => {
              const [title, ...rest] = d.split(' — ')
              return (
                <div key={i} className="sl-diff-card">
                  <div className="sl-diff-title">{title}</div>
                  {rest.length > 0 && <div className="sl-diff-body">{rest.join(' — ')}</div>}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Signature programmes ── */}
      {signature_programmes && signature_programmes.length > 0 && (
        <>
          <h3 className="block-sub">Signature programmes</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
            Named initiatives unique to or strongly associated with this school.
          </p>
          <div className="sl-programme-list">
            {signature_programmes.map((p, i) => {
              const dash = p.indexOf(' — ')
              const name = dash !== -1 ? p.slice(0, dash) : p
              const desc = dash !== -1 ? p.slice(dash + 3) : null
              return (
                <div key={i} className="sl-programme-card">
                  <div className="sl-programme-name">{name}</div>
                  {desc && <div className="sl-programme-desc">{desc}</div>}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Arts & music ── */}
      {arts_music && (arts_music.description || arts_music.highlights?.length) && (
        <>
          <h3 className="block-sub">Arts & music</h3>
          {arts_music.description && <p>{arts_music.description}</p>}
          {arts_music.highlights && arts_music.highlights.length > 0 && (
            <ul>
              {arts_music.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          )}
        </>
      )}

      {/* ── Activities & clubs ── */}
      {activities_clubs && activities_clubs.length > 0 && (
        <>
          <h3 className="block-sub">Activities & clubs ({activities_clubs.length})</h3>
          {cocurricular_requirement && (
            <div className="translate" style={{ marginBottom: 10 }}>
              <p style={{ margin: 0 }}><strong>Requirement:</strong> {cocurricular_requirement}</p>
            </div>
          )}
          <div className="sl-clubs-grid">
            {activities_clubs.map((c, i) => <span key={i} className="sl-club-chip">{c}</span>)}
          </div>
        </>
      )}

      {/* ── Trips & expeditions ── */}
      {trips_expeditions && trips_expeditions.length > 0 && (
        <>
          <h3 className="block-sub">Trips & expeditions</h3>
          <ul>
            {trips_expeditions.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </>
      )}

      {/* ── Day in the life ── */}
      {day_in_the_life && (
        <>
          <h3 className="block-sub">A typical day</h3>
          <p>{day_in_the_life}</p>
        </>
      )}

      {/* ── Community service ── */}
      {community_service && (
        <>
          <h3 className="block-sub">Community service & outreach</h3>
          <div className="sl-community">
            <span className="sl-community-icon">🤝</span>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7 }}>{community_service}</p>
          </div>
        </>
      )}

      {/* ── Sixth form life ── */}
      {sixth_form_life && (
        <>
          <h3 className="block-sub">Sixth form life</h3>
          <p>{sixth_form_life}</p>
        </>
      )}

      {/* ── Boarding life ── */}
      {boarding_life && (
        <>
          <h3 className="block-sub">Boarding life</h3>
          <p>{boarding_life}</p>
        </>
      )}

      {/* ── Notable traditions ── */}
      {notable_traditions && notable_traditions.length > 0 && (
        <>
          <h3 className="block-sub">Traditions & annual events</h3>
          <ul>
            {notable_traditions.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </>
      )}

      {/* ── School history ── */}
      {school_history && (
        <>
          <h3 className="block-sub">History & heritage</h3>
          <p>{school_history}</p>
        </>
      )}

      {/* ── Notable alumni ── */}
      {notable_alumni && notable_alumni.length > 0 && (
        <>
          <h3 className="block-sub">Notable alumni</h3>
          <div className="sl-alumni-grid">
            {notable_alumni.map((a: any, i) => {
              let name: string, role: string | null = null
              if (typeof a === 'string') {
                const m = a.match(/^(.+?)\s*\((.+)\)$/)
                name = m ? m[1].trim() : a
                role = m ? m[2].trim() : null
              } else {
                name = a?.name ?? ''
                role = a?.known_for ?? a?.role ?? null
              }
              return (
                <div key={i} className="sl-alumni-item">
                  <strong>{name}</strong>
                  {role && <span className="sl-alumni-role">{role}</span>}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Faith / values character ── */}
      {faith_character && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 16, fontStyle: 'italic' }}>
          {faith_character}
        </p>
      )}
    </section>
  )
}
