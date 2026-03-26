import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getSchoolPairBySlug, getSchoolPairs, formatFees } from '@/lib/schools'
import type { School } from '@/lib/types'

interface Props {
  params: { pair: string }
}

function parsePair(pair: string): [string, string] | null {
  const idx = pair.lastIndexOf('-vs-')
  if (idx < 1) return null
  const slugA = pair.slice(0, idx)
  const slugB = pair.slice(idx + 4)
  if (!slugA || !slugB) return null
  return [slugA, slugB]
}

export async function generateStaticParams() {
  const pairs = await getSchoolPairs(500)
  return pairs.map(({ slugA, slugB }) => ({ pair: `${slugA}-vs-${slugB}` }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slugs = parsePair(params.pair)
  if (!slugs) return { title: 'Not Found' }
  const [a, b] = await Promise.all([
    getSchoolPairBySlug(slugs[0], slugs[0]),
    getSchoolPairBySlug(slugs[1], slugs[1]),
  ])
  const result = await getSchoolPairBySlug(slugs[0], slugs[1])
  if (!result) return { title: 'Not Found' }
  const [schoolA, schoolB] = result
  return {
    title: `${schoolA.name} vs ${schoolB.name} — School Comparison · nanasays`,
    description: `Compare ${schoolA.name} and ${schoolB.name} side by side — fees, curriculum, boarding, admissions and more. NanaSays helps you choose the right school.`,
  }
}

function Row({ label, a, b }: { label: string; a: string | null; b: string | null }) {
  return (
    <tr>
      <td style={{
        padding: '12px 16px', fontSize: 13, color: 'var(--muted)',
        borderBottom: '1px solid var(--border)', fontWeight: 600,
        background: 'var(--off)', width: '22%',
      }}>
        {label}
      </td>
      <td style={{
        padding: '12px 16px', fontSize: 13, color: 'var(--body)',
        borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)',
        width: '39%',
      }}>
        {a ?? <span style={{ color: 'var(--muted)' }}>—</span>}
      </td>
      <td style={{
        padding: '12px 16px', fontSize: 13, color: 'var(--body)',
        borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)',
        width: '39%',
      }}>
        {b ?? <span style={{ color: 'var(--muted)' }}>—</span>}
      </td>
    </tr>
  )
}

function schoolData(s: School) {
  return {
    fees: formatFees(s),
    type: s.school_type ?? null,
    curriculum: s.curriculum?.join(', ') ?? null,
    ages: s.age_min != null && s.age_max != null ? `${s.age_min}–${s.age_max}` : null,
    students: s.student_count ? s.student_count.toLocaleString() : null,
    boarding: s.boarding != null ? (s.boarding ? 'Yes' : 'Day only') : null,
    scholarships: s.scholarship_available != null ? (s.scholarship_available ? 'Available' : 'None listed') : null,
    nationalities: s.nationalities_count ? `${s.nationalities_count}+` : null,
    ibScore: s.ib_pass_rate ? `${s.ib_pass_rate}%` : null,
    uniPlacement: s.university_placement_rate ? `${s.university_placement_rate}%` : null,
    eal: s.eal_support != null ? (s.eal_support ? 'Yes' : 'No') : null,
    location: [s.city, s.country].filter(Boolean).join(', ') || null,
  }
}

