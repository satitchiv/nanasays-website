'use client'

import { useCurrency } from '../CurrencyProvider'
import { convertFee, formatCurrencyAmount } from '@/lib/currencies'

interface Props {
  feesLocalMin: number | null
  feesLocalMax: number | null
  feesLocalCurrency: string | null
  feesUsdMin: number | null
  feesUsdMax: number | null
  feesOriginal: string | null
  label: string
}

export default function HeroFeesStat({
  feesLocalMin, feesLocalMax, feesLocalCurrency,
  feesUsdMin, feesUsdMax, feesOriginal, label,
}: Props) {
  const { currency: display } = useCurrency()

  function format(): string {
    // Prefer local currency with conversion
    if (feesLocalMin && feesLocalCurrency) {
      const converted = convertFee(feesLocalMin, feesLocalCurrency, display)
      if (converted !== null) {
        const lo = formatCurrencyAmount(converted, display)
        if (feesLocalMax && feesLocalMax !== feesLocalMin) {
          const hi = convertFee(feesLocalMax, feesLocalCurrency, display)
          if (hi !== null) return `${lo} – ${formatCurrencyAmount(hi, display)}`
        }
        return `From ${lo}`
      }
    }
    // Fall back to USD fields
    if (feesUsdMin) {
      const converted = convertFee(feesUsdMin, 'USD', display)
      if (converted !== null) {
        const lo = formatCurrencyAmount(converted, display)
        if (feesUsdMax && feesUsdMax !== feesUsdMin) {
          const hi = convertFee(feesUsdMax, 'USD', display)
          if (hi !== null) return `${lo} – ${formatCurrencyAmount(hi, display)}`
        }
        return `From ${lo}`
      }
    }
    // Raw original string
    if (feesOriginal) return feesOriginal.replace(/([A-Z]{3})(\d)/, '$1 $2')
    return 'Contact school'
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)', padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>
        {label}
      </span>
      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--teal)', lineHeight: 1.2, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
        {format()}
      </span>
    </div>
  )
}
