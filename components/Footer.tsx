import Link from 'next/link'

export default function Footer() {
  return (
    <footer style={{
      background: 'var(--navy)',
      color: 'rgba(255,255,255,0.4)',
      padding: '40px 5%',
      marginTop: 64,
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 24, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            color: '#fff', fontSize: 18, fontWeight: 800,
          }}>
            nana<span style={{ color: 'var(--teal)' }}>says</span>
          </div>
          <p style={{ fontSize: 12, marginTop: 6, color: 'rgba(255,255,255,0.4)' }}>
            International School Directory
          </p>
        </div>

        <div style={{ display: 'flex', gap: 24 }}>
          {(['About', 'For Schools', 'Contact'] as const).map(label => (
            <span key={label} style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
              {label}
            </span>
          ))}
          <Link href="/blog" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontSize: 13 }}>
            Blog
          </Link>
        </div>

        <p style={{ fontSize: 12, maxWidth: 500, lineHeight: 1.6 }}>
          School data sourced from public listings. Always verify fees and admissions details
          directly with the school before applying.
        </p>
      </div>
    </footer>
  )
}
