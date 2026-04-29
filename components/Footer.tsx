import Link from 'next/link'
import './footer.css'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">

        <div className="site-footer-brand">
          <div className="site-footer-wordmark">
            nana<span>says</span>
          </div>
          <p className="site-footer-tagline">UK Independent School Research</p>
          <p className="site-footer-copy">
            © {new Date().getFullYear()} Nanasays Ltd. All rights reserved.
          </p>
        </div>

        <div className="site-footer-links">
          <div className="site-footer-col">
            <span className="site-footer-col-head">Research</span>
            <Link href="/schools">Browse Schools</Link>
            <Link href="/about">How it works</Link>
            <Link href="/methodology">Methodology</Link>
          </div>
          <div className="site-footer-col">
            <span className="site-footer-col-head">Account</span>
            <Link href="/my-reports">My Reports</Link>
            <Link href="/unlock">Unlock access</Link>
            <Link href="/signup">Sign up free</Link>
          </div>
          <div className="site-footer-col">
            <span className="site-footer-col-head">Legal</span>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of service</Link>
            <a href="mailto:support@nanasays.com">Contact us</a>
            <Link href="/portal">School portal</Link>
          </div>
        </div>

      </div>
      <div className="site-footer-bar">
        School data is independently researched from public sources. Verify all details directly with schools before applying.
      </div>
    </footer>
  )
}
