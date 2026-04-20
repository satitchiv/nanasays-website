/**
 * <RegulatoryStatus> — 4-row regulatory status table with "→ In plain English" primers.
 *
 * Each row is: Charity Commission / Companies House / ISI Inspection / Safeguarding.
 * Each gets a plain-English explainer underneath, per today's writing review.
 */

type Status = 'ok' | 'watch' | 'alert'

type Props = {
  charity?: {
    number?: string | null
    legalName?: string | null
    registeredDate?: string | null
    filingsUpToDate?: boolean | null
  }
  companiesHouse?: {
    companyNumber?: string | null
    multipleEntities?: boolean
    foundationEntity?: string | null
    foundationNumber?: string | null
  }
  isi?: {
    lastInspectionDate?: string | null
    standardsMet?: boolean | null
    minorItems?: number | null
    inspectorate?: string  // e.g. 'ISI', 'Ofsted'
  }
  safeguarding?: {
    incidentReports5yr?: number | null  // 0 = clean
    inspectorConfirmedEffective?: boolean | null
  }
  reportDate?: string
}

function verdictClass(s: Status) {
  return `reg-verdict verdict-${s}`
}

export default function RegulatoryStatus({ charity, companiesHouse, isi, safeguarding, reportDate }: Props) {
  const displayDate = reportDate || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <section className="block" id="reg-status">
      <h2 className="block-title">
        Regulatory status at a glance
        <span className="stamp">As of {displayDate}</span>
      </h2>

      <div className="reg-status">
        {charity && (
          <>
            <div className="reg-row">
              <div className="reg-src">Charity Commission<small>England & Wales</small></div>
              <div className="reg-detail">
                {charity.registeredDate && <>Registered <strong>{charity.registeredDate}</strong> · </>}
                {charity.number && <>Charity <strong>{charity.number}</strong> </>}
                {charity.legalName && <>({charity.legalName}) </>}
                {charity.filingsUpToDate ? '· Filings up to date.' : '· Filing status not confirmed.'}
              </div>
              <div className={verdictClass(charity.filingsUpToDate ? 'ok' : 'watch')}>
                {charity.filingsUpToDate ? 'On time' : 'Check filings'}
              </div>
            </div>
            <div className="reg-primer">
              In the UK, most private schools are registered charities. This means the government keeps a <strong>public record of their finances and legal status</strong>. "Filings up to date" means the school has submitted all required paperwork on time — a sign of a well-run organisation.
            </div>
          </>
        )}

        {companiesHouse && (
          <>
            <div className="reg-row">
              <div className="reg-src">Companies House<small>UK</small></div>
              <div className="reg-detail">
                {companiesHouse.multipleEntities ? (
                  <>Two entities. {companiesHouse.companyNumber && <>Operating school filed via company <strong>{companiesHouse.companyNumber}</strong>. </>}
                  {companiesHouse.foundationEntity && <>Separate <strong>{companiesHouse.foundationEntity}</strong>
                  {companiesHouse.foundationNumber && <> ({companiesHouse.foundationNumber})</>} is a fundraising arm, not the school.</>}</>
                ) : companiesHouse.companyNumber ? (
                  <>Company <strong>{companiesHouse.companyNumber}</strong> — single entity for the school.</>
                ) : (
                  <>No Companies House filing on record.</>
                )}
              </div>
              <div className={verdictClass(companiesHouse.multipleEntities ? 'watch' : 'ok')}>
                {companiesHouse.multipleEntities ? '2 entities' : 'Single entity'}
              </div>
            </div>
            <div className="reg-primer">
              Think of it like a restaurant that has a separate charity arm to raise donations — <strong>two different legal registrations, but still one school</strong>. The operating entity is the actual school. Any "Foundation" listed separately is a fundraising pot, not the operating school.
            </div>
          </>
        )}

        {isi && isi.lastInspectionDate && (
          <>
            <div className="reg-row">
              <div className="reg-src">{isi.inspectorate || 'ISI Inspection'}<small>Independent Schools Inspectorate</small></div>
              <div className="reg-detail">
                Last inspection <strong>{isi.lastInspectionDate}</strong>.
                {isi.standardsMet && ' All Standards met.'}
                {isi.minorItems && isi.minorItems > 0 && ` ${isi.minorItems} minor item${isi.minorItems === 1 ? '' : 's'} rectified during the inspection.`}
              </div>
              <div className={verdictClass(isi.standardsMet ? 'ok' : 'watch')}>
                {isi.standardsMet ? 'Fresh · clean' : 'Check findings'}
              </div>
            </div>
            <div className="reg-primer">
              The ISI is like <strong>Ofsted for private schools</strong> — a team of inspectors visits the school (sometimes unannounced), watches lessons, talks to pupils and staff, and checks records. There are <strong>five areas</strong> they grade. Passing all five means the school is doing everything it's legally required to do. "Fresh" just means the inspection happened recently, so you're not relying on old information.
            </div>
          </>
        )}

        {safeguarding && (
          <>
            <div className="reg-row">
              <div className="reg-src">Safeguarding<small>Charity Commission SIRs + DfE</small></div>
              <div className="reg-detail">
                {safeguarding.incidentReports5yr === 0
                  ? 'No serious incident reports filed in the last 5 years.'
                  : `${safeguarding.incidentReports5yr} serious incident report(s) on file in the last 5 years.`}
                {safeguarding.inspectorConfirmedEffective && ' Most recent ISI inspection confirmed safeguarding arrangements effective.'}
              </div>
              <div className={verdictClass(safeguarding.incidentReports5yr === 0 ? 'ok' : 'alert')}>
                {safeguarding.incidentReports5yr === 0 ? 'Clean' : 'Incidents on file'}
              </div>
            </div>
            <div className="reg-primer">
              Safeguarding = <strong>how a school keeps children safe from harm</strong> (abuse, bullying, inappropriate staff behaviour). Schools are legally required to report serious incidents. "No reports filed" means nothing serious enough to require a formal submission has occurred in the last 5 years.
            </div>
          </>
        )}
      </div>
    </section>
  )
}
