import dynamicImport from 'next/dynamic'
import './home.css'
import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { flagUrl } from '@/lib/regions'
import { REGIONS_DATA } from '@/lib/regionData'
import { getCountrySchoolCounts, getTotalSchoolCount } from '@/lib/schools'
import { CATEGORY_LABELS } from '@/lib/blog'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'NanaSays — International School Directory · 10,000+ Schools Worldwide',
  description: 'NanaSays helps international families find the right school abroad. Search 10,000+ verified international schools across 100+ countries with Nana, your AI school advisor.',
  alternates: { canonical: 'https://nanasays.school' },
  openGraph: {
    title: 'NanaSays — International School Directory · 10,000+ Schools Worldwide',
    description: 'NanaSays helps international families find the right school abroad. Search 10,000+ verified international schools across 100+ countries with Nana, your AI school advisor.',
    url: 'https://nanasays.school',
    siteName: 'NanaSays',
    images: [{ url: 'https://nanasays.school/og-image.jpg', width: 1200, height: 630, alt: 'NanaSays — International School Directory' }],
    type: 'website',
  },
}

export const revalidate = 3600 // revalidate homepage every hour

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'NanaSays',
  url: 'https://nanasays.school',
  description: 'NanaSays helps international families find the right school abroad. Search 10,000+ verified international schools across 100+ countries.',
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://nanasays.school/ask?q={search_term_string}',
    'query-input': 'required name=search_term_string',
  },
}

const MapSection = dynamicImport(() => import('@/components/MapSection'), { ssr: false })
const HeroSearch = dynamicImport(() => import('@/components/HeroSearch'), { ssr: false })

const TOP_DESTINATIONS = [
  { name: 'United Kingdom', slug: 'united-kingdom', flagCode: 'gb' },
  { name: 'Singapore',      slug: 'singapore',      flagCode: 'sg' },
  { name: 'Thailand',       slug: 'thailand',        flagCode: 'th' },
  { name: 'Switzerland',    slug: 'switzerland',     flagCode: 'ch' },
  { name: 'UAE',            slug: 'uae',             flagCode: 'ae' },
  { name: 'Malaysia',       slug: 'malaysia',        flagCode: 'my' },
  { name: 'China',          slug: 'china',           flagCode: 'cn' },
  { name: 'Hong Kong',      slug: 'hong-kong',       flagCode: 'hk' },
]

const PICKS = [
  {
    rank: '01',
    award: "Nana's Top Pick",
    name: 'TASIS England',
    type: 'Boarding · Surrey, United Kingdom',
    slug: 'tasis-england',
    quote: 'Three curricula on one campus, 6:1 ratio, and 20 minutes from Heathrow. A rare combination of American rigour, IB flexibility, and a genuinely global community.',
  },
  {
    rank: '02',
    award: 'Best Value Asia',
    name: 'Singapore American School',
    type: 'Day · Singapore',
    slug: 'singapore-american-school',
    quote: 'Asia\'s most established American-curriculum school. Outstanding university outcomes, a vibrant international student body, and English as the language of everything.',
  },
  {
    rank: '03',
    award: 'Swiss Excellence',
    name: 'Leysin American School',
    type: 'Boarding · Vaud, Switzerland',
    slug: 'leysin-american-school',
    quote: 'Alpine campus, rigorous academics, wonderfully diverse student body. The AP + IB combination is rare, and the mountain experience is unforgettable.',
  },
]

const TESTIMONIALS = [
  {
    text: 'Nana helped us narrow from 40 schools down to 3 in a single afternoon. The data quality is better than anything else we found online.',
    author: 'Sarah M.',
    meta: 'Mother of two · London',
    initials: 'SM',
  },
  {
    text: 'I was overwhelmed by the UK boarding school process. Nana explained every step and gave us a clear picture of what each school is actually like day to day.',
    author: 'James T.',
    meta: 'Father · Singapore',
    initials: 'JT',
  },
  {
    text: 'The fee breakdowns and scholarship information saved us hours of emails. We found our shortlist in one session and felt genuinely prepared for open day.',
    author: 'Dr. Chen',
    meta: 'Parent · Hong Kong',
    initials: 'DC',
  },
]

