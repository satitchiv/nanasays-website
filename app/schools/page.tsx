import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import DirectoryClient, { type SchoolCard } from './DirectoryClient'
import { isPaidModeOn } from '@/lib/paid-mode'
import { getPublicSchoolsIndex } from '@/lib/school-page-data'
import { supabaseService } from '@/lib/supabase-admin'
import './schools.css'

export const metadata: Metadata = {
  title: 'UK Independent Schools Directory | Nanasays',
  description: isPaidModeOn()
    ? 'Browse 140 UK independent schools with deep research reports. Filter by boarding, sport, and more. Free to browse — unlock the full report for £39.'
    : 'Browse 140 UK independent schools. Filter by boarding, sport, location, fees and more.',
  alternates: { canonical: 'https://nanasays.school/schools' },
}

export const revalidate = 3600

async function loadSchools(): Promise<SchoolCard[]> {
  // Pull from schools_status (the 140 substantially-crawled UK schools)
  // then join schools table for city/boarding/gender/fees/ages.
  // Both reads go through service-role helpers so RLS lockdown on
  // schools_status doesn't break the directory.
  const sb = supabaseService()
  const [statusRows, schoolsRes] = await Promise.all([
    getPublicSchoolsIndex(),
    sb
      .from('schools')
      .select('slug, city, boarding, gender_split, age_min, age_max, fees_usd_min')
      .eq('country', 'United Kingdom'),
  ])

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
