import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

import RptHeader              from '@/components/report/RptHeader'
import VerdictBox, { Verdict } from '@/components/report/VerdictBox'
import KeyFactsGrid           from '@/components/report/KeyFactsGrid'
import CurriculumSection      from '@/components/report/CurriculumSection'
import UniversityDestinations from '@/components/report/UniversityDestinations'
import AdmissionsSection      from '@/components/report/AdmissionsSection'
import FeesSection            from '@/components/report/FeesSection'
import PastoralSection        from '@/components/report/PastoralSection'
import SchoolLifeSection      from '@/components/report/SchoolLifeSection'
import SportsSection          from '@/components/report/SportsSection'
import TennisSection          from '@/components/report/TennisSection'
import CommunityProfile       from '@/components/report/CommunityProfile'
import DailyLifeGrid          from '@/components/report/DailyLifeGrid'
import RecentSection          from '@/components/report/RecentSection'
import RegulatoryStatus       from '@/components/report/RegulatoryStatus'
import EntityMapping          from '@/components/report/EntityMapping'
import FinancialTable         from '@/components/report/FinancialTable'
import InspectionRecord       from '@/components/report/InspectionRecord'
import SafeguardingSection    from '@/components/report/SafeguardingSection'
import ParentFit, { ParentFitData }   from '@/components/report/ParentFit'
import TourQuestions, { TourQuestion } from '@/components/report/TourQuestions'
import Glossary               from '@/components/report/Glossary'
import Sources, { Source }    from '@/components/report/Sources'
import { SideTOC, MobileTOC } from '@/components/report/ReportNav'
import LocationSection        from '@/components/report/LocationSection'
import CrimeSafetySection     from '@/components/report/CrimeSafetySection'
import DossierOverview        from '@/components/report/DossierOverview'
import TierDivider            from '@/components/report/TierDivider'
import PreviewSections        from '@/components/report/PreviewSections'
import UnlockBanner           from '@/components/report/UnlockBanner'
import { computeDossierStats } from '@/lib/dossier-stats'
import { isUnlocked }         from '@/lib/paid-status'

import './report.css'

// Always render fresh from Supabase — no static caching while the generator
// pipeline is active. When we move to production we can swap to revalidate: 300
// so the page caches for 5 min between regenerations.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Props = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ unlocked?: string; just_unlocked?: string }>
}

async function loadAll(slug: string) {
  const [{ data: school }, { data: structured }, { data: sensitive }] = await Promise.all([
    supabase.from('schools').select('*').eq('slug', slug).maybeSingle(),
    supabase.from('school_structured_data').select('*').eq('school_slug', slug).maybeSingle(),
    supabase.from('school_sensitive').select('*').eq('school_slug', slug),
  ])
  return { school, structured, sensitive: sensitive || [] }
}

function findRow(rows: any[], source: string, dataType?: string) {
  return rows.find(r => r.source === source && (!dataType || r.data_type === dataType))
}

function extractFinancialYears(rows: any[]) {
  const charity = findRow(rows, 'charity_commission', 'financial_filing')
  if (!charity?.details) return []
  const fh = charity.details.financial_history
  const al = charity.details.assets_liabilities_history || []
  const years = fh?.years || al.map((a: any) => a.year)
  if (!years?.length) return []
  return years.map((year: string | number, i: number) => {
    const a = al.find((x: any) => x.year === year) || {}
    return {
      year,
      gross_income:      fh?.metrics?.total_gross_income?.[i] ?? null,
      total_expenditure: fh?.metrics?.total_expenditure?.[i] ?? null,
      total_assets:      a.total_assets ?? null,
      total_liabilities: a.total_liabilities ?? null,
      net_position:      a.net_position ?? null,
    }
  })
}

function extractCharityMeta(rows: any[]) {
  const row = findRow(rows, 'charity_commission', 'financial_filing')
  if (!row) return null
  const d = row.details || {}
  return {
    number: d.charity_number || null,
    legalName: d.charity_name || null,
    workingName: d.display_name || (Array.isArray(d.working_names) ? d.working_names[0] : null),
    registeredDate: d.registration_date || null,
    url: row.source_url || null,
    filingsUpToDate: d.filings_up_to_date ?? true,
  }
}