const FEATURED_SCHOOLS = [
  { name: 'British School Jakarta',                     slug: 'british-school-jakarta',                     logo: 'https://eda.sgp1.digitaloceanspaces.com/production/k7tBTmW9G2qQTLm8ohuTTMjHCZX3Y0P23fIxFTj5--o.webp' },
  { name: 'Dulwich College Shanghai Puxi',              slug: 'dulwich-college-shanghai-puxi',               logo: 'https://shanghai-puxi.dulwich.org/images/crest-logo.svg' },
  { name: 'Ecole Jeannine Manuel - Paris',              slug: 'ecole-jeannine-manuel-paris',                 logo: 'https://www.ecolejeanninemanuel.org/wp-content/themes/kingster-child/images/svg/ecole-jeannine-manuel-logo-color-short.svg' },
  { name: 'Haut-Lac International Bilingual School',    slug: 'haut-lac-international-bilingual-school',     logo: 'https://haut-lac.ch/wp-content/uploads/2025/10/logo-color.png' },
  { name: 'Hebron School',                              slug: 'hebron-school',                               logo: 'https://resources.finalsite.net/images/f_auto,q_auto/v1702360931/hebronootyorg/goyzstuwhw71so2e5aqb/2_3.png' },
  { name: "ICS Côte d'Azur",                            slug: 'ics-cote-dazur',                              logo: 'https://www.internationalschoolsearch.com/listings/internationalschools/32969L6.jpg' },
  { name: 'Institut Montana Switzerland',               slug: 'institut-montana-switzerland',                logo: 'https://www.montana-zug.ch/hubfs/Heading%20(1).png' },
  { name: 'International Bilingual School of Provence', slug: 'international-bilingual-school-of-provence',  logo: 'https://static.wixstatic.com/media/4a8972_c69ed16ee00e41c98c2c2fbdb8c5f540~mv2.png/v1/fill/w_81,h_86,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo-ibs.png' },
  { name: 'International School of Busan',              slug: 'international-school-of-busan',               logo: 'https://static.wixstatic.com/media/add61f_5d09626abbc84b2fb736370715027a6f~mv2.png/v1/crop/x_0,y_218,w_3238,h_1475/fill/w_202,h_92,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/ISB%20Logo-Large.png' },
  { name: 'International School of Lausanne',           slug: 'international-school-of-lausanne',            logo: 'https://www.isl.ch/hs-fs/hubfs/ISL_Logo_black_2000px.png?width=400&height=150&name=ISL_Logo_black_2000px.png' },
  { name: 'Kodaikanal International School',            slug: 'kodaikanal-international-school',             logo: 'https://resources.finalsite.net/images/f_auto,q_auto/v1731757171/kisin/itp6p7qqoh3soox1pohn/KIS-Logo.png' },
  { name: 'La Garenne International School',            slug: 'la-garenne-international-school',             logo: 'https://www.la-garenne.ch/wp-content/uploads/2025/12/Social-Media.jpg' },
  { name: 'Lyceum Alpinum Zuoz',                        slug: 'lyceum-alpinum-zuoz',                         logo: 'https://www.lyceum-alpinum.ch/wp-content/uploads/2020/12/lyzeum-alpinum-zuoz-internat-schweiz-logo-swisslearning-small.jpg' },
  { name: 'Marlborough College, Malaysia',              slug: 'marlborough-college-malaysia',                logo: 'https://www.marlboroughcollegemalaysia.org/wp-content/uploads/2025/12/Primary-MCM-Logo-2025-For-White-Background-scaled.png' },
  { name: 'Marymount International School London',      slug: 'marymount-international-school-london',       logo: 'https://www.marymountlondon.com/wp-content/themes/marymount/assets/img/icons/logo-new-blue.png' },
  { name: 'Oakridge International School, Bengaluru',   slug: 'oakridge-international-school-bengaluru',     logo: 'https://custpostimages.s3.ap-south-1.amazonaws.com/6847/1623820198871.png' },
  { name: "St Andrew's School Turi",                    slug: 'st-andrews-school-turi',                      logo: 'https://www.standrewsturi.com/wp-content/themes/st-andrews-2023/build/images/logo.png' },
  { name: "St. George's International School",          slug: 'st-georges-international-school-switzerland', logo: 'https://d24d7vsshzrslo.cloudfront.net/sites/school91/files/2024-10/16160_sgis-roundel-red-logo-rgb-png.png' },
  { name: 'Suzhou Singapore International School',      slug: 'suzhou-singapore-international-school',       logo: 'https://www.ssis.asia/wp-content/uploads/2019/09/logo-full.svg' },
  { name: 'Victoria Shanghai Academy',                  slug: 'victoria-shanghai-academy',                   logo: 'https://resources.finalsite.net/images/v1626762643/vsaeduhk/wvqlx4sxnozcmfj36u5g/VictoriaShanghaiAcademyHeaderLogo.svg' },
]

