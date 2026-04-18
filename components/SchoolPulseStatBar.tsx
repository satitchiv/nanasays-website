import type { StatBarConfig, StatBarMetric } from '@/lib/eduworld'

function getValue(m: StatBarMetric, school: any, pulse: any | null): number | string | null {
  if (m.source === 'pulse') return pulse ? (pulse[m.metric_key] ?? null) : null
  if (m.source === 'nanasays') return school?.[m.metric_key] ?? null
  return null
}

function formatValue(value: number | string, format: string): string {
  if (typeof value === 'string') return value
  if (format === 'percent') return `${Math.round(value as number)}%`
  if (format === 'currency_usd') return `$${(value as number).toLocaleString()}`
  if (format === 'year') return String(value)
  return (value as number).toLocaleString()
}

function selectCards(config: StatBarConfig, school: any, pulse: any | null) {
  const { metrics, max_cards } = config
  const cards: Array<StatBarMetric & { display: string }> = []

  // Step A: pinned metrics always show (use default_value or '—' when null)
  for (const m of metrics.filter(m => m.pinned).sort((a, b) => a.display_order - b.display_order)) {
    if (cards.length >= max_cards) break
    const value = getValue(m, school, pulse)
    cards.push({
      ...m,
      display: value !== null && value !== undefined
        ? formatValue(value, m.format)
        : (m.default_value || '—'),
    })
  }

  // Step B: enabled non-pinned with real values
  for (const m of metrics.filter(m => m.enabled && !m.pinned).sort((a, b) => a.display_order - b.display_order)) {
    if (cards.length >= max_cards) break
    const value = getValue(m, school, pulse)
    if (value === null || value === undefined) continue
    if (m.format === 'currency_usd' && value === 0) continue
    cards.push({ ...m, display: formatValue(value, m.format) })
  }

  return cards
}

interface Props {
  pulse: any | null
  school: any
  config: StatBarConfig
}

export default function SchoolPulseStatBar({ pulse, school, config }: Props) {
  const cards = selectCards(config, school, pulse)
  if (cards.length === 0) return null

  const cols = Math.min(cards.length, 5)

  return (
    <div className="ns-pulse-stats" style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 10,
      marginBottom: 28,
    }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          padding: '12px 16px',
          background: 'var(--off)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          textAlign: 'center',
          minWidth: 0,
        }}>
          <div style={{
            fontSize: 22,
            fontWeight: 900,
            color: 'var(--navy)',
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            lineHeight: 1.1,
            marginBottom: 4,
          }}>
            {c.display}
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}>
            {c.label}
          </div>
        </div>
      ))}
    </div>
  )
}
