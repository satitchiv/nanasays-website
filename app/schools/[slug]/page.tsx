import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import FaqItem from '@/components/school/FaqItem'
import GalleryLightbox from '@/components/school/GalleryLightbox'
import { getSchoolBySlug, getSimilarSchools, formatFees, formatAges } from '@/lib/schools'
import type { School } from '@/lib/types'
import Link from 'next/link'
import { getServerT } from '@/lib/serverI18n'
import TrackView from '@/components/school/TrackView'
import RequestProspectusModal from '@/components/school/RequestProspectusModal'
import ShareButton from '@/components/school/ShareButton'
import { buildUtmUrl } from '@/lib/utm'
import FeeTableClient from '@/components/school/FeeTableClient'
import FeesRangeClient from '@/components/school/FeesRangeClient'
import { getSchoolFeed, getSchoolNews, getSchoolsWithFeeds, getSchoolPulse, getFollowerCount, getStatBarConfig, getDeadlines, getMostMentionedSchools } from '@/lib/eduworld'
import { createClient } from '@supabase/supabase-js'
import ListingReportPreview from '@/components/school/ListingReportPreview'
import type { StatBarConfig } from '@/lib/eduworld'
import SchoolPulseFeed from '@/components/SchoolPulseFeed'
import SchoolPulseStatBar from '@/components/SchoolPulseStatBar'
import PinnedActionCard from '@/components/PinnedActionCard'
import SchoolFollowForm from '@/components/SchoolFollowForm'
import FaqAccordion from '@/components/FaqAccordion'
import FaqSchema from '@/components/FaqSchema'
import SchoolSchema from '@/components/SchoolSchema'
import SchoolSummary from '@/components/SchoolSummary'
import NewsPageClient from '@/components/NewsPageClient'

export const revalidate = 86400 // revalidate school pages every 24 hours

interface Props {
  params: { slug: string }
  searchParams?: { followed?: string }
}

// Fields that indicate a school page has enough content to be worth indexing.
// Automatically removes noindex as enrich-schools fills these in.
const SEO_QUALITY_FIELDS: (keyof School)[] = [
  'description', 'fees_usd_min', 'curriculum', 'student_count',
  'hero_image', 'logo_url', 'instagram_url', 'university_placement_rate',
  'entry_exam_type', 'application_deadline', 'scholarship_details',
  'sports_facilities', 'typical_class_size', 'nationalities_count', 'boarding_type',
]
const SEO_INDEX_THRESHOLD = 4 // must have at least 4 quality fields filled

function isIndexable(school: School): boolean {
  const filled = SEO_QUALITY_FIELDS.filter(f => {
    const v = school[f]
    return v !== null && v !== undefined && v !== ''
  }).length
  return filled >= SEO_INDEX_THRESHOLD
}

const LOGO_BLOCKLIST = ['youtube', 'facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'social', '/icon', 'favicon', 'placeholder']
function isValidLogoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return !LOGO_BLOCKLIST.some(term => lower.includes(term))
}

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
}
function expandRegion(region: string | null | undefined, country: string | null | undefined): string | null {
  if (!region) return null
  if ((country === 'United States' || country === 'USA') && region.length === 2) {
    return US_STATES[region.toUpperCase()] ?? region
  }
  return region
}

function shortCurriculum(raw: string): string {
  const map: Record<string, string> = {
    'IB Primary Years Programme': 'IB',
    'IB Middle Years Programme': 'IB',
    'IB Diploma Programme': 'IB',
    'International Baccalaureate': 'IB',
    'Advanced Placement': 'AP',
    'Cambridge IGCSE': 'Cambridge',
    'Cambridge A Level': 'Cambridge',
    'Cambridge International': 'Cambridge',
    'English National Curriculum': 'British',
    'British Curriculum': 'British',
    'American Curriculum': 'American',
    'French Baccalaureate': 'French Bac',
    'German Abitur': 'German',
    'Montessori': 'Montessori',
    'CBSE': 'CBSE',
    'ICSE': 'ICSE',
  }
  return map[raw] ?? raw
}

function buildSchoolTitle(school: School): string {
  // Returns the full <title> including brand suffix.
  // Use title: { absolute: buildSchoolTitle(school) } to bypass the layout template.
  // Tiered fallback: richest format that fits in 60 chars, otherwise drop location,
  // then drop descriptor, then truncate — so Google never truncates our titles mid-word.
  const name = school.name ?? 'International School'
  const curr = school.curriculum?.[0] ? shortCurriculum(school.curriculum[0]) : null
  const descriptor = curr ? `${curr} School` : 'International School'
  const suffix = ' | NanaSays'
  const fits = (s: string) => (s + suffix).length <= 65

  if (school.city && school.country) {
    const t = `${name} — ${descriptor} in ${school.city}, ${school.country}`
    if (fits(t)) return t + suffix
  }
  if (school.city) {
    const t = `${name} — ${descriptor} in ${school.city}`
    if (fits(t)) return t + suffix
  }
  if (school.country) {
    const t = `${name} — ${descriptor} in ${school.country}`
    if (fits(t)) return t + suffix
  }
  const withDescriptor = `${name} — ${descriptor}`
  if (fits(withDescriptor)) return withDescriptor + suffix

  // Name-only — most long-named schools land here
  if ((name + suffix).length <= 65) return name + suffix

  // Hard truncate (very rare — school names > 54 chars)
  return name.slice(0, 65 - suffix.length - 1) + '\u2026' + suffix
}

function buildSchoolDescription(school: School): string {
  const curr = school.curriculum?.[0] ? shortCurriculum(school.curriculum[0]) : null
  const nat = school.nationalities_count
  const fees = school.fees_usd_min
  const loc = school.city ?? school.country ?? ''

  if (curr && nat && fees)
    return `${curr} curriculum · ${nat}+ nationalities · fees from $${fees.toLocaleString()}/yr. Compare admissions, boarding and more on NanaSays.`
  if (curr && fees)
    return `${curr} curriculum · fees from $${fees.toLocaleString()}/yr. Compare admissions and curriculum details for ${school.name} on NanaSays.`
  if (school.description)
    return `${school.description.slice(0, 116).trimEnd()} — compare fees and admissions on NanaSays.`
  return `Compare fees, admissions, and curriculum details for ${school.name} in ${loc} — all on NanaSays.`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const school = await getSchoolBySlug(params.slug)
  if (!school) return { title: 'School Not Found' }
  return {
    title: { absolute: buildSchoolTitle(school) },
    description: buildSchoolDescription(school),
    alternates: {
      canonical: `https://nanasays.school/schools/${params.slug}`,
    },
    robots: isIndexable(school)
      ? { index: true, follow: true }
      : { index: false, follow: true },
    other: { robots: 'max-snippet:-1, max-image-preview:large, max-video-preview:-1' },
    openGraph: {
      title: buildSchoolTitle(school),
      description: buildSchoolDescription(school),
      ...(school.hero_image && {
        images: [{ url: school.hero_image, width: 1200, height: 630, alt: school.name }],
      }),
    },
  }
}

function CheckIcon({ yes }: { yes: boolean }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: yes ? '#e8faf6' : '#fdecea',
      border: `2px solid ${yes ? '#7dd9bf' : '#f5c0bb'}`,
      color: yes ? 'var(--teal-dk)' : '#c0392b',
      fontSize: 15, fontWeight: 700,
    }}>
      {yes ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      )}
    </div>
  )
}

function SectionTitle({ children, as: Tag = 'h2' }: { children: React.ReactNode; as?: 'h2' | 'div' }) {
  return (
    <Tag style={{
      fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
      color: 'var(--teal-dk)', marginBottom: 18, paddingBottom: 10,
      borderBottom: '2px solid var(--border)', fontWeight: 800,
      fontFamily: 'var(--font-nunito), Nunito, sans-serif',
    }}>
      {children}
    </Tag>
  )
}

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ marginBottom: 52, ...style }}>{children}</div>
}

function FacilityItem({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 13, color: 'var(--body)', padding: '9px 14px',
      background: 'var(--off)', borderRadius: 6, border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0, display: 'inline-block' }} />
      {label}
    </div>
  )
}

function SidebarStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '9px 0', borderBottom: '1px solid var(--border)',
      fontSize: 17, gap: 8,
    }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent ? 'var(--teal-dk)' : 'var(--body)', textAlign: 'right', fontSize: 17, minWidth: 0, wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  )
}

function SidebarCard({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{
      background: dark ? 'var(--navy)' : '#fff',
      border: `1px solid ${dark ? 'var(--navy)' : 'var(--border)'}`,
      borderRadius: 10, padding: '20px 22px', marginBottom: 16,
      boxShadow: '0 2px 12px var(--shadow)',
    }}>
      {children}
    </div>
  )
}

function SidebarTitle({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{
      fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em',
      color: dark ? 'rgba(255,255,255,0.4)' : 'var(--muted)',
      marginBottom: 14, fontWeight: 700,
    }}>
      {children}
    </div>
  )
}

