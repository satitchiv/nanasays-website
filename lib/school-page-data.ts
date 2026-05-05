import 'server-only'
import { supabaseService } from './supabase-admin'

/**
 * Server-only loaders for school detail pages and the directory index.
 *
 * Phase 1 goal: lock down the database. After RLS migration, anon clients can
 * no longer read school_structured_data, school_sensitive, school_pdfs, or
 * schools_status directly. These loaders run on the server with the service
 * role key (which never reaches the browser via 'server-only' import).
 *
 * Phase 1 keeps the public DTO wide (matches current rendering) so swapping
 * to these loaders is invisible to users. Phase 2 page redesign tightens the
 * column whitelist as paid sections move behind a real auth check.
 *
 * IMPORTANT — paid loader contract:
 * `getPaidSchoolReportData` returns the full structured + sensitive rows. It
 * does NOT verify the caller is paid. Today's /report page calls this loader
 * unconditionally and uses isPaid only at the render boundary (PreviewSections
 * for unpaid, full sections for paid). That's product behavior we're keeping
 * for Phase 1. Phase 2 redesign will gate the actual data fetch on isPaid so
 * unpaid users never load paid fields server-side at all.
 *
 * Loaders THROW on Supabase errors so rollout failures don't silently blank
 * pages. Callers should let errors bubble; Next.js will render the error UI.
 */

// -----------------------------------------------------------------------------
// Sensitive sources surfaced in the PUBLIC summary.
// `school_sensitive.details` is NEVER returned to public — only summary fields.
// -----------------------------------------------------------------------------
const PUBLIC_SENSITIVE_SOURCES = ['charity_commission', 'companies_house', 'isi', 'dfe_prohibition']

export interface PublicRegulatorySummary {
  source: string
  source_url: string | null
  data_type: string | null
  date: string | null
  title: string | null
  summary: string | null
  verified: boolean | null
}

export interface PublicSchoolPageData {
  structured: any | null // full structured row — Phase 2 will tighten to a column whitelist
  regulatorySummary: PublicRegulatorySummary[]
}

export interface PaidSchoolReportData {
  structured: any | null
  sensitive: any[]
  policyDocs: { title: string; source_url: string; analysis: any }[]
}

// -----------------------------------------------------------------------------
// Public loader — used by /schools/[slug] (no auth)
// -----------------------------------------------------------------------------

export async function getPublicSchoolPageData(slug: string): Promise<PublicSchoolPageData> {
  const sb = supabaseService()
  const [structuredRes, sensitiveRes] = await Promise.all([
    sb.from('school_structured_data').select('*').eq('school_slug', slug).maybeSingle(),
    sb.from('school_sensitive')
      .select('source, source_url, data_type, date, title, summary, verified')
      .eq('school_slug', slug)
      .in('source', PUBLIC_SENSITIVE_SOURCES),
  ])

  if (structuredRes.error) throw new Error(`getPublicSchoolPageData/structured: ${structuredRes.error.message}`)
  if (sensitiveRes.error) throw new Error(`getPublicSchoolPageData/sensitive: ${sensitiveRes.error.message}`)

  const regulatorySummary: PublicRegulatorySummary[] = (sensitiveRes.data ?? []).map(row => ({
    source: row.source,
    source_url: row.source_url,
    data_type: row.data_type,
    date: row.date,
    title: row.title,
    summary: row.summary,
    verified: row.verified,
  }))

  return { structured: structuredRes.data ?? null, regulatorySummary }
}

// -----------------------------------------------------------------------------
// Paid loader — used by /schools/[slug]/report (auth-gated by route)
// -----------------------------------------------------------------------------
// Caller MUST enforce paid entitlement (getUnlockedUser()) before invoking.
// This loader does not re-check auth; failing closed at the route is the contract.

export async function getPaidSchoolReportData(slug: string): Promise<PaidSchoolReportData> {
  const sb = supabaseService()
  const [structuredRes, sensitiveRes, policyDocsRes] = await Promise.all([
    sb.from('school_structured_data').select('*').eq('school_slug', slug).maybeSingle(),
    sb.from('school_sensitive').select('*').eq('school_slug', slug),
    sb.from('school_knowledge')
      .select('title, source_url, analysis')
      .eq('school_slug', slug)
      .eq('category', 'policies')
      .eq('source_type', 'pdf')
      .order('title'),
  ])

  if (structuredRes.error) throw new Error(`getPaidSchoolReportData/structured: ${structuredRes.error.message}`)
  if (sensitiveRes.error) throw new Error(`getPaidSchoolReportData/sensitive: ${sensitiveRes.error.message}`)
  if (policyDocsRes.error) throw new Error(`getPaidSchoolReportData/policyDocs: ${policyDocsRes.error.message}`)

  return {
    structured: structuredRes.data ?? null,
    sensitive: sensitiveRes.data ?? [],
    policyDocs: (policyDocsRes.data ?? []) as { title: string; source_url: string; analysis: any }[],
  }
}

// -----------------------------------------------------------------------------
// Public schools index loader — used by /schools (no auth)
// -----------------------------------------------------------------------------
// Replaces anon read of `schools_status`. After RLS migration, anon cannot read
// schools_status directly because it joins paid/internal tables.

export interface PublicSchoolIndexRow {
  school_slug: string
  name: string | null
  profile_boarding_type: string | null
  signature_sports: string[] | null
  has_rugby_extracted: boolean | null
  has_cricket_extracted: boolean | null
  has_hockey_extracted: boolean | null
  has_football_extracted: boolean | null
  has_tennis_deep: boolean | null
  pct_complete: number | null
}

export async function getPublicSchoolsIndex(): Promise<PublicSchoolIndexRow[]> {
  const sb = supabaseService()
  const { data, error } = await sb
    .from('schools_status')
    .select('school_slug, name, profile_boarding_type, signature_sports, has_rugby_extracted, has_cricket_extracted, has_hockey_extracted, has_football_extracted, has_tennis_deep, pct_complete')
    .eq('is_uk_evidence', true)
    .eq('has_substantial_chunks', true)
    .order('name')
  if (error) throw new Error(`getPublicSchoolsIndex: ${error.message}`)
  return (data ?? []) as PublicSchoolIndexRow[]
}
