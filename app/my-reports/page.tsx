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
      <MyReportsStyles />
    </main>
  )
}

function MyReportsStyles() {
  return (
    <style>{`
      .my-reports-page {
        min-height: 100vh;
        background: var(--off);
        padding: 60px 20px 80px;
        font-family: 'Nunito Sans', sans-serif;
      }
      .my-reports-wrap { max-width: 1100px; margin: 0 auto; }
      .my-reports-kicker {
        font-size: 11px; font-weight: 900; color: var(--teal-dk);
        letter-spacing: .14em; text-transform: uppercase; margin-bottom: 10px;
      }
      .my-reports-title {
        font-family: 'Nunito', sans-serif;
        font-size: 34px; font-weight: 900; color: var(--navy);
        letter-spacing: -.02em; line-height: 1.15; margin: 0 0 10px;
      }
      .my-reports-intro {
        font-size: 15px; color: var(--muted);
        margin: 0 0 28px;
      }
      .my-reports-success {
        display: flex; align-items: center; gap: 14px;
        background: #D1FAE5; border: 1px solid #A7F3D0;
        color: #065F46; padding: 18px 22px; border-radius: 12px;
        margin-bottom: 28px;
      }
      .my-reports-success-icon {
        width: 36px; height: 36px; background: #065F46;
        color: #fff; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-weight: 900; font-size: 18px; flex-shrink: 0;
      }
      .my-reports-success-title {
        font-family: 'Nunito', sans-serif; font-weight: 800;
        font-size: 15px; margin-bottom: 2px;
      }
      .my-reports-success-sub { font-size: 13px; opacity: .85; }

      .my-reports-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 14px;
      }
      .my-reports-card {
        background: #fff; border: 1px solid var(--border);
        border-radius: 12px; padding: 20px;
        text-decoration: none; color: inherit;
        display: flex; flex-direction: column; gap: 6px;
        transition: border-color .15s, box-shadow .15s, transform .15s;
      }
      .my-reports-card:hover {
        border-color: var(--teal);
        box-shadow: 0 6px 20px rgba(27,50,82,.08);
        transform: translateY(-1px);
      }
      .my-reports-card-name {
        font-family: 'Nunito', sans-serif;
        font-weight: 800; font-size: 17px; color: var(--navy);
        letter-spacing: -.01em; line-height: 1.25;
      }
      .my-reports-card-meta {
        font-size: 12px; color: var(--muted);
      }
      .my-reports-card-stats {
        display: flex; flex-wrap: wrap; gap: 12px;
        font-size: 12px; color: var(--muted);
        margin-top: 8px;
      }
      .my-reports-card-cta {
        margin-top: auto; padding-top: 12px;
        font-size: 13px; font-weight: 700; color: var(--teal-dk);
      }
    `}</style>
  )
}
