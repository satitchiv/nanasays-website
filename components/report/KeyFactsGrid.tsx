/**
 * <KeyFactsGrid> — 8-cell grid of key facts.
 *
 * Data comes from:
 *   schools (name, age_min, age_max, gender_split, boarding, city, country)
 *   school_structured_data (fees_local_min/max, fees_currency, curriculum_results, founded_year, student_count)
 *   school_sensitive (charity_number via dfe_prohibition or charity_commission record)
 */

import FeeText from '../FeeText'

type Props = {
  founded?: string | number | null
  head?: string | null
  chair?: string | null
  gender?: string | null
  ageMin?: number | null
  ageMax?: number | null
  studentCount?: number | null
  boarderCount?: number | null
  feesMin?: number | null
  feesMax?: number | null
  feesCurrency?: string | null
  sixthFormOffer?: string | null
  inspectorate?: string | null
  inspectionDate?: string | null
  charityNumber?: string | null
  charityLegalName?: string | null
}

function genderLabel(g?: string | null) {
  if (!g) return 'Co-ed'
  if (/girl/i.test(g)) return 'Girls'
  if (/boy/i.test(g))  return 'Boys'
  return 'Co-ed'
}

export default function KeyFactsGrid(props: Props) {
  const {
    founded, head, chair, gender, ageMin, ageMax, studentCount, boarderCount,
    feesMin, feesMax, feesCurrency, sixthFormOffer, inspectorate, inspectionDate,
    charityNumber, charityLegalName,
  } = props

  const ageRange = ageMin && ageMax ? `${ageMin}–${ageMax}` : null

  return (
    <section className="block" id="key-facts">
      <h2 className="block-title">Key facts</h2>
      <div className="kf-grid">
        {founded && (
          <div className="kf-cell">
            <div className="kf-label">Founded</div>
            <div className="kf-value">{founded}</div>
          </div>
        )}
        {head && (
          <div className="kf-cell">
            <div className="kf-label">Headteacher</div>
            <div className="kf-value">
              {head}
              {chair && <><br /><small>Chair of Governors: {chair}</small></>}
            </div>
          </div>
        )}
        {(ageRange || gender) && (
          <div className="kf-cell">
            <div className="kf-label">Ages</div>
            <div className="kf-value">
              {ageRange}{ageRange && gender ? ' ' : ''}{gender && `(${genderLabel(gender)})`}
            </div>
          </div>
        )}
        {studentCount && (
          <div className="kf-cell">
            <div className="kf-label">Pupils on roll</div>
            <div className="kf-value">
              {studentCount.toLocaleString()}
              {boarderCount && <> <small>({boarderCount.toLocaleString()} boarders)</small></>}
            </div>
          </div>
        )}
        {sixthFormOffer && (
          <div className="kf-cell">
            <div className="kf-label">Sixth Form offer</div>
            <div className="kf-value">{sixthFormOffer}</div>
          </div>
        )}
        {(feesMin || feesMax) && (
          <div className="kf-cell">
            <div className="kf-label">Fees</div>
            <div className="kf-value">
              <FeeText min={feesMin ?? 0} max={feesMax ?? feesMin ?? 0} originalCurrency={feesCurrency ?? 'GBP'} />
              {' '}<small>/ year</small>
            </div>
          </div>
        )}
        {(inspectorate || inspectionDate) && (
          <div className="kf-cell">
            <div className="kf-label">Inspectorate</div>
            <div className="kf-value">
              {inspectorate || 'ISI'}
              {inspectionDate && <> · last {inspectionDate}</>}
            </div>
          </div>
        )}
        {charityNumber && (
          <div className="kf-cell">
            <div className="kf-label">Legal form</div>
            <div className="kf-value">
              Charity {charityNumber}
              {charityLegalName && <> <small>({charityLegalName})</small></>}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
