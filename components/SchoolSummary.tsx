import { CURRENCY_SYMBOL } from '@/lib/currencies'

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
  fees_currency?: string | null
  fees_local_min?: number | null
  fees_local_max?: number | null
  fees_local_currency?: string | null
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

  {
    // Prefer local-currency fields. Fall back to the schools-table currency
    // tag (often already correct GBP/CHF) before assuming USD.
    const currency = school.fees_local_currency
      || (school.fees_currency && school.fees_currency !== 'USD' ? school.fees_currency : null)
      || 'USD'
    const min = school.fees_local_min ?? school.fees_usd_min
    const max = school.fees_local_max ?? school.fees_usd_max
    const symbol = CURRENCY_SYMBOL[currency] ?? currency
    if (min && max) {
      parts.push(`Annual tuition ranges from ${symbol}${min.toLocaleString()} to ${symbol}${max.toLocaleString()} ${currency}.`)
    } else if (min) {
      parts.push(`Annual tuition from ${symbol}${min.toLocaleString()} ${currency}.`)
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
