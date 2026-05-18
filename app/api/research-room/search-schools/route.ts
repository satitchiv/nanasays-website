import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { supabaseService } from '@/lib/supabase-admin'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import {
  type Hit,
  RichnessUnavailableError,
  expandApostropheVariants,
  groupByName,
  loadRichness,
  normName,
  rankGroups,
} from '@/lib/research-room/school-canonical'

// POST /api/research-room/search-schools
//
// Replaces the in-browser search + richness fetch in SchoolAdder. Powers
// the in-room "Add school" popup. Uses service-role for the DB queries
// so school_structured_data (RLS-locked from anon since 2026-05-03) is
// readable for the richness signal — without this, the picker fell back
// to the unsafe `-uk wins` tiebreaker and returned the data-poor twin
// for ~79 duplicate-name UK school groups.
//
// Auth gates mirror /api/research-room/shortlist exactly:
//   feature flag → origin → signed-in user → paid → service-role queries.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  q:             string
  excludeSlugs:  string[]
}

const SLUG_RX = /^[a-z0-9-]{1,80}$/

function parseBody(raw: unknown): { body: Body | null; error?: string } {
  if (!raw || typeof raw !== 'object') return { body: null, error: 'body must be a JSON object' }
  const o = raw as Record<string, unknown>
  if (typeof o.q !== 'string') return { body: null, error: 'q must be a string' }
  const q = o.q.trim()
  if (q.length < 2 || q.length > 120) return { body: null, error: 'q must be 2..120 chars after trim' }
  const rawExcl = Array.isArray(o.excludeSlugs) ? o.excludeSlugs : []
  const excludeSlugs = rawExcl
    .filter((s): s is string => typeof s === 'string')
    .filter(s => SLUG_RX.test(s))
    .slice(0, 200)
  return { body: { q, excludeSlugs } }
}

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

async function isAllowedOrigin(): Promise<boolean> {
  const h = await headers()
  const origin = h.get('origin')
  if (!origin) return true
  const host = h.get('host')
  if (!host) return false
  try {
    const originHost = new URL(origin).host
    if (originHost === host) return true
  } catch { /* malformed Origin */ }
  return false
}

// Strip Postgrest ilike wildcards so a user typing "%", "_", or "*"
// (Postgrest treats `*` as a `%` alias in LIKE patterns — Codex r1 P3)
// can't turn the LIKE into a wildcard scan. Control + NUL bytes are
// dropped outright; nothing reasonable to escape them to.
function escapeIlikePattern(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1f\x7f]/g, '').replace(/([\\%_*])/g, '\\$1')
}

