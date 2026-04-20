/**
 * <Sources> — Sources & Data Freshness at the bottom of the report.
 * Lists every source with URL and retrieval date.
 */

export type Source = {
  name: string
  detail?: string
  url?: string
  retrievedDate?: string
}

type Props = { sources: Source[] }

export default function Sources({ sources }: Props) {
  if (!sources || sources.length === 0) return null

  return (
    <section className="sources" id="sources">
      <h2 className="block-title">Sources & data freshness</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>
        Every claim in this report is drawn from one of the sources below. Regulatory and
        financial positions can change — check the most recent filings before a final decision.
      </p>
      <ul>
        {sources.map((s, i) => (
          <li key={i}>
            <span className="src-name">{s.name}</span>
            {s.detail && <> — {s.detail}</>}
            {s.url && <> (<a href={s.url}>{s.url.replace(/^https?:\/\//, '').split('/')[0]}</a>)</>}
            {s.retrievedDate && <>. Retrieved: {s.retrievedDate}</>}
          </li>
        ))}
      </ul>
    </section>
  )
}
