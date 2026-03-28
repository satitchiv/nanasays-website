import dynamicImport from 'next/dynamic'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { flagUrl } from '@/lib/regions'
import { REGIONS_DATA } from '@/lib/regionData'
import { getCountrySchoolCounts, getTotalSchoolCount } from '@/lib/schools'
import { BLOG_POSTS, CATEGORY_LABELS } from '@/lib/blog'
import Link from 'next/link'

export const revalidate = 3600 // revalidate homepage every hour

const MapSection = dynamicImport(() => import('@/components/MapSection'), { ssr: false })
const HeroSearch = dynamicImport(() => import('@/components/HeroSearch'), { ssr: false })

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
  const [countryCounts, totalSchools] = await Promise.all([
    getCountrySchoolCounts(),
    getTotalSchoolCount(),
  ])
  const totalCountries = Object.keys(countryCounts).length

  return (
    <>
      <Nav />

      {/* ─── HERO ──────────────────────────────────────────────────────────── */}
      <div className="ns-hero-outer" style={{ marginTop: 60 }}>
        {/* Full-width hero */}
        <div className="ns-hero-bg">
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'url(https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&q=85&auto=format&fit=crop)',
            backgroundSize: 'cover', backgroundPosition: 'center 22%', opacity: 0.42,
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to right, rgba(10,21,32,.78) 0%, rgba(10,21,32,.25) 100%), linear-gradient(to top, rgba(10,21,32,.65) 0%, transparent 55%)',
          }} />
          {/* Content row — copy left + chat card right, both over the photo */}
          <div className="ns-hero-inner">
            {/* Left — copy */}
            <div style={{ flex: 1, maxWidth: 560 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: 'rgba(52,195,160,.16)', border: '1px solid rgba(52,195,160,.3)',
                borderRadius: 100, padding: '5px 14px', fontSize: 12, fontWeight: 700,
                color: 'var(--teal)', marginBottom: 26, width: 'fit-content',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} />
                {totalSchools}+ Schools Across {totalCountries} Countries
              </div>

              <h1 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 'clamp(34px, 4vw, 54px)', fontWeight: 900, color: '#fff',
                lineHeight: 1.07, letterSpacing: '-1.8px', marginBottom: 22,
              }}>
                Find the right school<br />
                <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>for your child.</em>
              </h1>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 38 }}>
                {[
                  { title: 'Built for international families', desc: `Search ${totalSchools.toLocaleString()}+ verified schools across ${totalCountries} countries — all in one place` },
                  { title: 'Real data, not brochures', desc: 'Fees, pass rates, boarding life, and admissions steps clearly laid out' },
                  { title: 'Expert guidance, simply presented', desc: "Every school page includes fees, admissions steps, boarding life, and scholarship availability" },
                ].map(item => (
                  <div key={item.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: 'rgba(52,195,160,.15)', border: '1px solid rgba(52,195,160,.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', fontWeight: 300, lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 26, borderTop: '1px solid rgba(255,255,255,.13)' }}>
                <div style={{ display: 'flex' }}>
                  {['KM', 'KT', 'DS', 'N'].map((init, i) => (
                    <div key={init} style={{
                      width: 30, height: 30, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,.4)',
                      background: i === 3 ? 'var(--teal)' : 'var(--navy-lt)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.85)',
                      marginLeft: i === 0 ? 0 : -9,
                      fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                    }}>{init}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', lineHeight: 1.5 }}>
                  <strong style={{ color: '#fff' }}>Families worldwide trust Nana</strong><br />
                  to shortlist the right school
                </div>
              </div>
            </div>

            {/* Right — search card */}
            <div className="ns-hero-search-col">
              <HeroSearch />
            </div>
          </div>
        </div>
      </div>

      {/* ─── STATS ─────────────────────────────────────────────────────────── */}
      <div className="ns-stats-section" style={{ background: 'var(--navy)' }}>
        <div className="ns-stats-grid" style={{ maxWidth: 1240, margin: '0 auto' }}>
          {[
            { num: totalSchools, suffix: '+', label: 'Schools in our directory' },
            { num: totalCountries, suffix: '', label: 'Countries covered' },
            { num: totalSchools, suffix: '', label: 'Verified data points' },
            { num: 24, suffix: '/7', label: 'Nana is always available' },
          ].map((stat, i) => (
            <div key={i} style={{
              padding: '36px 32px',
              borderRight: i < 3 ? '1px solid rgba(255,255,255,.1)' : 'none',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', bottom: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(52,195,160,.06)' }} />
              <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: -2, lineHeight: 1, marginBottom: 6 }}>
                {stat.num}<span style={{ fontSize: 24, color: 'var(--teal)' }}>{stat.suffix}</span>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', lineHeight: 1.4 }}>{stat.label}</div>
            </div>
          ))}
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={region.heroImage}
                    alt={region.name}
                    className="ns-region-img"
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75, display: 'block', transition: 'transform .35s' }}
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
      <style>{`
        .ns-region-card { transition: box-shadow .22s, border-color .22s, transform .22s; }
        .ns-region-card:hover { border-color: var(--teal) !important; box-shadow: 0 10px 32px rgba(27,50,82,.15); transform: translateY(-4px); }
        .ns-region-card:hover .ns-region-img { transform: scale(1.05); }
      `}</style>

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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={flagUrl(country.flagCode, '24x18')}
                  alt={country.name}
                  width={24} height={18}
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
            {BLOG_POSTS.map((post, i) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', textDecoration: 'none', display: 'flex', flexDirection: 'column' }}>
                <div style={{ overflow: 'hidden', position: 'relative', background: 'var(--off2)', height: i === 0 ? 240 : 140 }}>
                  {post.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.image} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  )}
                </div>
                <div style={{ padding: '20px 22px 22px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{
                    fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px',
                    padding: '3px 9px', borderRadius: 100, width: 'fit-content', marginBottom: 10,
                    background: post.category === 'thai' ? 'var(--teal-bg)' : post.category === 'guide' ? 'var(--blue-bg)' : 'rgba(27,50,82,.08)',
                    color: post.category === 'thai' ? 'var(--teal-dk)' : post.category === 'guide' ? 'var(--blue)' : 'var(--navy)',
                  }}>
                    {CATEGORY_LABELS[post.category]}
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: i === 0 ? 20 : 16, fontWeight: 800, color: 'var(--navy)', lineHeight: 1.25, letterSpacing: '-0.2px', marginBottom: 8 }}>{post.title}</h3>
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.65, fontWeight: 300, flex: 1, marginBottom: 14 }}>{post.excerpt}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="var(--teal)"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg>
                      </div>
                      <span>{post.author}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--blue)' }}>{post.readTime} min read</span>
                  </div>
                </div>
              </Link>
            ))}
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
                Browse 4,000+ verified schools across 45+ countries — fees, curriculum, admissions and more.
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={school.logo}
                    alt={school.name}
                    loading="lazy"
                    style={{ maxWidth: '100%', maxHeight: 56, objectFit: 'contain', display: 'block', filter: 'none' }}
                  />
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy)', textAlign: 'center', lineHeight: 1.4 }}>{school.name}</div>
              </Link>
            ))}
          </div>
          <div style={{ maxWidth: 540, margin: '44px auto 0', background: 'var(--navy)', borderRadius: 24, padding: '8px' }}>
            <HeroSearch />
          </div>
        </div>
      </div>

      <Footer />
    </>
  )
}
