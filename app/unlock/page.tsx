import Link from 'next/link'
import { isUnlocked } from '@/lib/paid-status'
import { createSupabaseServer } from '@/lib/supabase-ssr'
import { redirect } from 'next/navigation'
import CheckoutButton from './CheckoutButton'
import './unlock.css'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams?: Promise<{ from?: string }>
}

export default async function UnlockPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {}
  const from = sp.from && sp.from.startsWith('/') && !sp.from.includes('//') ? sp.from : '/my-reports'

  // Already paid? Bounce straight through
  if (await isUnlocked()) {
    redirect(from)
  }

  // Not logged in? Send to signup first
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/signup?from=${encodeURIComponent('/unlock')}`)
  }

  return (
    <main className="unlock-page">
      <div className="unlock-wrap">
        <div className="unlock-kicker">Deep Research · Monthly access</div>
        <h1 className="unlock-title">Unlock every school report.</h1>
        <p className="unlock-intro">
          Full access to deep research on all 140 UK independent schools — plus every new school we add.
          Regulatory filings, ISI inspection quotes, financial health, parent-fit verdict, and Nana AI chat.
        </p>

        <div className="unlock-price-card">
          <div className="unlock-price-kicker">Unlocks all 140 UK school reports</div>
          <div className="unlock-price-value">
            <span style={{ fontSize: 48, fontWeight: 900, fontFamily: 'Nunito, sans-serif', color: '#0b1f3a' }}>£39<span style={{ fontSize: 20, fontWeight: 600 }}>/mo</span></span>
          </div>
          <div className="unlock-price-note">Cancel any time · new schools included</div>

          <div style={{ marginTop: 20 }}>
            <CheckoutButton from={from} />
          </div>
        </div>

        <div className="unlock-included">
          <h2 className="unlock-included-title">What you unlock per school</h2>
          <ul className="unlock-included-list">
            <li>📈 Full exam results with subject-by-subject breakdown</li>
            <li>🎓 Named university destinations + Oxbridge / Russell Group analysis</li>
            <li>🏆 Sport: tier breakdown, coaching staff, competition record, alumni athletes</li>
            <li>🌍 Student community: nationalities, boarding houses, language mix</li>
            <li>💙 Pastoral &amp; wellbeing: staff table, ratios, sector comparison</li>
            <li>💷 Fees: per-grade, hidden extras, 5-year inflation trend</li>
            <li>📋 Charity Commission filings &amp; trustee history</li>
            <li>🔍 ISI inspection verbatim quotes + strengths / improvements table</li>
            <li>💰 3-year financial health with sector benchmarks</li>
            <li>🎯 Parent-fit scorecard across 8 dimensions</li>
            <li>🗣️ 5 pointed tour questions with follow-up scripts &amp; red flags</li>
            <li>🤖 Chat with Nana — AI guide to every school</li>
          </ul>
        </div>

        <div className="unlock-back">
          <Link href={from}>← Back</Link>
        </div>
      </div>
    </main>
  )
}
