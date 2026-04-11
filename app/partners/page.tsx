import PartnerNav from '@/components/PartnerNav'
import Footer from '@/components/Footer'
import PartnerContactForm from '@/components/PartnerContactForm'
import type { Metadata } from 'next'
import { getTotalSchoolCount } from '@/lib/schools'

export const metadata: Metadata = {
  title: 'Partner with NanaSays — Reach International Families',
  description: 'List your school on NanaSays and connect with families actively searching for the right international school. Verified data, real parent traffic.',
}

const TIERS = [
  {
    name: 'Starter',
    price: 'Free',
    billing: 'Free forever',
    highlight: false,
    features: [
      '1 admin user',
      'Basic school profile',
      'Starter dashboard with data previews',
      'Visible in search results',
    ],
    cta: 'Claim your school',
    ctaHref: '/claim',
  },
  {
    name: 'Partner',
    price: '£5,000',
    billing: 'per year',
    highlight: true,
    badge: 'Most popular',
    features: [
      'Editable school profile',
      'Priority placement in search results',
      'Access to parent enquiries',
      'Real-time dashboard metrics',
      'Competitor insights',
      'Content Booster (24+ month plans)',
    ],
    cta: 'Claim your school',
    ctaHref: '/claim',
  },
  {
    name: 'Partner Plus',
    price: '£7,500',
    billing: 'per year',
    highlight: false,
    badge: 'Coming soon',
    features: [
      'Everything in Partner, plus:',
      'Parent champions programme',
      'Managed profile updates',
      'Concierge support',
      'AI training on school data',
      'Premium Custom Booster package',
    ],
    cta: 'Join waitlist',
    ctaHref: '#contact',
  },
]

const BENEFITS = [
  {
    title: 'Reach best-fit families',
    desc: 'Parents with clear needs and intent, matched to schools aligned with what they are looking for — not random traffic.',
  },
  {
    title: 'Stand out from the crowd',
    desc: "A verified profile that highlights your school's approach, strengths, and character — not just a listing.",
  },
  {
    title: 'Engage parents across their journey',
    desc: 'Track website visits, prospectus downloads, open day sign-ups, and direct enquiries in one place.',
  },
  {
    title: 'See what is working and why',
    desc: 'Built-in insights and ROI calculator showing marketing performance and how you compare to competitor schools.',
  },
]

const BOOSTERS = [
  {
    name: 'Basic Booster',
    commitment: '24-month commitment',
    items: ['1 strategy session', '1 blog post', '1 webinar invitation', 'Social syndication', 'AI profile optimisation'],
  },
  {
    name: 'Enhanced Booster',
    commitment: '36+ month commitment',
    items: ['1 strategy session', '2 blog posts', '2 webinar invitations', 'Social syndication', 'AI profile optimisation'],
  },
  {
    name: 'Custom Booster',
    commitment: 'From £1,000',
    items: ['Bespoke blog content', 'Webinar episodes', 'Testimonial videos', 'Podcast features', 'Fully à la carte'],
  },
]

const TESTIMONIALS = [
  {
    text: 'For the very reasonable cost of joining NanaSays, schools quite simply cannot afford not to participate — it is less than the value of one enrolment.',
    author: 'Matt Hall',
    role: 'Admissions Director, Singapore',
  },
  {
    text: 'We found three schools through NanaSays that we never would have found otherwise. The data quality made the shortlisting process so much faster.',
    author: 'Claire S.',
    role: 'Parent, relocating France → Singapore',
  },
  {
    text: 'I was overwhelmed by options across Southeast Asia. NanaSays gave us a clear picture of what each school is actually like day to day — not just the brochure version.',
    author: 'Natalie C.',
    role: 'Parent, relocating Australia → Thailand',
  },
]

const INSIGHTS = [
  {
    label: 'Admissions Strategy',
    title: 'How international families research schools in 2025',
    desc: 'The search journey has changed. Parents now compare 12+ schools across multiple countries before making first contact. Here is what that means for your admissions team.',
  },
  {
    label: 'Data & Benchmarking',
    title: 'What fee transparency actually does to enquiry quality',
    desc: 'Schools that publish full fee breakdowns receive fewer but far better-qualified enquiries. The data from our growing directory of listed schools tells a clear story.',
  },
  {
    label: 'Partner Success',
    title: 'From listing to enrolment: a partner case study',
    desc: 'How one Southeast Asia school converted NanaSays traffic into 14 qualified enquiries and 3 confirmed enrolments in their first term as a Partner.',
  },
]

