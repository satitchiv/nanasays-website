import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import FaqItem from '@/components/school/FaqItem'
import GalleryLightbox from '@/components/school/GalleryLightbox'
import { getSchoolBySlug, getSimilarSchools, formatFees, formatAges } from '@/lib/schools'
import type { School } from '@/lib/types'
import Link from 'next/link'
import { getServerT } from '@/lib/serverI18n'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const school = await getSchoolBySlug(params.slug)
  if (!school) return { title: 'School Not Found' }
  return {
    title: school.name,
    description: school.description ?? `${school.name} — international school in ${school.city ?? school.country}.`,
  }
}

function CheckIcon({ yes }: { yes: boolean }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: yes ? '#e8faf6' : '#fdecea',
      border: `2px solid ${yes ? '#7dd9bf' : '#f5c0bb'}`,
      color: yes ? 'var(--teal-dk)' : '#c0392b',
      fontSize: 15, fontWeight: 700,
    }}>
      {yes ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
      color: 'var(--teal-dk)', marginBottom: 18, paddingBottom: 10,
      borderBottom: '2px solid var(--border)', fontWeight: 800,
      fontFamily: 'var(--font-nunito), Nunito, sans-serif',
    }}>
      {children}
    </div>
  )
}

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ marginBottom: 52, ...style }}>{children}</div>
}

function FacilityItem({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 13, color: 'var(--body)', padding: '9px 14px',
      background: 'var(--off)', borderRadius: 6, border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0, display: 'inline-block' }} />
      {label}
    </div>
  )
}

function SidebarStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '9px 0', borderBottom: '1px solid var(--border)',
      fontSize: 17, gap: 8,
    }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent ? 'var(--teal-dk)' : 'var(--body)', textAlign: 'right', fontSize: 17 }}>
        {value}
      </span>
    </div>
  )
}

function SidebarCard({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{
      background: dark ? 'var(--navy)' : '#fff',
      border: `1px solid ${dark ? 'var(--navy)' : 'var(--border)'}`,
      borderRadius: 10, padding: '20px 22px', marginBottom: 16,
      boxShadow: '0 2px 12px var(--shadow)',
    }}>
      {children}
    </div>
  )
}

function SidebarTitle({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{
      fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em',
      color: dark ? 'rgba(255,255,255,0.4)' : 'var(--muted)',
      marginBottom: 14, fontWeight: 700,
    }}>
      {children}
    </div>
  )
}