export default async function SchoolPage({ params, searchParams }: Props) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [school, similarSchools, schoolFeedItems, schoolNewsArticles, schoolsWithFeeds, schoolPulse, followerCount, statBarConfig, newsDeadlines, newsMentionedSchools, structuredDataRow] = await Promise.all([
    getSchoolBySlug(params.slug),
    getSchoolBySlug(params.slug).then(s => s ? getSimilarSchools(s) : []),
    getSchoolFeed(params.slug),
    getSchoolNews(params.slug),
    getSchoolsWithFeeds(),
    getSchoolPulse(params.slug),
    getFollowerCount(params.slug),
    getStatBarConfig(),
    getDeadlines(3),
    getMostMentionedSchools(5),
    supabase.from('school_structured_data').select('*').eq('school_slug', params.slug).maybeSingle(),
  ])

  if (!school) notFound()

  // Strip narrative JSONBs (paid content — report-only) before passing to listing preview
  const structuredForListing = structuredDataRow?.data ? (() => {
    const { report_verdict, report_parent_fit, report_tour_questions, ...safe } = structuredDataRow.data
    return safe
  })() : null

  // Build lookup for similar schools that have EduWorld feeds
  const feedSlugsWithCounts = Object.fromEntries(
    schoolsWithFeeds.map(s => [s.nanasays_slug, s.update_count])
  )
  const feedActivityRatings = Object.fromEntries(
    schoolsWithFeeds.map(s => [s.nanasays_slug, s.activity_rating])
  )
  const similarWithFeeds = similarSchools
    .filter(s => feedSlugsWithCounts[s.slug] !== undefined)
    .slice(0, 3)

  const t = getServerT()

  const fees = formatFees(school)
  const ages = formatAges(school)

  const scorecardItems = [
    school.founded_year != null && {
      value: `Est. ${school.founded_year}`,
      label: t('school_label_founded'),
      bar: Math.min(100, Math.round(((school.founded_year - 1800) / 225) * 100)),
    },
    school.student_count != null && {
      value: school.student_count.toLocaleString(),
      label: t('school_label_students'),
      bar: Math.min(100, Math.round((school.student_count / 2000) * 100)),
    },
    school.nationalities_count != null && {
      value: `${school.nationalities_count}+`,
      label: t('school_label_nationalities'),
      bar: Math.min(100, Math.round((school.nationalities_count / 80) * 100)),
    },
    school.student_teacher_ratio != null && {
      value: school.student_teacher_ratio,
      label: t('school_label_ratio'),
      bar: 90,
    },
    school.university_placement_rate != null && {
      value: `${school.university_placement_rate}%`,
      label: t('school_label_uni_placement'),
      bar: school.university_placement_rate,
    },
    school.ib_pass_rate != null && {
      value: `${school.ib_pass_rate}%`,
      label: t('school_label_ib_rate'),
      bar: school.ib_pass_rate,
      benchmark: 'World avg: 81%',
    },
    school.ap_pass_rate != null && {
      value: `${school.ap_pass_rate}%`,
      label: t('school_label_ap_rate'),
      bar: school.ap_pass_rate,
      benchmark: 'World avg: 60%',
    },
    school.teacher_count != null && {
      value: school.teacher_count.toLocaleString(),
      label: 'Teachers',
      bar: Math.min(100, Math.round((school.teacher_count / 200) * 100)),
    },
    school.typical_class_size != null && {
      value: String(school.typical_class_size),
      label: 'Avg Class Size',
      bar: Math.min(100, Math.round(100 - (school.typical_class_size / 35) * 100)),
    },
    school.acceptance_rate != null && {
      value: `${school.acceptance_rate}%`,
      label: 'Acceptance Rate',
      bar: school.acceptance_rate,
    },
  ].filter(Boolean) as { value: string; label: string; bar: number; benchmark?: string }[]

  const boolItems = [
    { label: t('school_bool_boarding'), value: school.boarding },
    { label: t('school_bool_scholarships'), value: school.scholarship_available },
    { label: t('school_bool_eal'), value: school.eal_support },
    { label: t('school_bool_sen'), value: school.sen_support },
    { label: t('school_bool_visa'), value: school.visa_support },
    { label: t('school_bool_rolling'), value: school.rolling_admissions },
    { label: 'Sibling Discount', value: school.sibling_discount },
    { label: 'Fees Include Boarding', value: school.fees_includes_boarding },
    { label: 'Bursaries Available', value: school.bursary_available },
    { label: 'CCF Programme', value: school.ccf },
    { label: 'Duke of Edinburgh', value: school.duke_of_edinburgh },
  ].filter(item => item.value != null)

  const allFacilities: { group: string; items: string[] }[] = []
  if (school.sports_facilities?.length) allFacilities.push({ group: 'Sports', items: school.sports_facilities })
  if (school.arts_programs?.length) allFacilities.push({ group: 'Arts', items: school.arts_programs })
  if (school.academic_facilities?.length) allFacilities.push({ group: 'Academic', items: school.academic_facilities })
  if (school.extracurriculars?.length) allFacilities.push({ group: 'Co-Curricular', items: school.extracurriculars.slice(0, 8) })

  const faqs = [
    // 1. Annual fees — always shown, 3-tier fallback, never blank
    {
      q: `What are the annual fees at ${school.name}?`,
      a: school.fees_by_grade
        ? `Fees at ${school.name} vary by year group. Contact the admissions office for a full fee schedule.`
        : school.fees_usd_min || school.fees_original
        ? `The annual fees at ${school.name} are ${fees} per academic year.`
        : `Contact the admissions office at ${school.name} directly for current fee information.`,
    },
    // 2. Boarding or day — always shown
    {
      q: `Is ${school.name} a boarding school or a day school?`,
      a: school.boarding
        ? `${school.name} is a ${school.school_type ?? 'co-educational'} school offering both boarding and day places.${school.boarding_type ? ` Boarding options include ${school.boarding_type}.` : ''}`
        : `${school.name} is a day school${school.school_type ? ` (${school.school_type})` : ''}. No residential boarding is offered.`,
    },
    // 3. Entrance exam — always shown
    {
      q: `Does ${school.name} require an entrance exam?`,
      a: school.entrance_exam_required
        ? `Yes — ${school.name} requires an entrance assessment as part of the admissions process.${school.entry_exam_type ? ` The assessment is the ${school.entry_exam_type}.` : ''}`
        : `No entrance exam is required at ${school.name}. ${school.admissions_process?.split('\n')[0] ?? 'Admission is based on academic records and a school reference.'}`,
    },
    // 4. Curriculum
    school.curriculum?.length && {
      q: `What curriculum does ${school.name} follow?`,
      a: (() => {
        const curricula = Array.from(new Set(school.curriculum as string[])).slice(0, 5)
        const hasIB = curricula.some((c: string) => /\bIB\b|IB Diploma|IB PYP|IB MYP|IB CP|IBDP|IBPYP|IBMYP/i.test(c))
        const hasBritish = curricula.some((c: string) => /British|A-Levels|IGCSE|GCSE/i.test(c))
        const list = curricula.length > 1
          ? curricula.slice(0, -1).join(', ') + ' and ' + curricula.slice(-1)[0]
          : curricula[0]
        return `${school.name} follows the ${list} curriculum.${hasIB ? ' The International Baccalaureate is recognised by universities worldwide.' : ''}${hasBritish ? ' The British curriculum is widely accepted for university entry globally.' : ''}`
      })(),
    },
    // 5. Ages
    school.age_min != null && {
      q: `What ages does ${school.name} accept?`,
      a: `${school.name} welcomes students aged ${school.age_min} to ${school.age_max}.${school.stages?.length ? ` The school covers ${school.stages.join(', ')}.` : ''}`,
    },
    // 6. Nationalities
    school.nationalities_count && {
      q: `What nationalities attend ${school.name}?`,
      a: `${school.name} welcomes students from over ${school.nationalities_count} nationalities, creating a genuinely international learning community.${school.international_student_percent ? ` Approximately ${school.international_student_percent}% of students are international.` : ''}`,
    },
    // 7. EAL / non-native English
    school.eal_support != null && {
      q: `Is ${school.name} suitable for non-native English speakers?`,
      a: school.eal_support
        ? `Yes — ${school.name} provides dedicated EAL (English as an Additional Language) support for students whose first language is not English.${school.eal_hours_per_week ? ` Students receive up to ${school.eal_hours_per_week} hours of EAL tuition per week.` : ''}${school.eal_cost_usd ? ` EAL support is available at an additional cost of $${school.eal_cost_usd.toLocaleString()} per year.` : ''}`
        : `${school.name} does not currently offer a dedicated EAL programme. A strong level of English proficiency is expected at admission.`,
    },
    // 8. Class size
    school.typical_class_size != null && {
      q: `What is the average class size at ${school.name}?`,
      a: `The average class size at ${school.name} is ${school.typical_class_size} students.${school.student_teacher_ratio ? ` The school maintains a ${school.student_teacher_ratio} student-to-teacher ratio.` : ''}`,
    },
    // 9. Student-teacher ratio (only if no class size — avoids overlap with #8)
    school.student_teacher_ratio && !school.typical_class_size && {
      q: `What is the student-teacher ratio at ${school.name}?`,
      a: `${school.name} maintains a ${school.student_teacher_ratio} student-to-teacher ratio, ensuring students receive personalised attention and support.`,
    },
    // 10. Total students
    school.student_count != null && {
      q: `How many students attend ${school.name}?`,
      a: `${school.name} has approximately ${school.student_count.toLocaleString()} students.${school.nationalities_count ? ` The student body represents over ${school.nationalities_count} nationalities.` : ''}${school.boarding && school.boarding_capacity ? ` The school has boarding capacity for ${school.boarding_capacity} students.` : ''}`,
    },
    // 11. Scholarships/bursaries
    (school.scholarship_available || school.bursary_available) && {
      q: `Does ${school.name} offer scholarships or financial assistance?`,
      a: [
        school.scholarship_available ? (school.scholarship_details ?? `${school.name} offers merit-based scholarships for eligible students.`) : null,
        school.bursary_available ? (school.bursary_details ?? 'Means-tested bursaries are also available for families who demonstrate financial need.') : null,
      ].filter(Boolean).join(' '),
    },
    // 12. University destinations
    (school.top_universities?.length || school.university_placement_rate != null) && {
      q: `Where do graduates of ${school.name} go to university?`,
      a: [
        school.university_placement_rate != null ? `${school.university_placement_rate}% of ${school.name} graduates go on to higher education.` : null,
        school.top_universities?.length ? `Recent graduates have been accepted at ${school.top_universities.slice(0, 5).join(', ')}${school.top_universities.length > 5 ? ' and other leading universities' : ''}.` : null,
      ].filter(Boolean).join(' '),
    },
    // 13. Accreditations
    school.accreditations?.length && {
      q: `Is ${school.name} accredited?`,
      a: `${school.name} is accredited by ${school.accreditations.slice(0, -1).join(', ')}${school.accreditations.length > 1 ? ' and ' : ''}${school.accreditations.slice(-1)[0]}.${school.verified_at ? ` Accreditation was last verified in ${new Date(school.verified_at).getFullYear()}.` : ''}`,
    },
    // 14. Languages
    school.languages?.length && {
      q: `What languages are taught at ${school.name}?`,
      a: `${school.name} offers instruction in ${school.languages.join(', ')}.`,
    },
    // 15. IB — matches any IB variant in the curriculum array
    school.curriculum?.some((c: string) => /\bIB\b|IB Diploma|IB PYP|IB MYP|IB CP|IBDP|IBPYP|IBMYP/i.test(c)) && {
      q: `Is ${school.name} a good school for IB?`,
      a: `${school.name} offers the IB Diploma Programme${school.ib_pass_rate ? ` with a ${school.ib_pass_rate}% pass rate` : ''}${school.ib_authorized_year ? `, and has been IB-authorised since ${school.ib_authorized_year}` : ''}.${school.student_teacher_ratio ? ` With a ${school.student_teacher_ratio} student-to-teacher ratio, students receive highly personalised academic support.` : ''}`,
    },
    // 16. Boarding fees
    school.boarding === true && {
      q: `What are the boarding fees at ${school.name}?`,
      a: school.boarding_fees_usd
        ? `Full boarding at ${school.name} costs approximately $${school.boarding_fees_usd.toLocaleString()} per year.${school.boarding_type ? ` The school offers ${school.boarding_type}.` : ''}`
        : `${school.name} offers boarding${school.boarding_type ? ` (${school.boarding_type})` : ''}. Contact the admissions office for current boarding fee information.`,
    },
    // 17. Airport/location
    (school.distance_airport || school.nearest_airport) && {
      q: `How far is ${school.name} from the nearest airport?`,
      a: [
        school.nearest_airport ? `The nearest airport to ${school.name} is ${school.nearest_airport}.` : null,
        school.distance_airport ? school.distance_airport : null,
        school.flight_hours_from_bkk ? `The school is approximately ${school.flight_hours_from_bkk} hours by flight from Bangkok.` : null,
      ].filter(Boolean).join(' '),
    },
    // 18. When to apply
    (school.admissions_open_month || school.application_deadline || school.rolling_admissions) && {
      q: `When should I apply to ${school.name}?`,
      a: [
        school.rolling_admissions ? `${school.name} operates rolling admissions, accepting applications throughout the year.` : null,
        school.admissions_open_month ? `Applications typically open in ${school.admissions_open_month}.` : null,
        school.application_deadline ? `The application deadline is ${school.application_deadline}.` : null,
        !school.rolling_admissions && !school.admissions_open_month ? `Contact the admissions team at ${school.name} for current application timelines.` : null,
      ].filter(Boolean).join(' '),
    },
    // 19. Expat recommendation
    (school.review_score || school.strengths?.length || school.unique_selling_points) && {
      q: `Is ${school.name} recommended for expat families?`,
      a: [
        school.review_score ? `${school.name} is rated ${school.review_score}/5 by families.` : null,
        school.strengths?.length && typeof school.strengths[0] === 'string' && !school.strengths[0].includes('[') ? school.strengths[0] : null,
        school.unique_selling_points ? school.unique_selling_points.split('\n')[0] : null,
        `${school.name} is consistently recommended by international and expat families.`,
      ].filter(Boolean).join(' '),
    },
    // 20. Virtual tour
    school.virtual_tour_url && {
      q: `Does ${school.name} offer a virtual tour?`,
      a: `Yes — prospective families can explore ${school.name} via an online virtual tour before visiting in person.`,
    },
    // 21. Inspection rating
    (school.inspection_rating || school.isi_summary) && {
      q: `What is the inspection rating of ${school.name}?`,
      a: [
        school.inspection_rating ? `${school.name} received a rating of "${school.inspection_rating}" from ${school.inspection_body ?? 'its most recent inspection'}.` : null,
        school.isi_summary ? school.isi_summary.split('.')[0] + '.' : null,
      ].filter(Boolean).join(' '),
    },
    // 22. Mid-year entry
    school.accepts_mid_year != null && {
      q: `Can my child join ${school.name} mid-year?`,
      a: school.accepts_mid_year
        ? `Yes — ${school.name} accepts applications throughout the year and can accommodate mid-year entry, which is ideal for families relocating mid-term.`
        : `${school.name} typically admits new students at the start of each academic term. Families relocating mid-year should contact the admissions office to discuss available options.`,
    },
  ].filter(Boolean) as { q: string; a: string }[]

  const mapQuery = school.address
    ? encodeURIComponent(school.address)
    : encodeURIComponent(`${school.name} ${school.city ?? ''} ${school.country ?? ''}`)

  const schoolSchema = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: school.name,
    ...(school.official_website && { url: school.official_website }),
    ...(school.description && { description: school.description }),
    address: {
      '@type': 'PostalAddress',
      addressCountry: school.country,
      ...(school.city && { addressLocality: school.city }),
      ...(school.address && { streetAddress: school.address }),
    },
    ...(school.fees_usd_min && {
      offers: {
        '@type': 'Offer',
        category: 'Tuition',
        priceRange: `$${school.fees_usd_min.toLocaleString()}–$${(school.fees_usd_max ?? school.fees_usd_min).toLocaleString()}`,
        priceCurrency: 'USD',
      },
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Tuition Fees',
        itemListElement: [
          {
            '@type': 'Offer',
            name: 'Annual Tuition',
            price: String(school.fees_usd_min),
            priceCurrency: 'USD',
            ...(school.fees_usd_max && school.fees_usd_max !== school.fees_usd_min && {
              priceSpecification: {
                '@type': 'PriceSpecification',
                minPrice: school.fees_usd_min,
                maxPrice: school.fees_usd_max,
                priceCurrency: 'USD',
              },
            }),
          },
        ],
      },
    }),
    ...(school.curriculum?.length && { curriculumsOffered: school.curriculum }),
    ...(school.student_count && { numberOfStudents: { '@type': 'QuantitativeValue', value: school.student_count } }),
    ...(school.founded_year && { foundingDate: String(school.founded_year) }),
    ...(school.contact_email && { email: school.contact_email }),
    ...(school.contact_phone && { telephone: school.contact_phone }),
    ...(school.hero_image && { image: school.hero_image }),
    ...(school.accreditations?.length && { hasCredential: school.accreditations.map((a: string) => ({ '@type': 'EducationalOccupationalCredential', credentialCategory: a })) }),
    ...(school.review_score && school.review_count && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: school.review_score,
        reviewCount: school.review_count,
        bestRating: 5,
      },
    }),
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://nanasays.school' },
      ...(school.country ? [{ '@type': 'ListItem', position: 2, name: school.country, item: `https://nanasays.school/countries/${school.country.toLowerCase().replace(/ /g, '-')}` }] : []),
      { '@type': 'ListItem', position: school.country ? 3 : 2, name: school.name, item: `https://nanasays.school/schools/${school.slug}` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schoolSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <SchoolSchema school={school} />
      <TrackView schoolId={school.id} />
      <Nav />

      {/* BREADCRUMB */}
      <div style={{
        background: 'var(--off)', padding: '14px 5%',
        borderBottom: '1px solid var(--border)', marginTop: 60,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto', fontSize: 12, color: 'var(--muted)',
          display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <Link href="/" style={{ color: 'var(--blue)' }}>Schools</Link>
          {school.country && <><span>/</span><Link href={`/countries/${school.country.toLowerCase().replace(/ /g, '-')}`} style={{ color: 'var(--blue)' }}>{school.country}</Link></>}
          {school.city && <><span>/</span><span>{school.city}</span></>}
          <span>/</span><span style={{ color: 'var(--navy)', fontWeight: 600 }}>{school.name}</span>
        </div>
      </div>

      {/* HERO */}
      <div style={{
        background: 'linear-gradient(135deg, #1B3252 0%, #1e3f6b 100%)',
        ...(school.hero_image ? {
          backgroundImage: `linear-gradient(135deg, rgba(27,50,82,0.88) 0%, rgba(30,63,107,0.82) 100%), url(${school.hero_image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 300' preserveAspectRatio='xMidYMid slice'%3E%3Cpath d='M0,300 Q360,100 720,200 T1440,120' fill='none' stroke='rgba(52,195,160,0.18)' stroke-width='1.2'/%3E%3Cpath d='M0,300 Q300,140 660,230 T1440,160' fill='none' stroke='rgba(255,255,255,0.1)' stroke-width='1'/%3E%3Cpath d='M0,300 Q420,60 780,170 T1440,80' fill='none' stroke='rgba(52,195,160,0.08)' stroke-width='0.8'/%3E%3Cpath d='M0,300 Q480,20 900,140 T1440,40' fill='none' stroke='rgba(255,255,255,0.05)' stroke-width='0.8'/%3E%3C/svg%3E"), linear-gradient(150deg, #0d2040 0%, #1B3252 55%, #1d3d6a 100%)`,
        }),
        color: '#fff', padding: '52px 5% 44px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="ns-school-hero-inner">
            <div style={{ flex: 1 }}>
              {/* Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{
                  display: 'inline-block',
                  background: 'rgba(52,195,160,0.15)', border: '1px solid rgba(52,195,160,0.3)',
                  color: 'var(--teal)', fontSize: 11, letterSpacing: '0.1em',
                  textTransform: 'uppercase', padding: '4px 14px', borderRadius: 100,
                }}>
                  {[school.country, school.region ?? school.city].filter(Boolean).join(' — ')}
                </div>
                {school.is_partner && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'var(--teal)', border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff', fontSize: 11, letterSpacing: '0.08em',
                    textTransform: 'uppercase', padding: '4px 14px', borderRadius: 100,
                    fontWeight: 800,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    Verified Partner
                  </div>
                )}
              </div>

              {/* School name */}
              <h1 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 900,
                letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 8,
              }}>
                {school.name}
              </h1>

              {/* Location */}
              {school.address && (
                <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  {school.address}
                  {school.distance_city && ` — ${school.distance_city}`}
                </div>
              )}

              {/* Motto */}
              {school.school_motto && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic', marginBottom: 20 }}>
                  "{school.school_motto}"
                </div>
              )}

              {/* Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
                {school.curriculum?.map(c => (
                  <span key={c} style={{
                    fontSize: 12, padding: '5px 13px', borderRadius: 100, fontWeight: 600,
                    background: 'rgba(52,195,160,0.15)', color: 'var(--teal)',
                    border: '1px solid rgba(52,195,160,0.3)',
                  }}>{c}</span>
                ))}
                {school.boarding === true && (
                  <span style={{
                    fontSize: 12, padding: '5px 13px', borderRadius: 100, fontWeight: 600,
                    background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}>{t('school_section_boarding')}</span>
                )}
                {school.scholarship_available && (
                  <span style={{
                    fontSize: 12, padding: '5px 13px', borderRadius: 100, fontWeight: 600,
                    background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}>Scholarships</span>
                )}
                {school.rolling_admissions && (
                  <span style={{
                    fontSize: 12, padding: '5px 13px', borderRadius: 100, fontWeight: 600,
                    background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}>Rolling Admissions</span>
                )}
              </div>
            </div>

              {/* Hero CTAs — Visit Website + Share */}
              <div className="ns-hero-ctas" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {school.official_website && (
                  <a
                    href={buildUtmUrl(school.official_website, 'hero-visit-website')}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: 'var(--teal)', color: '#fff',
                      padding: '11px 22px', borderRadius: 8, fontSize: 14,
                      fontWeight: 700, textDecoration: 'none',
                    }}
                    onClick={undefined}
                  >
                    Visit Official Website
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </a>
                )}
                <ShareButton schoolName={school.name} schoolSlug={school.slug} />
              </div>

            {/* Right badge */}
            <div className="ns-school-hero-badge">
              {isValidLogoUrl(school.logo_url) && (
                <div style={{
                  background: 'var(--navy)', borderRadius: 8, padding: '14px 18px',
                  marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}>
                  <img
                    src={school.logo_url!}
                    alt={`${school.name} logo`}
                    style={{ maxWidth: 120, maxHeight: 56, objectFit: 'contain', display: 'block' }}
                  />
                </div>
              )}
              {school.verified_at ? (
                <div style={{
                  fontSize: 13, color: 'var(--teal)',
                  background: 'rgba(52,195,160,0.1)', padding: '10px 16px',
                  borderRadius: 6, border: '1px solid rgba(52,195,160,0.25)',
                  fontWeight: 700,
                }}>
                  {t('school_verified')}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  {t('school_data_source')}
                </div>
              )}
            </div>
          </div>

          {/* Stats bar */}
          <div className="ns-stats-bar" style={{ gap: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden', marginTop: 32 }}>
            {[
              { label: t('school_stat_fees'), value: fees, sub: '' },
              school.university_placement_rate != null && { label: t('school_stat_uni_rate'), value: `${school.university_placement_rate}%`, sub: t('school_stat_graduates') },
              (school.age_min != null && school.age_max != null) && { label: t('school_stat_ages'), value: `${school.age_min} – ${school.age_max}`, sub: '' },
              school.student_teacher_ratio && { label: t('school_stat_ratio'), value: school.student_teacher_ratio, sub: t('school_stat_faculty') },
              school.nationalities_count && { label: t('school_stat_nationalities'), value: `${school.nationalities_count}+`, sub: t('school_stat_on_campus') },
            ].filter(Boolean).slice(0, 5).map((stat: any, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.05)', padding: '18px 20px',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>
                  {stat.label}
                </span>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--teal)', lineHeight: 1.2, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                  {stat.value}
                </span>
                {stat.sub && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{stat.sub}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="ns-school-layout" style={{ maxWidth: 1100, margin: '0 auto', padding: '44px 5%' }}>
        <main style={{ minWidth: 0 }}>
          <SchoolSummary school={school} />

          {/* FOLLOWED CONFIRMATION BANNER */}
          {searchParams?.followed === 'true' && (
            <div style={{
              padding: '12px 18px', marginBottom: 20,
              background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 8,
              fontSize: 13, fontWeight: 600, color: '#065f46',
            }}>
              You are now following {school?.name}. We will email you when there are important updates.
            </div>
          )}

          {/* EXPLORE THIS SCHOOL */}
          {(() => {
            const exploreItems = [
              school.official_website ? 'website' : null,
              school.prospectus_url ? 'prospectus' : (school.contact_email ? 'request-prospectus' : null),
              school.virtual_tour_url ? 'virtual-tour' : null,
              school.school_video_url ? 'video' : null,
            ].filter(Boolean)
            if (exploreItems.length === 0) return null
            return (
              <Section>
                {exploreItems.length >= 2 && <SectionTitle>Explore This School</SectionTitle>}
                <div className="ns-explore-section" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {school.official_website && (
                    <a
                      href={buildUtmUrl(school.official_website, 'explore-visit-website')}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: 'var(--navy)', color: '#fff',
                        padding: '12px 22px', borderRadius: 8, fontSize: 14,
                        fontWeight: 700, textDecoration: 'none',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      Visit Website
                    </a>
                  )}
                  {school.prospectus_url ? (
                    <a
                      href={buildUtmUrl(school.prospectus_url, 'explore-prospectus')}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: 'var(--off)', color: 'var(--navy)',
                        border: '1px solid var(--border)',
                        padding: '12px 22px', borderRadius: 8, fontSize: 14,
                        fontWeight: 700, textDecoration: 'none',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      View Prospectus
                    </a>
                  ) : school.contact_email ? (
                    <RequestProspectusModal schoolId={school.id} schoolName={school.name} schoolEmail={school.contact_email} />
                  ) : null}
                  {school.virtual_tour_url && (
                    <a
                      href={buildUtmUrl(school.virtual_tour_url, 'explore-virtual-tour')}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: 'var(--off)', color: 'var(--navy)',
                        border: '1px solid var(--border)',
                        padding: '12px 22px', borderRadius: 8, fontSize: 14,
                        fontWeight: 700, textDecoration: 'none',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                      Virtual Tour
                    </a>
                  )}
                  {school.school_video_url && (
                    <a
                      href={buildUtmUrl(school.school_video_url, 'explore-video')}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: 'var(--off)', color: 'var(--navy)',
                        border: '1px solid var(--border)',
                        padding: '12px 22px', borderRadius: 8, fontSize: 14,
                        fontWeight: 700, textDecoration: 'none',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      Watch Video
                    </a>
                  )}
                </div>
              </Section>
            )
          })()}

          {/* OPEN DAY BANNER */}
          {school.open_day_text && (
            <div className="ns-open-day-banner" style={{
              background: 'linear-gradient(135deg, var(--navy), #1e3f6b)',
              color: '#fff', borderRadius: 10, padding: '24px 28px',
              marginBottom: 44,
            }}>
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--teal)', marginBottom: 6 }}>
                  {t('school_open_day')}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{school.open_day_text}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  {t('school_open_day_sub')}
                </div>
              </div>
              {(school.open_day_url || school.official_website) && (
                <a
                  href={school.open_day_url
                    ? buildUtmUrl(school.open_day_url, 'open-day-link')
                    : buildUtmUrl(school.official_website!, 'open-day-link')}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    background: '#fff', color: 'var(--navy)', padding: '11px 24px',
                    borderRadius: 6, fontSize: 13, fontWeight: 700, textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {school.open_day_url ? 'View Open Days' : t('school_cta_register')}
                </a>
              )}
            </div>
          )}

          {/* VIRTUAL TOUR / VIDEO */}
          {(school.virtual_tour_url || school.school_video_url) && (
            <Section>
              <SectionTitle>Virtual Tour & Video</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {school.school_video_url && (
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: '#000' }}>
                    <video
                      controls
                      style={{ width: '100%', display: 'block', maxHeight: 380 }}
                      src={school.school_video_url}
                    />
                  </div>
                )}
                {school.virtual_tour_url && (
                  <a
                    href={school.virtual_tour_url} target="_blank" rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: 'var(--off)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600,
                      color: 'var(--navy)', textDecoration: 'none', width: 'fit-content',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
                    </svg>
                    Take a Virtual Tour
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* MAP */}
          <Section>
            <SectionTitle>{t('school_section_location')}</SectionTitle>
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <iframe
                src={`https://maps.google.com/maps?q=${mapQuery}&output=embed&z=14`}
                width="100%"
                height="280"
                style={{ border: 0, display: 'block' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div style={{
                padding: '14px 18px', background: '#fff',
                borderTop: '1px solid var(--border)',
                fontSize: 15, color: 'var(--muted)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>{school.address}</span>
                <a
                  href={`https://maps.google.com/?q=${mapQuery}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}
                >
                  {t('school_cta_maps')}
                </a>
              </div>
            </div>
            {(school.distance_city || school.distance_airport || school.bus_service || school.nearest_airport || school.flight_hours_from_bkk) && (
              <div className="ns-3col-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
                {school.nearest_airport && <FacilityItem label={`Airport: ${school.nearest_airport}`} />}
                {school.country?.toLowerCase() === 'thailand' && !!school.flight_hours_from_bkk && <FacilityItem label={`${school.flight_hours_from_bkk}h from Bangkok`} />}
                {school.distance_airport && <FacilityItem label={school.distance_airport} />}
                {school.distance_city && <FacilityItem label={school.distance_city} />}
                {school.bus_service && <FacilityItem label={t('school_transport_bus')} />}
              </div>
            )}
          </Section>

          {/* GALLERY — only shown when images exist */}
          {(school.gallery_images?.length ?? 0) > 0 && (() => {
            const placeholderLabels = ['Campus', 'Classrooms', 'Boarding', 'Sports', 'Performing Arts']
            const allImages = school.gallery_images!
            const cells = Array.from({ length: 5 }, (_, i) => ({
              imageUrl: allImages[i] ?? null,
              label: placeholderLabels[i],
              gridRow: i === 0 ? '1 / 3' : undefined,
            }))
            return <GalleryLightbox cells={cells} allImages={allImages} schoolName={school.name} />
          })()}

          {/* NANASAYS SCORECARD */}
          {(scorecardItems.length > 0 || boolItems.length > 0) && (
            <Section>
              <SectionTitle>{t('school_section_scorecard')}</SectionTitle>
              <div className="ns-scorecard-grid" style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
              }}>
                {scorecardItems.map((item, i) => (
                  <div key={i} style={{
                    background: 'var(--off)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '18px 16px',
                  }}>
                    <div style={{
                      fontSize: 28, fontWeight: 800, color: 'var(--navy)',
                      lineHeight: 1, marginBottom: 6,
                      fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                    }}>{item.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.4 }}>{item.label}</div>
                    <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${item.bar}%`, background: 'var(--teal)', borderRadius: 3 }} />
                    </div>
                    {item.benchmark && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>{item.benchmark}</div>}
                  </div>
                ))}
                {boolItems.map((item, i) => (
                  <div key={i} style={{
                    background: 'var(--off)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '18px 16px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', textAlign: 'center', gap: 8,
                  }}>
                    <CheckIcon yes={!!item.value} />
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* KEY DETAILS — curricula, accreditations, languages, support */}
          {(school.curriculum?.length || school.accreditations?.length || school.languages?.length ||
            school.eal_support != null || school.sen_support != null || school.sel_support != null || school.bus_service != null) && (
            <Section>
              <SectionTitle>{t('school_section_key_details')}</SectionTitle>
              <div className="ns-key-details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>

                {school.curriculum?.length ? (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{t('school_sub_curricula')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {school.curriculum.map(c => (
                        <div key={c} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: 'var(--body)' }}>{c}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--teal-dk)',
                            background: 'var(--teal-bg)', border: '1px solid rgba(52,195,160,.3)',
                            borderRadius: 100, padding: '3px 10px',
                          }}>{t('school_yes')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(school.eal_support != null || school.sen_support != null || school.sel_support != null || school.bus_service != null) ? (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{t('school_sub_support')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { label: t('school_bool_eal'), value: school.eal_support },
                        { label: t('school_bool_sen'), value: school.sen_support },
                        { label: t('school_sub_wellbeing'), value: school.sel_support },
                        { label: t('school_bool_visa'), value: school.visa_support },
                        { label: t('school_bool_bus'), value: school.bus_service },
                      ].filter(item => item.value != null).map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: 'var(--body)' }}>{item.label}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: item.value ? 'var(--teal-dk)' : 'var(--muted)',
                            background: item.value ? 'var(--teal-bg)' : 'var(--off2)',
                            border: `1px solid ${item.value ? 'rgba(52,195,160,.3)' : 'var(--border)'}`,
                            borderRadius: 100, padding: '3px 10px',
                          }}>{item.value ? 'Yes' : 'No'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {school.accreditations?.length ? (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{t('school_sub_accreditations')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {school.accreditations.map(acc => (
                        <span key={acc} style={{
                          background: '#fff', border: '1.5px solid var(--border)',
                          borderRadius: 7, padding: '8px 16px',
                          fontSize: 13, fontWeight: 700, color: 'var(--navy)', letterSpacing: '0.04em',
                        }}>{acc}</span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {school.languages?.length ? (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{t('school_sub_languages')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {school.languages.map(lang => (
                        <span key={lang} style={{
                          background: '#fff', border: '1.5px solid var(--border)',
                          borderRadius: 7, padding: '8px 16px',
                          fontSize: 13, fontWeight: 600, color: 'var(--body)',
                        }}>{lang}</span>
                      ))}
                    </div>
                  </div>
                ) : null}

              </div>
            </Section>
          )}

          {/* SCHOLARSHIPS — full detail when no scholarship_total_usd */}
          {(school.scholarship_available && school.scholarship_details && !school.scholarship_total_usd) || school.bursary_available ? (
            <Section>
              <SectionTitle>{t('school_section_scholarships')}</SectionTitle>
              <div style={{
                background: 'var(--navy)', borderRadius: 14, padding: '24px 28px',
                color: '#fff',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: 'rgba(52,195,160,.2)',
                    border: '1px solid rgba(52,195,160,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <span style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontWeight: 800, fontSize: 15, color: '#fff' }}>
                    {t('school_scholarship_merit')}
                  </span>
                </div>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,.8)', lineHeight: 1.75, margin: 0 }}>
                  {school.scholarship_details}
                </p>
              </div>
              {school.bursary_available && (
                <div style={{ marginTop: 16, padding: '18px 20px', background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                    Means-Tested Bursaries
                  </div>
                  <p style={{ fontSize: 14, color: '#556', lineHeight: 1.7, margin: 0 }}>
                    {school.bursary_details ?? 'Means-tested bursaries are available. Contact the school admissions office for details.'}
                  </p>
                </div>
              )}
            </Section>
          ) : null}

          {/* ACADEMIC PERFORMANCE */}
          {(school.ap_pass_rate != null || school.ib_pass_rate != null || school.university_placement_rate != null || school.sat_avg != null || school.act_avg != null || school.inspection_rating || school.a_level_results || school.gcse_results || school.oxbridge_rate != null || school.russell_group_rate != null) && (
            <Section>
              <SectionTitle>{t('school_section_academic')}</SectionTitle>
              <div className="ns-2col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
                {school.ap_pass_rate != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.ap_pass_rate}%
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>{t('school_label_ap_rate')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[{ label: school.name, pct: school.ap_pass_rate, school: true }, { label: t('school_label_world_avg'), pct: 60, school: false }].map(row => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                          <span style={{ width: 100, flexShrink: 0, color: 'var(--body)', fontSize: 11 }}>{row.label}</span>
                          <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${row.pct}%`, background: row.school ? 'var(--teal)' : '#b0c8e8', borderRadius: 4 }} />
                          </div>
                          <span style={{ width: 34, textAlign: 'right', fontWeight: 600, color: row.school ? 'var(--navy)' : 'var(--muted)', fontSize: 12 }}>{row.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {school.ib_pass_rate != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.ib_pass_rate}%
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>{t('school_label_ib_rate')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[{ label: school.name, pct: school.ib_pass_rate, school: true }, { label: t('school_label_world_avg'), pct: 81, school: false }].map(row => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <span style={{ width: 100, flexShrink: 0, color: 'var(--body)', fontSize: 11 }}>{row.label}</span>
                          <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${row.pct}%`, background: row.school ? 'var(--teal)' : '#b0c8e8', borderRadius: 4 }} />
                          </div>
                          <span style={{ width: 34, textAlign: 'right', fontWeight: 600, color: row.school ? 'var(--navy)' : 'var(--muted)', fontSize: 12 }}>{row.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {school.university_placement_rate != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.university_placement_rate}%
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>University Placement Rate</div>
                    <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${school.university_placement_rate}%`, background: 'var(--teal)', borderRadius: 4 }} />
                    </div>
                  </div>
                )}
                {school.scholarship_total_usd && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.scholarship_total_usd}
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>Scholarships Awarded</div>
                    <p style={{ fontSize: 13, color: '#556', lineHeight: 1.6 }}>{school.scholarship_details ?? 'Financial assistance and scholarships available.'}</p>
                  </div>
                )}
                {school.sat_avg != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.sat_avg}
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>SAT Average Score</div>
                    <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round((school.sat_avg / 1600) * 100)}%`, background: 'var(--teal)', borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>Max: 1600</div>
                  </div>
                )}
                {school.act_avg != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.act_avg}
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>ACT Average Score</div>
                    <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round((school.act_avg / 36) * 100)}%`, background: 'var(--teal)', borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>Max: 36</div>
                  </div>
                )}
                {school.inspection_rating && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.inspection_rating}
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>
                      {school.inspection_body ?? 'Inspection Rating'}
                    </div>
                    {school.pastoral_care_rating && (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pastoral: {school.pastoral_care_rating}</div>
                    )}
                  </div>
                )}
                {school.a_level_results && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.a_level_results}
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 600 }}>A-Level Results</div>
                  </div>
                )}
                {school.gcse_results && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.gcse_results}
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 600 }}>GCSE Results</div>
                  </div>
                )}
                {school.oxbridge_rate != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.oxbridge_rate}%
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>Oxbridge Acceptance</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* UK Oxbridge avg ~1% — update periodically */}
                      {[{ label: school.name, pct: Number(school.oxbridge_rate), isSchool: true }, { label: 'UK avg', pct: 1, isSchool: false }].map(row => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <span style={{ width: 80, flexShrink: 0, color: 'var(--body)', fontSize: 11 }}>{row.label}</span>
                          <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, row.pct * 5)}%`, background: row.isSchool ? 'var(--teal)' : '#b0c8e8', borderRadius: 4 }} />
                          </div>
                          <span style={{ width: 34, textAlign: 'right', fontWeight: 600, fontSize: 12, color: row.isSchool ? 'var(--navy)' : 'var(--muted)' }}>{row.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {school.russell_group_rate != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.russell_group_rate}%
                    </div>
                    <div style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 14, fontWeight: 600 }}>Russell Group Acceptance</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* UK Russell Group avg ~52% — update periodically */}
                      {[{ label: school.name, pct: Number(school.russell_group_rate), isSchool: true }, { label: 'UK avg', pct: 52, isSchool: false }].map(row => (
                        <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <span style={{ width: 80, flexShrink: 0, color: 'var(--body)', fontSize: 11 }}>{row.label}</span>
                          <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, row.pct * 1.5)}%`, background: row.isSchool ? 'var(--teal)' : '#b0c8e8', borderRadius: 4 }} />
                          </div>
                          <span style={{ width: 34, textAlign: 'right', fontWeight: 600, fontSize: 12, color: row.isSchool ? 'var(--navy)' : 'var(--muted)' }}>{row.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ISI INSPECTION REPORT */}
          {(school.isi_summary || school.isi_academic_quality || school.isi_key_strengths?.length) && (
            <Section>
              <SectionTitle>ISI Inspection Report</SectionTitle>
              {school.isi_summary && (
                <p style={{ color: '#334', marginBottom: 20, fontSize: 16, lineHeight: 1.85 }}>{school.isi_summary}</p>
              )}
              <div className="ns-2col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                {school.isi_academic_quality && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Academic Quality</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{school.isi_academic_quality}</div>
                  </div>
                )}
                {school.isi_pastoral_care && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Pastoral Care</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{school.isi_pastoral_care}</div>
                  </div>
                )}
                {school.isi_boarding_quality && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Boarding Quality</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{school.isi_boarding_quality}</div>
                  </div>
                )}
                {school.isi_standards_met != null && (
                  <div style={{ background: school.isi_standards_met ? 'var(--teal-bg)' : '#fdecea', border: `1px solid ${school.isi_standards_met ? 'rgba(52,195,160,.3)' : '#f5c0bb'}`, borderRadius: 10, padding: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>ISI Standards</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: school.isi_standards_met ? 'var(--teal-dk)' : '#c0392b' }}>
                      {school.isi_standards_met ? 'Met' : 'Not Met'}
                    </div>
                  </div>
                )}
              </div>
              {school.isi_key_strengths?.length ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Key Strengths</div>
                  <div className="ns-2col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {school.isi_key_strengths.map(s => <FacilityItem key={s} label={s} />)}
                  </div>
                </div>
              ) : null}
              {school.isi_areas_for_improvement?.length ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Areas for Development</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {school.isi_areas_for_improvement.map((area, i) => (
                      <div key={i} style={{ fontSize: 13, color: '#556', padding: '8px 14px', background: '#fff5f5', border: '1px solid #f5c0bb', borderRadius: 6 }}>{area}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {school.isi_report_url && (
                <a
                  href={school.isi_report_url} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: 'var(--navy)', color: '#fff',
                    borderRadius: 8, padding: '11px 20px', fontSize: 13, fontWeight: 700,
                    textDecoration: 'none', marginTop: 8,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  View Full ISI Report
                  {school.isi_report_date && ` (${school.isi_report_date})`}
                </a>
              )}
            </Section>
          )}

          {/* EXTENDED RESEARCH (structured_data preview + link to paid report) */}
          {structuredForListing && (
            <ListingReportPreview
              slug={params.slug}
              schoolName={school.name}
              structured={structuredForListing}
              studentCountFallback={school.student_count}
            />
          )}

          {/* ABOUT */}
          {school.description && (
            <Section>
              <SectionTitle>{t('school_section_about')}</SectionTitle>
              {school.description.split('\n\n').map((para, i) => (
                <p key={i} style={{ color: '#334', marginBottom: 14, fontSize: 16, lineHeight: 1.85 }}>{para}</p>
              ))}
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, fontFamily: "'Nunito Sans', sans-serif" }}>
                School data verified by NanaSays. Last updated: April 2026.
              </p>
            </Section>
          )}

          {/* WHY CHOOSE */}
          {school.unique_selling_points && (
            <Section>
              <SectionTitle>{t('school_section_why_choose')}</SectionTitle>
              {(() => {
                const usp = school.unique_selling_points!
                let items: string[]
                try {
                  const parsed = JSON.parse(usp)
                  items = Array.isArray(parsed) ? parsed.filter(Boolean) : [usp]
                } catch {
                  items = usp.split('\n').filter(Boolean)
                }
                if (items.length <= 1) {
                  return <p style={{ color: '#334', fontSize: 16, lineHeight: 1.85 }}>{items[0] ?? usp}</p>
                }
                return (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {items.map((point, i) => (
                      <li key={i} style={{
                        padding: '11px 0', borderBottom: '1px solid var(--border)',
                        fontSize: 18, color: '#334', display: 'flex',
                        alignItems: 'flex-start', gap: 12, lineHeight: 1.7,
                      }}>
                        <span style={{
                          width: 20, height: 20, background: 'var(--teal-bg)',
                          border: '2px solid var(--teal)', borderRadius: '50%',
                          flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ width: 6, height: 6, background: 'var(--teal)', borderRadius: '50%', display: 'block' }} />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                )
              })()}
            </Section>
          )}

          {/* STRENGTHS */}
          {school.strengths?.length && !school.unique_selling_points && (
            <Section>
              <SectionTitle>{t('school_section_why_choose')}</SectionTitle>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {school.strengths.map((s, i) => (
                  <li key={i} style={{
                    padding: '11px 0', borderBottom: '1px solid var(--border)',
                    fontSize: 18, color: '#334', display: 'flex',
                    alignItems: 'flex-start', gap: 12, lineHeight: 1.7,
                  }}>
                    <span style={{
                      width: 20, height: 20, background: 'var(--teal-bg)',
                      border: '2px solid var(--teal)', borderRadius: '50%',
                      flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ width: 6, height: 6, background: 'var(--teal)', borderRadius: '50%', display: 'block' }} />
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* UNIVERSITY DESTINATIONS */}
          {school.top_universities?.length && (
            <Section>
              <SectionTitle>{t('school_section_uni_destinations')}</SectionTitle>
              {school.university_placement_rate && (
                <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 16 }}>
                  {school.university_placement_rate}% of {school.name} graduates go on to higher education. Recent graduates have been accepted at universities including:
                </p>
              )}
              <div className="ns-3col-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {school.top_universities.map(uni => (
                  <div key={uni} style={{
                    background: 'var(--off)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: 14, fontSize: 13,
                    fontWeight: 600, color: 'var(--navy)', textAlign: 'center',
                  }}>
                    {uni}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* FEES */}
          {(school.fees_by_grade || school.fees_usd_min || school.fees_local_min) && (
            <Section>
              <SectionTitle>{t('school_section_fees')}</SectionTitle>
              {school.fees_by_grade ? (
                <FeeTableClient
                  fees={school.fees_by_grade as Record<string, number | string>}
                  currency={school.fees_currency ?? 'USD'}
                  boardingFeesUsd={school.boarding_fees_usd}
                />
              ) : school.fees_local_min && school.fees_local_currency ? (
                <FeesRangeClient
                  min={school.fees_local_min}
                  max={school.fees_local_max}
                  currency={school.fees_local_currency}
                />
              ) : (
                <div style={{
                  background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20,
                  fontSize: 15, fontWeight: 600, color: 'var(--navy)',
                }}>
                  {fees}
                </div>
              )}
              {school.fees_original && (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
                  Original currency: {school.fees_original}.{' '}
                  {school.application_fee_usd && `Application fee: $${school.application_fee_usd.toLocaleString()}.`}
                </p>
              )}
            </Section>
          )}

          {/* ADMISSIONS */}
          {school.admissions_process && (
            <Section>
              <SectionTitle>{t('school_section_admissions_process')}</SectionTitle>
              <ol style={{ listStyle: 'none', padding: 0 }}>
                {school.admissions_process.split('\n').filter(Boolean).map((step, i) => {
                  const cleanStep = step.replace(/^\s*(\d+[.)]\s*|Step\s*\d+[.:)]\s*)/i, '').trim()
                  return (
                    <li key={i} style={{
                      display: 'flex', gap: 16, padding: '14px 0',
                      borderBottom: '1px solid var(--border)', fontSize: 14, color: '#334', lineHeight: 1.6,
                    }}>
                      <span style={{
                        width: 28, height: 28, background: 'var(--teal)', color: '#fff',
                        borderRadius: '50%', fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>{i + 1}</span>
                      {cleanStep || step}
                    </li>
                  )
                })}
              </ol>
            </Section>
          )}

          {/* ADMISSIONS DETAILS */}
          {(school.application_deadline || school.admission_deposit_usd != null || school.waitlist || school.eal_cost_usd != null || school.entry_exam_type || school.admissions_open_month) && (
            <Section>
              <SectionTitle>{t('school_section_admissions_details')}</SectionTitle>
              <div className="ns-2col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {school.admissions_open_month && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>Admissions Open</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{school.admissions_open_month}</div>
                  </div>
                )}
                {school.entry_exam_type && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>Entrance Exam</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{school.entry_exam_type}</div>
                  </div>
                )}
                {school.application_deadline && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>{t('school_admissions_deadline')}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{school.application_deadline}</div>
                  </div>
                )}
                {school.admission_deposit_usd != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>Admission Deposit</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>${school.admission_deposit_usd.toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>due on acceptance</div>
                  </div>
                )}
                {school.eal_cost_usd != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>EAL Support Cost</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>${school.eal_cost_usd.toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{t('school_fees_per_year_add')}</div>
                    {school.eal_hours_per_week != null && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{school.eal_hours_per_week} hrs/week</div>
                    )}
                  </div>
                )}
                {school.sen_cost_usd != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>SEN Support Cost</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>${school.sen_cost_usd.toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{t('school_fees_per_year_add')}</div>
                  </div>
                )}
                {school.waitlist && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>{t('school_admissions_waitlist_policy')}</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.waitlist}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* BOARDING */}
          {school.boarding && (school.boarding_arrangements || school.boarding_type || school.boarding_facilities || school.single_rooms != null) && (
            <Section>
              <SectionTitle>{t('school_section_boarding')}</SectionTitle>
              {(school.boarding_type || school.single_rooms != null) && (
                <div className="ns-3col-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                  {school.boarding_type && (
                    <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Boarding Type</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{school.boarding_type}</div>
                    </div>
                  )}
                  {school.single_rooms != null && (
                    <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Single Rooms</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: school.single_rooms ? 'var(--teal-dk)' : 'var(--muted)' }}>{school.single_rooms ? 'Available' : 'Not available'}</div>
                    </div>
                  )}
                  {school.boarding_capacity && (
                    <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Capacity</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{school.boarding_capacity} students</div>
                    </div>
                  )}
                </div>
              )}
              {school.boarding_facilities && (
                <p style={{ color: '#334', marginBottom: 14, fontSize: 16, lineHeight: 1.85 }}>{school.boarding_facilities}</p>
              )}
              {school.boarding_arrangements && school.boarding_arrangements.split('\n\n').map((para, i) => (
                <p key={i} style={{ color: '#334', marginBottom: 14, fontSize: 16, lineHeight: 1.85 }}>{para}</p>
              ))}
            </Section>
          )}

          {/* SCHOOL DAY */}
          {school.school_day_structure && (
            <Section>
              <SectionTitle>{t('school_section_school_day')}</SectionTitle>
              <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: 22 }}>
                <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.school_day_structure}</p>
              </div>
            </Section>
          )}

          {/* STUDENT LIFE */}
          {(school.clubs?.length || school.food_options || school.uniform_requirement || school.house_system || school.house_names?.length) && (
            <Section>
              <SectionTitle>{t('school_section_student_life')}</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {school.house_system && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>House System</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.house_system}</p>
                  </div>
                )}
                {school.house_names?.length ? (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Houses</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {school.house_names.slice(0, 8).map(h => (
                        <span key={h} style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>{h}</span>
                      ))}
                      {school.house_names.length > 8 && (
                        <span style={{ padding: '8px 16px', fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                          and {school.house_names.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}
                {school.uniform_requirement && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Uniform</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.uniform_requirement}</p>
                  </div>
                )}
                {school.food_options && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Food &amp; Dining</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.food_options}</p>
                  </div>
                )}
                {school.clubs?.length ? (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Clubs &amp; Activities</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {school.clubs.map(club => (
                        <span key={club} style={{
                          background: '#fff', border: '1.5px solid var(--border)',
                          borderRadius: 7, padding: '8px 16px',
                          fontSize: 14, fontWeight: 600, color: 'var(--body)',
                        }}>{club}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Section>
          )}

          {/* FACILITIES */}
          {(allFacilities.length > 0 || school.sports_excellence_programmes?.length) && (
            <Section>
              <SectionTitle>{t('school_section_facilities')}</SectionTitle>
              {school.sports_excellence_programmes?.length ? (
                <div style={{ marginBottom: 24 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
                  }}>
                    Sports Excellence Programmes
                  </div>
                  <div className="ns-2col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {school.sports_excellence_programmes.map(item => <FacilityItem key={item} label={item} />)}
                  </div>
                </div>
              ) : null}
              {allFacilities.map(group => (
                <div key={group.group} style={{ marginBottom: 24 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
                  }}>
                    {group.group}
                  </div>
                  <div className="ns-2col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {group.items.map(item => <FacilityItem key={item} label={item} />)}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* WELLBEING & SAFETY */}
          {(school.mental_wellbeing || school.safeguarding) && (
            <Section>
              <SectionTitle>{t('school_section_wellbeing')}</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {school.mental_wellbeing && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Pastoral &amp; Mental Health</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.mental_wellbeing}</p>
                  </div>
                )}
                {school.safeguarding && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Safeguarding &amp; Child Protection</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.safeguarding}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* STUDENT DEMOGRAPHICS */}
          {(school.nationalities_count || school.age_min != null || school.gender_split || school.stages?.length) && (
            <Section>
              <SectionTitle>{t('school_section_demographics')}</SectionTitle>
              <div className="ns-scorecard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {school.gender_split && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>School Type</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>{school.gender_split}</div>
                  </div>
                )}
                {school.age_min != null && school.age_max != null && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>Age Range</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.age_min} – {school.age_max}
                    </div>
                    {school.stages && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                        {school.stages.map(stage => (
                          <div key={stage} style={{
                            fontSize: 12, padding: '4px 10px', borderRadius: 4,
                            background: 'var(--teal)', color: '#fff', width: 'fit-content',
                          }}>{stage}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {school.nationalities_count && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>Nationalities</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', lineHeight: 1, marginBottom: 8, fontFamily: 'var(--font-nunito), Nunito, sans-serif' }}>
                      {school.nationalities_count}+
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>countries represented on campus</div>
                  </div>
                )}
                {(school.boarding_capacity || school.international_student_percent) && (
                  <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 14 }}>Student Body</div>
                    {school.international_student_percent && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)', color: 'var(--muted)', gap: 8 }}>
                        <span>International</span><span style={{ fontWeight: 600, color: 'var(--body)' }}>{school.international_student_percent}%</span>
                      </div>
                    )}
                    {school.boarding_capacity && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', color: 'var(--muted)', gap: 8 }}>
                        <span>Boarding capacity</span><span style={{ fontWeight: 600, color: 'var(--body)' }}>{school.boarding_capacity}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* CURRICULUM BY STAGE */}
          {school.curriculum_results && (
            <Section>
              <SectionTitle>{t('school_section_curriculum_stage')}</SectionTitle>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: 'var(--navy)', color: '#fff' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, letterSpacing: '0.05em' }}>Stage</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, letterSpacing: '0.05em' }}>Curriculum</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, letterSpacing: '0.05em' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(school.curriculum_results as Record<string, { curriculum: string; notes: string | null; pass_rate: number | null }>).map(([stage, data], i) => (
                      <tr key={stage} style={{ background: i % 2 === 0 ? '#fff' : 'var(--off)' }}>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap' }}>{stage}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--body)' }}>{data.curriculum}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 }}>{data.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* SCHOOL BACKGROUND */}
          {(school.governance || school.religious_affiliation || school.awards || school.alumni_notable || school.thai_community) && (
            <Section>
              <SectionTitle>{t('school_section_background')}</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {school.governance && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Governance &amp; Ownership</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.governance}</p>
                  </div>
                )}
                {school.religious_affiliation && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Religious Affiliation</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.religious_affiliation}</p>
                  </div>
                )}
                {school.awards && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Awards &amp; Recognition</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.awards}</p>
                  </div>
                )}
                {school.alumni_notable && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Notable Alumni</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.alumni_notable}</p>
                  </div>
                )}
                {school.thai_community && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Thai Community</div>
                    <p style={{ fontSize: 18, color: '#334', lineHeight: 1.9, margin: 0 }}>{school.thai_community}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* FAQ */}
          {faqs.length > 0 && (
            <Section>
              <SectionTitle>{t('school_section_faqs')}</SectionTitle>
              {faqs.map((faq, i) => (
                <FaqItem key={i} question={faq.q} answer={faq.a} defaultOpen={i === 0} />
              ))}
            </Section>
          )}

          {/* SIMILAR SCHOOLS */}
          {similarSchools.length > 0 && (
            <Section>
              <SectionTitle>{t('school_section_similar')}</SectionTitle>
              <div className="ns-similar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {similarSchools.map(s => (
                  <Link key={s.id} href={`/schools/${s.slug}`} style={{
                    border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
                    textDecoration: 'none', display: 'block', transition: 'box-shadow 0.15s, transform 0.15s',
                  }}>
                    <div style={{
                      height: 110,
                      background: s.hero_image
                        ? `linear-gradient(135deg, rgba(27,50,82,0.35), rgba(30,63,107,0.25)), url(${s.hero_image})`
                        : 'linear-gradient(135deg, #ddf0ea, #b8e6d8)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, color: 'var(--teal-dk)',
                    }}>
                      {!s.hero_image && (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                      )}
                    </div>
                    <div style={{ padding: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 4, lineHeight: 1.3 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{s.city}, {s.country}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal-dk)' }}>
                        {s.fees_usd_min ? `From $${s.fees_usd_min.toLocaleString()} / ${t('school_fees_per_year')}` : t('school_contact_school')}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {/* SCHOOL PULSE — title + stat bar + feed, all under one heading */}
          {(schoolFeedItems.length > 0 || statBarConfig) && (
            <Section style={{ paddingTop: 20, marginTop: 16 }}>
              {/* Title sits above everything */}
              <div className="ew-widget ew-section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <p className="ew-section-title" style={{ margin: 0, flex: 1 }}>
                    School Pulse
                  </p>
                  {schoolPulse?.activity_rating && (
                    <span style={{
                      fontSize: 14, fontWeight: 600, borderRadius: 100, padding: '4px 14px', flexShrink: 0,
                      ...(schoolPulse.activity_rating === 'Very active'
                        ? { color: '#059669', background: '#d1fae5', border: '1px solid #a7f3d0' }
                        : schoolPulse.activity_rating === 'Active'
                        ? { color: '#2563eb', background: '#dbeafe', border: '1px solid #bfdbfe' }
                        : { color: '#666', background: 'var(--off)', border: '1px solid var(--border)' }
                      ),
                    }}>
                      {schoolPulse.activity_rating}
                    </span>
                  )}
                </div>
                <p className="ew-section-subtitle">
                  Live updates from {school.name}&apos;s official website · {schoolFeedItems.length} recent update{schoolFeedItems.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Stat bar — below title */}
              <SchoolPulseStatBar
                pulse={schoolPulse}
                school={school}
                config={statBarConfig}
              />

              {/* Pinned action card */}
              {schoolPulse?.pinned_item && (
                <div className="ew-widget" style={{ marginTop: 20 }}>
                  <PinnedActionCard
                    item={schoolPulse.pinned_item}
                    schoolName={school.name}
                  />
                </div>
              )}

              {/* Feed items */}
              {schoolFeedItems.length > 0 && (
                <div className="ew-widget" style={{ marginTop: 20 }}>
                  <SchoolPulseFeed
                    items={schoolFeedItems}
                    schoolName={school.name}
                    officialWebsite={school.official_website ?? null}
                  />
                </div>
              )}
            </Section>
          )}

          {/* IN THE NEWS — moved to full-width section below school layout */}

          {/* FALLBACK — no feed AND no news */}
          {schoolFeedItems.length === 0 && schoolNewsArticles.length === 0 && (
            <Section>
              <SectionTitle>Stay Informed</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {school.official_website && (
                  <a
                    href={buildUtmUrl(school.official_website, 'pulse-fallback-website')}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: 'var(--navy)', color: '#fff',
                      padding: '12px 22px', borderRadius: 8, fontSize: 14,
                      fontWeight: 700, textDecoration: 'none', width: 'fit-content',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    Visit {school.name} website
                  </a>
                )}

                {/* Ask Nana chips hidden — chatbot not in use */}

                {similarWithFeeds.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                      Similar schools with recent updates
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {similarWithFeeds.map(s => (
                        <Link
                          key={s.id}
                          href={`/schools/${s.slug}`}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8,
                            textDecoration: 'none', background: 'var(--off)',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', marginBottom: 2 }}>{s.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.city} · {s.curriculum?.[0]}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, color: 'var(--teal-dk)',
                              background: 'var(--teal-bg)', borderRadius: 100, padding: '3px 10px',
                              whiteSpace: 'nowrap',
                            }}>
                              {feedSlugsWithCounts[s.slug]} update{feedSlugsWithCounts[s.slug] !== 1 ? 's' : ''}
                            </span>
                            {feedActivityRatings[s.slug] && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, borderRadius: 100, padding: '2px 8px',
                                whiteSpace: 'nowrap',
                                ...(feedActivityRatings[s.slug] === 'Very active'
                                  ? { color: '#059669', background: '#d1fae5' }
                                  : feedActivityRatings[s.slug] === 'Active'
                                  ? { color: '#2563eb', background: '#dbeafe' }
                                  : { color: '#666', background: 'var(--off)' }
                                ),
                              }}>
                                {feedActivityRatings[s.slug]}
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

        </main>

        {/* SIDEBAR */}
        <aside className="ns-school-aside" style={{ position: 'sticky', top: 80, minWidth: 0 }}>
          <SidebarCard>
            <SidebarTitle>{t('school_sidebar_facts')}</SidebarTitle>
            {school.country && <SidebarStat label={t('school_sidebar_country')} value={school.country} />}
            {school.region && <SidebarStat label={t('school_sidebar_region')} value={expandRegion(school.region, school.country) ?? school.region} />}
            {school.city && !school.region && <SidebarStat label={t('school_sidebar_city')} value={school.city} />}
            {school.school_type && <SidebarStat label={t('school_sidebar_type')} value={school.school_type} />}
            {school.boarding_type && <SidebarStat label="Boarding Type" value={school.boarding_type} />}
            {ages && <SidebarStat label={t('school_sidebar_ages')} value={ages} />}
            {school.founded_year && <SidebarStat label={t('school_label_founded')} value={String(school.founded_year)} />}
            {school.ib_authorized_year && <SidebarStat label="IB Authorized" value={String(school.ib_authorized_year)} />}
            {!!school.campus_size_hectares && <SidebarStat label={t('school_sidebar_campus')} value={`${school.campus_size_hectares} ha`} />}
            {!!school.typical_class_size && <SidebarStat label="Avg Class Size" value={String(school.typical_class_size)} />}
            {school.student_teacher_ratio && <SidebarStat label={t('school_stat_ratio')} value={school.student_teacher_ratio} />}
            {school.nearest_airport && <SidebarStat label="Nearest Airport" value={school.nearest_airport} />}
            {!!school.flight_hours_from_bkk && <SidebarStat label="From Bangkok" value={`${school.flight_hours_from_bkk}h`} />}
            {!!school.university_placement_rate && <SidebarStat label={t('school_stat_uni_rate')} value={`${school.university_placement_rate}%`} accent />}
            {school.head_of_school && <SidebarStat label={t('school_sidebar_head')} value={school.head_of_school} />}
          </SidebarCard>

          {/* School admin claim prompt */}
          <div style={{
            borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4, marginBottom: 10,
          }}>
            <a
              href="/claim"
              style={{
                display: 'block', textAlign: 'center', fontSize: 12,
                color: 'var(--muted)', textDecoration: 'none',
                padding: '10px 0',
              }}
            >
              Are you the school admin?{' '}
              <span style={{ color: 'var(--teal-dk)', fontWeight: 700, textDecoration: 'underline' }}>
                Claim this listing
              </span>
            </a>
          </div>

          {school.official_website && (
            <a
              href={buildUtmUrl(school.official_website, 'sidebar-visit-website')} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'block', width: '100%', background: 'var(--teal)', color: '#fff',
                textAlign: 'center', padding: '14px 20px', borderRadius: 8, fontSize: 14,
                fontWeight: 700, textDecoration: 'none', marginBottom: 10, border: 'none',
              }}
            >
              {t('school_cta_website')}
            </a>
          )}

          {/* SOCIAL LINKS */}
          {(school.instagram_url || school.youtube_url) && (
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              {school.instagram_url && (
                <a
                  href={buildUtmUrl(school.instagram_url, 'sidebar-instagram')} target="_blank" rel="noopener noreferrer"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 8,
                    padding: '10px 0', fontSize: 12, fontWeight: 600, color: 'var(--body)',
                    textDecoration: 'none',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                  </svg>
                  Instagram
                </a>
              )}
              {school.youtube_url && (
                <a
                  href={buildUtmUrl(school.youtube_url, 'sidebar-youtube')} target="_blank" rel="noopener noreferrer"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'var(--off)', border: '1px solid var(--border)', borderRadius: 8,
                    padding: '10px 0', fontSize: 12, fontWeight: 600, color: 'var(--body)',
                    textDecoration: 'none',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.95C18.88 4 12 4 12 4s-6.88 0-8.59.47a2.78 2.78 0 0 0-1.95 1.95C1 8.12 1 12 1 12s0 3.88.46 5.58a2.78 2.78 0 0 0 1.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 0 0 1.95-1.95C23 15.88 23 12 23 12s0-3.88-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/>
                  </svg>
                  YouTube
                </a>
              )}
            </div>
          )}

        </aside>
      </div>

      {/* IN THE NEWS — single column with new card design */}
      {schoolNewsArticles.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 44, marginTop: 12 }}>
          <div className="ew-widget" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 5% 60px' }}>
            <NewsPageClient
              articles={schoolNewsArticles}
              deadlines={newsDeadlines}
              mentionedSchools={newsMentionedSchools}
              mode="school"
              currentSchoolSlug={params.slug}
            />
          </div>
        </div>
      )}

      {/* FOLLOW FORM — full width at bottom */}
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--teal-bg)' }}>
        <div className="ns-newsletter-grid" style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 5%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px 80px', alignItems: 'center' }}>

          {/* Left — copy */}
          <div>
            <div style={{ marginBottom: 10, fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Follow this school
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', marginBottom: 16, fontFamily: 'var(--font-nunito), Nunito, sans-serif', lineHeight: 1.2 }}>
              Stay informed about {school.name}
            </h2>
            <p style={{ fontSize: 16, color: 'var(--body)', marginBottom: 0, lineHeight: 1.7 }}>
              Choose what you want to hear about. We send one email when something relevant comes in — no spam, no daily digests.
            </p>
          </div>

          {/* Right — form */}
          <div>
            <SchoolFollowForm
              slug={params.slug}
              schoolName={school.name}
              initialCount={followerCount}
            />
          </div>

        </div>
      </div>

      <Footer />
    </>
  )
}
