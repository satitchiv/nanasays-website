'use client'

import { convertFee, CURRENCY_SYMBOL } from '@/lib/currencies'
import { useCurrency } from './CurrencyProvider'

interface Props {
  feesUsdMin: number | null
  feesUsdMax?: number | null
  feesOriginal?: string | null
  /**
   * The actual currency of `feesUsdMin`/`feesUsdMax`. Defaults to 'USD' for
   * backwards-compat with callers that pass true USD-converted amounts (e.g.
   * the country cards). UK/CH report renderers MUST pass the school's local
   * currency (typically 'GBP' or 'CHF') so the converter doesn't treat raw
   * GBP/CHF values as USD and double-convert them. P0.4 Codex r4 finding.
   */
  sourceCurrency?: string
  suffix?: string
  fallback?: string
}

export default function FeeText({
  feesUsdMin,
  feesUsdMax,
  feesOriginal,
  sourceCurrency = 'USD',
  suffix = '',
  fallback = 'Contact school',
}: Props) {
  const { currency } = useCurrency()

  if (!feesUsdMin) {
    if (feesOriginal) return <>{feesOriginal}{suffix}</>
    return <>{fallback}</>
  }

  const symbol = CURRENCY_SYMBOL[currency] ?? currency
  const min = currency === sourceCurrency
    ? feesUsdMin
    : (convertFee(feesUsdMin, sourceCurrency, currency) ?? feesUsdMin)
  const max = feesUsdMax
    ? (currency === sourceCurrency
        ? feesUsdMax
        : (convertFee(feesUsdMax, sourceCurrency, currency) ?? feesUsdMax))
    : null

  if (max && max !== min) {
    return <>{symbol} {min.toLocaleString()}–{symbol} {max.toLocaleString()}{suffix}</>
  }
  return <>{symbol} {min.toLocaleString()}+{suffix}</>
}
