import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import nextDynamic from 'next/dynamic'
import type { SchoolPin } from '@/components/shortlist/ShortlistMap'
import './my-shortlist.css'

export const dynamic = 'force-dynamic'

const ShortlistMap = nextDynamic(() => import('@/components/shortlist/ShortlistMap'), { ssr: false })

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

function getAuthClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
}

function findRow(rows: any[], source: string, dataType?: string) {
  return rows.find(r => r.source === source && (!dataType || r.data_type === dataType)) ?? null
}

function deriveFinancialHealth(sensitiveRows: any[]): 'green' | 'amber' | 'unknown' {
  const charity = findRow(sensitiveRows, 'charity_commission', 'financial_filing')
  if (!charity?.details) return 'unknown'
  const fh = charity.details.financial_history
  if (!fh?.metrics) return 'unknown'
  const incomes: number[] = fh.metrics.total_gross_income ?? []
  const expenditures: number[] = fh.metrics.total_expenditure ?? []
  if (incomes.length < 2) return 'unknown'
  const lastIncome = incomes[incomes.length - 1]
  const lastExpend = expenditures[expenditures.length - 1]
  if (!lastIncome || !lastExpend) return 'unknown'
  return lastIncome >= lastExpend * 0.95 ? 'green' : 'amber'
}

function deriveFinancialNote(sensitiveRows: any[], schoolName: string): string {
  const charity = findRow(sensitiveRows, 'charity_commission', 'financial_filing')
  if (!charity?.details) return 'No financial data available.'
  const d = charity.details
  const fh = d.financial_history
  const incomes: number[] = fh?.metrics?.total_gross_income ?? []
  const expenditures: number[] = fh?.metrics?.total_expenditure ?? []
  if (incomes.length >= 2) {
    const last = incomes[incomes.length - 1]
    const prev = incomes[incomes.length - 2]
    const lastE = expenditures[expenditures.length - 1]
    if (last && lastE) {
      const surplus = last - lastE
      const sign = surplus >= 0 ? '+' : ''
      const pct = prev ? Math.round(((last - prev) / prev) * 100) : null
      const trend = pct !== null ? ` (income ${pct >= 0 ? '+' : ''}${pct}% YoY)` : ''
      return `Surplus ${sign}£${Math.round(Math.abs(surplus) / 1000)}k${trend}.`
    }
  }
  return d.charity_name ? `Registered charity: ${d.charity_name}.` : 'Financial data available.'
}

function parseSportsEmojis(sports: any): string {
  if (!sports) return ''
  const map: Record<string, string> = {
    rugby: '🏉', cricket: '🏏', football: '⚽', tennis: '🎾',
    hockey: '🏑', swimming: '🏊', rowing: '🚣', athletics: '🏃',
    netball: '🏐', basketball: '🏀', golf: '⛳',
  }
  const keys = Object.keys(sports).map(k => k.toLowerCase())
  const icons = Object.entries(map)
    .filter(([k]) => keys.some(key => key.includes(k)))
    .map(([, v]) => v)
  return icons.slice(0, 5).join(' ')
}

function parseOpenEvents(openEvents: any): Array<{ text: string; dateStr: string | null }> {
  if (!Array.isArray(openEvents)) return []
  const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }
  return openEvents.slice(0, 3).map(ev => {
    const text = typeof ev === 'string' ? ev : String(ev)
    const m = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/)
    let dateStr: string | null = null
    if (m) {
      const month = MONTHS[m[2].toLowerCase().slice(0, 3)]
      if (month) dateStr = `${m[3]}-${month}-${m[1].padStart(2, '0')}`
    }
    return { text, dateStr }
  })
}

type ShortlistSchool = {
  slug: string
  name: string
  city: string | null
  boardingType: string | null
  feesDisplay: string | null
  financialHealth: 'green' | 'amber' | 'unknown'
  financialNote: string
  sportsEmojis: string
  visitNote: string | null
  openEvents: Array<{ text: string; dateStr: string | null }>
}

