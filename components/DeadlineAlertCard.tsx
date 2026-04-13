import Link from 'next/link'

interface Deadline {
  nanasays_slug: string
  source_name?: string
  title: string
  detected_date: string
  category?: string
  link?: string
}

function countdown(dateStr: string): { label: string; color: string } {
  const diff = new Date(dateStr).getTime() - Date.now()
  const days = Math.ceil(diff / 86400000)
  if (days <= 0) return { label: 'Today', color: '#dc2626' }
  if (days <= 7) return { label: `${days}d`, color: '#dc2626' }
  if (days <= 30) return { label: `${days}d`, color: '#ea580c' }
  return { label: `${days}d`, color: '#888780' }
}

export default function DeadlineAlertCard({ deadline }: { deadline: Deadline }) {
  const { label, color } = countdown(deadline.detected_date)
  const date = new Date(deadline.detected_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div style={{
      background: '#fff',
      border: '2px solid #2563eb',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 22,
    }}>
      {/* Deadline alert badge */}
      <span style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 700,
        background: '#fee2e2',
        color: '#dc2626',
        padding: '2px 8px',
        borderRadius: 10,
        marginBottom: 8,
      }}>
        Deadline alert
      </span>

      {/* Title */}
      <p style={{
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--navy)',
        margin: '0 0 4px',
        lineHeight: 1.4,
      }}>
        {deadline.title}
      </p>

      {/* School name + date */}
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
        {deadline.source_name && <>{deadline.source_name} · </>}{date}
      </p>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Link
          href={`/schools/${deadline.nanasays_slug}`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 14px',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 20,
            textDecoration: 'none',
          }}
        >
          View school
        </Link>
        {deadline.link && (
          <a
            href={deadline.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 14px',
              background: 'none',
              color: '#2563eb',
              border: '1px solid #2563eb',
              borderRadius: 20,
              textDecoration: 'none',
            }}
          >
            View original
          </a>
        )}
        <span style={{
          marginLeft: 'auto',
          fontSize: 11,
          fontWeight: 700,
          color,
          background: `${color}18`,
          padding: '3px 8px',
          borderRadius: 10,
        }}>
          {label}
        </span>
      </div>
    </div>
  )
}
