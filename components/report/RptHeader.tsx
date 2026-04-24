/**
 * <RptHeader> — School name + subtitle + meta strip at the top of the report page.
 *
 * Data lives in: schools (name, slug, city, country, gender_split, age_min, age_max, boarding)
 *                school_structured_data (short_description or similar subtitle source)
 */

type Props = {
  schoolName: string
  slug?: string
  subtitle?: string | null
  city?: string | null
  country?: string | null
  gender?: string | null
  ageMin?: number | null
  ageMax?: number | null
  boarding?: boolean | null
  charityNumber?: string | null
  reportDate?: string
  pdfUnlocked?: boolean
}

function isWikimarkup(text: string): boolean {
  return /^thumb\|/i.test(text.trim()) || /^\[\[/.test(text.trim()) || text.includes('|upright=')
}

function genderText(g?: string | null) {
  if (!g) return 'Co-ed'
  if (/girl/i.test(g)) return 'Girls'
  if (/boy/i.test(g))  return 'Boys'
  return 'Co-ed'
}

export default function RptHeader({
  schoolName, slug, subtitle, city, country, gender, ageMin, ageMax, boarding, charityNumber, reportDate, pdfUnlocked,
}: Props) {
  const ages = ageMin && ageMax ? `${ageMin}–${ageMax}` : ageMin ? `${ageMin}+` : null
  const displayDate = reportDate || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <header className="rpt-header">
      <div className="rpt-eyebrow">
        Deep School Report · Written for parents, not lawyers
        {slug && (
          <a href={`/api/schools/${slug}/report/pdf${pdfUnlocked ? '?unlocked=true' : ''}`}
             className="pdf-download"
             aria-label={`Download ${schoolName} Deep Report as PDF`}>
            ⬇ Download PDF
          </a>
        )}
      </div>
      <h1 className="rpt-title">{schoolName}</h1>
      {subtitle && !isWikimarkup(subtitle) && <p className="rpt-sub">{subtitle}</p>}

      <div className="rpt-meta">
        <div className="rpt-meta-item"><strong>Report date:</strong> {displayDate}</div>
        <div className="rpt-meta-item">
          <strong>School:</strong> {genderText(gender)}
          {ages ? `, ${ages}` : ''}
          {boarding ? ', boarding' : ', day'}
        </div>
        {(city || country) && (
          <div className="rpt-meta-item"><strong>Location:</strong> {[city, country].filter(Boolean).join(', ')}</div>
        )}
        {charityNumber && (
          <div className="rpt-meta-item"><strong>Charity no:</strong> {charityNumber}</div>
        )}
      </div>
    </header>
  )
}
