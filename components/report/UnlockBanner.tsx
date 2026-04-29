import Link from 'next/link'

type Props = {
  justUnlocked: boolean
  isPaid: boolean
  slug: string
  unlockHref: string
}

export default function UnlockBanner({ justUnlocked, isPaid, slug, unlockHref }: Props) {
  if (justUnlocked && isPaid) {
    return (
      <div className="unlock-banner unlock-banner-success">
        <span className="unlock-banner-icon">✓</span>
        <div className="unlock-banner-body">
          <div className="unlock-banner-title">Unlocked. All 140 school reports are now yours.</div>
          <div className="unlock-banner-sub">
            <Link href="/my-reports">Browse all reports →</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!isPaid) {
    return (
      <div className="unlock-banner unlock-banner-cta">
        <div className="unlock-banner-body">
          <div className="unlock-banner-title">You&apos;re previewing this report</div>
          <div className="unlock-banner-sub">Unlock the full Deep Research for this school and 139 others.</div>
        </div>
        <Link href={unlockHref} className="unlock-banner-btn">Unlock · £29</Link>
      </div>
    )
  }

  return null
}
