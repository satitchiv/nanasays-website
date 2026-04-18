'use client'

import { convertFee, CURRENCY_SYMBOL } from '@/lib/currencies'
import { useCurrency } from '../CurrencyProvider'

interface Props {
  fees: Record<string, number | string>
  currency: string
  boardingFeesUsd?: number | null
}

export default function FeeTableClient({ fees, currency, boardingFeesUsd }: Props) {
  const { currency: userCurrency, ratesAsOf } = useCurrency()
  const showHint = userCurrency !== currency

  function feeDisplay(fee: number | string): { main: string; hint: string | null } {
    if (typeof fee !== 'number') return { main: String(fee), hint: null }
    const main = `${currency} ${fee.toLocaleString()}`
    if (!showHint) return { main, hint: null }
    const converted = convertFee(fee, currency, userCurrency)
    if (converted === null) return { main, hint: null }
    const symbol = CURRENCY_SYMBOL[userCurrency] ?? userCurrency
    return { main, hint: `~${symbol} ${converted.toLocaleString()}` }
  }

  return (
    <>
      <div className="ns-fee-table-wrap">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{
              textAlign: 'left', fontSize: 11, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--muted)', padding: '10px 12px',
              background: 'var(--off)', border: '1px solid var(--border)', fontWeight: 600,
            }}>Grade / Year</th>
            <th style={{
              textAlign: 'right', fontSize: 11, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--muted)', padding: '10px 12px',
              background: 'var(--off)', border: '1px solid var(--border)', fontWeight: 600,
            }}>Annual Fee</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(fees).map(([grade, fee]) => {
            const { main, hint } = feeDisplay(fee as number | string)
            return (
              <tr key={grade}>
                <td style={{ padding: '10px 12px', border: '1px solid var(--border)', color: '#334' }}>{grade}</td>
                <td style={{ padding: '10px 12px', border: '1px solid var(--border)', textAlign: 'right', fontWeight: 600, color: 'var(--navy)' }}>
                  {main}
                  {hint && (
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 8 }}>
                      {hint}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
          {boardingFeesUsd != null && (
            <tr style={{ background: 'var(--teal-bg)' }}>
              <td style={{ padding: '10px 12px', border: '1px solid var(--border)', color: '#334', fontWeight: 600 }}>
                Boarding (Full Year)
              </td>
              <td style={{ padding: '10px 12px', border: '1px solid var(--border)', textAlign: 'right', fontWeight: 700, color: 'var(--teal-dk)' }}>
                ${boardingFeesUsd.toLocaleString()}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {showHint && (
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, marginBottom: 0 }}>
          Conversions to {userCurrency} use exchange rates as of {ratesAsOf}.
        </p>
      )}
    </>
  )
}