export default async function HomePage() {
  const [countryCounts, totalSchools, blogResult] = await Promise.all([
    getCountrySchoolCounts(),
    getTotalSchoolCount(),
    supabase.from('blog_posts')
      .select('slug, title, excerpt, category, hero_image, published_at, word_count')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(6),
  ])
  const totalCountries = Object.keys(countryCounts).length
  const blogPosts = blogResult.data ?? []

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <Nav />

      {/* ─── HERO ──────────────────────────────────────────────────────────── */}
      <div className="ns-hero-outer" style={{ marginTop: 60 }}>
        <div className="ns-hero-bg">
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'url(https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1400&q=85&auto=format&fit=crop)',
            backgroundSize: 'cover', backgroundPosition: 'center 22%', opacity: 0.25,
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, rgba(27,50,82,.88) 0%, rgba(27,50,82,.72) 55%, rgba(27,50,82,.95) 100%)',
          }} />
          <div className="ns-hero-inner">

            {/* Badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: 'rgba(52,195,160,.16)', border: '1px solid rgba(52,195,160,.3)',
              borderRadius: 100, padding: '5px 16px', fontSize: 12, fontWeight: 700,
              color: 'var(--teal)', marginBottom: 22,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} />
              {totalSchools}+ Schools Across {totalCountries} Countries
            </div>

            {/* Headline */}
            <h1 style={{
              fontFamily: 'var(--font-nunito), Nunito, sans-serif',
              fontSize: 'clamp(38px, 5vw, 62px)', fontWeight: 900, color: '#fff',
              lineHeight: 1.06, letterSpacing: '-2.2px', marginBottom: 14,
            }}>
              Find the right school<br />
              <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>for your child.</em>
            </h1>

            {/* Subtitle */}
            <p style={{
              fontSize: 16, color: 'rgba(255,255,255,.55)', fontWeight: 300,
              lineHeight: 1.65, marginBottom: 32, maxWidth: 520,
            }}>
              The world&apos;s largest verified international school directory — fees,
              curriculum, boarding life, and Nana&apos;s AI guidance in one place.
            </p>

            {/* Proof line — replaces the bloated 4-cell stats bar */}
            <div className="ns-hero-proof">
              <div className="ns-proof-stat">
                <div className="ns-proof-num">{totalSchools.toLocaleString()}<em>+</em></div>
                <div className="ns-proof-label">Schools listed</div>
              </div>
              <div className="ns-proof-divider" />
              <div className="ns-proof-stat">
                <div className="ns-proof-num">{totalCountries}<em>+</em></div>
                <div className="ns-proof-label">Countries covered</div>
              </div>
              <div className="ns-proof-divider" />
              <div className="ns-proof-stat">
                <div className="ns-proof-num">24<em>/7</em></div>
                <div className="ns-proof-label">Nana available</div>
              </div>
            </div>

            {/* Search — centered */}
            <div className="ns-hero-search-col">
              <HeroSearch />
            </div>

            {/* Popular destination chips */}
            <div className="ns-hero-destinations">
              <div className="ns-hero-dest-label">Popular destinations</div>
              <div className="ns-hero-dest-chips">
                {TOP_DESTINATIONS.map(d => (
                  <Link key={d.slug} href={`/countries/${d.slug}`} className="ns-hero-dest-chip">
                    <Image src={flagUrl(d.flagCode, '24x18')} alt={d.name} width={20} height={15} style={{ borderRadius: 2 }} />
                    <span>{d.name}</span>
                  </Link>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>


      {/* ─── MAP DISCOVERY ──────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--off)', borderTop: '1px solid var(--border)', padding: '88px 0 0' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 5%' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>Explore the Map</div>
          <h2 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 900, color: 'var(--navy)', letterSpacing: '-0.5px', lineHeight: 1.12, marginBottom: 10 }}>
            Schools in <span style={{ color: 'var(--teal-dk)' }}>{totalCountries} countries</span>, mapped.
          </h2>
          <p style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 300, lineHeight: 1.65, maxWidth: 520, marginBottom: 36 }}>
            Click any pin to see how many schools are in that country. Teal pins are Nana&apos;s recommended destinations for international families.
          </p>
        </div>
        <MapSection />

      </div>

      {/* ─── REGION BROWSE ──────────────────────────────────────────────────── */}
      <div id="regions" style={{ background: 'var(--white)', borderTop: '1px solid var(--border)', padding: '88px 5%' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 40 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>Browse by Region</div>
              <h2 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 900, color: 'var(--navy)', letterSpacing: '-0.5px', lineHeight: 1.12, marginBottom: 10 }}>
                Schools in <span style={{ color: 'var(--teal-dk)' }}>every corner</span> of the world
              </h2>
              <p style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 300, lineHeight: 1.65, maxWidth: 520 }}>
                8 regions, {totalSchools.toLocaleString()}+ schools. Select a region to browse every country and campus.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {REGIONS_DATA.map(region => {
              const regionSchools = region.countries.reduce((s, c) => s + (countryCounts[c.name] || 0), 0)
              const regionCountries = region.countries.filter(c => (countryCounts[c.name] || 0) > 0).length
              if (regionSchools === 0) return null
              return (
              <a
                key={region.slug}
                href={`/regions/${region.slug}`}
                className="ns-region-card"
                style={{
                  display: 'block', textDecoration: 'none',
                  borderRadius: 18, overflow: 'hidden',
                  border: '1px solid var(--border)',
                  background: 'var(--white)',
                  position: 'relative',
                }}
              >
                {/* Photo */}
                <div style={{ height: 160, position: 'relative', overflow: 'hidden', background: '#0a1520' }}>
                  <Image
                    src={region.heroImage}
                    alt={region.name}
                    fill
                    loading="lazy"
                    className="ns-region-img"
                    style={{ objectFit: 'cover', opacity: 0.75, transition: 'transform .35s' }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(10,21,32,.72) 0%, rgba(10,21,32,.15) 60%, transparent 100%)',
                  }} />
                  {/* School count badge */}
                  <div style={{
                    position: 'absolute', top: 12, right: 12,
                    background: 'rgba(27,50,82,.82)', backdropFilter: 'blur(4px)',
                    color: '#fff', fontSize: 10, fontWeight: 800,
                    padding: '4px 10px', borderRadius: 100,
                    fontFamily: "'Nunito', sans-serif",
                    border: '1px solid rgba(255,255,255,.12)',
                  }}>
                    {regionSchools.toLocaleString()}+ schools
                  </div>
                  {/* Region name over photo */}
                  <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16 }}>
                    <div style={{
                      fontFamily: "'Nunito', sans-serif",
                      fontSize: 22, fontWeight: 900, color: '#fff',
                      letterSpacing: '-0.5px', lineHeight: 1.1,
                      textShadow: '0 1px 8px rgba(0,0,0,.4)',
                    }}>
                      {region.name}
                    </div>
                  </div>
                </div>

                {/* Card body */}
                <div style={{ padding: '14px 16px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 300 }}>
                      <strong style={{ color: 'var(--navy)', fontWeight: 700 }}>{regionCountries}</strong> countries
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 800, color: 'var(--teal-dk)',
                      padding: '3px 9px', borderRadius: 100,
                      background: 'var(--teal-bg)', border: '1px solid rgba(52,195,160,.2)',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                      Browse
                    </div>
                  </div>
                  <p style={{
                    fontSize: 11, color: 'var(--muted)', fontStyle: 'italic',
                    fontWeight: 300, lineHeight: 1.5,
                    paddingTop: 10, borderTop: '1px solid var(--border)',
                    margin: 0,
                  }}>
                    {region.description.split(' — ')[0]}
                  </p>
                </div>
              </a>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── COUNTRIES ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--off)', borderTop: '1px solid var(--border)', padding: '72px 5%' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>Browse by Country</div>
          <h2 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 900, color: 'var(--navy)', letterSpacing: '-0.5px', lineHeight: 1.12, marginBottom: 36 }}>
            {totalCountries} countries, <span style={{ color: 'var(--teal-dk)' }}>one search.</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
            {REGIONS_DATA.flatMap(r => r.countries).filter(c => (countryCounts[c.name] || 0) > 0).map(country => (
              <Link
                key={country.slug}
                href={`/countries/${country.slug}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 10,
                  border: '1px solid var(--border)', background: '#fff',
                  textDecoration: 'none',
                }}
              >
                <Image
                  src={flagUrl(country.flagCode, '24x18')}
                  alt={country.name}
                  width={24}
                  height={18}
                  style={{ borderRadius: 2, flexShrink: 0 }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{country.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 300 }}>{countryCounts[country.name] ?? country.schoolCount} schools</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ─── NANA'S PICKS ───────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--navy)', padding: '88px 5%' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>Editorial</div>
          <h2 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.12, marginBottom: 10 }}>
            Nana&apos;s <span style={{ color: 'var(--teal)' }}>top picks</span> this season
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,.5)', fontWeight: 300, lineHeight: 1.65, maxWidth: 520, marginBottom: 44 }}>
            These three schools consistently rise to the top when Thai families ask Nana for recommendations.
          </p>
          <div className="ns-picks-grid">
            {PICKS.map(pick => (
              <Link key={pick.rank} href={`/schools/${pick.slug}`} style={{
                background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 18, padding: 30, position: 'relative', overflow: 'hidden',
                textDecoration: 'none', display: 'block',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--teal), var(--teal-dk), transparent)' }} />
                <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 52, fontWeight: 900, color: 'rgba(255,255,255,.05)', lineHeight: 1, marginBottom: 12, letterSpacing: -2 }}>{pick.rank}</div>
                <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', background: 'rgba(52,195,160,.15)', border: '1px solid rgba(52,195,160,.25)', color: 'var(--teal)', fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 100, marginBottom: 10, textTransform: 'uppercase' as const }}>{pick.award}</div>
                <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 19, fontWeight: 900, color: '#fff', marginBottom: 4 }}>{pick.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 14 }}>{pick.type}</div>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,.65)', fontStyle: 'italic', fontWeight: 300, borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 13, margin: 0 }}>{pick.quote}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ─── BLOG ───────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderTop: '1px solid var(--border)', padding: '88px 5%' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>From Nana&apos;s Desk</div>
              <h2 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 900, color: 'var(--navy)', letterSpacing: '-0.5px', lineHeight: 1.12 }}>
                Guides for international families
              </h2>
            </div>
            <Link href="/blog" style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', padding: '8px 18px', borderRadius: 8, border: '1.5px solid var(--blue-bg)', background: 'var(--blue-bg)', textDecoration: 'none' }}>
              See all articles
            </Link>
          </div>
          <div className="ns-blog-grid">
            {blogPosts.map((post, i) => {
              const readTime = Math.ceil((post.word_count ?? 800) / 200)
              const cat = post.category ?? 'guide'
              return (
                <Link key={post.slug} href={`/blog/${post.slug}`} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', textDecoration: 'none', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ overflow: 'hidden', position: 'relative', background: 'var(--off2)', height: i === 0 ? 240 : 140 }}>
                    {post.hero_image && (
                      <Image src={post.hero_image} alt={post.title} fill loading="lazy" style={{ objectFit: 'cover' }} />
                    )}
                  </div>
                  <div style={{ padding: '20px 22px 22px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                      fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px',
                      padding: '3px 9px', borderRadius: 100, width: 'fit-content', marginBottom: 10,
                      background: cat === 'thai' ? 'var(--teal-bg)' : cat === 'guide' ? 'var(--blue-bg)' : 'rgba(27,50,82,.08)',
                      color: cat === 'thai' ? 'var(--teal-dk)' : cat === 'guide' ? 'var(--blue)' : 'var(--navy)',
                    }}>
                      {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? 'Guide'}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: i === 0 ? 20 : 16, fontWeight: 800, color: 'var(--navy)', lineHeight: 1.25, letterSpacing: '-0.2px', marginBottom: 8 }}>{post.title}</h3>
                    <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.65, fontWeight: 300, flex: 1, marginBottom: 14 }}>{post.excerpt}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="var(--teal)"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg>
                        </div>
                        <span>Nana</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--blue)' }}>{readTime} min read</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── TRUST / CTA ─────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderTop: '1px solid var(--border)', padding: '88px 5%' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div className="ns-trust-grid">
            {TESTIMONIALS.map(t => (
              <div key={t.author} style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 16, padding: 26 }}>
                <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} style={{ width: 13, height: 13, background: '#F59E0B', clipPath: 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' }} />
                  ))}
                </div>
                <p style={{ fontSize: 13, color: 'var(--body)', fontStyle: 'italic', lineHeight: 1.7, fontWeight: 300, marginBottom: 18 }}>
                  &ldquo;{t.text}&rdquo;
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>{t.initials}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{t.author}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.meta}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA band */}
          <div className="ns-cta-band" style={{ background: 'var(--navy)', borderRadius: 22, padding: '48px 52px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -40, right: 80, width: 200, height: 200, borderRadius: '50%', background: 'rgba(52,195,160,.08)' }} />
            <div style={{ position: 'absolute', bottom: -60, right: -30, width: 240, height: 240, borderRadius: '50%', background: 'rgba(45,125,210,.08)' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <h2 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', marginBottom: 8, lineHeight: 1.2 }}>
                Ready to find the right school?
              </h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', fontWeight: 300, lineHeight: 1.65, maxWidth: 420 }}>
                Browse {totalSchools.toLocaleString()}+ verified schools across {totalCountries} countries — fees, curriculum, admissions and more.
              </p>
            </div>
            <div className="ns-hero-search-cta">
              <HeroSearch />
            </div>
          </div>
        </div>
      </div>

      {/* ─── FEATURED SCHOOLS / PARTNERS ────────────────────────────────────── */}
      <div style={{ background: 'var(--off)', borderTop: '1px solid var(--border)', padding: '88px 5%' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 }}>Schools in Our Directory</div>
            <h2 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 900, color: 'var(--navy)', letterSpacing: '-0.5px', lineHeight: 1.15, marginBottom: 12 }}>
              Some of our Top Schools
            </h2>
            <p style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 300, lineHeight: 1.65, maxWidth: 480, margin: '0 auto' }}>
              From Swiss boarding schools to top day schools across Asia — all verified and in the Nana directory.
            </p>
          </div>
          <div className="ns-partners-grid">
            {FEATURED_SCHOOLS.map(school => (
              <Link
                key={school.slug}
                href={`/schools/${school.slug}`}
                style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
              >
                <div style={{
                  width: '100%', aspectRatio: '3/2',
                  background: '#fff', borderRadius: 14,
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '18px 20px', overflow: 'hidden',
                  transition: 'box-shadow .2s, border-color .2s',
                }}>
                  <Image
                    src={school.logo}
                    alt={school.name}
                    width={120}
                    height={56}
                    loading="lazy"
                    style={{ maxWidth: '100%', height: 'auto', maxHeight: 56, objectFit: 'contain' }}
                  />
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', textAlign: 'center', lineHeight: 1.4 }}>{school.name}</div>
              </Link>
            ))}
          </div>
          <div className="ns-cta-band" style={{ maxWidth: 1100, margin: '44px auto 0', background: 'var(--navy)', borderRadius: 22, padding: '48px 52px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -40, right: 80, width: 200, height: 200, borderRadius: '50%', background: 'rgba(52,195,160,.08)' }} />
            <div style={{ position: 'absolute', bottom: -60, right: -30, width: 240, height: 240, borderRadius: '50%', background: 'rgba(45,125,210,.08)' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <h2 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', marginBottom: 8, lineHeight: 1.2 }}>
                Ready to find the right school?
              </h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', fontWeight: 300, lineHeight: 1.65, maxWidth: 420 }}>
                Browse {totalSchools.toLocaleString()}+ verified schools across {totalCountries} countries — fees, curriculum, admissions and more.
              </p>
            </div>
            <div className="ns-hero-search-cta">
              <HeroSearch />
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  )
}