async function loadShortlistData(userId: string): Promise<ShortlistSchool[]> {
  const { data: shortlisted } = await serviceClient
    .from('shortlisted_schools')
    .select('school_slug, added_at')
    .eq('user_id', userId)
    .order('added_at', { ascending: false })

  if (!shortlisted || shortlisted.length === 0) return []

  const slugs = shortlisted.map((r: any) => r.school_slug)

  const [
    { data: schools },
    { data: structured },
    { data: sensitive },
    { data: notes },
  ] = await Promise.all([
    serviceClient.from('schools').select('slug, name, city, boarding, fees_usd_min').in('slug', slugs),
    serviceClient.from('school_structured_data').select('school_slug, sports_profile, admissions_format').in('school_slug', slugs),
    serviceClient.from('school_sensitive').select('school_slug, source, data_type, details, source_url, retrieved_date').in('school_slug', slugs),
    serviceClient.from('visit_notes').select('school_slug, content').eq('user_id', userId).in('school_slug', slugs),
  ])

  const schoolMap = new Map((schools ?? []).map((s: any) => [s.slug, s]))
  const structuredMap = new Map((structured ?? []).map((s: any) => [s.school_slug, s]))
  const sensitiveMap = new Map<string, any[]>()
  for (const row of (sensitive ?? [])) {
    const arr = sensitiveMap.get(row.school_slug) ?? []
    arr.push(row)
    sensitiveMap.set(row.school_slug, arr)
  }
  const noteMap = new Map((notes ?? []).map((n: any) => [n.school_slug, n.content]))

  return slugs.map(slug => {
    const meta = schoolMap.get(slug)
    const str = structuredMap.get(slug)
    const sens = sensitiveMap.get(slug) ?? []
    const openEventsRaw = str?.admissions_format?.open_events ?? []
    const feesMin = (meta as any)?.fees_usd_min
    const feesDisplay = feesMin ? `$${Math.round(feesMin / 1000)}k/yr` : null

    return {
      slug,
      name: meta?.name ?? slug,
      city: meta?.city ?? null,
      boardingType: meta?.boarding ?? null,
      feesDisplay,
      financialHealth: deriveFinancialHealth(sens),
      financialNote: deriveFinancialNote(sens, meta?.name ?? slug),
      sportsEmojis: parseSportsEmojis(str?.sports_profile),
      visitNote: noteMap.get(slug) ?? null,
      openEvents: parseOpenEvents(openEventsRaw),
    }
  })
}

