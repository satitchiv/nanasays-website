interface SchoolData {
  name?: string | null
  city?: string | null
  country?: string | null
  official_website?: string | null
  student_count?: number | null
  founded_year?: number | null
  description?: string | null
  contact_phone?: string | null
  contact_email?: string | null
}

export default function SchoolSchema({ school }: { school: SchoolData }) {
  const entity: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'School',
  }

  if (school.name) entity.name = school.name
  if (school.official_website) entity.url = school.official_website
  if (school.student_count) entity.numberOfStudents = school.student_count
  if (school.founded_year) entity.foundingDate = String(school.founded_year)
  if (school.description) entity.description = school.description.slice(0, 500)

  if (school.city || school.country) {
    const address: Record<string, string> = { '@type': 'PostalAddress' }
    if (school.city) address.addressLocality = school.city
    if (school.country) address.addressCountry = school.country
    entity.address = address
  }

  const sameAs: string[] = []
  if (school.official_website) sameAs.push(school.official_website)
  if (sameAs.length > 0) entity.sameAs = sameAs.length === 1 ? sameAs[0] : sameAs

  if (school.contact_phone) entity.telephone = school.contact_phone
  if (school.contact_email) entity.email = school.contact_email

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(entity) }}
    />
  )
}