export async function POST(req: NextRequest) {
  if (!isResearchRoomEnabled()) {
    return NextResponse.json({ ok: false, code: 'feature_disabled' }, { status: 404 })
  }
  if (!(await isAllowedOrigin())) {
    return NextResponse.json({ ok: false, code: 'forbidden_origin' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }
  const { body, error } = parseBody(raw)
  if (!body) return NextResponse.json({ ok: false, code: 'invalid_payload', detail: error }, { status: 400 })

  const auth = await getAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) return NextResponse.json({ ok: false, code: 'payment_required' }, { status: 402 })

  // Service-role for the actual data queries — RLS would otherwise hide
  // school_structured_data and produce the original picker bug.
  const svc = supabaseService()

  // Codex r2 P3: parseBody validates query length BEFORE stripping
  // control bytes. A query of "\x01\x02" would pass the length gate
  // and then become "" after escape → pattern "%%" → match-everything.
  // Revalidate post-strip; count escaped pairs as one char each.
  const stripped = escapeIlikePattern(body.q)
  const literalChars = stripped.replace(/\\./g, 'X').trim().length
  if (literalChars < 2) {
    return NextResponse.json({ ok: true, groups: [] }, { status: 200 })
  }

  // 2026-05-18 apostrophe-variant expansion (Codex r7 / smoke):
  // "kings" doesn't ILIKE-match "King's College" because of the
  // apostrophe between g and s. expandApostropheVariants generates
  // ["kings", "king's"] for trailing-s queries; we run one Postgrest
  // query per variant in parallel and union+dedupe by slug. Most
  // queries (no trailing s) generate a single variant — zero overhead.
  // eslint-disable-next-line no-control-regex
  const cleanedQ = body.q.replace(/[\x00-\x1f\x7f]/g, '').trim()
  const variants = expandApostropheVariants(cleanedQ)
  const queries = variants.map(v => {
    const pat = `%${escapeIlikePattern(v)}%`
    // Codex r1 P1 #3 + Q7: UK country OR null (rich twin may have null country).
    // 2026-05-18 — limit 500 per variant covers any reasonable substring.
    let q1 = svc
      .from('schools')
      .select('slug, name, region, country')
      .ilike('name', pat)
      .or('country.eq.United Kingdom,country.is.null')
    if (body.excludeSlugs.length > 0) {
      q1 = q1.not('slug', 'in', `(${body.excludeSlugs.join(',')})`)
    }
    return q1.order('name', { ascending: true }).limit(500)
  })
  const variantResults = await Promise.all(queries)
  const seen = new Set<string>()
  const candidatesAccum: Hit[] = []
  for (const r of variantResults) {
    if (r.error) {
      console.error('[search-schools] schools query failed:', r.error.message)
      return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
    }
    for (const row of (r.data ?? []) as Hit[]) {
      if (!seen.has(row.slug)) {
        seen.add(row.slug)
        candidatesAccum.push(row)
      }
    }
  }
  let candidates = candidatesAccum
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, groups: [] }, { status: 200 })
  }

  // Codex r1 P2 #4 + r2 P2: exact-slug exclusion is not enough. If the
  // parent has `cheltenham-ladies-college` shortlisted, the popup must
  // not surface `cheltenham-ladies-college-uk` (alternate-click would
  // send skip_canonicalize:true and bypass canonicalize, inserting the
  // twin). We exclude every candidate whose normalised name matches an
  // already-shortlisted slug. r2 P2: this is a correctness gate — if
  // the name lookup errors we 5xx, not silently fall back.
  if (body.excludeSlugs.length > 0) {
    const { data: excludedRows, error: excErr } = await svc
      .from('schools')
      .select('slug, name')
      .in('slug', body.excludeSlugs)
    if (excErr) {
      console.error('[search-schools] exclude-name lookup failed:', excErr.message)
      return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
    }
    const excludedNameKeys = new Set(
      (excludedRows ?? []).map((r: { name: string }) => normName(r.name)),
    )
    if (excludedNameKeys.size > 0) {
      candidates = candidates.filter(c => !excludedNameKeys.has(normName(c.name)))
    }
  }
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, groups: [] }, { status: 200 })
  }

  // Codex r1 Q8 + r2 P1: fail closed when any richness query errored
  // AND zero slugs scored (see loadRichness). Falling back to an empty
  // Map would silently reproduce the original `-uk wins` bug.
  // RichnessUnavailableError signals that no-positive-signal state; a
  // partial map (some slugs scored, others not) still flows through.
  let richness
  try {
    richness = await loadRichness(svc, candidates.map(c => c.slug))
  } catch (e) {
    if (e instanceof RichnessUnavailableError) {
      console.error('[search-schools] richness unavailable:', e.message)
      return NextResponse.json({ ok: false, code: 'richness_unavailable' }, { status: 503 })
    }
    throw e
  }
  // 2026-05-18 — rank by prefix-match + richness BEFORE slicing top 8
  // so "eton" surfaces Eton College ahead of state primaries that
  // alphabetic-asc ordering would otherwise eat the slots with.
  // rankGroups strips control bytes from the query internally
  // (Codex r5 #4 — pure helper defends its own ranking semantics).
  const groups = rankGroups(groupByName(candidates, richness), body.q, richness).slice(0, 8)

  return NextResponse.json({
    ok: true,
    groups: groups.map(g => ({
      name:       g.name,
      primary:    g.primary,
      alternates: g.alternates,
    })),
  }, { status: 200 })
}