function extractCompaniesHouse(rows: any[]) {
  const row = findRow(rows, 'companies_house', 'financial_filing')
  if (!row) return null
  const d = row.details || {}
  return {
    companyNumber: d.company_number || null,
    companyName: d.company_name || null,
    url: row.source_url || null,
    officerResignationsLast2yr: d.officer_resignations_last_2yr ?? 0,
  }
}

function extractISIRow(rows: any[]) {
  return rows.find(r => r.source === 'isi' || r.data_type === 'inspection_report')
}

function toQuotes(arr: any, flag = false) {
  if (!Array.isArray(arr)) return []
  return arr.map((q: any) => typeof q === 'string' ? { text: q, flag } : q)
}

function extractISIDetails(rows: any[]) {
  const row = extractISIRow(rows)
  if (!row) return null
  const d = row.details || {}
  const date = d.inspection_date || row.date
  const formattedDate = date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  const monthsAgo = date ? Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24 * 30.44)) : null
  return {
    date,
    formattedDate,
    shortDate: date ? new Date(date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : null,
    monthsAgo,
    standardsMet: d.standards_met !== false,
    numberOfInspectors: d.number_of_inspectors || null,
    durationDays: d.duration_days || null,
    previousInspectionDate: d.previous_inspection_date || null,
    reportUrl: row.source_url || null,
    signatureQuotes: toQuotes(d.signature_quotes || d.quotes?.signature),
    wellbeingQuotes: toQuotes(d.wellbeing_quotes),
    academicQuotes: toQuotes(d.academic_quotes || d.quotes?.academic),
    sendNotes: d.send_notes || null,
    inspectionType: d.inspection_type || null,
    overallSummary: d.overall_summary || null,
    recommendations: toQuotes(d.recommendations, true),
  }
}

function extractTRA(rows: any[]) {
  const row = rows.find(r => r.source === 'dfe_prohibition')
  if (!row) return { verified: [], uncertain: 0, dropped: 0 }
  const d = row.details || {}
  return {
    verified: d.tra_verified_publications || [],
    uncertain: Array.isArray(d.tra_uncertain_publications) ? d.tra_uncertain_publications.length : 0,
    dropped: Array.isArray(d.tra_dropped_publications) ? d.tra_dropped_publications.length : 0,
  }
}

