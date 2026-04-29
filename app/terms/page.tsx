import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Link from 'next/link'
import '../legal.css'

export const metadata: Metadata = {
  title: 'Terms of Service | Nanasays',
  description: 'Terms governing use of Nanasays deep school research reports.',
  robots: { index: false },
}

export default function TermsPage() {
  return (
    <>
      <Nav />
      <div className="legal-page">
        <div className="legal-hero">
          <h1>Terms of Service</h1>
          <p className="legal-hero-meta">Last updated: April 2026 · Applies to nanasays.com</p>
        </div>
        <div className="legal-body">

          <div className="legal-highlight">
            <p><strong>Short version:</strong> You get a personal, non-transferable licence to read the reports. Don&apos;t scrape, resell, or republish them. The content is research to inform your decision — not professional legal, financial, or educational advice. One-time purchases are non-refundable once the report has been accessed.</p>
          </div>

          <h2>1. Who these terms apply to</h2>
          <p>These Terms of Service (&quot;Terms&quot;) govern your use of nanasays.com (&quot;the Service&quot;), operated by Nanasays (&quot;we&quot;, &quot;us&quot;). By creating an account or accessing any part of the Service, you agree to these Terms.</p>

          <h2>2. The service</h2>
          <p>Nanasays provides deep research reports on UK independent schools, including data sourced from public regulatory filings, school websites, ISI inspection records, and Charity Commission documents. A free school profile is available to all visitors. A one-time payment unlocks full access to all reports and the Nana AI chat feature.</p>

          <h2>3. Access licence</h2>
          <p>On purchase, we grant you a personal, non-exclusive, non-transferable licence to access and read the reports for your own private, non-commercial use in connection with choosing a school for your child.</p>
          <p>You may not:</p>
          <ul>
            <li>Copy, reproduce, or republish report content in any medium.</li>
            <li>Resell, sublicence, or share access with any third party.</li>
            <li>Use automated means (scrapers, bots, crawlers) to extract data from the Service.</li>
            <li>Use the content for commercial purposes, including consultancy or advisory services.</li>
          </ul>

          <h2>4. Payment and access</h2>
          <p>Access is granted via a one-time payment of £39 (or the current price displayed at checkout), processed by Stripe. Payment is in GBP. VAT is not currently charged as we are below the UK VAT registration threshold — this will be updated if our status changes.</p>
          <p>Your access covers all current and future school reports added to the Service for as long as Nanasays operates. We do not charge recurring fees for existing purchasers when new schools are added.</p>

          <h2>5. Refund policy</h2>
          <p>Because the report content is delivered digitally and is immediately accessible on purchase, we are unable to offer refunds once you have accessed the paid content. If you have a technical problem that prevented access, contact <a href="mailto:support@nanasays.com">support@nanasays.com</a> within 7 days of purchase and we will investigate.</p>
          <p>If you have not yet accessed the report (e.g., you purchased in error), contact us within 24 hours and we will issue a full refund at our discretion.</p>

          <h2>6. Content disclaimer</h2>
          <p>Nanasays compiles information from publicly available sources and presents it as research to assist your school selection process. Our reports are not:</p>
          <ul>
            <li>Professional legal, financial, or educational advice.</li>
            <li>A guarantee of any school&apos;s current status, policies, or quality.</li>
            <li>A substitute for your own due diligence, school visits, and direct conversations with schools.</li>
          </ul>
          <p>Data sourced from public filings (Charity Commission, ISI, Companies House) is accurate as of the date retrieved. School policies, fees, and staffing change — always verify directly with the school before making a decision.</p>
          <p>AI-generated content (Nana chat responses, parent-fit verdicts, tour questions) is produced by a large language model and may contain errors. Do not rely on AI-generated content as a sole basis for any decision.</p>

          <h2>7. Intellectual property</h2>
          <p>All original content on Nanasays — including report structure, analysis, writing, and design — is owned by Nanasays and protected by copyright. Data sourced from public bodies (ISI, Charity Commission, Companies House) is used under applicable open data licences and remains the property of those bodies.</p>

          <h2>8. Account termination</h2>
          <p>We may suspend or terminate your account if you breach these Terms, particularly the licence restrictions in Section 3. We will notify you by email before doing so unless the breach is severe (e.g., systematic scraping).</p>
          <p>You may close your account at any time by emailing <a href="mailto:support@nanasays.com">support@nanasays.com</a>. Closing your account does not entitle you to a refund.</p>

          <h2>9. Limitation of liability</h2>
          <p>To the maximum extent permitted by UK law, Nanasays&apos; total liability for any claim arising from use of the Service is limited to the amount you paid for access. We are not liable for indirect, consequential, or incidental losses.</p>

          <h2>10. Governing law</h2>
          <p>These Terms are governed by the laws of England and Wales. Any disputes will be subject to the exclusive jurisdiction of the courts of England and Wales.</p>

          <h2>11. Changes to these terms</h2>
          <p>We may update these Terms as the Service evolves. We will notify existing users by email of material changes at least 14 days before they take effect. Continued use after that date constitutes acceptance.</p>

          <h2>12. Contact</h2>
          <p>Questions about these Terms: <a href="mailto:support@nanasays.com">support@nanasays.com</a>.</p>

          <p style={{ marginTop: 40, fontSize: 13, color: 'var(--muted)' }}>
            See also: <Link href="/privacy">Privacy Policy</Link>
          </p>

        </div>
      </div>
      <Footer />
    </>
  )
}
