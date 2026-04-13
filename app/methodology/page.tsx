import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How NanaSays Verifies School Data | Methodology',
  description: 'NanaSays collects and verifies international school data from official school websites, government registries, and the IBO database. Learn how our data is sourced, verified, and kept current.',
}

export default function MethodologyPage() {
  return (
    <>
      <Nav />
      <main>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '80px 5% 88px' }}>

          <div style={{ marginBottom: 8 }}>
            <Link href="/about" style={{ fontSize: 13, color: 'var(--teal-dk)', textDecoration: 'none', fontWeight: 600 }}>
              About NanaSays
            </Link>
            <span style={{ fontSize: 13, color: 'var(--muted)', margin: '0 8px' }}>→</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Methodology</span>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            fontSize: 'clamp(28px, 4vw, 42px)',
            fontWeight: 900, color: 'var(--navy)',
            letterSpacing: '-0.5px', lineHeight: 1.12,
            marginBottom: 20, marginTop: 24,
          }}>
            How NanaSays Verifies School Data
          </h1>

          <p style={{ fontSize: 16, color: 'var(--body)', lineHeight: 1.8, marginBottom: 40, fontWeight: 300 }}>
            Every school profile on NanaSays is built from data we collect directly — not from paid submissions or third-party aggregators. Here is exactly how that works.
          </p>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 40 }}>

            <section style={{ marginBottom: 44 }}>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 22, fontWeight: 900, color: 'var(--navy)',
                letterSpacing: '-0.3px', marginBottom: 16,
              }}>
                Where the data comes from
              </h2>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8, marginBottom: 14 }}>
                NanaSays maintains a crawler that visits official school websites and extracts structured data — fees, curriculum, contact details, age ranges, boarding availability, and more. We cross-reference this against three authoritative sources:
              </p>
              <ul style={{ paddingLeft: 20, margin: '0 0 14px' }}>
                <li style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8, marginBottom: 8 }}>
                  <strong>IBO database</strong> — the International Baccalaureate Organisation&apos;s official register of authorised IB schools worldwide
                </li>
                <li style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8, marginBottom: 8 }}>
                  <strong>Government education registries</strong> — national and regional databases of licensed private schools, where publicly available
                </li>
                <li style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8 }}>
                  <strong>Official school websites</strong> — the primary source for fees, admissions deadlines, curriculum details, and contact information
                </li>
              </ul>
            </section>

            <section style={{ marginBottom: 44 }}>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 22, fontWeight: 900, color: 'var(--navy)',
                letterSpacing: '-0.3px', marginBottom: 16,
              }}>
                What &ldquo;verified&rdquo; means
              </h2>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8, marginBottom: 14 }}>
                A school profile is marked as verified when our system has confirmed at minimum: the school name, country, city, a working website URL, and at least one data point from either fees or curriculum. Profiles that do not meet this threshold are excluded from search results and not indexed by search engines.
              </p>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8 }}>
                Our quality scoring system rates each school on 15 fields. Schools scoring below 4 out of 15 are set to noindex and do not appear in the directory until more data is collected.
              </p>
            </section>

            <section style={{ marginBottom: 44 }}>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 22, fontWeight: 900, color: 'var(--navy)',
                letterSpacing: '-0.3px', marginBottom: 16,
              }}>
                How often data is updated
              </h2>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8, marginBottom: 14 }}>
                Our enrichment crawler runs continuously against school websites. Fee data and admissions information are re-verified at least once per academic year. Images (logos, hero images, gallery photos) are refreshed separately and validated against each school&apos;s current website.
              </p>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8 }}>
                Schools that claim their profile through our partner programme can update their own data directly — these updates are applied within one business day and flagged as school-verified.
              </p>
            </section>

            <section style={{ marginBottom: 44 }}>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 22, fontWeight: 900, color: 'var(--navy)',
                letterSpacing: '-0.3px', marginBottom: 16,
              }}>
                How schools can claim or correct their profile
              </h2>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8, marginBottom: 14 }}>
                If you represent a school and find incorrect data, you can claim your profile at{' '}
                <Link href="/claim" style={{ color: 'var(--teal-dk)', fontWeight: 600, textDecoration: 'none' }}>
                  nanasays.school/claim
                </Link>
                . Verified schools can update fees, curriculum, images, contact information, and admissions details directly.
              </p>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8 }}>
                For urgent corrections — particularly if a school has closed or if fees shown are significantly out of date — contact us directly. We aim to process correction requests within 48 hours.
              </p>
            </section>

            <section>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 22, fontWeight: 900, color: 'var(--navy)',
                letterSpacing: '-0.3px', marginBottom: 16,
              }}>
                A note on fee accuracy
              </h2>
              <p style={{ fontSize: 15, color: 'var(--body)', lineHeight: 1.8 }}>
                Tuition fees shown on NanaSays are sourced from official school websites and are displayed in the currency originally published by the school. USD equivalents are calculated using exchange rates updated periodically. Fees change annually — always confirm current fees directly with the school before making enrolment decisions. NanaSays is not responsible for discrepancies between displayed and current fees.
              </p>
            </section>

          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