function buildRecentNewsItems(rows: any[], structured: any): Array<{ date: string; text: string }> {
  const items: Array<{ date: string; text: string }> = []

  const isi = extractISIRow(rows)
  if (isi) {
    const d = isi.details?.inspection_date || isi.date
    if (d) {
      const label = new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
      const std = isi.details?.standards_met !== false
      items.push({
        date: label,
        text: `<strong>ISI routine inspection:</strong> ${std ? 'all Standards met' : 'check findings'}${isi.details?.minor_items ? `; ${isi.details.minor_items} minor item(s) rectified during the inspection` : ''}.`,
      })
    }
  }

  const charity = findRow(rows, 'charity_commission', 'financial_filing')
  if (charity?.details?.latest_accounts_date) {
    const d = new Date(charity.details.latest_accounts_date)
    items.push({
      date: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      text: `<strong>Latest Charity Commission accounts filed</strong> for year ending ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    })
  }

  return items
}

function buildSources(rows: any[], structured: any, school: any): Source[] {
  const sources: Source[] = []

  if (school?.official_website) {
    sources.push({
      name: 'School website',
      detail: 'Admissions, fees, exam results, leadership',
      url: school.official_website,
      retrievedDate: structured?.extracted_at ? new Date(structured.extracted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined,
    })
  }

  const isi = extractISIRow(rows)
  if (isi) {
    sources.push({
      name: 'Independent Schools Inspectorate (ISI)',
      detail: isi.details?.inspection_date ? `Inspection ${new Date(isi.details.inspection_date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` : 'Inspection report',
      url: isi.source_url,
      retrievedDate: isi.retrieved_date,
    })
  }

  const charity = findRow(rows, 'charity_commission', 'financial_filing')
  if (charity) {
    sources.push({
      name: 'Charity Commission',
      detail: `Charity ${charity.details?.charity_number || '—'} (${charity.details?.charity_name || 'operating charity'})`,
      url: charity.source_url,
      retrievedDate: charity.retrieved_date,
    })
  }

  const ch = findRow(rows, 'companies_house', 'financial_filing')
  if (ch) {
    sources.push({
      name: 'Companies House',
      detail: `Company ${ch.details?.company_number || '—'}`,
      url: ch.source_url,
      retrievedDate: ch.retrieved_date,
    })
  }

  const tra = rows.find(r => r.source === 'dfe_prohibition')
  if (tra) {
    sources.push({
      name: 'DfE / Teaching Regulation Agency',
      detail: 'Teacher misconduct check (verified per-hit against school profile)',
      url: tra.details?.tra_publications_feed || tra.source_url,
      retrievedDate: tra.retrieved_date,
    })
  }

  if (structured?.location_profile) {
    const locDate = structured.extracted_at
      ? new Date(structured.extracted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : undefined
    sources.push({
      name: 'UK Police open data API',
      detail: 'Crime statistics within 1-mile radius of school postcode',
      url: 'https://data.police.uk/docs/',
      retrievedDate: locDate,
    })
    sources.push({
      name: 'OpenStreetMap / Overpass API',
      detail: 'Location data, nearby attractions, transport links',
      url: 'https://www.openstreetmap.org/',
      retrievedDate: locDate,
    })
  }

  return sources
}

export default async function SchoolReportPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = (await searchParams) ?? {}
  const isPaid = await isUnlocked(sp.unlocked)
  const justUnlocked = sp.just_unlocked === 'true'
  const { school, structured, sensitive } = await loadAll(slug)
  if (!school) notFound()

  const stats = computeDossierStats(structured, sensitive)

  const charity   = extractCharityMeta(sensitive)
  const ch        = extractCompaniesHouse(sensitive)
  const years     = extractFinancialYears(sensitive)
  const isi       = extractISIDetails(sensitive)
  const tra       = extractTRA(sensitive)

  const verdict:   Verdict | null       = structured?.report_verdict ?? null
  const parentFit: ParentFitData | null = structured?.report_parent_fit ?? null
  const tourQs:    TourQuestion[] | null = structured?.report_tour_questions ?? null

  // Leadership (head can be string or {name, title, tenure_start, ...})
  const lead = school.leadership || {}
  const headRaw = lead.head || lead.head_of_school || null
  const headObj = typeof headRaw === 'string' ? { name: headRaw } : (headRaw || null)
  const chairRaw = lead.governance?.chair_of_governors || lead.chair_of_governors || null
  const chairName = typeof chairRaw === 'string' ? chairRaw : (chairRaw?.name || null)
  const seniorTeam = Array.isArray(lead.senior_team) ? lead.senior_team : []

  // Signals for multiple sections
  const financialRed = years.length >= 2 && (() => {
    const [prev, last] = [years[years.length - 2], years[years.length - 1]]
    const prevL = prev.total_liabilities ?? 0
    const lastL = last.total_liabilities ?? 0
    return prevL > 0 && lastL >= prevL * 2
  })()

  // Compose sources
  const sourcesList = buildSources(sensitive, structured, school)
  const recentItems = buildRecentNewsItems(sensitive, structured)

  // Short sixth form label for Key Facts grid (not the full paragraph)
  const sixthFormShort = (() => {
    const curr = structured?.curriculum
    if (Array.isArray(curr) && curr.length > 0) {
      const postGCSE = curr.filter((p: string) => !['GCSE', 'IGCSE', 'O Level'].includes(p))
      if (postGCSE.length > 0) return postGCSE.slice(0, 4).join(' · ')
    }
    const sf = structured?.sixth_form_curriculum
    if (!sf) return null
    const first = sf.split('.')[0]
    return first.length <= 80 ? first : sf.slice(0, 70) + '…'
  })()

  return (
    <main className="report-page" id="top">
      <SideTOC />
      <div className="page">
        <RptHeader
          schoolName={school.name}
          slug={slug}
          subtitle={structured?.short_description || school.description || null}
          city={school.city}
          country={school.country}
          gender={school.gender_split}
          ageMin={school.age_min}
          ageMax={school.age_max}
          boarding={school.boarding}
          charityNumber={charity?.number}
          pdfUnlocked={isPaid}
        />

        <DossierOverview schoolName={school.name} stats={stats} />

        <UnlockBanner
          justUnlocked={justUnlocked}
          isPaid={isPaid}
          slug={slug}
          unlockHref={`/unlock?from=${encodeURIComponent(`/schools/${slug}/report`)}`}
        />

        <MobileTOC />

        {/* ═══ TIER A — verified overview ═══ */}
        <TierDivider
          tier="A"
          title="What the school says — verified"
          subtitle="Facts and figures as published by the school, cross-checked against primary sources."
        />

        {!isPaid ? (
          <PreviewSections
            schoolName={school.name}
            unlockHref={`/unlock?from=${encodeURIComponent(`/schools/${slug}/report`)}`}
            structured={structured}
            charity={charity}
            isi={isi}
            financialYearCount={years.length}
          />
        ) : (
          <>
            <VerdictBox verdict={verdict} />

            <ParentFit fit={parentFit} />

            <KeyFactsGrid
              founded={school.founded_year || lead.founded}
              head={headObj?.name || null}
              chair={chairName}
              gender={school.gender_split}
              ageMin={school.age_min}
              ageMax={school.age_max}
              studentCount={structured?.student_count || school.student_count}
              boarderCount={structured?.boarder_count}
              feesMin={structured?.fees_local_min || structured?.fees_min}
              feesMax={structured?.fees_local_max || structured?.fees_max}
              feesCurrency={structured?.fees_local_currency || structured?.fees_currency}
              sixthFormOffer={sixthFormShort}
              inspectorate={school.country === 'United Kingdom' ? 'ISI' : null}
              inspectionDate={isi?.shortDate}
              charityNumber={charity?.number}
              charityLegalName={charity?.legalName}
            />

            {recentItems.length > 0 && <RecentSection items={recentItems} />}

            <TierDivider
              tier="B"
              title="What the public data shows"
              subtitle="Our analysis of published exam results, destinations, sports, community, and fees."
            />

            <CurriculumSection
              curriculum={structured?.curriculum}
              sixthForm={structured?.sixth_form_curriculum}
              examResults={structured?.exam_results}
            />

            <UniversityDestinations destinations={structured?.university_destinations} />

            <AdmissionsSection
              admissionsFormat={structured?.admissions_format}
              registrationDeadline={structured?.registration_deadline}
              entryExamType={structured?.entry_exam_type}
            />

            <SchoolLifeSection schoolLife={structured?.school_life ?? null} />

            <PastoralSection
              description={structured?.pastoral_care}
              facilities={structured?.facilities}
              pastoralModel={structured?.pastoral_model}
            />

            <SportsSection sports={structured?.sports_profile} />

            <TennisSection tennis={structured?.sports_profile?.tennis} />

            <CommunityProfile
              community={structured?.student_community}
              totalPupilsFallback={structured?.student_count || school.student_count}
            />

            <DailyLifeGrid
              wellbeing={structured?.wellbeing_staffing}
              policies={structured?.policies_summary}
              boarding={school.boarding}
              totalPupils={structured?.student_count || school.student_count}
            />

            <FeesSection
              feesMin={structured?.fees_local_min || structured?.fees_min}
              feesMax={structured?.fees_local_max || structured?.fees_max}
              currency={structured?.fees_local_currency || structured?.fees_currency}
              feesByGrade={structured?.fees_by_grade}
              includesBoarding={structured?.fees_includes_boarding}
              applicationFee={structured?.application_fee_usd}
              scholarships={structured?.scholarships_available}
              bursariesNote={structured?.bursary_note}
            />

            <LocationSection
              location={structured?.location_profile ?? null}
              schoolName={school.name}
            />

            <TierDivider
              tier="C"
              title="Independently verified &amp; regulated"
              subtitle="Charity Commission, Companies House, ISI inspection quotes, safeguarding, and tour questions."
            />

            <RegulatoryStatus
              charity={charity ? {
                number: charity.number,
                legalName: charity.legalName,
                registeredDate: charity.registeredDate,
                filingsUpToDate: charity.filingsUpToDate,
              } : undefined}
              companiesHouse={ch ? {
                companyNumber: ch.companyNumber,
                multipleEntities: ch.companyName !== charity?.legalName && !!charity?.legalName,
                foundationEntity: ch.companyName && ch.companyName !== charity?.legalName ? ch.companyName : null,
                foundationNumber: ch.companyName && ch.companyName !== charity?.legalName ? ch.companyNumber : null,
              } : undefined}
              isi={isi ? {
                lastInspectionDate: isi.formattedDate,
                standardsMet: isi.standardsMet,
                minorItems: isi.recommendations?.length ?? null,
                inspectorate: 'ISI Inspection',
              } : undefined}
              safeguarding={{
                incidentReports5yr: 0,
                inspectorConfirmedEffective: isi?.standardsMet,
              }}
            />

            {charity?.number && (
              <section className="block" id="financial">
                <h2 className="block-title">Financial health</h2>
                <EntityMapping
                  schoolName={school.name}
                  charityLegalName={charity.legalName}
                  charityWorkingName={charity.workingName}
                  charityNumber={charity.number}
                  charityRegisteredDate={charity.registeredDate}
                  foundationName={ch?.companyName && ch.companyName !== charity.legalName ? ch.companyName : null}
                  foundationNumber={ch?.companyName && ch.companyName !== charity.legalName ? ch.companyNumber : null}
                  charityUrl={charity.url}
                  foundationUrl={ch?.url}
                />
                <FinancialTable years={years} />
                {financialRed && (
                  <div className="translate">
                    <p>
                      <strong>The one flag to probe:</strong> Liabilities more than doubled in one year. This sounds
                      alarming but isn&apos;t automatically a bad thing — it often just means the school took out a loan to
                      build something new, or started counting a long-term rental as a debt. The key fact: total assets
                      also grew in the same year, so the school&apos;s overall health improved. But ask the Bursar directly:
                      &quot;What caused liabilities to grow sharply in the latest accounts?&quot;
                    </p>
                  </div>
                )}
              </section>
            )}

            {isi && (
              <InspectionRecord
                inspectionDate={isi.formattedDate}
                inspectionAgeMonths={isi.monthsAgo}
                standardsMet={isi.standardsMet}
                numberOfInspectors={isi.numberOfInspectors}
                durationDays={isi.durationDays}
                previousInspectionDate={isi.previousInspectionDate}
                reportUrl={isi.reportUrl}
                signatureQuotes={isi.signatureQuotes}
                wellbeingQuotes={isi.wellbeingQuotes}
                academicQuotes={isi.academicQuotes}
                sendNotes={isi.sendNotes}
                inspectionType={isi.inspectionType}
                overallSummary={isi.overallSummary}
                recommendations={isi.recommendations}
              />
            )}

            <SafeguardingSection
              verifiedTRA={tra.verified}
              uncertainTRACount={tra.uncertain}
              droppedTRACount={tra.dropped}
              sirCount5yr={0}
              isiSafeguardingEffective={isi?.standardsMet}
              head={headObj ? { name: headObj.name, role: headObj.title, tenureStart: headObj.tenure_start } : null}
              chair={chairName}
              seniorTeam={seniorTeam.map((s: any) => ({ name: s.name, role: s.role, tenure_start: s.tenure_start }))}
            />

            <CrimeSafetySection
              crime={(structured?.location_profile as any)?.crime_summary ?? null}
            />

            <TourQuestions questions={tourQs} />
          </>
        )}

        <Glossary />

        <Sources sources={sourcesList} />
      </div>
    </main>
  )
}