export default async function MyShortlistPage() {
  const cookieStore = await cookies()
  const authClient = getAuthClient(cookieStore)
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) redirect('/unlock?from=/my-shortlist')

  const schools = await loadShortlistData(user.id)

  const pins: SchoolPin[] = schools.map(s => ({
    slug: s.slug,
    name: s.name,
    city: s.city ?? 'England',
    feesDisplay: s.feesDisplay ?? undefined,
  }))

  const notesCount = schools.filter(s => s.visitNote).length
  const allOpenEvents = schools.flatMap(s =>
    s.openEvents.filter(e => e.dateStr).map(e => ({ school: s.name, slug: s.slug, ...e }))
  ).sort((a, b) => (a.dateStr ?? '').localeCompare(b.dateStr ?? ''))

  return (
    <div className="shortlist-page">
      <nav className="shortlist-nav">
        <Link href="/" className="shortlist-nav-logo">nana<span>says</span></Link>
        <Link href="/my-shortlist" className="active">My Shortlist</Link>
        <Link href="/my-reports">Reports</Link>
        <Link href="/nana">Nana</Link>
      </nav>

      <div className="shortlist-content">
        {/* Left column */}
        <div>
          <div className="shortlist-section-header">
            <h2 className="shortlist-section-title">My Shortlist</h2>
            <span className="shortlist-section-count">{schools.length} school{schools.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="shortlist-map-wrap">
            <ShortlistMap schools={pins} />
          </div>

          {schools.length === 0 ? (
            <div className="shortlist-empty">
              <p>You haven&apos;t saved any schools yet.</p>
              <a href="/my-reports">Browse schools and save ones you&apos;re interested in →</a>
            </div>
          ) : (
            <div className="shortlist-cards">
              {schools.map(s => (
                <div key={s.slug} className="shortlist-card">
                  <div className="shortlist-card-name">{s.name}</div>
                  <div className="shortlist-card-meta">
                    {s.city && <span className="shortlist-card-tag">{s.city}</span>}
                    {s.boardingType && <span className="shortlist-card-tag">{s.boardingType}</span>}
                  </div>
                  {s.feesDisplay && (
                    <div className="shortlist-card-fees">{s.feesDisplay}</div>
                  )}
                  <div>
                    <span className={`shortlist-card-health shortlist-card-health--${s.financialHealth}`}>
                      {s.financialHealth === 'green' ? '✓ Financially Strong' :
                       s.financialHealth === 'amber' ? '⚠ Watch' : '— No data'}
                    </span>
                  </div>
                  {s.sportsEmojis && (
                    <div className="shortlist-card-sports">{s.sportsEmojis}</div>
                  )}
                  {s.visitNote && (
                    <div className="shortlist-card-note">{s.visitNote}</div>
                  )}
                  <div className="shortlist-card-actions">
                    <Link href={`/schools/${s.slug}/report`} className="shortlist-card-btn shortlist-card-btn--primary">
                      Open in Nana →
                    </Link>
                    <Link href={`/schools/${s.slug}/report#visit-notes`} className="shortlist-card-btn shortlist-card-btn--secondary">
                      Edit notes
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="shortlist-sidebar">
          <div className="shortlist-widget">
            <div className="shortlist-widget-title">Upcoming Open Days</div>
            {allOpenEvents.length === 0 ? (
              <div className="shortlist-no-events">No upcoming open days found.</div>
            ) : (
              <ul className="shortlist-open-days">
                {allOpenEvents.slice(0, 6).map((ev, i) => (
                  <li key={i} className="shortlist-open-day-item">
                    <div>
                      <div className="shortlist-open-day-school">{ev.school}</div>
                      <div className="shortlist-open-day-date">{ev.text}</div>
                    </div>
                    {ev.dateStr && (
                      <a
                        href={`/api/calendar/${ev.slug}`}
                        className="shortlist-ics-link"
                        download
                      >
                        ↓ .ics
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shortlist-widget">
            <div className="shortlist-widget-title">Financial Health Alerts</div>
            {schools.length === 0 ? (
              <div className="shortlist-no-events">No schools shortlisted.</div>
            ) : (
              <ul className="shortlist-alert-list">
                {schools.map(s => (
                  <li key={s.slug} className="shortlist-alert-item">
                    <span className="shortlist-alert-icon">
                      {s.financialHealth === 'green' ? '✓' : s.financialHealth === 'amber' ? '⚠' : '—'}
                    </span>
                    <span className="shortlist-alert-text">
                      <strong>{s.name}</strong> — {s.financialNote}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="shortlist-widget">
            <div className="shortlist-widget-title">Your Progress</div>
            <div className="shortlist-progress-grid">
              <div className="shortlist-stat">
                <div className="shortlist-stat-value">{schools.length}</div>
                <div className="shortlist-stat-label">Shortlisted</div>
              </div>
              <div className="shortlist-stat">
                <div className="shortlist-stat-value">{notesCount}</div>
                <div className="shortlist-stat-label">Visit notes</div>
              </div>
              <div className="shortlist-stat">
                <div className="shortlist-stat-value">{schools.filter(s => s.financialHealth === 'green').length}</div>
                <div className="shortlist-stat-label">Financially strong</div>
              </div>
              <div className="shortlist-stat">
                <div className="shortlist-stat-value">{allOpenEvents.length}</div>
                <div className="shortlist-stat-label">Open days</div>
              </div>
            </div>
          </div>

          <Link href="/my-reports" className="shortlist-nana-cta">
            Ask Nana about your shortlist →
          </Link>
        </div>
      </div>
    </div>
  )
}
