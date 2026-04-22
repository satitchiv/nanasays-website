type Props = {
  tier: 'A' | 'B' | 'C'
  title: string
  subtitle: string
  id?: string
}

export default function TierDivider({ tier, title, subtitle, id }: Props) {
  return (
    <div className={`tier-divider tier-divider-${tier}`} id={id}>
      <div className="tier-divider-badge">{tier}</div>
      <div className="tier-divider-body">
        <div className="tier-divider-title">{title}</div>
        <div className="tier-divider-sub">{subtitle}</div>
      </div>
    </div>
  )
}
