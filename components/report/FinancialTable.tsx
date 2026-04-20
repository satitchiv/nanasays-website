/**
 * <FinancialTable> — 5-year Charity Commission trajectory with plain-English primer.
 *
 * Data comes from school_sensitive where source='charity_commission' and
 * data_type='financial_filing'. The details JSONB holds financial_history +
 * assets_liabilities_history arrays, keyed by year.
 */

type YearRow = {
  year: string | number
  gross_income?: number | null
  total_expenditure?: number | null
  total_assets?: number | null
  total_liabilities?: number | null
  net_position?: number | null
}

type Props = {
  years: YearRow[]
  currencyPrefix?: string  // defaults to '£'
}

function fmtMoney(n?: number | null, prefix = '£') {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}m`
  if (Math.abs(n) >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}k`
  return `${prefix}${n}`
}

export default function FinancialTable({ years, currencyPrefix = '£' }: Props) {
  if (!years || years.length === 0) {
    return (
      <section className="block" id="financial">
        <h2 className="block-title">Financial health</h2>
        <p>No Charity Commission financial data available for this school yet.</p>
      </section>
    )
  }

  const latest = years[years.length - 1]
  const surplus = (latest.gross_income ?? 0) - (latest.total_expenditure ?? 0)

  return (
    <section className="block" id="financial">
      <h2 className="block-title">Financial health</h2>

      <div className="fin-primer">
        <p>
          <strong>Total assets</strong> = everything the school owns (buildings, playing fields, cash in the bank).<br />
          <strong>Total liabilities</strong> = everything it owes (loans, future costs it has committed to pay).<br />
          <strong>Net position</strong> = assets minus liabilities. The higher, the healthier.
        </p>
      </div>

      <h3 className="block-sub">Headline — latest year ending {latest.year}</h3>
      <div className="fin-callout">
        <div className="fin-stat">
          <div className="fin-stat-label">Income</div>
          <div className="fin-stat-value">{fmtMoney(latest.gross_income, currencyPrefix)}</div>
        </div>
        <div className="fin-stat">
          <div className="fin-stat-label">Expenditure</div>
          <div className="fin-stat-value">{fmtMoney(latest.total_expenditure, currencyPrefix)}</div>
        </div>
        <div className="fin-stat">
          <div className="fin-stat-label">Operating surplus</div>
          <div className="fin-stat-value">{surplus >= 0 ? '+' : ''}{fmtMoney(surplus, currencyPrefix)}</div>
        </div>
        <div className="fin-stat">
          <div className="fin-stat-label">Net position</div>
          <div className="fin-stat-value">{fmtMoney(latest.net_position, currencyPrefix)}</div>
        </div>
      </div>

      <h3 className="block-sub">Five-year trajectory</h3>
      <table className="fin-table">
        <thead>
          <tr>
            <th>Year ending</th>
            <th>Income</th>
            <th>Expenditure</th>
            <th>Total assets</th>
            <th>Total liabilities</th>
            <th>Net position</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={String(y.year)}>
              <td>{y.year}</td>
              <td>{fmtMoney(y.gross_income, currencyPrefix)}</td>
              <td>{fmtMoney(y.total_expenditure, currencyPrefix)}</td>
              <td>{fmtMoney(y.total_assets, currencyPrefix)}</td>
              <td>{fmtMoney(y.total_liabilities, currencyPrefix)}</td>
              <td>{fmtMoney(y.net_position, currencyPrefix)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
