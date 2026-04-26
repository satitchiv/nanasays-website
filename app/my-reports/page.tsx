/**
 * /my-reports
 *
 * Parent-facing "your unlocked reports" dashboard. Shown after the unlock
 * flow completes. Lists every school with enough Deep Research data to
 * render a full report.
 *
 * Gated: unauthenticated visitors are redirected to /unlock.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { isUnlocked } from '@/lib/paid-status'
import './my-reports.css'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams?: Promise<{ just_unlocked?: string }>
}

async function loadSchools() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )
  const [{ data: structured }, { data: schools }] = await Promise.all([
    supabase
      .from('school_structured_data')
      .select('school_slug, exam_results, university_destinations, sports_profile, student_community, wellbeing_staffing, report_verdict'),
    supabase.from('schools').select('slug, name, city, country, fees_usd_min, fees_usd_max, student_count'),
  ])

  const byName = new Map((schools ?? []).map(s => [s.slug, s]))

  return (structured ?? [])
    .map(r => {
      const meta = byName.get(r.school_slug)
      const score = [
        r.exam_results, r.university_destinations, r.sports_profile,
        r.student_community, r.wellbeing_staffing, r.report_verdict,
      ].filter(Boolean).length
      return {
        slug: r.school_slug,
        name: meta?.name ?? r.school_slug,
        city: meta?.city ?? null,
        country: meta?.country ?? null,
        feesMin: meta?.fees_usd_min ?? null,
        feesMax: meta?.fees_usd_max ?? null,
        studentCount: meta?.student_count ?? null,
        score,
      }
    })
    .filter(s => s.score >= 3)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

function formatFeesRange(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  if (min && max && min !== max) return `$${Math.round(min / 1000)}k–$${Math.round(max / 1000)}k`
  const v = min || max
  return v ? `$${Math.round(v / 1000)}k` : null
}

export default async function MyReportsPage({ searchParams }: Props) {
  if (!(await isUnlocked())) {
    redirect('/unlock?from=/my-reports')
  }

  const sp = (await searchParams) ?? {}
  const justUnlocked = sp.just_unlocked === 'true'
  const schools = await loadSchools()

  return (
    <main className="my-reports-page">
      <div className="my-reports-wrap">
        <div className="my-reports-kicker">Deep Research · your library</div>
        <h1 className="my-reports-title">Your Deep Research reports</h1>
        <p className="my-reports-intro">
          {schools.length} school reports unlocked. New schools added to your library automatically.
        </p>

        {justUnlocked && (
          <div className="my-reports-success">
            <span className="my-reports-success-icon">✓</span>
            <div>
              <div className="my-reports-success-title">You&apos;re unlocked. Lifetime access confirmed.</div>
              <div className="my-reports-success-sub">Every report below is now yours to read, download, and return to.</div>
            </div>
          </div>
        )}

        <div className="my-reports-grid">
          {schools.map(s => (
            <Link href={`/schools/${s.slug}/report`} key={s.slug} className="my-reports-card">
              <div className="my-reports-card-name">{s.name}</div>
              <div className="my-reports-card-meta">
                {[s.city, s.country].filter(Boolean).join(' · ')}
              </div>
              <div className="my-reports-card-stats">
                {s.studentCount && <span>👥 {s.studentCount.toLocaleString()} students</span>}
                {formatFeesRange(s.feesMin, s.feesMax) && <span>💷 {formatFeesRange(s.feesMin, s.feesMax)}/yr</span>}
              </div>
              <div className="my-reports-card-cta">Open report →</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
