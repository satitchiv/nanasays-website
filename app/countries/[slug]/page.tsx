import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getCountryPageMeta } from '@/lib/countryMeta'
import { getSchoolsForCountryPage, getCountrySchoolCounts } from '@/lib/schools'
import { REGIONS_DATA } from '@/lib/regionData'
import CountryPageClient from '@/components/country/CountryPageClient'

interface Props { params: { slug: string } }

export async function generateStaticParams() {
  const counts = await getCountrySchoolCounts()
  const countriesWithData = new Set(Object.keys(counts).filter(c => counts[c] > 0))
  return REGIONS_DATA.flatMap(r =>
    r.countries
      .filter(c => countriesWithData.has(c.name))
      .map(c => ({ slug: c.slug }))
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const meta = getCountryPageMeta(params.slug)
  if (!meta) return { title: 'Country not found · nanasays' }
  return {
    title: `${meta.name} International Schools · nanasays`,
    description: meta.nanaNote.replace(/['"]/g, ''),
    openGraph: { images: [{ url: meta.heroImage }] },
  }
}

export const revalidate = 3600 // revalidate country pages every hour

export default async function CountryPage({ params }: Props) {
  const meta = getCountryPageMeta(params.slug)
  if (!meta) notFound()

  const schools = await getSchoolsForCountryPage(meta.name)
  if (!schools.length) notFound()

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `International Schools in ${meta.name}`,
    description: meta.nanaNote,
    numberOfItems: schools.length,
    itemListElement: schools.slice(0, 20).map((s, i) => ({
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
      { '@type': 'ListItem', position: 2, name: 'Browse Regions', item: 'https://nanasays.school/#regions' },
      { '@type': 'ListItem', position: 3, name: meta.name, item: `https://nanasays.school/countries/${params.slug}` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />
      <CountryPageClient meta={meta} schools={schools} />
      <Footer />
    </>
  )
}