export default async function PartnersPage() {
  const totalSchools = await getTotalSchoolCount()
  const schoolCount = `${totalSchools.toLocaleString()}+`
  return (
    <>
      <PartnerNav />

      {/* HERO */}
      <div className="ns-pp-hero-pad" style={{
        marginTop: 64,
        background: 'linear-gradient(135deg, var(--navy) 0%, #1a3557 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -80, right: -80, width: 400, height: 400,
          borderRadius: '50%', background: 'rgba(52,195,160,0.06)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -120, left: '30%', width: 300, height: 300,
          borderRadius: '50%', background: 'rgba(52,195,160,0.04)', pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <div style={{
            display: 'inline-block', background: 'rgba(52,195,160,0.15)', border: '1px solid rgba(52,195,160,0.3)',
            color: 'var(--teal)', fontSize: 11, letterSpacing: '0.12em',
            textTransform: 'uppercase', padding: '5px 16px', borderRadius: 100, marginBottom: 24,
          }}>
            For Schools
          </div>
          <h1 style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, color: '#fff',
            letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 24,
          }}>
            Stand out with <span style={{ color: 'var(--teal)' }}>best-fit families</span>
          </h1>
          <p style={{
            fontSize: 18, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7,
            maxWidth: 600, margin: '0 auto 40px',
          }}>
            NanaSays connects international schools with families actively searching for the right fit — with verified data, real traffic, and tools that work.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="?interest=chat#contact"
              style={{
                padding: '14px 32px', borderRadius: 9, fontSize: 14, fontWeight: 800,
                background: 'var(--teal)', color: '#fff', textDecoration: 'none',
                fontFamily: 'var(--font-nunito), Nunito, sans-serif', letterSpacing: '0.04em',
              }}
            >
              {"Let's chat"}
            </a>
            <a
              href="/claim"
              style={{
                padding: '14px 32px', borderRadius: 9, fontSize: 14, fontWeight: 800,
                background: '#fff', color: 'var(--navy)', textDecoration: 'none',
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
              }}
            >
              Claim your school
            </a>
            <a
              href="?interest=demo#contact"
              style={{
                padding: '14px 32px', borderRadius: 9, fontSize: 14, fontWeight: 700,
                background: 'rgba(255,255,255,0.08)', color: '#fff', textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              View demo
            </a>
            <a
              href="#pricing"
              style={{
                padding: '14px 32px', borderRadius: 9, fontSize: 14, fontWeight: 700,
                background: 'transparent', color: '#fff', textDecoration: 'underline',
                textUnderlineOffset: '3px', opacity: 0.75,
              }}
            >
              See pricing
            </a>
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div id="how-it-works" style={{ background: '#fff', padding: '88px 5%', scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>
              How NanaSays works
            </div>
            <h2 style={{
              fontFamily: 'var(--font-nunito), Nunito, sans-serif',
              fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 900,
              color: 'var(--navy)', letterSpacing: '-0.02em', lineHeight: 1.2,
            }}>
              Built for schools that take admissions seriously
            </h2>
          </div>

          <div className="ns-pp-how-grid">
            {BENEFITS.map((b, i) => (
              <div key={i} style={{
                background: 'var(--off)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '28px 30px',
                display: 'flex', gap: 20, alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, background: 'var(--teal-bg)',
                  border: '1px solid rgba(52,195,160,0.3)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--teal-dk)', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', marginBottom: 8, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                    {b.title}
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
                    {b.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Testimonials sit within this section */}
          <div style={{ marginTop: 64, borderTop: '1px solid var(--border)', paddingTop: 64 }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>
                What they say
              </div>
              <h3 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 900,
                color: 'var(--navy)', letterSpacing: '-0.02em',
              }}>
                Trusted by schools and families worldwide
              </h3>
            </div>
            <div className="ns-pp-test-grid">
              {TESTIMONIALS.map((t, i) => (
                <div key={i} style={{
                  background: 'var(--off)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '24px 26px',
                }}>
                  <div style={{ fontSize: 32, color: 'var(--teal)', lineHeight: 1, marginBottom: 12, fontFamily: 'Georgia, serif' }}>&ldquo;</div>
                  <p style={{ fontSize: 14, color: 'var(--body)', lineHeight: 1.75, margin: '0 0 20px', fontStyle: 'italic' }}>
                    {t.text}
                  </p>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{t.author}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t.role}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PRICING */}
      <div id="pricing" style={{ background: 'var(--off)', padding: '88px 5%', borderTop: '1px solid var(--border)', scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>
              Pricing
            </div>
            <h2 style={{
              fontFamily: 'var(--font-nunito), Nunito, sans-serif',
              fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 900,
              color: 'var(--navy)', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 12,
            }}>
              Simple, transparent pricing
            </h2>
            <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.65 }}>
              No hidden fees. No surprises. Start free and upgrade when you&apos;re ready.
            </p>
          </div>

          <div className="ns-pp-pricing-grid">
            {TIERS.map((tier, i) => (
              <div key={i} style={{
                background: tier.highlight ? 'var(--navy)' : '#fff',
                border: `2px solid ${tier.highlight ? 'var(--navy)' : 'var(--border)'}`,
                borderRadius: 16, padding: '32px 28px',
                position: 'relative',
                boxShadow: tier.highlight ? '0 8px 40px rgba(27,50,82,0.22)' : '0 1px 8px var(--shadow)',
              }}>
                {tier.badge && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    background: tier.highlight ? 'var(--teal)' : '#fff',
                    border: `1px solid ${tier.highlight ? 'var(--teal)' : 'var(--border)'}`,
                    color: tier.highlight ? '#fff' : 'var(--muted)',
                    fontSize: 10, fontWeight: 800, padding: '3px 12px', borderRadius: 100,
                    textTransform: 'uppercase' as const, letterSpacing: '0.08em', whiteSpace: 'nowrap' as const,
                  }}>
                    {tier.badge}
                  </div>
                )}

                <div style={{
                  fontSize: 12, fontWeight: 800, textTransform: 'uppercase' as const,
                  letterSpacing: '0.12em', color: tier.highlight ? 'var(--teal)' : 'var(--teal-dk)',
                  marginBottom: 12,
                }}>
                  {tier.name}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <span style={{
                    fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                    fontSize: 40, fontWeight: 900,
                    color: tier.highlight ? '#fff' : 'var(--navy)',
                    letterSpacing: '-0.02em',
                  }}>
                    {tier.price}
                  </span>
                  <span style={{ fontSize: 13, color: tier.highlight ? 'rgba(255,255,255,0.5)' : 'var(--muted)', marginLeft: 6 }}>
                    {tier.billing}
                  </span>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px' }}>
                  {tier.features.map((f, j) => (
                    <li key={j} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      fontSize: 13, color: tier.highlight ? 'rgba(255,255,255,0.8)' : 'var(--body)',
                      padding: '7px 0', borderBottom: `1px solid ${tier.highlight ? 'rgba(255,255,255,0.08)' : 'var(--border)'}`,
                      lineHeight: 1.5,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tier.highlight ? 'var(--teal)' : 'var(--teal-dk)'} strokeWidth="3" style={{ flexShrink: 0, marginTop: 2 }}>
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href={tier.ctaHref}
                  style={{
                    display: 'block', textAlign: 'center', padding: '13px 20px',
                    borderRadius: 9, fontSize: 13, fontWeight: 800, textDecoration: 'none',
                    fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                    background: tier.highlight ? 'var(--teal)' : 'transparent',
                    color: tier.highlight ? '#fff' : 'var(--navy)',
                    border: tier.highlight ? 'none' : '2px solid var(--navy)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>

          {/* Content Boosters — lives within Pricing section */}
          <div className="ns-pp-booster-inner">
            <div style={{ textAlign: 'center', marginBottom: 44 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>
                Content Booster
              </div>
              <h3 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 'clamp(20px, 2vw, 28px)', fontWeight: 900,
                color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 10,
              }}>
                Amplify your school&apos;s story
              </h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, maxWidth: 480, margin: '0 auto' }}>
                Editorial packages that build awareness and bring your school to life for families who are comparing.
              </p>
            </div>

            <div className="ns-pp-booster-grid">
              {BOOSTERS.map((b, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14, padding: '26px 24px',
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase' as const,
                    letterSpacing: '0.1em', marginBottom: 8,
                  }}>
                    {b.commitment}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                    fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 18,
                  }}>
                    {b.name}
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {b.items.map((item, j) => (
                      <li key={j} style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        fontSize: 13, color: 'rgba(255,255,255,0.7)',
                        padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.07)',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* OUR AUDIENCE */}
      <div id="audience" style={{ background: '#fff', padding: '88px 5%', scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="ns-pp-audience-grid">
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>
                Our audience
              </div>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 'clamp(22px, 2.5vw, 32px)', fontWeight: 900,
                color: 'var(--navy)', letterSpacing: '-0.02em', lineHeight: 1.25, marginBottom: 20,
              }}>
                Families who are ready to decide
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 16 }}>
                NanaSays serves international families at the most important decision point of their lives — choosing where their children will be educated. These are not passive browsers.
              </p>
              <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75 }}>
                Our users are relocating families, expats planning their next move, and globally-mobile parents who compare schools across multiple countries before making contact.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { value: schoolCount, label: 'Schools listed' },
                { value: '77', label: 'Countries covered' },
                { value: '9', label: 'Languages supported' },
                { value: 'Free', label: 'For families, always' },
              ].map((stat, i) => (
                <div key={i} style={{
                  background: 'var(--off)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '24px 20px', textAlign: 'center',
                }}>
                  <div style={{
                    fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                    fontSize: 36, fontWeight: 900, color: 'var(--teal-dk)', lineHeight: 1, marginBottom: 6,
                  }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* INSIGHTS & RESOURCES */}
      <div id="insights" style={{ background: 'var(--off)', padding: '88px 5%', borderTop: '1px solid var(--border)', scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>
              Insights & Resources
            </div>
            <h2 style={{
              fontFamily: 'var(--font-nunito), Nunito, sans-serif',
              fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 900,
              color: 'var(--navy)', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 12,
            }}>
              Built for admissions teams
            </h2>
            <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.65, maxWidth: 520, margin: '0 auto' }}>
              Guides, data reports, and case studies to help you understand the modern international family search journey.
            </p>
          </div>

          <div className="ns-pp-insights-grid">
            {INSIGHTS.map((a, i) => (
              <div key={i} style={{
                background: '#fff', border: '1px solid var(--border)',
                borderRadius: 14, overflow: 'hidden',
              }}>
                <div style={{
                  background: 'linear-gradient(135deg, var(--navy) 0%, #1a3557 100%)',
                  height: 6,
                }} />
                <div style={{ padding: '28px 26px' }}>
                  <div style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 800,
                    color: 'var(--teal-dk)', textTransform: 'uppercase' as const,
                    letterSpacing: '0.1em', marginBottom: 12,
                    background: 'var(--teal-bg)', padding: '3px 10px', borderRadius: 100,
                    border: '1px solid rgba(52,195,160,0.3)',
                  }}>
                    {a.label}
                  </div>
                  <h3 style={{
                    fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                    fontSize: 16, fontWeight: 800, color: 'var(--navy)',
                    lineHeight: 1.35, marginBottom: 12,
                  }}>
                    {a.title}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 20px' }}>
                    {a.desc}
                  </p>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12, fontWeight: 700, color: 'var(--muted)',
                    background: 'var(--off)', border: '1px solid var(--border)',
                    padding: '5px 12px', borderRadius: 100,
                  }}>
                    Coming soon
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CONTACT FORM */}
      <div id="contact" className="ns-pp-contact-outer" style={{ background: '#fff', borderTop: '1px solid var(--border)', scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }} className="ns-pp-contact-grid">
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>
              Get in touch
            </div>
            <h2 style={{
              fontFamily: 'var(--font-nunito), Nunito, sans-serif',
              fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 900,
              color: 'var(--navy)', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 16,
            }}>
              Ready to reach the right families?
            </h2>
            <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.75, marginBottom: 32 }}>
              Tell us about your school and what you are looking for. We will be in touch within one working day.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[
                { icon: '→', text: 'Free to list — no commitment required' },
                { icon: '→', text: `Verified directory with ${schoolCount} schools` },
                { icon: '→', text: 'Reach families actively comparing schools' },
                { icon: '→', text: 'Direct access to parent enquiries' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--teal)', fontWeight: 800, fontSize: 16, lineHeight: 1.5 }}>{item.icon}</span>
                  <span style={{ fontSize: 14, color: 'var(--body)', lineHeight: 1.6 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="ns-pp-contact-card">
            <PartnerContactForm />
          </div>
        </div>
      </div>

      <Footer />
    </>
  )
}
