interface Programme {
  name?: string
  description?: string
}

interface Props {
  signatureProgrammes: string[] | Programme[] | null
  uniqueDifferentiators: string[] | null
  tripsExpeditions: string[] | null
  activitiesClubs: string[] | null
}

function getText(p: string | Programme): string {
  if (typeof p === 'string') return p
  return p.description ?? p.name ?? ''
}
function getTitle(p: string | Programme): string {
  if (typeof p === 'string') {
    const dash = p.indexOf(' — ')
    return dash > 0 ? p.slice(0, dash) : p.slice(0, 40)
  }
  return p.name ?? ''
}
function getBody(p: string | Programme): string {
  if (typeof p === 'string') {
    const dash = p.indexOf(' — ')
    return dash > 0 ? p.slice(dash + 3) : ''
  }
  return p.description ?? ''
}

export default function SignatureProgrammesSection({
  signatureProgrammes, uniqueDifferentiators, tripsExpeditions, activitiesClubs,
}: Props) {
  const programmes = (signatureProgrammes ?? []) as (string | Programme)[]
  const differentiators = uniqueDifferentiators ?? []
  const trips = tripsExpeditions ?? []
  const clubs = activitiesClubs ?? []

  if (programmes.length === 0 && differentiators.length === 0) return null

  // Show programmes (full description) or fall back to differentiators as short pills
  const useDetailedProgrammes = programmes.length > 0

  return (
    <div style={{ marginBottom: 52 }}>
      <h2 style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
        color: 'var(--teal-dk)', marginBottom: 18, paddingBottom: 10,
        borderBottom: '2px solid var(--border)', fontWeight: 800,
        fontFamily: 'var(--font-nunito), Nunito, sans-serif',
      }}>
        What Makes This School Different
      </h2>

      {/* Programme cards */}
      {useDetailedProgrammes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {programmes.map((p, i) => {
            const title = getTitle(p)
            const body = getBody(p)
            return (
              <div key={i} style={{
                background: 'var(--off)', border: '1px solid var(--border)',
                borderLeft: '3px solid var(--teal)', borderRadius: 10,
                padding: '14px 16px',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: body ? 4 : 0 }}>
                  {title}
                </div>
                {body && (
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                    {body}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Clubs & activities count */}
      {clubs.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            Clubs & Activities
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {clubs.slice(0, 10).map((c, i) => (
              <span key={i} style={{
                fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 100,
                background: 'var(--off)', color: 'var(--text)', border: '1px solid var(--border)',
              }}>
                {c}
              </span>
            ))}
            {clubs.length > 10 && (
              <span style={{
                fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 100,
                background: 'var(--off)', color: 'var(--muted)', border: '1px solid var(--border)',
              }}>
                +{clubs.length - 10} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Trips teaser */}
      {trips.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginTop: 4 }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>Expeditions include: </span>
          {trips.slice(0, 5).join(', ')}
          {trips.length > 5 && ` and ${trips.length - 5} more.`}
        </div>
      )}
    </div>
  )
}
