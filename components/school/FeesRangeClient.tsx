'use client'

import { CURRENCY_SYMBOL, convertFee } from '@/lib/currencies'
import { useCurrency } from '../CurrencyProvider'

interface Props {
  min: number
  max: number | null
  currency: string
}

export default function FeesRangeClient({ min, max, currency }: Props) {
  const { currency: display, ratesAsOf } = useCurrency()

  const symbol = CURRENCY_SYMBOL[display] ?? display
  const convertedMin = display === currency ? min : convertFee(min, currency, display)
  const convertedMax = max == null ? null : display === currency ? max : convertFee(max, currency, display)

  const rangeText =
    convertedMin == null
      ? 'Contact school'
      : convertedMax && convertedMax !== convertedMin
        ? `${symbol} ${convertedMin.toLocaleString()} – ${convertedMax.toLocaleString()}`
        : `From ${symbol} ${convertedMin.toLocaleString()}`

  const showApprox = display !== currency && convertedMin !== null

  return (
    <div style={{
      background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20,
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>
        {rangeText}
        {showApprox && (
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', marginLeft: 10 }}>
            (from {currency} {min.toLocaleString()}{max ? `–${max.toLocaleString()}` : ''})
          </span>
        )}
      </div>
      {showApprox && (
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, marginBottom: 0 }}>
          Converted from {currency} using exchange rates as of {ratesAsOf}.
        </p>
      )}
    </div>
  )
}
