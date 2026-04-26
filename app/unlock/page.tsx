/**
 * /unlock
 *
 * Phase 1 stub checkout page. Clicking the "pay" button hits the
 * /api/unlock-stub route handler which sets the nanasays_unlocked
 * cookie and redirects back. No real payment — Stripe wires in
 * Phase 2.
 */

import Link from 'next/link'
import { isUnlocked } from '@/lib/paid-status'
import { redirect } from 'next/navigation'
import './unlock.css'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams?: Promise<{ from?: string }>
}

export default async function UnlockPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {}
  const from = sp.from && sp.from.startsWith('/') ? sp.from : '/my-reports'

  // Already unlocked? Bounce straight through.
  if (await isUnlocked()) {
    redirect(from)
  }

  return (
    <main className="unlock-page">
      <div className="unlock-wrap">
        <div className="unlock-kicker">Deep Research · one payment</div>
        <h1 className="unlock-title">Unlock every school report.</h1>
        <p className="unlock-intro">
          One payment, lifetime access to Deep Research for all 29 schools currently analysed — plus every new school we add.
          Regulatory filings, ISI inspection quotes, financial health, parent-fit verdict, and 5 pointed tour questions per school.
        </p>

        <div className="unlock-price-card">
          <div className="unlock-price-kicker">Unlocks all 29 school reports</div>
          <div className="unlock-price-value">
            <div className="unlock-price-track">
              <span>£29</span>
              <span>$37</span>
              <span>฿1,300</span>
              <span>£29</span>
            </div>
          </div>
          <div className="unlock-price-note">Lifetime access · downloadable PDFs · new schools included free</div>

          <form action="/api/unlock-stub" method="post" className="unlock-form">
            <input type="hidden" name="from" value={from} />
            <button type="submit" className="unlock-cta">Pay &amp; unlock (demo)</button>
          </form>
          <div className="unlock-stub-note">
            Phase 1 stub: clicking this sets a cookie and sends you straight to your reports. Stripe integration lands in Phase 2.
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
            <li>📥 Downloadable PDF of every report</li>
          </ul>
        </div>

        <div className="unlock-back">
          <Link href={from}>← Back</Link>
        </div>
      </div>
    </main>
  )
}