export default async function SchoolPage({ params }: Props) {
  const [school, similarSchools] = await Promise.all([
    getSchoolBySlug(params.slug),
    getSchoolBySlug(params.slug).then(s => s ? getSimilarSchools(s) : []),
  ])

  if (!school) notFound()

  const t = getServerT()

  const fees = formatFees(school)
  const ages = formatAges(school)

  const scorecardItems = [
    school.founded_year != null && {
      value: `Est. ${school.founded_year}`,
      label: t('school_label_founded'),
      bar: Math.min(100, Math.round(((school.founded_year - 1800) / 225) * 100)),
    },
    school.student_count != null && {
      value: school.student_count.toLocaleString(),
      label: t('school_label_students'),
      bar: Math.min(100, Math.round((school.student_count / 2000) * 100)),
    },
    school.nationalities_count != null && {
      value: `${school.nationalities_count}+`,
      label: t('school_label_nationalities'),
      bar: Math.min(100, Math.round((school.nationalities_count / 80) * 100)),
    },
    school.student_teacher_ratio != null && {
      value: school.student_teacher_ratio,
      label: t('school_label_ratio'),
      bar: 90,
    },
    school.university_placement_rate != null && {
      value: `${school.university_placement_rate}%`,
      label: t('school_label_uni_placement'),
      bar: school.university_placement_rate,
    },
    school.ib_pass_rate != null && {
      value: `${school.ib_pass_rate}%`,
      label: t('school_label_ib_rate'),
      bar: school.ib_pass_rate,
      benchmark: 'World avg: 81%',
    },
    school.ap_pass_rate != null && {
      value: `${school.ap_pass_rate}%`,
      label: t('school_label_ap_rate'),
      bar: school.ap_pass_rate,
      benchmark: 'World avg: 60%',
    },
  ].filter(Boolean) as { value: string; label: string; bar: number; benchmark?: string }[]

  const boolItems = [
    { label: t('school_bool_boarding'), value: school.boarding },
    { label: t('school_bool_scholarships'), value: school.scholarship_available },
    { label: t('school_bool_eal'), value: school.eal_support },
    { label: t('school_bool_sen'), value: school.sen_support },
    { label: t('school_bool_visa'), value: school.visa_support },
    { label: t('school_bool_rolling'), value: school.rolling_admissions },
  ].filter(item => item.value != null)

  const allFacilities: { group: string; items: string[] }[] = []
  if (school.sports_facilities?.length) allFacilities.push({ group: 'Sports', items: school.sports_facilities })
  if (school.arts_programs?.length) allFacilities.push({ group: 'Arts', items: school.arts_programs })
  if (school.academic_facilities?.length) allFacilities.push({ group: 'Academic', items: school.academic_facilities })
  if (school.extracurriculars?.length) allFacilities.push({ group: 'Co-Curricular', items: school.extracurriculars.slice(0, 8) })

  const faqs = [
    school.curriculum?.includes('IB') && {
      q: `Is ${school.name} a good school for IB?`,
      a: `${school.name} offers the IB Diploma Programme${school.ib_pass_rate ? ` with a ${school.ib_pass_rate}% pass rate` : ''}. ${school.student_teacher_ratio ? `With a ${school.student_teacher_ratio} student-to-teacher ratio, students receive highly personalised support.` : ''}`,
    },
    school.boarding && {
      q: `What are the boarding fees at ${school.name}?`,
      a: `${school.boarding_fees_usd ? `Full boarding fees are approximately $${school.boarding_fees_usd.toLocaleString()} per year.` : fees} ${school.boarding_arrangements ?? ''}`,
    },
    {
      q: `Does ${school.name} require an entrance exam?`,
      a: school.entrance_exam_required
        ? 'An entrance exam is required as part of the admissions process.'
        : `No entrance exam is required. ${school.admissions_process ?? 'Admissions are based on academic records and references.'}`,
    },
    school.distance_airport && {
      q: `How far is ${school.name} from the nearest airport?`,
      a: `${school.distance_airport}. ${school.distance_city ? `It is ${school.distance_city} from the city centre.` : ''}`,
    },
  ].filter(Boolean) as { q: string; a: string }[]

  const mapQuery = school.address
    ? encodeURIComponent(school.address)
    : encodeURIComponent(`${school.name} ${school.city ?? ''} ${school.country ?? ''}`)

  const schoolSchema = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: school.name,
    ...(school.official_website && { url: school.official_website }),
    ...(school.description && { description: school.description }),
    address: {
      '@type': 'PostalAddress',
      addressCountry: school.country,
      ...(school.city && { addressLocality: school.city }),
      ...(school.address && { streetAddress: school.address }),
    },
    ...(school.fees_usd_min && { tuitionCost: `USD ${school.fees_usd_min.toLocaleString()}–${(school.fees_usd_max ?? school.fees_usd_min).toLocaleString()} per year` }),
    ...(school.curriculum?.length && { curriculumsOffered: school.curriculum }),
    ...(school.student_count && { numberOfStudents: { '@type': 'QuantitativeValue', value: school.student_count } }),
    ...(school.founded_year && { foundingDate: String(school.founded_year) }),
    ...(school.contact_email && { email: school.contact_email }),
    ...(school.contact_phone && { telephone: school.contact_phone }),
    ...(school.hero_image && { image: school.hero_image }),
    ...(school.accreditations?.length && { hasCredential: school.accreditations.map((a: string) => ({ '@type': 'EducationalOccupationalCredential', credentialCategory: a })) }),
    ...(school.review_score && school.review_count && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: school.review_score,
        reviewCount: school.review_count,
        bestRating: 5,
      },
    }),
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://nanasays.com' },
      ...(school.country ? [{ '@type': 'ListItem', position: 2, name: school.country, item: `https://nanasays.com/countries/${school.country.toLowerCase().replace(/ /g, '-')}` }] : []),
      { '@type': 'ListItem', position: school.country ? 3 : 2, name: school.name, item: `https://nanasays.com/schools/${school.slug}` },
    ],
  }

  const faqSchema = faqs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  } : null

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schoolSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />}
      <Nav />

      {/* BREADCRUMB */}
      <div style={{
        background: 'var(--off)', padding: '12px 5%',
        borderBottom: '1px solid var(--border)', marginTop: 60,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto', fontSize: 12, color: 'var(--muted)',
          display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <Link href="/" style={{ color: 'var(--blue)' }}>Schools</Link>
          {school.country && <><span>/</span><Link href={`/country/${school.country.toLowerCase().replace(/ /g, '-')}`} style={{ color: 'var(--blue)' }}>{school.country}</Link></>}
          {school.city && <><span>/</span><span>{school.city}</span></>}
          <span>/</span><span style={{ color: 'var(--navy)', fontWeight: 600 }}>{school.name}</span>
        </div>
      </div>

      {/* HERO */}
      <div style={{
        background: 'linear-gradient(135deg, #1B3252 0%, #1e3f6b 100%)',
        ...(school.hero_image ? {
          backgroundImage: `linear-gradient(135deg, rgba(27,50,82,0.88) 0%, rgba(30,63,107,0.82) 100%), url(${school.hero_image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 300' preserveAspectRatio='xMidYMid slice'%3E%3Cpath d='M0,300 Q360,100 720,200 T1440,120' fill='none' stroke='rgba(52,195,160,0.18)' stroke-width='1.2'/%3E%3Cpath d='M0,300 Q300,140 660,230 T1440,160' fill='none' stroke='rgba(255,255,255,0.1)' stroke-width='1'/%3E%3Cpath d='M0,300 Q420,60 780,170 T1440,80' fill='none' stroke='rgba(52,195,160,0.08)' stroke-width='0.8'/%3E%3Cpath d='M0,300 Q480,20 900,140 T1440,40' fill='none' stroke='rgba(255,255,255,0.05)' stroke-width='0.8'/%3E%3C/svg%3E"), linear-gradient(150deg, #0d2040 0%, #1B3252 55%, #1d3d6a 100%)`,
        }),
        color: '#fff', padding: '52px 5% 44px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32 }}>
            <div style={{ flex: 1 }}>
              {/* Badge */}
              <div style={{
                display: 'inline-block',
                background: 'rgba(52,195,160,0.15)', border: '1px solid rgba(52,195,160,0.3)',
                color: 'var(--teal)', fontSize: 11, letterSpacing: '0.1em',
                textTransform: 'uppercase', padding: '4px 14px', borderRadius: 100, marginBottom: 14,
              }}>
                {[school.country, school.region ?? school.city].filter(Boolean).join(' — ')}
              </div>

              {/* School name */}
              <h1 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 900,
                letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 8,
              }}>
                {school.name}
              </h1>

              {/* Location */}
              {school.address && (
                <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  {school.address}
                  {school.distance_city && ` — ${school.distance_city}`}
                </div>
              )}

              {/* Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
                {school.curriculum?.map(c => (
                  <span key={c} style={{
                    fontSize: 12, padding: '5px 13px', borderRadius: 100, fontWeight: 600,
                    background: 'rgba(52,195,160,0.15)', color: 'var(--teal)',
                    border: '1px solid rgba(52,195,160,0.3)',
                  }}>{c}</span>
                ))}
                {school.boarding && (
                  <span style={{
                    fontSize: 12, padding: '5px 13px', borderRadius: 100, fontWeight: 600,
                    background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}>{t('school_section_boarding')}</span>
                )}
                {school.scholarship_available && (
                  <span style={{
                    fontSize: 12, padding: '5px 13px', borderRadius: 100, fontWeight: 600,
                    background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}>Scholarships</span>
                )}
                {school.rolling_admissions && (
                  <span style={{
                    fontSize: 12, padding: '5px 13px', borderRadius: 100, fontWeight: 600,
                    background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}>Rolling Admissions</span>
                )}
              </div>
            </div>

            {/* Right badge */}
            <div style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12, padding: '24px 28px', textAlign: 'center',
              minWidth: 180, flexShrink: 0,
            }}>
              {school.logo_url && (
                <div style={{
                  background: 'var(--navy)', borderRadius: 8, padding: '14px 18px',
                  marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}>
                  <img
                    src={school.logo_url}
                    alt={`${school.name} logo`}
                    style={{ maxWidth: 120, maxHeight: 56, objectFit: 'contain', display: 'block' }}
                  />
                </div>
              )}
              {school.verified_at ? (
                <div style={{
                  fontSize: 13, color: 'var(--teal)',
                  background: 'rgba(52,195,160,0.1)', padding: '10px 16px',
                  borderRadius: 6, border: '1px solid rgba(52,195,160,0.25)',
                  fontWeight: 700,
                }}>
                  {t('school_verified')}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  {t('school_data_source')}
                </div>
              )}
            </div>
          </div>

          {/* Stats bar */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 1, background: 'rgba(255,255,255,0.08)',
            borderRadius: 10, overflow: 'hidden', marginTop: 32,
          }}>
            {[
              { label: t('school_stat_fees'), value: fees, sub: '' },
              school.university_placement_rate != null && { label: t('school_stat_uni_rate'), value: `${school.university_placement_rate}%`, sub: t('school_stat_graduates') },
              (school.age_min != null && school.age_max != null) && { label: t('school_stat_ages'), value: `${school.age_min} – ${school.age_max}`, sub: '' },
              school.student_teacher_ratio && { label: t('school_stat_ratio'), value: school.student_teacher_ratio, sub: t('school_stat_faculty') },
              school.nationalities_count && { label: t('school_stat_nationalities'), value: `${school.nationalities_count}+`, sub: t('school_stat_on_campus') },
            ].filter(Boolean).slice(0, 5).map((stat: any, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.05)', padding: '18px 20px',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>
                  {stat.label}
                </span>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--teal)', lineHeight: 1.2, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                  {stat.value}
                </span>
                {stat.sub && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{stat.sub}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '44px 5%',
        display: 'grid', gridTemplateColumns: '1fr 300px', gap: 52, alignItems: 'start',
      }}>
        <main>
          {/* OPEN DAY BANNER */}
          {school.open_day_text && (
            <div style={{
              background: 'linear-gradient(135deg, var(--navy), #1e3f6b)',
              color: '#fff', borderRadius: 10, padding: '24px 28px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 20, marginBottom: 44,
            }}>
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)', marginBottom: 6 }}>
                  {t('school_open_day')}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{school.open_day_text}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  {t('school_open_day_sub')}
                </div>
              </div>
              {school.official_website && (
                <a
                  href={school.official_website} target="_blank" rel="noopener noreferrer"
                  style={{
                    background: '#fff', color: 'var(--navy)', padding: '11px 24px',
                    borderRadius: 6, fontSize: 13, fontWeight: 700, textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('school_cta_register')}
                </a>
              )}
            </div>
          )}

          {/* MAP */}
          <Section>
            <SectionTitle>{t('school_section_location')}</SectionTitle>
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <iframe
                src={`https://maps.google.com/maps?q=${mapQuery}&output=embed&z=14`}
                width="100%"
                height="280"
                style={{ border: 0, display: 'block' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div style={{
                padding: '14px 18px', background: '#fff',
                borderTop: '1px solid var(--border)',
                fontSize: 15, color: 'var(--muted)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{school.address}</span>
                <a
                  href={`https://maps.google.com/?q=${mapQuery}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}
                >
                  {t('school_cta_maps')}
                </a>
              </div>
            </div>
            {(school.distance_city || school.distance_airport || school.bus_service) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
                {school.distance_airport && <FacilityItem label={school.distance_airport} />}
                {school.distance_city && <FacilityItem label={school.distance_city} />}
                {school.bus_service && <FacilityItem label={t('school_transport_bus')} />}
              </div>
            )}
          </Section>

          {/* GALLERY */}
          {(() => {
            const placeholderLabels = ['Campus', 'Classrooms', 'Boarding', 'Sports', 'Performing Arts']
            const allImages = school.gallery_images ?? []
            const cells = Array.from({ length: 5 }, (_, i) => ({
              imageUrl: allImages[i] ?? null,
              label: placeholderLabels[i],
              gridRow: i === 0 ? '1 / 3' : undefined,
            }))
            return <GalleryLightbox cells={cells} allImages={allImages} schoolName={school.name} />
          })()}

          {/* NANASAYS SCORECARD */}
          {(scorecardItems.length > 0 || boolItems.length > 0) && (
            <Section>
              <SectionTitle>{t('school_section_scorecard')}</SectionTitle>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
              }}>
                {scorecardItems.map((item, i) => (
                  <div key={i} style={{
                    background: 'var(--off)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '18px 16px',
                  }}>
                    <div style={{
                      fontSize: 28, fontWeight: 800, color: 'var(--navy)',
                      lineHeight: 1, marginBottom: 6,
                      fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                    }}>{item.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.4 }}>{item.label}</div>
                    <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${item.bar}%`, background: 'var(--teal)', borderRadius: 3 }} />
                    </div>
                    {item.benchmark && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>{item.benchmark}</div>}
                  </div>
                ))}
                {boolItems.map((item, i) => (
                  <div key={i} style={{
                    background: 'var(--off)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '18px 16px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', textAlign: 'center', gap: 8,
                  }}>
                    <CheckIcon yes={!!item.value} />
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* KEY DETAILS — curricula, accreditations, languages, support */}
          {(school.curriculum?.length || school.accreditations?.length || school.languages?.length ||
            school.eal_support != null || school.sen_support != null || school.sel_support != null || school.bus_service != null) && (
            <Section>
              <SectionTitle>{t('school_section_key_details')}</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>

                {school.curriculum?.length ? (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{t('school_sub_curricula')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {school.curriculum.map(c => (
                        <div key={c} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: 'var(--body)' }}>{c}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--teal-dk)',
                            background: 'var(--teal-bg)', border: '1px solid rgba(52,195,160,.3)',
                            borderRadius: 100, padding: '3px 10px',
                          }}>{t('school_yes')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(school.eal_support != null || school.sen_support != null || school.sel_support != null || school.bus_service != null) ? (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{t('school_sub_support')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { label: t('school_bool_eal'), value: school.eal_support },
                        { label: t('school_bool_sen'), value: school.sen_support },
                        { label: t('school_sub_wellbeing'), value: school.sel_support },
                        { label: t('school_bool_visa'), value: school.visa_support },
                        { label: t('school_bool_bus'), value: school.bus_service },
                      ].filter(item => item.value != null).map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: 'var(--body)' }}>{item.label}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: item.value ? 'var(--teal-dk)' : 'var(--muted)',
                            background: item.value ? 'var(--teal-bg)' : 'var(--off2)',
                            border: `1px solid ${item.value ? 'rgba(52,195,160,.3)' : 'var(--border)'}`,
                            borderRadius: 100, padding: '3px 10px',
                          }}>{item.value ? 'Yes' : 'No'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {school.accreditations?.length ? (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{t('school_sub_accreditations')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {school.accreditations.map(acc => (
                        <span key={acc} style={{
                          background: '#fff', border: '1.5px solid var(--border)',
                          borderRadius: 7, padding: '8px 16px',
                          fontSize: 13, fontWeight: 700, color: 'var(--navy)', letterSpacing: '0.04em',
                        }}>{acc}</span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {school.languages?.length ? (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{t('school_sub_languages')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {school.languages.map(lang => (
                        <span key={lang} style={{
                          background: '#fff', border: '1.5px solid var(--border)',
                          borderRadius: 7, padding: '8px 16px',
                          fontSize: 13, fontWeight: 600, color: 'var(--body)',
                        }}>{lang}</span>
                      ))}
                    </div>
                  </div>
                ) : null}

              </div>
            </Section>
          )}

          {/* SCHOLARSHIPS — full detail when no scholarship_total_usd */}
          {school.scholarship_available && school.scholarship_details && !school.scholarship_total_usd && (
            <Section>
              <SectionTitle>{t('school_section_scholarships')}</SectionTitle>
              <div style={{
                background: 'var(--navy)', borderRadius: 14, padding: '24px 28px',
                color: '#fff',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: 'rgba(52,195,160,.2)',
                    border: '1px solid rgba(52,195,160,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <span style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontWeight: 800, fontSize: 15, color: '#fff' }}>
                    {t('school_scholarship_merit')}
                  </span>
                </div>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,.8)', lineHeight: 1.75, margin: 0 }}>
                  {school.scholarship_details}
                </p>
              </div>
            </Section>
          )}

          {/* ACADEMIC PERFORMANCE */}
          {(school.ap_pass_rate != null || school.ib_pass_rate != null || school.university_placement_rate != null) && (
            <Section>
              <SectionTitle>{t('school_section_academic')}</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
                {school.ap_pass_rate != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.ap_pass_rate}%
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>{t('school_label_ap_rate')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[{ label: school.name, pct: school.ap_pass_rate, school: true }, { label: t('school_label_world_avg'), pct: 60, school: false }].map(row => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                          <span style={{ width: 100, flexShrink: 0, color: 'var(--body)', fontSize: 11 }}>{row.label}</span>
                          <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${row.pct}%`, background: row.school ? 'var(--teal)' : '#b0c8e8', borderRadius: 4 }} />
                          </div>
                          <span style={{ width: 34, textAlign: 'right', fontWeight: 600, color: row.school ? 'var(--navy)' : 'var(--muted)', fontSize: 12 }}>{row.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {school.ib_pass_rate != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.ib_pass_rate}%
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>{t('school_label_ib_rate')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[{ label: school.name, pct: school.ib_pass_rate, school: true }, { label: t('school_label_world_avg'), pct: 81, school: false }].map(row => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <span style={{ width: 100, flexShrink: 0, color: 'var(--body)', fontSize: 11 }}>{row.label}</span>
                          <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${row.pct}%`, background: row.school ? 'var(--teal)' : '#b0c8e8', borderRadius: 4 }} />
                          </div>
                          <span style={{ width: 34, textAlign: 'right', fontWeight: 600, color: row.school ? 'var(--navy)' : 'var(--muted)', fontSize: 12 }}>{row.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {school.university_placement_rate != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.university_placement_rate}%
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>University Placement Rate</div>
                    <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${school.university_placement_rate}%`, background: 'var(--teal)', borderRadius: 4 }} />
                    </div>
                  </div>
                )}
                {school.scholarship_total_usd && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.scholarship_total_usd}
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>Scholarships Awarded</div>
                    <p style={{ fontSize: 13, color: '#556', lineHeight: 1.6 }}>{school.scholarship_details ?? 'Financial assistance and scholarships available.'}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ABOUT */}
          {school.description && (
            <Section>
              <SectionTitle>{t('school_section_about')}</SectionTitle>
              {school.description.split('\n\n').map((para, i) => (
                <p key={i} style={{ color: '#334', marginBottom: 14, fontSize: 16, lineHeight: 1.85 }}>{para}</p>
              ))}
            </Section>
          )}

          {/* WHY CHOOSE */}
          {school.unique_selling_points && (
            <Section>
              <SectionTitle>{t('school_section_why_choose')}</SectionTitle>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {school.unique_selling_points.split('\n').filter(Boolean).map((point, i) => (
                  <li key={i} style={{
                    padding: '11px 0', borderBottom: '1px solid var(--border)',
                    fontSize: 18, color: '#334', display: 'flex',
                    alignItems: 'flex-start', gap: 12, lineHeight: 1.7,
                  }}>
                    <span style={{
                      width: 20, height: 20, background: 'var(--teal-bg)',
                      border: '2px solid var(--teal)', borderRadius: '50%',
                      flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ width: 6, height: 6, background: 'var(--teal)', borderRadius: '50%', display: 'block' }} />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* STRENGTHS */}
          {school.strengths?.length && !school.unique_selling_points && (
            <Section>
              <SectionTitle>{t('school_section_why_choose')}</SectionTitle>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {school.strengths.map((s, i) => (
                  <li key={i} style={{
                    padding: '11px 0', borderBottom: '1px solid var(--border)',
                    fontSize: 18, color: '#334', display: 'flex',
                    alignItems: 'flex-start', gap: 12, lineHeight: 1.7,
                  }}>
                    <span style={{
                      width: 20, height: 20, background: 'var(--teal-bg)',
                      border: '2px solid var(--teal)', borderRadius: '50%',
                      flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ width: 6, height: 6, background: 'var(--teal)', borderRadius: '50%', display: 'block' }} />
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* UNIVERSITY DESTINATIONS */}
          {school.top_universities?.length && (
            <Section>
              <SectionTitle>{t('school_section_uni_destinations')}</SectionTitle>
              {school.university_placement_rate && (
                <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 16 }}>
                  {school.university_placement_rate}% of {school.name} graduates go on to higher education. Recent graduates have been accepted at universities including:
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {school.top_universities.map(uni => (
                  <div key={uni} style={{
                    background: 'var(--off)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: 14, fontSize: 13,
                    fontWeight: 600, color: 'var(--navy)', textAlign: 'center',
                  }}>
                    {uni}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* FEES */}
          {(school.fees_by_grade || school.fees_usd_min) && (
            <Section>
              <SectionTitle>{t('school_section_fees')}</SectionTitle>
              {school.fees_by_grade ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={{
                        textAlign: 'left', fontSize: 11, textTransform: 'uppercase',
                        letterSpacing: '0.08em', color: 'var(--muted)', padding: '10px 12px',
                        background: 'var(--off)', border: '1px solid var(--border)', fontWeight: 600,
                      }}>Grade / Year</th>
                      <th style={{
                        textAlign: 'right', fontSize: 11, textTransform: 'uppercase',
                        letterSpacing: '0.08em', color: 'var(--muted)', padding: '10px 12px',
                        background: 'var(--off)', border: '1px solid var(--border)', fontWeight: 600,
                      }}>Annual Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(school.fees_by_grade as Record<string, string>).map(([grade, fee]) => (
                      <tr key={grade}>
                        <td style={{ padding: '10px 12px', border: '1px solid var(--border)', color: '#334' }}>{grade}</td>
                        <td style={{ padding: '10px 12px', border: '1px solid var(--border)', textAlign: 'right', fontWeight: 600, color: 'var(--navy)' }}>{fee}</td>
                      </tr>
                    ))}
                    {school.boarding_fees_usd && (
                      <tr style={{ background: 'var(--teal-bg)' }}>
                        <td style={{ padding: '10px 12px', border: '1px solid var(--border)', color: '#334', fontWeight: 600 }}>
                          Boarding (Full Year)
                        </td>
                        <td style={{ padding: '10px 12px', border: '1px solid var(--border)', textAlign: 'right', fontWeight: 700, color: 'var(--teal-dk)' }}>
                          ${school.boarding_fees_usd.toLocaleString()}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <div style={{
                  background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20,
                  fontSize: 15, fontWeight: 600, color: 'var(--navy)',
                }}>
                  {fees}
                </div>
              )}
              {school.fees_original && (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
                  Original currency: {school.fees_original}.{' '}
                  {school.application_fee_usd && `Application fee: $${school.application_fee_usd.toLocaleString()}.`}
                </p>
              )}
            </Section>
          )}

          {/* ADMISSIONS */}
          {school.admissions_process && (
            <Section>
              <SectionTitle>{t('school_section_admissions_process')}</SectionTitle>
              <ol style={{ listStyle: 'none', padding: 0 }}>
                {school.admissions_process.split('\n').filter(Boolean).map((step, i) => (
                  <li key={i} style={{
                    display: 'flex', gap: 16, padding: '14px 0',
                    borderBottom: '1px solid var(--border)', fontSize: 14, color: '#334', lineHeight: 1.6,
                  }}>
                    <span style={{
                      width: 28, height: 28, background: 'var(--teal)', color: '#fff',
                      borderRadius: '50%', fontSize: 12, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* ADMISSIONS DETAILS */}
          {(school.application_deadline || school.admission_deposit_usd != null || school.waitlist || school.eal_cost_usd != null) && (
            <Section>
              <SectionTitle>{t('school_section_admissions')}</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {school.application_deadline && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>{t('school_admissions_deadline')}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{school.application_deadline}</div>
                  </div>
                )}
                {school.admission_deposit_usd != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>Admission Deposit</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>${school.admission_deposit_usd.toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>due on acceptance</div>
                  </div>
                )}
                {school.eal_cost_usd != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>EAL Support Cost</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>${school.eal_cost_usd.toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{t('school_fees_per_year_add')}</div>
                  </div>
                )}
                {school.waitlist && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>{t('school_admissions_waitlist_policy')}</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.waitlist}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* BOARDING */}
          {school.boarding && school.boarding_arrangements && (
            <Section>
              <SectionTitle>{t('school_section_boarding')}</SectionTitle>
              {school.boarding_arrangements.split('\n\n').map((para, i) => (
                <p key={i} style={{ color: '#334', marginBottom: 14, fontSize: 16, lineHeight: 1.85 }}>{para}</p>
              ))}
            </Section>
          )}

          {/* SCHOOL DAY */}
          {school.school_day_structure && (
            <Section>
              <SectionTitle>{t('school_section_school_day')}</SectionTitle>
              <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 22 }}>
                <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.school_day_structure}</p>
              </div>
            </Section>
          )}

          {/* STUDENT LIFE */}
          {(school.clubs?.length || school.food_options || school.uniform_requirement || school.house_system) && (
            <Section>
              <SectionTitle>{t('school_section_student_life')}</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {school.house_system && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>House System</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.house_system}</p>
                  </div>
                )}
                {school.uniform_requirement && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Uniform</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.uniform_requirement}</p>
                  </div>
                )}
                {school.food_options && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Food &amp; Dining</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.food_options}</p>
                  </div>
                )}
                {school.clubs?.length ? (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Clubs &amp; Activities</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {school.clubs.map(club => (
                        <span key={club} style={{
                          background: '#fff', border: '1.5px solid var(--border)',
                          borderRadius: 7, padding: '8px 16px',
                          fontSize: 14, fontWeight: 600, color: 'var(--body)',
                        }}>{club}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Section>
          )}

          {/* FACILITIES */}
          {allFacilities.length > 0 && (
            <Section>
              <SectionTitle>{t('school_section_facilities')}</SectionTitle>
              {allFacilities.map(group => (
                <div key={group.group} style={{ marginBottom: 24 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
                  }}>
                    {group.group}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {group.items.map(item => <FacilityItem key={item} label={item} />)}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* WELLBEING & SAFETY */}
          {(school.mental_wellbeing || school.safeguarding) && (
            <Section>
              <SectionTitle>{t('school_section_wellbeing')}</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {school.mental_wellbeing && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Pastoral &amp; Mental Health</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.mental_wellbeing}</p>
                  </div>
                )}
                {school.safeguarding && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Safeguarding &amp; Child Protection</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.safeguarding}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* STUDENT DEMOGRAPHICS */}
          {(school.nationalities_count || school.age_min != null || school.gender_split || school.stages?.length) && (
            <Section>
              <SectionTitle>{t('school_section_demographics')}</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {school.gender_split && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>School Type</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>{school.gender_split}</div>
                  </div>
                )}
                {school.age_min != null && school.age_max != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>Age Range</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.age_min} – {school.age_max}
                    </div>
                    {school.stages && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                        {school.stages.map(stage => (
                          <div key={stage} style={{
                            fontSize: 12, padding: '4px 10px', borderRadius: 4,
                            background: 'var(--teal)', color: '#fff', width: 'fit-content',
                          }}>{stage}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {school.nationalities_count && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>Nationalities</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 8, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.nationalities_count}+
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>countries represented on campus</div>
                  </div>
                )}
                {(school.boarding_capacity || school.international_student_percent) && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>Student Body</div>
                    {school.international_student_percent && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)', color: 'var(--muted)', gap: 8 }}>
                        <span>International</span><span style={{ fontWeight: 600, color: 'var(--body)' }}>{school.international_student_percent}%</span>
                      </div>
                    )}
                    {school.boarding_capacity && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', color: 'var(--muted)', gap: 8 }}>
                        <span>Boarding capacity</span><span style={{ fontWeight: 600, color: 'var(--body)' }}>{school.boarding_capacity}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* CURRICULUM BY STAGE */}
          {school.curriculum_results && (
            <Section>
              <SectionTitle>{t('school_section_curriculum_stage')}</SectionTitle>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: 'var(--navy)', color: '#fff' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, letterSpacing: '0.05em' }}>Stage</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, letterSpacing: '0.05em' }}>Curriculum</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, letterSpacing: '0.05em' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(school.curriculum_results as Record<string, { curriculum: string; notes: string | null; pass_rate: number | null }>).map(([stage, data], i) => (
                      <tr key={stage} style={{ background: i % 2 === 0 ? '#fff' : 'var(--off)' }}>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{stage}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--body)' }}>{data.curriculum}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 }}>{data.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* SCHOOL BACKGROUND */}
          {(school.governance || school.religious_affiliation || school.awards) && (
            <Section>
              <SectionTitle>{t('school_section_background')}</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {school.governance && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Governance &amp; Ownership</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.governance}</p>
                  </div>
                )}
                {school.religious_affiliation && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Religious Affiliation</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.religious_affiliation}</p>
                  </div>
                )}
                {school.awards && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Awards &amp; Recognition</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.awards}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* FAQ */}
          {faqs.length > 0 && (
            <Section>
              <SectionTitle>{t('school_section_faqs')}</SectionTitle>
              {faqs.map((faq, i) => (
                <FaqItem key={i} question={faq.q} answer={faq.a} defaultOpen={i === 0} />
              ))}
            </Section>
          )}

          {/* SIMILAR SCHOOLS */}
          {similarSchools.length > 0 && (
            <Section>
              <SectionTitle>{t('school_section_similar')}</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {similarSchools.map(s => (
                  <Link key={s.id} href={`/schools/${s.slug}`} style={{
                    border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
                    textDecoration: 'none', display: 'block', transition: 'box-shadow 0.15s, transform 0.15s',
                  }}>
                    <div style={{
                      height: 110,
                      background: s.hero_image
                        ? `linear-gradient(135deg, rgba(27,50,82,0.35), rgba(30,63,107,0.25)), url(${s.hero_image})`
                        : 'linear-gradient(135deg, #ddf0ea, #b8e6d8)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, color: 'var(--teal-dk)',
                    }}>
                      {!s.hero_image && (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                      )}
                    </div>
                    <div style={{ padding: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 4, lineHeight: 1.3 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{s.city}, {s.country}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal-dk)' }}>
                        {s.fees_usd_min ? `From $${s.fees_usd_min.toLocaleString()} / ${t('school_fees_per_year')}` : t('school_contact_school')}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </main>

        {/* SIDEBAR */}
        <aside style={{ position: 'sticky', top: 80 }}>
          <SidebarCard>
            <SidebarTitle>{t('school_sidebar_facts')}</SidebarTitle>
            {school.country && <SidebarStat label={t('school_sidebar_country')} value={school.country} />}
            {school.region && <SidebarStat label={t('school_sidebar_region')} value={school.region} />}
            {school.city && !school.region && <SidebarStat label={t('school_sidebar_city')} value={school.city} />}
            {school.school_type && <SidebarStat label={t('school_sidebar_type')} value={school.school_type} />}
            {ages && <SidebarStat label={t('school_sidebar_ages')} value={ages} />}
            {school.founded_year && <SidebarStat label={t('school_label_founded')} value={String(school.founded_year)} />}
            {school.campus_size_hectares && <SidebarStat label={t('school_sidebar_campus')} value={`${school.campus_size_hectares} ha`} />}
            {school.student_teacher_ratio && <SidebarStat label={t('school_stat_ratio')} value={school.student_teacher_ratio} />}
            {school.university_placement_rate && <SidebarStat label={t('school_stat_uni_rate')} value={`${school.university_placement_rate}%`} accent />}
            {school.head_of_school && <SidebarStat label={t('school_sidebar_head')} value={school.head_of_school} />}
          </SidebarCard>

          {school.official_website && (
            <a
              href={school.official_website} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'block', width: '100%', background: 'var(--teal)', color: '#fff',
                textAlign: 'center', padding: '14px 20px', borderRadius: 8, fontSize: 14,
                fontWeight: 700, textDecoration: 'none', marginBottom: 10, border: 'none',
              }}
            >
              {t('school_cta_website')}
            </a>
          )}
          {school.contact_email && (
            <a
              href={`mailto:${school.contact_email}`}
              style={{
                display: 'block', width: '100%', background: 'transparent', color: 'var(--navy)',
                textAlign: 'center', padding: '13px 20px', borderRadius: 8, fontSize: 14,
                fontWeight: 600, textDecoration: 'none', border: '2px solid var(--border)',
                marginBottom: 10,
              }}
            >
              {t('school_cta_enquiry')}
            </a>
          )}
          {school.contact_email && (
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>
              <a href={`mailto:${school.contact_email}`} style={{ color: 'var(--blue)', textDecoration: 'none' }}>
                {school.contact_email}
              </a>
            </div>
          )}
          {school.contact_phone && (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }}>
              <a href={`tel:${school.contact_phone}`} style={{ color: 'var(--body)', textDecoration: 'none' }}>
                {school.contact_phone}
              </a>
            </div>
          )}


          {/* ADVISOR CTA */}
          <div style={{
            marginTop: 16, padding: '16px 18px', borderRadius: 10,
            background: 'var(--teal-bg)', border: '1px solid rgba(52,195,160,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal-dk)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontWeight: 800, fontSize: 13, color: 'var(--navy)',
              }}>
                {t('school_advisor_title')}
              </span>
            </div>
            <p style={{
              fontSize: 12, color: 'var(--body)', lineHeight: 1.6, margin: '0 0 12px',
            }}>
              {t('school_advisor_sub')}
            </p>
            <a
              href="/advisors"
              style={{
                display: 'block', textAlign: 'center', padding: '10px 16px',
                borderRadius: 7, fontSize: 13, fontWeight: 700,
                background: 'var(--teal-dk)', color: '#fff', textDecoration: 'none',
                fontFamily: "'Nunito Sans', sans-serif",
              }}
            >
              {t('school_advisor_cta')}
            </a>
          </div>

        </aside>
      </div>

      <Footer />
    </>
  )
}
