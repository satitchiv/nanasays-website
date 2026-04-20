/**
 * <ListingReportPreview> — premium preview block on the free public listing page.
 *
 * Renders non-sensitive sections from school_structured_data so that parents
 * landing from Google get a substantive preview. Sensitive data (Charity
 * Commission, Companies House, ISI inspection quotes, TRA, full narrative) is
 * held back for the £29 Deep Report.
 *
 * Reuses components from components/report/* — same code, wrapped in
 * `.report-page` so the existing CSS applies.
 */

import CurriculumSection      from '@/components/report/CurriculumSection'
import UniversityDestinations from '@/components/report/UniversityDestinations'
import AdmissionsSection      from '@/components/report/AdmissionsSection'
import CommunityProfile       from '@/components/report/CommunityProfile'
import FeesSection            from '@/components/report/FeesSection'
import SportsSection          from '@/components/report/SportsSection'
import '@/app/schools/[slug]/report/report.css'

type Props = {
  slug: string
  schoolName: string
  structured: any | null
  studentCountFallback?: number | null
}

export default function ListingReportPreview({ slug, schoolName, structured, studentCountFallback }: Props) {
  if (!structured) return null

  const hasAnything =
    structured.curriculum ||
    structured.exam_results ||
    structured.university_destinations ||
    structured.admissions_format ||
    structured.student_community ||
    structured.wellbeing_staffing ||
    structured.sports_profile ||
    structured.fees_by_grade ||
    structured.fees_local_min

  if (!hasAnything) return null

  const wellbeing = structured.wellbeing_staffing
  const totalStaff = wellbeing?.total_staff
  const ratio = wellbeing?.ratio_per_pupil

  return (
    <section className="report-page" style={{ background: 'transparent', margin: '32px 0' }}>
      <div className="page" style={{ padding: 0, maxWidth: '100%' }}>
        <div style={{
          background: 'linear-gradient(180deg, #fff 0%, var(--teal-bg, #E8FAF6) 100%)',
          border: '2px solid var(--teal, #34C3A0)',
          borderRadius: 16,
          padding: '24px 28px',
          marginBottom: 24,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 900, color: 'var(--teal-dk, #239C80)',
            letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 8,
          }}>
            Extended research · free preview
          </div>
          <h2 className="block-title" style={{ marginBottom: 8 }}>
            What we&apos;ve extracted from {schoolName}&apos;s published materials
          </h2>
          <p style={{ fontSize: 15, color: 'var(--body, #374151)', margin: 0, lineHeight: 1.6 }}>
            The sections below are the free part of our research — exam results, destinations, admissions,
            and community. For the full £29 <strong>Deep School Report</strong> — regulatory & financial
            analysis, inspection quotes, safeguarding verification, 5 pointed tour questions and a
            downloadable PDF — open the report.
          </p>
          <a
            href={`/schools/${slug}/report`}
            style={{
              display: 'inline-block',
              marginTop: 14,
              background: 'var(--navy, #1B3252)',
              color: '#fff',
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              padding: '10px 20px',
              borderRadius: 24,
              textDecoration: 'none',
            }}
          >
            Read the full Deep Report →
          </a>
        </div>

        <CurriculumSection
          curriculum={structured.curriculum}
          sixthForm={structured.sixth_form_curriculum}
          examResults={structured.exam_results}
        />

        <FeesSection
          feesMin={structured.fees_local_min || structured.fees_min}
          feesMax={structured.fees_local_max || structured.fees_max}
          currency={structured.fees_local_currency || structured.fees_currency}
          feesByGrade={structured.fees_by_grade}
          includesBoarding={structured.fees_includes_boarding}
          applicationFee={structured.application_fee_usd}
        />

        <UniversityDestinations destinations={structured.university_destinations} />

        <AdmissionsSection
          admissionsFormat={structured.admissions_format}
          registrationDeadline={structured.registration_deadline}
          entryExamType={structured.entry_exam_type}
        />

        <SportsSection sports={structured.sports_profile} compact />

        <CommunityProfile
          community={structured.student_community}
          totalPupilsFallback={structured.student_count || studentCountFallback}
        />

        {(totalStaff || ratio) && (
          <section className="block">
            <h2 className="block-title">Wellbeing team (preview)</h2>
            <p>
              This school publishes a pastoral & mental-health team of{' '}
              <strong>{totalStaff ?? '—'}</strong> staff
              {ratio && <> — roughly <strong>1 staff member per {ratio} pupils</strong></>}.
              The full Deep Report (£29) includes the ISI inspection context,
              verified safeguarding record, and the sector benchmark.
            </p>
            <a href={`/schools/${slug}/report#wellbeing`} style={{ fontWeight: 700 }}>
              Read the wellbeing analysis →
            </a>
          </section>
        )}
      </div>
    </section>
  )
}
