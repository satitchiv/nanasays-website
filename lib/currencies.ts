// Exchange rates last updated: 2026-04-07 — refresh monthly
// All rates expressed as: 1 USD = X units of currency
export const RATES: Record<string, number> = {
  USD: 1,
  GBP: 0.79,
  EUR: 0.92,
  THB: 36.5,
  SGD: 1.35,
  AUD: 1.54,
  HKD: 7.82,
  AED: 3.67,
  JPY: 150.5,
  CNY: 7.24,
  KRW: 1350,
  INR: 83.5,
  MYR: 4.72,
  IDR: 15800,
  VND: 24500,
  PHP: 56.5,
  NZD: 1.64,
  CAD: 1.36,
  CHF: 0.90,
  SEK: 10.5,
  NOK: 10.6,
  DKK: 6.9,
  QAR: 3.64,
  SAR: 3.75,
  EGP: 30.9,
}

// Browser locale region (ISO 3166-1 alpha-2) → preferred currency
export const LOCALE_TO_CURRENCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR',
  NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', IE: 'EUR', FI: 'EUR',
  GR: 'EUR', LU: 'EUR', SI: 'EUR', SK: 'EUR', EE: 'EUR', LV: 'EUR',
  LT: 'EUR', CY: 'EUR', MT: 'EUR',
  TH: 'THB', SG: 'SGD', AU: 'AUD', HK: 'HKD', AE: 'AED',
  JP: 'JPY', CN: 'CNY', KR: 'KRW', IN: 'INR', MY: 'MYR',
  ID: 'IDR', VN: 'VND', PH: 'PHP', NZ: 'NZD', CA: 'CAD',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', QA: 'QAR',
  SA: 'SAR', EG: 'EGP',
}

// Display prefix for each currency
export const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',    GBP: '£',    EUR: '€',    THB: 'THB',  SGD: 'S$',
  AUD: 'A$',   HKD: 'HK$',  AED: 'AED',  JPY: '¥',    CNY: '¥',
  KRW: '₩',   INR: '₹',    MYR: 'RM',   IDR: 'Rp',   VND: '₫',
  PHP: '₱',   NZD: 'NZ$',  CAD: 'C$',   CHF: 'CHF',  SEK: 'kr',
  NOK: 'kr',   DKK: 'kr',   QAR: 'QAR',  SAR: 'SAR',  EGP: 'EGP',
}

/**
 * Detect user's preferred currency from browser locale.
 * Bare locale like "en" (no region) defaults to USD.
 */
export function getUserCurrency(): string {
  if (typeof navigator === 'undefined') return 'USD'
  const locale = navigator.language ?? ''          // e.g. "en-GB", "th-TH", "en"
  const parts = locale.split('-')
  const region = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : ''
  return LOCALE_TO_CURRENCY[region] ?? 'USD'
}

/**
 * Convert an amount from one currency to another.
 * Returns null if either currency is unknown.
 */
export function convertFee(amount: number, fromCurrency: string, toCurrency: string): number | null {
  const fromRate = RATES[fromCurrency]
  const toRate = RATES[toCurrency]
  if (!fromRate || !toRate) return null
  return Math.round((amount / fromRate) * toRate)
}

/**
 * Format a number with its currency prefix.
 * e.g. formatCurrencyAmount(17200, 'GBP') → '£17,200'
 */
export function formatCurrencyAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency
  return `${symbol} ${amount.toLocaleString()}`.trim()
}
