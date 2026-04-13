import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Link from 'next/link'
import { getTotalSchoolCount, getCountrySchoolCounts } from '@/lib/schools'

export const metadata: Metadata = {
  title: 'About NanaSays | International School Directory',
  description: 'Independent international school directory for expat families. Compare fees, curriculum and boarding across 10,000+ verified schools in 100+ countries.',
  alternates: { canonical: 'https://nanasays.school/about' },
  openGraph: {
    title: 'About NanaSays | International School Directory',
    description: 'Independent international school directory for expat families. Compare fees, curriculum and boarding across 10,000+ verified schools in 100+ countries.',
    images: [{ url: 'https://nanasays.school/og-image.jpg', width: 1200, height: 630 }],
  },
}

export const revalidate = 3600

export default async function AboutPage() {
  const [totalSchools, countryCounts] = await Promise.all([
    getTotalSchoolCount(),
    getCountrySchoolCounts(),
  ])
  const totalCountries = Object.keys(countryCounts).length

  return (
    <>
      <Nav />
      <main>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '80px 5% 88px' }}>

          <h1 style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            fontSize: 'clamp(28px, 4vw, 42px)',
            fontWeight: 900, color: 'var(--navy)',
            letterSpacing: '-0.5px', lineHeight: 1.12,
            marginBottom: 20,
          }}>
            About NanaSays
          </h1>

          <p style={{ fontSize: 16, color: 'var(--body)', lineHeight: 1.8, marginBottom: 32, fontWeight: 300 }}>
            NanaSays is an independent international school directory built for families relocating abroad. We exist to make one of the most important decisions in a family&apos;s relocation — choosing the right school — easier, more transparent, and less stressful.
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
            marginBottom: 48,
          }}>
            {[
              { value: `${totalSchools.toLocaleString()}+`, label: 'Schools listed' },
              { value: `${totalCountries}+`, label: 'Countries covered' },
              { value: 'Free', label: 'For families, always' },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'var(--off)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '20px 16px', textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                  fontSize: 28, fontWeight: 900, color: 'var(--teal-dk)', lineHeight: 1, marginBottom: 6,
                }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 40 }}>

            <section style={{ marginBottom: 44 }}>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 22, fontWeight: 900, color: 'var(--navy)',
                letterSpacing: '-0.3px', marginBottom: 16,
              }}>
                Who we serve
              </h2>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8 }}>
                NanaSays is built for internationally mobile families — expat parents relocating for work, families moving between countries, and parents researching schools before a move. Our directory covers international schools across Southeast Asia, Europe, the Middle East, East Asia, and beyond. The majority of our users are comparing schools across multiple countries before making first contact with a school.
              </p>
            </section>

            <section style={{ marginBottom: 44 }}>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 22, fontWeight: 900, color: 'var(--navy)',
                letterSpacing: '-0.3px', marginBottom: 16,
              }}>
                What we offer
              </h2>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8, marginBottom: 14 }}>
                Each school profile includes: fee ranges in local and USD currency, curriculum type, age range, boarding availability, student nationalities, accreditations, admissions timeline, and where available, university placement data. Schools can claim their profile and update their data directly.
              </p>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8 }}>
                Nana, our AI school advisor, can answer specific questions — finding schools that match a budget, curriculum, age range, or location requirement — in plain language.
              </p>
            </section>

            <section style={{ marginBottom: 44 }}>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 22, fontWeight: 900, color: 'var(--navy)',
                letterSpacing: '-0.3px', marginBottom: 16,
              }}>
                Independence and transparency
              </h2>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8 }}>
                NanaSays is independent. Our directory is free for families and always will be. Schools that choose to become partners gain enhanced visibility and direct enquiry routing — but all schools are listed regardless of partner status. Our data collection and quality scoring processes are documented in our{' '}
                <Link href="/methodology" style={{ color: 'var(--teal-dk)', fontWeight: 600, textDecoration: 'none' }}>
                  methodology
                </Link>
                .
              </p>
            </section>

            <section>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 22, fontWeight: 900, color: 'var(--navy)',
                letterSpacing: '-0.3px', marginBottom: 16,
              }}>
                Contact and corrections
              </h2>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8 }}>
                If you represent a school and need to correct or update your listing, visit{' '}
                <Link href="/claim" style={{ color: 'var(--teal-dk)', fontWeight: 600, textDecoration: 'none' }}>
                  nanasays.school/claim
                </Link>
                . For general enquiries, use the contact form on the{' '}
                <Link href="/partners" style={{ color: 'var(--teal-dk)', fontWeight: 600, textDecoration: 'none' }}>
                  partners page
                </Link>
                .
              </p>
            </section>

          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
