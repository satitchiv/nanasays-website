interface SchoolData {
  name?: string
  curriculum?: string[] | null
  city?: string | null
  country?: string | null
  founded_year?: number | null
  student_count?: number | null
  age_min?: number | null
  age_max?: number | null
  fees_usd_min?: number | null
  fees_usd_max?: number | null
}

export default function SchoolSummary({ school }: { school: SchoolData }) {
  const parts: string[] = []

  const curriculum = school.curriculum?.length ? school.curriculum.join(' / ') : null

  if (school.name && curriculum && school.city && school.country) {
    parts.push(`${school.name} is a ${curriculum} school in ${school.city}, ${school.country}.`)
  } else if (school.name && school.city && school.country) {
    parts.push(`${school.name} is an international school in ${school.city}, ${school.country}.`)
  }

  if (school.founded_year) {
    parts.push(`Founded in ${school.founded_year}.`)
  }

  if (school.student_count) {
    const ageRange = school.age_min != null && school.age_max != null
      ? ` for students aged ${school.age_min}–${school.age_max}`
      : ''
    parts.push(`It serves ${school.student_count.toLocaleString()} students${ageRange}.`)
  }

  if (school.fees_usd_min || school.fees_usd_max) {
    if (school.fees_usd_min && school.fees_usd_max) {
      parts.push(`Annual tuition ranges from $${school.fees_usd_min.toLocaleString()} to $${school.fees_usd_max.toLocaleString()} USD.`)
    } else if (school.fees_usd_min) {
      parts.push(`Annual tuition from $${school.fees_usd_min.toLocaleString()} USD.`)
    }
  }

  if (!parts.length) return null

  return (
    <p style={{
      fontSize: 13,
      color: 'var(--muted)',
      lineHeight: 1.65,
      margin: '12px 0 0',
    }}>
      {parts.join(' ')}
    </p>
  )
}
