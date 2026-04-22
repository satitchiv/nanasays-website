import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Dev-only endpoint powering /mockup-schools-index.html.
// Returns live completeness scores for every school that has
// any Deep Research fields populated in school_structured_data.
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  const [{ data: structured }, { data: schools }] = await Promise.all([
    supabase
      .from('school_structured_data')
      .select(
        'school_slug, exam_results, university_destinations, sports_profile, student_community, wellbeing_staffing, report_verdict',
      ),
    supabase.from('schools').select('slug, name'),
  ])

  const nameBySlug = new Map((schools ?? []).map(s => [s.slug, s.name]))

  const scored = (structured ?? [])
    .map(r => {
      const fields = {
        exam: !!r.exam_results,
        uni: !!r.university_destinations,
        sport: !!r.sports_profile,
        community: !!r.student_community,
        wellbeing: !!r.wellbeing_staffing,
        verdict: !!r.report_verdict,
      }
      const score = Object.values(fields).filter(Boolean).length
      return {
        slug: r.school_slug,
        name: nameBySlug.get(r.school_slug) ?? r.school_slug,
        score,
        fields,
      }
    })
    .filter(s => s.score >= 3)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  const byTier = {
    full: scored.filter(s => s.score === 6).length,
    mostly: scored.filter(s => s.score === 5).length,
    partial: scored.filter(s => s.score >= 3 && s.score <= 4).length,
  }

  return NextResponse.json({
    total: scored.length,
    byTier,
    updatedAt: new Date().toISOString(),
    schools: scored,
  })
}
