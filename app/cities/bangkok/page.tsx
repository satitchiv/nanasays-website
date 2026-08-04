import type { Metadata } from 'next'
import Link from 'next/link'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'

export const revalidate = 3600

interface BangkokSchool {
  id: string
  slug: string
  name: string
  city: string | null
  curriculum: string[] | null
  fees_usd_min: number | null
  fees_usd_max: number | null
  boarding: boolean | null
  hero_image: string | null
}

async function getBangkokSchools(): Promise<BangkokSchool[]> {
  const { data } = await supabase
    .from('schools')
    .select('id,slug,name,city,curriculum,fees_usd_min,fees_usd_max,boarding,hero_image')
    .eq('country', 'Thailand')
    .eq('is_international', true)
    .ilike('city', '%Bangkok%')
    .order('confidence_score', { ascending: false })
    .limit(200)
  return (data ?? []) as BangkokSchool[]
}

export const metadata: Metadata = {
  title: 'International Schools in Bangkok — Fees, Reviews & Admissions',
  description: 'Compare international schools in Bangkok by fees, curriculum, boarding options and admissions information. Explore IB, IGCSE and other schools on NanaSays.',
  alternates: { canonical: 'https://nanasays.school/cities/bangkok' },
  openGraph: {
    title: 'International Schools in Bangkok — Fees, Reviews & Admissions',
    description: 'Compare international schools in Bangkok by fees, curriculum, boarding options and admissions information.',
    siteName: 'NanaSays',
    type: 'website',
    locale: 'en_GB',
  },
}

function money(value: number | null): string {
  if (!value) return 'Fee not listed'
  return `$${Math.round(value).toLocaleString()}`
}

export default async function BangkokPage() {
  const schools = await getBangkokSchools()
  const feeValues = schools.flatMap(s => [s.fees_usd_min, s.fees_usd_max]).filter((v): v is number => typeof v === 'number' && v > 0)
  const feeMin = feeValues.length ? Math.min(...feeValues) : null
  const feeMax = feeValues.length ? Math.max(...feeValues) : null
  const boardingCount = schools.filter(s => s.boarding === true).length
  const curriculumCounts = new Map<string, number>()
  for (const school of schools) {
    for (const curriculum of school.curriculum ?? []) {
      const key = curriculum.toLowerCase().includes('ib') ? 'IB' : curriculum.toLowerCase().includes('igcse') ? 'IGCSE' : curriculum
      curriculumCounts.set(key, (curriculumCounts.get(key) ?? 0) + 1)
    }
  }
  const topCurricula = Array.from(curriculumCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'International Schools in Bangkok',
    numberOfItems: schools.length,
    itemListElement: schools.slice(0, 30).map((school, index) => ({
      '@type': 'ListItem', position: index + 1, name: school.name,
      url: `https://nanasays.school/schools/${school.slug}`,
    })),
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question', name: 'How many international schools are in Bangkok?',
        acceptedAnswer: { '@type': 'Answer', text: `${schools.length} international schools in Bangkok are currently listed in the NanaSays directory.` },
      },
      ...(feeMin && feeMax ? [{
        '@type': 'Question', name: 'How much do international schools in Bangkok cost?',
        acceptedAnswer: { '@type': 'Answer', text: `The listed annual fee range is ${money(feeMin)} to ${money(feeMax)}. Fees vary by school, age group and what is included, so check each school profile.` },
      }] : []),
      {
        '@type': 'Question', name: 'Which curricula are available in Bangkok international schools?',
        acceptedAnswer: { '@type': 'Answer', text: `Bangkok schools in the NanaSays directory include ${topCurricula.map(([name]) => name).join(', ')} and other curricula. Use the IB and IGCSE pages to narrow the search.` },
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Nav />
      <main style={{ background: 'var(--off)', minHeight: '70vh' }}>
        <header style={{ background: 'var(--navy)', color: '#fff', padding: '72px 5% 58px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ color: 'var(--teal)', fontSize: 12, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>
              Thailand · Bangkok
            </div>
            <h1 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 'clamp(30px, 5vw, 54px)', lineHeight: 1.08, margin: '0 0 16px', letterSpacing: '-1px' }}>
              International Schools in Bangkok
            </h1>
            <p style={{ maxWidth: 700, color: 'rgba(255,255,255,.72)', fontSize: 17, lineHeight: 1.65, margin: 0 }}>
              Compare Bangkok international schools by curriculum, fees, boarding options and the admissions information available for each school.
            </p>
          </div>
        </header>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '30px 5% 80px' }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, marginBottom: 22 }}>
            <Link href="/" style={{ color: 'var(--blue)' }}>Home</Link> <span>›</span>{' '}
            <Link href="/countries/thailand" style={{ color: 'var(--blue)' }}>Thailand schools</Link> <span>›</span>{' '}
            <span>Bangkok</span>
          </nav>

          <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 22, marginBottom: 24 }}>
            <h2 style={{ margin: '0 0 10px', fontFamily: 'var(--font-nunito), Nunito, sans-serif', color: 'var(--navy)' }}>Choosing a Bangkok international school</h2>
            <p style={{ margin: 0, color: 'var(--body)', lineHeight: 1.7, fontSize: 14 }}>
              Bangkok has Thailand's broadest choice of international schools. Families can compare British schools offering IGCSE and A-Level pathways, IB schools, American schools and other international curricula. School location matters in Bangkok, so review the campus address and travel requirements alongside fees and academic information.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14, fontSize: 13, fontWeight: 700 }}>
              <Link href="/schools/thailand/ib" style={{ color: 'var(--blue)' }}>IB schools in Thailand →</Link>
              <Link href="/schools/thailand/igcse" style={{ color: 'var(--blue)' }}>IGCSE schools in Thailand →</Link>
              <Link href="/blog/international-schools-bangkok-guide" style={{ color: 'var(--blue)' }}>Bangkok school guide →</Link>
              <Link href="/blog/affordable-international-schools-bangkok" style={{ color: 'var(--blue)' }}>Affordable Bangkok schools →</Link>
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
            {[
              [`${schools.length}`, 'schools listed'],
              [feeMin && feeMax ? `${money(feeMin)}–${money(feeMax)}` : 'Varies', 'listed annual fees'],
              [`${boardingCount}`, 'boarding options'],
              [topCurricula.map(([name]) => name).join(' · ') || 'Multiple', 'curricula'],
            ].map(([value, label]) => (
              <div key={label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 14px' }}>
                <div style={{ color: 'var(--navy)', fontSize: 18, fontWeight: 900 }}>{value}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </section>

          <h2 style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', color: 'var(--navy)', margin: '0 0 14px' }}>Bangkok international schools</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 16 }}>
            {schools.slice(0, 60).map(school => (
              <Link key={school.id} href={`/schools/${school.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <article style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 18, height: '100%', boxSizing: 'border-box' }}>
                  <h3 style={{ fontSize: 16, color: 'var(--navy)', margin: '0 0 7px', lineHeight: 1.3 }}>{school.name}</h3>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>{school.city ?? 'Bangkok, Thailand'}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {(school.curriculum ?? []).slice(0, 3).map(c => <span key={c} style={{ background: 'var(--teal-bg)', color: 'var(--teal-dk)', padding: '3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{c}</span>)}
                  </div>
                  <div style={{ color: 'var(--navy)', fontSize: 13, fontWeight: 700 }}>{money(school.fees_usd_min)}{school.fees_usd_max ? `–${money(school.fees_usd_max)}` : ''} / year</div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
