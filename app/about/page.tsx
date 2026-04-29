import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Link from 'next/link'
import './about.css'

export const metadata: Metadata = {
  title: 'Nanasays — The independent school guide parents actually trust',
  description: 'Deep research reports on 140 UK independent schools. Full fees breakdown, ISI inspection history, financial health, safeguarding record, and Nana — your AI school advisor.',
  alternates: { canonical: 'https://nanasays.com/about' },
  openGraph: {
    title: 'Nanasays — The independent school guide parents actually trust',
    description: 'Deep research reports on 140 UK independent schools. Unlock the risk file parents need before making a £15k–£50k/year decision.',
    images: [{ url: 'https://nanasays.com/og-image.jpg', width: 1200, height: 630 }],
  },
}

export const revalidate = 3600

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getSampleSchools() {
  const { data } = await supabase
    .from('schools')
    .select('slug, name, city, boarding, gender_split, age_min, age_max')
    .eq('country', 'United Kingdom')
    .in('slug', ['wycombe-abbey', 'eton-college', 'harrow-school'])
    .order('name')
  return data ?? []
}

function boardingLabel(b: string | null) {
  if (!b) return null
  if (b === 'full') return 'Full boarding'
  if (b === 'weekly') return 'Weekly boarding'
  if (b === 'flexi') return 'Flexi boarding'
  if (b === 'day') return 'Day school'
  return b
}

function genderLabel(g: string | null) {
  if (!g) return null
  if (g === 'boys') return 'Boys'
  if (g === 'girls') return 'Girls'
  if (g === 'co-ed' || g === 'mixed') return 'Co-ed'
  return g
}

export default async function AboutPage() {
  const schools = await getSampleSchools()

  return (
    <>
      <Nav />
      <main>

        {/* ── HERO ── */}
        <section className="lp-hero">
          <div className="lp-hero-kicker">UK Independent Schools · Deep Research</div>
          <h1>The independent school guide<br /><em>parents actually trust</em></h1>
          <p className="lp-hero-sub">
            We dig into the ISI inspection record, charity filings, safeguarding data, and school policies — so you can walk into an open day knowing exactly what questions to ask.
          </p>
          <div className="lp-hero-ctas">
            <Link href="/signup" className="lp-cta-primary">Create free account →</Link>
            <Link href="/schools" className="lp-cta-secondary">Browse 140 schools</Link>
          </div>
          <p className="lp-hero-proof">140 UK independent schools analysed · £39/month · Cancel any time</p>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="lp-how">
          <div className="lp-section-label">How it works</div>
          <h2 className="lp-section-title">Three steps to a decision you can trust</h2>
          <p className="lp-section-sub">Every school gets a full research dossier. The free profile gives you the facts. The unlock gives you the intelligence.</p>
          <div className="lp-steps">
            <div className="lp-step">
              <span className="lp-step-num">STEP 01</span>
              <span className="lp-step-icon">🔍</span>
              <h3>Browse the directory</h3>
              <p>Search 140 UK independent schools by boarding type, sport, location, or fees range. Every school profile is free to read.</p>
            </div>
            <div className="lp-step">
              <span className="lp-step-num">STEP 02</span>
              <span className="lp-step-icon">📄</span>
              <h3>Read the deep report</h3>
              <p>Unlock the full dossier — ISI inspection quotes, charity Commission financials, safeguarding record, policy transparency ratings, and parent-fit verdict.</p>
            </div>
            <div className="lp-step">
              <span className="lp-step-num">STEP 03</span>
              <span className="lp-step-icon">💬</span>
              <h3>Chat with Nana</h3>
              <p>Ask Nana anything about the school. She reads the full research file and answers in plain English — with citations to the source.</p>
            </div>
          </div>
        </section>

        {/* ── SAMPLE SCHOOLS ── */}
        <section className="lp-schools">
          <div className="lp-section-label">140 schools covered</div>
          <h2 className="lp-section-title">From Eton to Wycombe Abbey and beyond</h2>
          <p className="lp-section-sub" style={{ marginBottom: 40 }}>
            Every school in the directory has been individually researched. Free profile for all. Full risk file unlocked with a monthly subscription.
          </p>
          <div className="lp-school-grid">
            {schools.map(s => (
              <Link key={s.slug} href={`/schools/${s.slug}`} className="lp-school-card">
                <div className="lp-school-name">{s.name}</div>
                <div className="lp-school-meta">{s.city}</div>
                <div className="lp-school-tags">
                  {genderLabel(s.gender_split) && <span className="lp-school-tag">{genderLabel(s.gender_split)}</span>}
                  {boardingLabel(s.boarding) && <span className="lp-school-tag">{boardingLabel(s.boarding)}</span>}
                  {s.age_min != null && s.age_max != null && (
                    <span className="lp-school-tag">Ages {s.age_min}–{s.age_max}</span>
                  )}
                </div>
                <div className="lp-school-cta">View profile →</div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── PRICING ── */}
        <section className="lp-pricing">
          <div className="lp-section-label">Pricing</div>
          <h2 className="lp-section-title">£39/month. Every school.</h2>
          <p className="lp-section-sub">
            You&apos;re making a £15,000–£50,000 per year decision. The research should cost less than a school application fee.
          </p>
          <div className="lp-price-card">
            <div className="lp-price-amount"><sup>£</sup>39<span style={{ fontSize: 22, fontWeight: 600 }}>/mo</span></div>
            <div className="lp-price-note">Cancel any time · All 140 schools · New schools included</div>
            <ul className="lp-feature-list">
              <li>Full fees breakdown — day, boarding, year-by-year</li>
              <li>ISI inspection quotes and full history</li>
              <li>Charity Commission financial health (3–5 year trend)</li>
              <li>Safeguarding record and regulatory status</li>
              <li>Policy transparency ratings from 30–50 policy docs</li>
              <li>Parent-fit verdict and school-specific tour questions</li>
              <li>Deep sports data — rankings, alumni, cup results</li>
              <li>Nana AI chat across all 140 schools</li>
              <li>Shortlist + comparison tools</li>
            </ul>
            <Link href="/unlock" className="lp-pricing-cta">Unlock access →</Link>
            <p className="lp-pricing-fine">Free school profiles available without payment. Cancel subscription any time.</p>
          </div>
        </section>

      </main>
      <Footer />
    </>
  )
}
