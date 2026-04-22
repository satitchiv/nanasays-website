type Props = {
  tier: 'A' | 'B' | 'C'
  label: string
  title: string
  subtitle: string
  id?: string
}

export default function TierDivider({ tier, label, title, subtitle, id }: Props) {
  return (
    <div className={`tier-part tier-part-${tier}`} id={id}>
      <div className="tier-part-row">
        <div className="tier-part-badge">{tier}</div>
        <div className="tier-part-label">{label}</div>
      </div>
      <h2 className="tier-part-title">{title}</h2>
      <p className="tier-part-intro">{subtitle}</p>
    </div>
  )
}
