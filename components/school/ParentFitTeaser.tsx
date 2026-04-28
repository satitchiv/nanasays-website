interface ParentFit {
  harder?: string[]
  easier?: string[]
  thrives?: string[]
}

interface Props {
  parentFit: ParentFit | null
  reportSlug: string
}

export default function ParentFitTeaser({ parentFit, reportSlug }: Props) {
  const harder = parentFit?.harder ?? []
  const easier = parentFit?.easier ?? parentFit?.thrives ?? []

  if (harder.length === 0 && easier.length === 0) return null

  // Show 1 free from each column — gate the rest
  const freeEasier = easier.slice(0, 1)
  const freeHarder = harder.slice(0, 1)
  const lockedCount = (easier.length - freeEasier.length) + (harder.length - freeHarder.length)

  return (
    <div style={{ marginBottom: 52 }}>
      <h2 style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
        color: 'var(--teal-dk)', marginBottom: 4, paddingBottom: 10,
        borderBottom: '2px solid var(--border)', fontWeight: 800,
        fontFamily: 'var(--font-nunito), Nunito, sans-serif',
      }}>
        Is This School Right For You?
      </h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
        A quick read on family fit — based on the school&apos;s pastoral model, academic pace, and boarding culture.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Strong fit */}
        {freeEasier.length > 0 && (
          <div style={{
            background: 'var(--off)', border: '1px solid var(--border)',
            borderLeft: '3px solid #16a34a', borderRadius: 10, padding: '16px 18px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#166534', marginBottom: 10 }}>
              ✓ Strong fit if…
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {freeEasier.map((item, i) => (
                <li key={i} style={{ fontSize: 13, color: 'var(--text)', display: 'flex', gap: 8, lineHeight: 1.6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', flexShrink: 0, marginTop: 6 }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Consider carefully */}
        {freeHarder.length > 0 && (
          <div style={{
            background: 'var(--off)', border: '1px solid var(--border)',
            borderLeft: '3px solid #d97706', borderRadius: 10, padding: '16px 18px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400e', marginBottom: 10 }}>
              ⚠ Consider carefully if…
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {freeHarder.map((item, i) => (
                <li key={i} style={{ fontSize: 13, color: 'var(--text)', display: 'flex', gap: 8, lineHeight: 1.6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', flexShrink: 0, marginTop: 6 }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Locked signal count */}
      {lockedCount > 0 && (
        <div style={{
          background: 'var(--off)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
              +{lockedCount} more fit signals
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
              — academic pace, SEND support, boarding culture, day pupil expectations
            </span>
          </div>
          <a
            href={`/schools/${reportSlug}/report`}
            style={{
              fontSize: 12, fontWeight: 700, color: 'var(--teal-dk)',
              textDecoration: 'none', whiteSpace: 'nowrap',
              borderBottom: '1px solid rgba(0,128,110,0.3)',
            }}
          >
            Full Report →
          </a>
        </div>
      )}
    </div>
  )
}
