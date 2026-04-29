import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Link from 'next/link'
import '../legal.css'

export const metadata: Metadata = {
  title: 'Privacy Policy | Nanasays',
  description: 'How Nanasays collects, uses, and protects your personal data.',
  robots: { index: false },
}

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <div className="legal-page">
        <div className="legal-hero">
          <h1>Privacy Policy</h1>
          <p className="legal-hero-meta">Last updated: April 2026 · Applies to nanasays.com</p>
        </div>
        <div className="legal-body">

          <div className="legal-highlight">
            <p><strong>Short version:</strong> We collect your email address to create your account, and payment details are handled entirely by Stripe — we never see your card number. We use your data to run the service and nothing else. You can ask us to delete your account at any time.</p>
          </div>

          <h2>1. Who we are</h2>
          <p>Nanasays (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates nanasays.com, a UK independent schools research platform. For GDPR purposes we are the data controller. Contact: <a href="mailto:privacy@nanasays.com">privacy@nanasays.com</a>.</p>

          <h2>2. What data we collect</h2>
          <ul>
            <li><strong>Account data:</strong> your email address, collected when you sign up or log in via magic link.</li>
            <li><strong>Onboarding preferences:</strong> optional details you provide about your child (age range, boarding preference, sports interest) — used only to personalise Nana&apos;s responses.</li>
            <li><strong>Purchase data:</strong> whether you have made a purchase and the date. We store only a Stripe customer ID — your payment card details are processed and stored by Stripe, never by us.</li>
            <li><strong>Usage data:</strong> questions you ask Nana, schools you shortlist, visit notes you write, and which report pages you view. Stored in our database linked to your account.</li>
            <li><strong>Cookies:</strong> a session cookie set by Supabase to keep you logged in. An analytics cookie (Google Analytics 4) set only after you accept cookies.</li>
          </ul>

          <h2>3. Why we collect it (lawful basis)</h2>
          <ul>
            <li><strong>Contract performance:</strong> account data and purchase records are necessary to deliver the service you paid for.</li>
            <li><strong>Legitimate interests:</strong> usage data helps us improve the product. We balance this against your right to privacy — we do not share or sell usage data.</li>
            <li><strong>Consent:</strong> analytics cookies are only set after you accept. You can withdraw consent by clearing cookies or using the &quot;Manage cookies&quot; link in the footer.</li>
          </ul>

          <h2>4. Who we share data with</h2>
          <p>We use the following sub-processors. We have data processing agreements with each:</p>
          <ul>
            <li><strong>Supabase</strong> (database and authentication) — EU-hosted, SOC 2 Type II certified.</li>
            <li><strong>Stripe</strong> (payment processing) — PCI DSS Level 1 certified. Stripe processes and stores all payment card data.</li>
            <li><strong>Resend</strong> (transactional email) — used to send sign-in links and purchase confirmations.</li>
            <li><strong>Google Analytics 4</strong> (analytics) — only active after consent. IP anonymisation enabled.</li>
            <li><strong>Vercel</strong> (hosting) — processes request logs. Logs retained for 30 days.</li>
          </ul>
          <p>We do not sell, rent, or trade your personal data with any third party for marketing purposes.</p>

          <h2>5. How long we keep your data</h2>
          <ul>
            <li>Account and purchase records: retained for 3 years after your last login, or until you request deletion.</li>
            <li>Usage data (Nana conversations, visit notes): retained for 3 years, or until deletion request.</li>
            <li>Analytics data: retained per Google&apos;s default 26-month rolling window.</li>
          </ul>

          <h2>6. Your rights</h2>
          <p>Under UK GDPR you have the right to: access the data we hold about you, correct inaccurate data, request deletion (&quot;right to be forgotten&quot;), object to processing, and request a portable copy of your data.</p>
          <p>To exercise any of these rights, email <a href="mailto:privacy@nanasays.com">privacy@nanasays.com</a>. We will respond within 30 days. You also have the right to lodge a complaint with the ICO at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.</p>

          <h2>7. Cookies</h2>
          <ul>
            <li><strong>sb-auth-token</strong> — Supabase session cookie. Essential for login. Duration: session / 1 week.</li>
            <li><strong>nanasays-consent</strong> — stores your cookie consent choice. Duration: 1 year.</li>
            <li><strong>_ga, _ga_*</strong> — Google Analytics. Set only after consent. Duration: 26 months.</li>
          </ul>

          <h2>8. Children</h2>
          <p>Nanasays is a service for parents and is not directed at children under 13. We do not knowingly collect data from children.</p>

          <h2>9. Changes to this policy</h2>
          <p>We may update this policy as the service evolves. Material changes will be notified by email to registered users. The &quot;Last updated&quot; date at the top of this page always reflects the current version.</p>

          <h2>10. Contact</h2>
          <p>Questions about this policy: <a href="mailto:privacy@nanasays.com">privacy@nanasays.com</a>. Postal address available on request.</p>

          <p style={{ marginTop: 40, fontSize: 13, color: 'var(--muted)' }}>
            See also: <Link href="/terms">Terms of Service</Link>
          </p>

        </div>
      </div>
      <Footer />
    </>
  )
}
