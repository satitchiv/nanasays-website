import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getCountryPageMeta } from '@/lib/countryMeta'
import {
  getSchoolsByFilter,
  getFilterCombinations,
  filterSlugToLabel,
  isTypeFilter,
  isCurriculumFilter,
} from '@/lib/schools'

interface Props {
  params: { slug: string; filter: string }
}

export async function generateStaticParams() {
  const combos = await getFilterCombinations()
  return combos
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const meta = getCountryPageMeta(params.slug)
  if (!meta) return { title: 'Not Found' }
  const filterLabel = filterSlugToLabel(params.filter)
  const title = `${filterLabel} Schools in ${meta.name}`
  const description = `Find the best ${filterLabel.toLowerCase()} international schools in ${meta.name}. Browse fees, curriculum, boarding options and more on NanaSays.`
  return {
    title: `${title} · nanasays`,
    description,
    alternates: { canonical: `https://nanasays.school/schools/${params.slug}/${params.filter}` },
    openGraph: {
      title,
      description,
      images: [{ url: meta.heroImage, width: 1200, height: 630 }],
    },
  }
}

export default async function FilterPage({ params }: Props) {
  const meta = getCountryPageMeta(params.slug)
  if (!meta) notFound()

  if (!isTypeFilter(params.filter) && !isCurriculumFilter(params.filter)) notFound()

  const filterType = isTypeFilter(params.filter) ? params.filter : undefined
  const filterCurriculum = isCurriculumFilter(params.filter) ? params.filter : undefined
  const filterLabel = filterSlugToLabel(params.filter)

  const schools = await getSchoolsByFilter({
    country: meta.name,
    type: filterType,
    curriculum: filterCurriculum,
  })

  if (schools.length < 5) notFound()

  const pageTitle = `${filterLabel} Schools in ${meta.name}`

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: pageTitle,
    description: `Browse ${schools.length} ${filterLabel.toLowerCase()} international schools in ${meta.name}.`,
    numberOfItems: schools.length,
    itemListElement: schools.slice(0, 30).map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: s.name,
      url: `https://nanasays.school/schools/${s.slug}`,
    })),
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://nanasays.school' },
      { '@type': 'ListItem', position: 2, name: meta.name, item: `https://nanasays.school/countries/${params.slug}` },
      { '@type': 'ListItem', position: 3, name: pageTitle, item: `https://nanasays.school/schools/${params.slug}/${params.filter}` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Breadcrumb */}
      <div style={{
        marginTop: 60,
        background: 'var(--off)', borderBottom: '1px solid var(--border)',
        padding: '14px 5%',
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--muted)',
      }}>
        <Link href="/" style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>Home</Link>
        <span>›</span>
        <Link href={`/countries/${params.slug}`} style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>{meta.name}</Link>
        <span>›</span>
        <span style={{ color: 'var(--navy)', fontWeight: 700 }}>{filterLabel}</span>
      </div>

      {/* Hero band */}
      <div style={{
        background: 'var(--navy)',
        padding: '48px 5% 40px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--teal)',
            textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12,
          }}>
            {meta.name} · {filterLabel}
          </div>
          <h1 style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: 900,
            color: '#fff', letterSpacing: '-1px', lineHeight: 1.1, margin: '0 0 12px',
          }}>
            {pageTitle}
          </h1>
          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,.6)', margin: '0 0 20px',
            maxWidth: 560, lineHeight: 1.6,
          }}>
            {schools.length} school{schools.length !== 1 ? 's' : ''} found · free to browse
          </p>

          {/* Other filter pills for this country */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/countries/${params.slug}`} style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.7)',
              textDecoration: 'none', border: '1px solid rgba(255,255,255,.15)',
            }}>
              All {meta.name} schools
            </Link>
          </div>
        </div>
      </div>

      {/* School grid */}
      <main style={{ background: 'var(--off)', padding: '40px 5% 80px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}>
            {schools.map((school) => {
              const feesText = school.fees_original
                ? school.fees_original
                : school.fees_usd_min
                  ? `$${school.fees_usd_min.toLocaleString()}${school.fees_usd_max ? `–$${school.fees_usd_max.toLocaleString()}` : '+'}/yr`
                  : 'Contact school'

              const heroUrl = school.hero_image
                ?? `https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&q=70&auto=format&fit=crop`

              return (
                <Link key={school.id} href={`/schools/${school.slug}`} style={{ textDecoration: 'none' }}>
                  <article style={{
                    background: '#fff',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                    transition: 'box-shadow .15s, transform .15s',
                    height: '100%',
                  }}>
                    {/* Image */}
                    <div style={{ height: 160, overflow: 'hidden', position: 'relative' }}>
                      <Image
                        src={heroUrl}
                        alt={school.name}
                        fill
                        loading="lazy"
                        style={{ objectFit: 'cover' }}
                      />
                      {school.scholarship_available && (
                        <div style={{
                          position: 'absolute', top: 10, right: 10,
                          background: 'var(--teal)', color: '#fff',
                          fontSize: 10, fontWeight: 700, padding: '3px 8px',
                          borderRadius: 10, textTransform: 'uppercase', letterSpacing: '.5px',
                        }}>
                          Scholarships
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ padding: '16px 18px' }}>
                      <div style={{
                        fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                        fontWeight: 800, fontSize: 15, color: 'var(--navy)',
                        marginBottom: 4, lineHeight: 1.3,
                      }}>
                        {school.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                        {[school.city, school.country].filter(Boolean).join(', ')}
                        {school.school_type ? ` · ${school.school_type}` : ''}
                      </div>

                      {school.curriculum && school.curriculum.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                          {school.curriculum.slice(0, 3).map(c => (
                            <span key={c} style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 7px',
                              background: 'var(--teal-bg)', color: 'var(--teal-dk)',
                              borderRadius: 6, border: '1px solid rgba(52,195,160,.2)',
                            }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{
                        fontSize: 13, fontWeight: 700, color: 'var(--navy)',
                        borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4,
                      }}>
                        {feesText}
                      </div>
                    </div>
                  </article>
                </Link>
              )
            })}
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
