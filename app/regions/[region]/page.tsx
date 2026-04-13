import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import CountryGrid from '@/components/region/CountryGrid'
import OtherRegions from '@/components/region/OtherRegions'
import { getRegionData, REGIONS_DATA } from '@/lib/regionData'
import { getCountrySchoolCounts } from '@/lib/schools'

interface Props {
  params: { region: string }
}

export async function generateStaticParams() {
  return REGIONS_DATA.map(r => ({ region: r.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const region = getRegionData(params.region)
  if (!region) return { title: 'Region not found · nanasays' }
  return {
    title: `${region.name} International Schools · nanasays`,
    description: region.description,
    alternates: { canonical: `https://nanasays.school/regions/${params.region}` },
    openGraph: {
      title: `${region.name} International Schools · nanasays`,
      description: region.description,
      images: [{ url: region.heroImage, width: 1200, height: 630 }],
    },
  }
}

export const revalidate = 3600 // revalidate region pages every hour

export default async function RegionPage({ params }: Props) {
  const [region, countryCounts] = await Promise.all([
    Promise.resolve(getRegionData(params.region)),
    getCountrySchoolCounts(),
  ])
  if (!region) notFound()

  const countries = region.countries
    .map(c => ({ ...c, schoolCount: countryCounts[c.name] ?? 0 }))
    .filter(c => c.schoolCount > 0)

  const nameParts = region.name.split(region.nameItalicPart)
  const beforeItalic = nameParts[0]
  const afterItalic = nameParts[1] ?? ''

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://nanasays.school' },
      { '@type': 'ListItem', position: 2, name: 'Browse Regions', item: 'https://nanasays.school/#regions' },
      { '@type': 'ListItem', position: 3, name: region.name, item: `https://nanasays.school/regions/${region.slug}` },
    ],
  }

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${region.name} International Schools`,
    description: region.description,
    numberOfItems: countries.length,
    itemListElement: countries.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `International Schools in ${c.name}`,
      url: `https://nanasays.school/countries/${c.slug}`,
    })),
  }

  const totalSchools = countries.reduce((s, c) => s + c.schoolCount, 0)
  const topCountry = countries.length > 0
    ? [...countries].sort((a, b) => b.schoolCount - a.schoolCount)[0]
    : null

  const faqItems = [
    {
      q: `How many international schools are in ${region.name}?`,
      a: `NanaSays lists over ${totalSchools.toLocaleString()} international schools across ${countries.length} countries in ${region.name}. You can browse by country to filter by curriculum, fees, boarding availability, and more.`,
    },
    ...(topCountry ? [{
      q: `Which country in ${region.name} has the most international schools?`,
      a: `${topCountry.name} has the largest number of international schools in ${region.name}, with ${topCountry.schoolCount.toLocaleString()}+ schools listed on NanaSays. Other popular destinations include ${countries.filter(c => c.name !== topCountry.name).slice(0, 2).map(c => c.name).join(' and ')}.`,
    }] : []),
    {
      q: `What curricula are available at international schools in ${region.name}?`,
      a: `International schools in ${region.name} offer a wide range of curricula including the International Baccalaureate (IB), British (IGCSE/A-Level), American, and local national curricula. The right curriculum depends on your child's age, future university plans, and your family's relocation timeline.`,
    },
    {
      q: `How do I choose the right international school in ${region.name}?`,
      a: `Start by filtering by country and curriculum on NanaSays, then compare fee ranges, boarding options, and age ranges. You can also ask Nana — our AI school advisor — to match schools to your specific budget, curriculum preference, and location requirements.`,
    },
  ]

  const faqSchema = faqItems.length >= 4 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  } : null

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />}
      {/* SVG icon defs */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <symbol id="ic-globe" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </symbol>
        </defs>
      </svg>

      <Nav />

      {/* Breadcrumb */}
      <div style={{
        marginTop: 60,
        background: 'var(--white)', borderBottom: '1px solid var(--border)',
        padding: '18px 5%',
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--muted)',
      }}>
        <a href="/" style={{ color: 'var(--blue)', fontWeight: 600 }}>Home</a>
        <span style={{ color: 'var(--bmd)' }}>›</span>
        <a href="/#regions" style={{ color: 'var(--blue)', fontWeight: 600 }}>Browse Regions</a>
        <span style={{ color: 'var(--bmd)' }}>›</span>
        <span style={{ color: 'var(--navy)', fontWeight: 700 }}>{region.name}</span>
      </div>

      {/* Hero */}
      <section style={{ position: 'relative', height: 380, overflow: 'hidden', background: '#0a1520' }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url('${region.heroImage}')`,
          backgroundSize: 'cover', backgroundPosition: 'center 30%',
          opacity: 0.5,
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: `
            linear-gradient(to top, rgba(10,21,32,.85) 0%, rgba(10,21,32,.3) 55%, rgba(10,21,32,.1) 100%),
            linear-gradient(to right, rgba(10,21,32,.6) 0%, transparent 60%)
          `,
        }} />
        <div style={{
          position: 'relative', zIndex: 2,
          height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          padding: '0 5% 40px', maxWidth: 1340, margin: '0 auto', width: '100%',
        }}>
          {/* Eyebrow */}
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--teal)',
            textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <svg width="12" height="12" style={{ color: 'var(--teal)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
            Browse by Region
          </div>

          {/* H1 */}
          <h1 style={{
            fontFamily: "'Nunito', sans-serif",
            fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900,
            color: '#fff', letterSpacing: '-1.5px', lineHeight: 1.05,
            marginBottom: 12,
          }}>
            {beforeItalic}<em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>{region.nameItalicPart}</em>{afterItalic}
          </h1>

          {/* Description */}
          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,.7)', fontWeight: 300,
            lineHeight: 1.65, maxWidth: 560, marginBottom: 24,
          }}>
            {region.description}
          </p>

          {/* Stat pills */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <StatPill value={String(countries.length)} label="Countries" />
            <StatPill value={`${countries.reduce((s, c) => s + c.schoolCount, 0).toLocaleString()}+`} label="International schools" isPlus />
            <StatPill value="100%" label="Free to browse" />
          </div>
        </div>
      </section>

      {/* Nana quote band */}
      <div style={{
        background: 'var(--teal-bg)',
        borderTop: '3px solid var(--teal)',
        borderBottom: '1px solid rgba(52,195,160,.25)',
        padding: '22px 5%',
      }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {/* Avatar */}
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: 'var(--navy)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            border: '2px solid rgba(52,195,160,.4)',
          }}>
            <NanaAvatar />
          </div>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 800, color: 'var(--teal-dk)',
              textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 5,
            }}>
              {region.nanaQuoteLabel}
            </div>
            <p style={{
              fontSize: 14, lineHeight: 1.65, color: 'var(--navy)',
              fontStyle: 'italic', fontWeight: 300,
            }}>
              {region.nanaQuote.split(region.nanaQuoteStrong).map((part, i, arr) =>
                i < arr.length - 1
                  ? <span key={i}>{part}<strong style={{ fontStyle: 'normal', fontWeight: 800, color: 'var(--teal-dk)' }}>{region.nanaQuoteStrong}</strong></span>
                  : <span key={i}>{part}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Countries section */}
      <section style={{
        background: 'var(--off)',
        borderTop: '1px solid var(--border)',
        padding: '64px 5%',
      }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <CountryGrid countries={countries} />
        </div>
      </section>

      {/* Other Regions */}
      <OtherRegions currentSlug={region.slug} />

      <Footer />
    </>
  )
}

function StatPill({ value, label, isPlus }: { value: string; label: string; isPlus?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,.1)',
      border: '1px solid rgba(255,255,255,.18)',
      borderRadius: 10, padding: '10px 16px',
      backdropFilter: 'blur(6px)',
    }}>
      <div>
        <div style={{
          fontFamily: "'Nunito', sans-serif", fontSize: 18, fontWeight: 900,
          color: '#fff', letterSpacing: '-.5px', lineHeight: 1,
        }}>
          {value}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  )
}

function NanaAvatar() {
  return (
    <svg width="28" height="28" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="24" fill="#1B3252" />
      <circle cx="24" cy="18" r="8" fill="#F5CBA7" />
      <ellipse cx="24" cy="38" rx="13" ry="10" fill="#2D7DD2" />
      <circle cx="21" cy="17" r="1.6" fill="#4A3728" />
      <circle cx="27" cy="17" r="1.6" fill="#4A3728" />
      <path d="M21 20 Q24 22.5 27 20" stroke="#C17A4A" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <rect x="17" y="14.5" width="7" height="5" rx="2.5" fill="none" stroke="#8B7355" strokeWidth="1.4" />
      <rect x="24" y="14.5" width="7" height="5" rx="2.5" fill="none" stroke="#8B7355" strokeWidth="1.4" />
      <line x1="14.5" y1="17" x2="17" y2="17" stroke="#8B7355" strokeWidth="1.4" />
      <line x1="31" y1="17" x2="33.5" y2="17" stroke="#8B7355" strokeWidth="1.4" />
      <circle cx="20.5" cy="29" r="1.8" fill="#F0E8D0" stroke="#D4C9B0" strokeWidth=".6" />
      <circle cx="24" cy="30" r="1.8" fill="#F0E8D0" stroke="#D4C9B0" strokeWidth=".6" />
      <circle cx="27.5" cy="29" r="1.8" fill="#F0E8D0" stroke="#D4C9B0" strokeWidth=".6" />
    </svg>
  )
}
