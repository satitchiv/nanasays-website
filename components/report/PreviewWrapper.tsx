import Link from 'next/link'

type Props = {
  isPaid: boolean
  chipText?: string
  unlockHref?: string
  children: React.ReactNode
}

export default function PreviewWrapper({
  isPaid,
  chipText = 'Preview',
  unlockHref = '/unlock',
  children,
}: Props) {
  if (isPaid) return <>{children}</>

  return (
    <div className="preview-wrapper">
      <span className="preview-chip">🔒 {chipText}</span>
      <div className="preview-content">
        {children}
      </div>
      <Link href={unlockHref} className="preview-unlock-link">
        Unlock to see everything in this section →
      </Link>
    </div>
  )
}
