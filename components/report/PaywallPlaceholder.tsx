type Props = {
  hiddenSections: string[]
}

export default function PaywallPlaceholder({ hiddenSections }: Props) {
  return (
    <section className="paywall-placeholder">
      <div className="paywall-placeholder-icon">🔒</div>
      <h3 className="paywall-placeholder-title">Tier C is locked</h3>
      <p className="paywall-placeholder-sub">
        The verified & regulated tier covers what we cross-referenced from primary regulators and inspectors — material schools don&apos;t voluntarily publish.
      </p>
      <ul className="paywall-placeholder-list">
        {hiddenSections.map(s => <li key={s}>{s}</li>)}
      </ul>
      <div className="paywall-placeholder-note">
        Paywall wiring coming in the next milestone. Remove <code>?preview=free</code> from the URL to see the full content now.
      </div>
    </section>
  )
}