export default async function ComparePage({ params }: Props) {
  const slugs = parsePair(params.pair)
  if (!slugs) notFound()

  const result = await getSchoolPairBySlug(slugs[0], slugs[1])
  if (!result) notFound()

  const [a, b] = result
  const da = schoolData(a)
  const db = schoolData(b)

  const pairSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${a.name} vs ${b.name} — School Comparison`,
    numberOfItems: 2,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: a.name, url: `https://nanasays.com/schools/${a.slug}` },
      { '@type': 'ListItem', position: 2, name: b.name, url: `https://nanasays.com/schools/${b.slug}` },
    ],
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://nanasays.com' },
      { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://nanasays.com/compare' },
      { '@type': 'ListItem', position: 3, name: `${a.name} vs ${b.name}`, item: `https://nanasays.com/compare/${params.pair}` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pairSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Breadcrumb */}
      <div style={{
        marginTop: 60, background: 'var(--off)',
        borderBottom: '1px solid var(--border)',
        padding: '14px 5%', display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--muted)',
      }}>
        <Link href="/" style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>Home</Link>
        <span>›</span>
        <span style={{ color: 'var(--navy)', fontWeight: 700 }}>Compare Schools</span>
      </div>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 5% 80px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)',
            textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12,
          }}>
            School Comparison
          </div>
          <h1 style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            fontSize: 'clamp(22px, 3.5vw, 34px)', fontWeight: 900,
            color: 'var(--navy)', letterSpacing: '-0.5px', margin: '0 0 8px',
          }}>
            {a.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>vs</span> {b.name}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
            {da.location}{da.location !== db.location ? ` · ${db.location}` : ''}
          </p>
        </div>

        {/* Quick school header cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          {[a, b].map(school => (
            <Link key={school.id} href={`/schools/${school.slug}`} style={{ textDecoration: 'none' }}>
              <div style={{
                border: '2px solid var(--border)', borderRadius: 12, padding: '20px 22px',
                background: '#fff', transition: 'border-color .15s',
              }}>
                <div style={{
                  fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                  fontWeight: 900, fontSize: 16, color: 'var(--navy)', marginBottom: 4,
                }}>
                  {school.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                  {[school.city, school.country].filter(Boolean).join(', ')}
                </div>
                <span style={{
                  fontSize: 12, color: 'var(--teal-dk)', fontWeight: 700,
                }}>
                  View full profile →
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Comparison table */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                <th style={{ padding: '14px 16px', fontSize: 11, color: 'rgba(255,255,255,.4)', textAlign: 'left', fontWeight: 600, width: '22%' }}></th>
                <th style={{ padding: '14px 16px', fontSize: 13, color: '#fff', textAlign: 'left', fontWeight: 800, borderLeft: '1px solid rgba(255,255,255,.1)', width: '39%' }}>
                  {a.name}
                </th>
                <th style={{ padding: '14px 16px', fontSize: 13, color: '#fff', textAlign: 'left', fontWeight: 800, borderLeft: '1px solid rgba(255,255,255,.1)', width: '39%' }}>
                  {b.name}
                </th>
              </tr>
            </thead>
            <tbody>
              <Row label="Location" a={da.location} b={db.location} />
              <Row label="School type" a={da.type} b={db.type} />
              <Row label="Annual fees" a={da.fees} b={db.fees} />
              <Row label="Curriculum" a={da.curriculum} b={db.curriculum} />
              <Row label="Ages" a={da.ages} b={db.ages} />
              <Row label="Students" a={da.students} b={db.students} />
              <Row label="Boarding" a={da.boarding} b={db.boarding} />
              <Row label="Scholarships" a={da.scholarships} b={db.scholarships} />
              <Row label="Nationalities" a={da.nationalities} b={db.nationalities} />
              <Row label="IB pass rate" a={da.ibScore} b={db.ibScore} />
              <Row label="Uni placement" a={da.uniPlacement} b={db.uniPlacement} />
              <Row label="EAL support" a={da.eal} b={db.eal} />
            </tbody>
          </table>
        </div>

        {/* CTA */}
        <div style={{
          marginTop: 40, textAlign: 'center',
          background: 'var(--teal-bg)', border: '1px solid rgba(52,195,160,.25)',
          borderRadius: 12, padding: '28px 32px',
        }}>
          <div style={{
            fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            fontWeight: 900, fontSize: 17, color: 'var(--navy)', marginBottom: 8,
          }}>
            Not sure which is right for your family?
          </div>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 18 }}>
            Ask Nana — describe your child and she will give you a personal recommendation.
          </p>
          <Link href="/ask" style={{
            background: 'var(--teal)', color: '#fff', padding: '12px 24px',
            borderRadius: 8, textDecoration: 'none',
            fontWeight: 700, fontSize: 14, display: 'inline-block',
          }}>
            Ask Nana for advice
          </Link>
        </div>
      </main>

      <Footer />
    </>
  )
}
