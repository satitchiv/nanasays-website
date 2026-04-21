/**
 * <LocationSection> — Part 1 (free preview)
 *
 * Renders school location context for international parents:
 * - Setting description + postcode
 * - Nearest train station
 * - Airports table (with drive times)
 * - Nearby attractions for visiting families
 * - Google Maps embed
 *
 * Data: school_structured_data.location_profile (JSONB)
 */

type NearestStation = { name?: string | null; distance_km?: number | null }
type NearestTown    = { name?: string | null; type?: string | null; population_approx?: number | null; distance_km?: number | null }
type Airport        = { name?: string | null; distance_km?: number | null; drive_time_min_estimate?: number | null }
type Attraction     = { name?: string | null; type?: string | null; distance_km?: number | null; description?: string | null }

export type LocationProfile = {
  postcode?: string | null
  region?: string | null
  local_authority?: string | null
  setting?: string | null
  setting_note?: string | null
  nearest_town?: NearestTown | null
  nearest_station?: NearestStation | null
  airports?: Airport[]
  nearby_attractions?: Attraction[]
  lat?: number | null
  lng?: number | null
  crime_summary?: unknown
}

type Props = {
  location: LocationProfile | null
  schoolName?: string | null
  compact?: boolean
}

function fmtDist(km?: number | null) {
  if (km == null) return null
  return km < 2 ? `${Math.round(km * 1000)} m` : `${km} km`
}

function settingLabel(setting?: string | null) {
  if (!setting) return null
  const map: Record<string, string> = {
    urban: 'Urban',
    suburban: 'Suburban',
    'semi-rural': 'Semi-rural',
    rural: 'Rural',
    coastal: 'Coastal',
    village: 'Village',
  }
  return map[setting.toLowerCase()] ?? setting
}

const AIRPORT_INTERNATIONAL: Record<string, string> = {
  'heathrow':  'LHR — gateway for Bangkok, Singapore, Hong Kong, Dubai',
  'gatwick':   'LGW — good for SE Asia, Middle East via BA/EK/QR',
  'stansted':  'STN — European and budget carriers',
  'luton':     'LTN — European and budget carriers',
  'birmingham':'BHX — Midlands gateway',
  'manchester':'MAN — Northern gateway; global connections',
  'edinburgh': 'EDI — Scottish gateway',
  'glasgow':   'GLA — Scottish gateway',
  'bristol':   'BRS — Southwest gateway',
}

function airportNote(name?: string | null) {
  if (!name) return null
  const key = Object.keys(AIRPORT_INTERNATIONAL).find(k => name.toLowerCase().includes(k))
  return key ? AIRPORT_INTERNATIONAL[key] : null
}

export default function LocationSection({ location, schoolName, compact = false }: Props) {
  if (!location) return null

  const airports    = Array.isArray(location.airports) ? location.airports : []
  const attractions = Array.isArray(location.nearby_attractions) ? location.nearby_attractions : []
  const station     = location.nearest_station
  const town        = location.nearest_town
  const mapQuery    = location.postcode
    ? encodeURIComponent(location.postcode)
    : schoolName
    ? encodeURIComponent(schoolName)
    : null

  const hasSomething = location.setting || station?.name || airports.length || attractions.length || mapQuery

  if (!hasSomething) return null

  return (
    <section className="block" id="location">
      <h2 className="block-title">Location &amp; getting here</h2>

      {/* ── Setting strip ── */}
      {(location.setting || location.postcode || station?.name || town?.name) && (
        <div className="loc-strip">
          {location.postcode && (
            <div className="loc-cell">
              <div className="loc-label">Postcode</div>
              <div className="loc-val">{location.postcode}</div>
            </div>
          )}
          {location.setting && (
            <div className="loc-cell">
              <div className="loc-label">Setting</div>
              <div className="loc-val">{settingLabel(location.setting)}</div>
            </div>
          )}
          {station?.name && (
            <div className="loc-cell">
              <div className="loc-label">Nearest station</div>
              <div className="loc-val">
                {station.name}
                {station.distance_km != null && (
                  <small>{fmtDist(station.distance_km)} away</small>
                )}
              </div>
            </div>
          )}
          {town?.name && (
            <div className="loc-cell">
              <div className="loc-label">Nearest town</div>
              <div className="loc-val">
                {town.name}
                {town.distance_km != null && (
                  <small>{fmtDist(town.distance_km)}</small>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {location.setting_note && (
        <p className="loc-setting-note">{location.setting_note}</p>
      )}

      {/* ── Map embed ── */}
      {!compact && mapQuery && (
        <div className="loc-map-wrap">
          <iframe
            title="School location map"
            src={`https://maps.google.com/maps?q=${mapQuery}&output=embed&z=14`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}

      {/* ── Airports ── */}
      {airports.length > 0 && (
        <>
          <h3 className="block-sub">Nearest airports</h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 10 }}>
            Framed for international families — drive times are from the school, not the city centre.
          </p>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Airport</th>
                <th style={{ textAlign: 'right' }}>Distance</th>
                <th style={{ textAlign: 'right' }}>Drive from school</th>
                <th>International note</th>
              </tr>
            </thead>
            <tbody>
              {airports.map((a, i) => {
                const note = airportNote(a.name)
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--navy)' }}>{a.name || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{a.distance_km != null ? `${a.distance_km} km` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {a.drive_time_min_estimate != null ? `~${a.drive_time_min_estimate} min` : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{note || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {/* ── Attractions ── */}
      {!compact && attractions.length > 0 && (
        <>
          <h3 className="block-sub">Nearby for visiting weekends</h3>
          <div className="loc-attract-grid">
            {attractions.map((a, i) => (
              <div key={i} className="loc-attract-card">
                <div className="loc-attract-name">{a.name || '—'}</div>
                {a.type && <div className="loc-attract-type">{a.type}</div>}
                {a.distance_km != null && (
                  <div className="loc-attract-dist">{a.distance_km} km away</div>
                )}
                {a.description && (
                  <div className="loc-attract-desc">{a.description}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
