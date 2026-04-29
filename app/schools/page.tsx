import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import DirectoryClient, { type SchoolCard } from './DirectoryClient'
import './schools.css'

export const metadata: Metadata = {
  title: 'UK Independent Schools Directory | Nanasays',
  description: 'Browse 140 UK independent schools with deep research reports. Filter by boarding, sport, and more. Free to browse — unlock the full report for £39.',
  alternates: { canonical: 'https://nanasays.com/schools' },
}

export const revalidate = 3600

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function loadSchools(): Promise<SchoolCard[]> {
  // Pull from schools_status (the 140 substantially-crawled UK schools)
  // then join schools table for city/boarding/gender/fees/ages
  const [statusRes, schoolsRes] = await Promise.all([
    supabase
      .from('schools_status')
      .select('school_slug, name, profile_boarding_type, signature_sports, has_rugby_extracted, has_cricket_extracted, has_hockey_extracted, has_football_extracted, has_tennis_deep, pct_complete')
      .eq('is_uk_evidence', true)
      .eq('has_substantial_chunks', true)
      .order('name'),
    supabase
      .from('schools')
      .select('slug, city, boarding, gender_split, age_min, age_max, fees_usd_min')
      .eq('country', 'United Kingdom'),
  ])

  const statusRows = statusRes.data ?? []
  const schoolMap = new Map((schoolsRes.data ?? []).map(s => [s.slug, s]))

  return statusRows.map(row => {
    const school = schoolMap.get(row.school_slug)
    const rawSports: string[] = Array.isArray(row.signature_sports) ? row.signature_sports : []
    // Normalise capitalisation
    const sports = rawSports.map((s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())

    return {
      slug: row.school_slug,
      name: row.name ?? school?.city ?? row.school_slug,
      city: school?.city ?? null,
      boarding: school?.boarding ? 'boarding' : row.profile_boarding_type,
      gender_split: school?.gender_split ?? null,
      age_min: school?.age_min ?? null,
      age_max: school?.age_max ?? null,
      fees_min: school?.fees_usd_min ?? null,
      sports,
      has_rugby: row.has_rugby_extracted ?? false,
      has_cricket: row.has_cricket_extracted ?? false,
      has_hockey: row.has_hockey_extracted ?? false,
      has_football: row.has_football_extracted ?? false,
      has_tennis: row.has_tennis_deep ?? false,
      pct_complete: row.pct_complete ?? 0,
    }
  })
}

export default async function SchoolsPage() {
  const schools = await loadSchools()

  return (
    <>
      <Nav />
      <div className="dir-page">
        <header className="dir-header">
          <h1>UK Independent Schools</h1>
          <p className="dir-header-sub">{schools.length} schools with deep research reports · free to browse</p>
        </header>
        <DirectoryClient schools={schools} />
      </div>
      <Footer />
    </>
  )
}
