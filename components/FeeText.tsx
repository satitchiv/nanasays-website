'use client'

import { convertFee, CURRENCY_SYMBOL } from '@/lib/currencies'
import { useCurrency } from './CurrencyProvider'

interface Props {
  feesUsdMin: number | null
  feesUsdMax?: number | null
  feesOriginal?: string | null
  suffix?: string
  fallback?: string
}

export default function FeeText({
  feesUsdMin,
  feesUsdMax,
  feesOriginal,
  suffix = '',
  fallback = 'Contact school',
}: Props) {
  const { currency } = useCurrency()

  if (!feesUsdMin) {
    if (feesOriginal) return <>{feesOriginal}{suffix}</>
    return <>{fallback}</>
  }

  const symbol = CURRENCY_SYMBOL[currency] ?? currency
  const min = currency === 'USD' ? feesUsdMin : (convertFee(feesUsdMin, 'USD', currency) ?? feesUsdMin)
  const max = feesUsdMax
    ? currency === 'USD' ? feesUsdMax : (convertFee(feesUsdMax, 'USD', currency) ?? feesUsdMax)
    : null

  if (max && max !== min) {
    return <>{symbol} {min.toLocaleString()}–{symbol} {max.toLocaleString()}{suffix}</>
  }
  return <>{symbol} {min.toLocaleString()}+{suffix}</>
}
