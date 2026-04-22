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
      <UnlockPageStyles />
    </main>
  )
}

function UnlockPageStyles() {
  return (
    <style>{`
      .unlock-page {
        min-height: 100vh;
        background: var(--off);
        padding: 60px 20px 80px;
        font-family: 'Nunito Sans', sans-serif;
      }
      .unlock-wrap { max-width: 680px; margin: 0 auto; }
      .unlock-kicker {
        font-size: 11px; font-weight: 900; color: var(--teal-dk);
        letter-spacing: .14em; text-transform: uppercase; margin-bottom: 12px;
      }
      .unlock-title {
        font-family: 'Nunito', sans-serif;
        font-size: 36px; font-weight: 900; color: var(--navy);
        letter-spacing: -.02em; line-height: 1.15; margin: 0 0 14px;
      }
      .unlock-intro {
        font-size: 15px; color: var(--body); line-height: 1.65;
        margin: 0 0 32px; max-width: 600px;
      }

      .unlock-price-card {
        background: linear-gradient(135deg, var(--navy) 0%, #1e3f6b 100%);
        color: #fff;
        border-radius: 16px;
        padding: 28px 32px;
        margin-bottom: 32px;
      }
      .unlock-price-kicker {
        font-size: 11px; font-weight: 900; color: var(--teal);
        letter-spacing: .14em; text-transform: uppercase; margin-bottom: 10px;
      }
      .unlock-price-value {
        font-family: 'Nunito', sans-serif;
        font-weight: 900; color: #fff;
        line-height: 1; height: 58px; overflow: hidden;
        margin-bottom: 8px;
      }
      .unlock-price-track {
        display: flex; flex-direction: column;
        animation: unlockPriceRotate 10s infinite;
      }
      .unlock-price-track span {
        height: 58px; line-height: 58px; font-size: 56px; flex-shrink: 0;
      }
      @keyframes unlockPriceRotate {
        0%, 18%   { transform: translateY(0); }
        25%, 43%  { transform: translateY(-58px); }
        50%, 68%  { transform: translateY(-116px); }
        75%, 100% { transform: translateY(-174px); }
      }
      .unlock-price-note {
        font-size: 13px; color: rgba(255,255,255,.7);
        margin-bottom: 24px;
      }
      .unlock-form { margin: 0; }
      .unlock-cta {
        width: 100%;
        background: var(--teal); color: #fff;
        font-family: 'Nunito', sans-serif;
        font-weight: 900; font-size: 15px;
        letter-spacing: .06em; text-transform: uppercase;
        padding: 16px 24px; border-radius: 100px;
        border: none; cursor: pointer;
        transition: background .15s, transform .15s;
      }
      .unlock-cta:hover { background: var(--teal-dk); transform: translateY(-1px); }
      .unlock-stub-note {
        font-size: 12px; color: rgba(255,255,255,.55);
        font-style: italic; margin-top: 14px; line-height: 1.5;
      }

      .unlock-included {
        background: #fff; border: 1px solid var(--border);
        border-radius: 14px; padding: 28px;
        margin-bottom: 28px;
      }
      .unlock-included-title {
        font-family: 'Nunito', sans-serif;
        font-size: 16px; font-weight: 800; color: var(--navy);
        margin: 0 0 16px;
      }
      .unlock-included-list {
        list-style: none; padding: 0; margin: 0;
        display: grid; grid-template-columns: 1fr; gap: 10px;
        font-size: 14px; color: var(--body); line-height: 1.5;
      }

      .unlock-back {
        text-align: center; font-size: 13px;
      }
      .unlock-back a { color: var(--muted); font-weight: 600; }
      .unlock-back a:hover { color: var(--navy); }

      @media (max-width: 640px) {
        .unlock-title { font-size: 28px; }
        .unlock-price-value { height: 44px; }
        .unlock-price-track span { height: 44px; line-height: 44px; font-size: 40px; }
        @keyframes unlockPriceRotate {
          0%, 18%   { transform: translateY(0); }
          25%, 43%  { transform: translateY(-44px); }
          50%, 68%  { transform: translateY(-88px); }
          75%, 100% { transform: translateY(-132px); }
        }
      }
    `}</style>
  )
}
