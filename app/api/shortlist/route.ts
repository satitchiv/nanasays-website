import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { loadMatchReasonsBatch, type MatchReasonsRecord } from '@/lib/research-room/match-reasons'
import type { BriefProfile } from '@/lib/research-room/brief-predicates'

async function getAuthClient() {
  const cookieStore = await cookies()
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

// GET /api/shortlist — return the parent-wide shortlist (child_id IS NULL
// rows only). This endpoint is the saved-state source for the school-page
// ShortlistButton; POST and DELETE on this route both write/delete
// parent-wide rows, so GET must report the same scope or the button shows
// stale state for child-bound schools (Codex r4 P2).
//
// Child-bound shortlist state lives in the Research Room (Brief tab and
// in-room comparison column); that's where the user adds/removes per
// child via dedicated routes.
export async function GET() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ slugs: [] })

  const { data } = await supabase
    .from('shortlisted_schools')
    .select('school_slug, added_at')
    .eq('user_id', user.id)
    .is('child_id', null)
    .order('added_at', { ascending: false })

  return NextResponse.json({ slugs: (data ?? []).map((r: any) => r.school_slug) })
}

// POST /api/shortlist — add a school { slug }
//
// Slice 8 Build 2 r1: when the user has exactly one active child OR
// active_child_id resolves cleanly, compute match_reasons from that
// child's brief and store alongside the row. child_id remains unset on
// this path (preserves pre-Build-2 behavior where manual ShortlistButton
// adds were unbound). The match_reasons reflect "active child at time of
// add" — fine for v1.
//
// On unique violation (idempotent re-add), we DO NOT overwrite; but if
// the existing row has match_reasons = null AND we just computed fresh
// ones, we backfill via a null-only UPDATE so the data isn't lost.
export async function POST(req: NextRequest) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const slug = typeof body?.slug === 'string' ? body.slug.toLowerCase().trim() : ''
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  // Best-effort match_reasons computation. Failure must not block the insert.
  let matchReasons: MatchReasonsRecord | null = null
  try {
    matchReasons = await computeMatchReasonsForAdd(supabase, user.id, slug)
  } catch (e) {
    console.error('[shortlist POST match_reasons]', e)
  }

  const insertRow: { user_id: string; school_slug: string; match_reasons?: unknown } = {
    user_id:     user.id,
    school_slug: slug,
  }
  if (matchReasons && matchReasons.reasons.length > 0) {
    insertRow.match_reasons = matchReasons
  }

  const { error } = await supabase
    .from('shortlisted_schools')
    .insert(insertRow)

  if (error) {
    if (error.message.includes('unique')) {
      // Idempotent re-add. Codex r1 Q9 + r2 P1 #2: if the existing
      // parent-wide (child_id IS NULL) row has null match_reasons, fill
      // them now. Critically, scope by `.is('child_id', null)` so we
      // never bleed active-child reasons onto a different child's row
      // for the same slug.
      if (matchReasons && matchReasons.reasons.length > 0) {
        const { error: backfillErr } = await supabase
          .from('shortlisted_schools')
          .update({ match_reasons: matchReasons })
          .eq('user_id', user.id)
          .eq('school_slug', slug)
          .is('child_id', null)
          .is('match_reasons', null)
        if (backfillErr) {
          console.warn('[shortlist POST] match_reasons backfill on dup:', backfillErr.message)
        }
      }
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE /api/shortlist?slug=xxx — remove a school from the parent-wide
// shortlist (child_id IS NULL rows only).
//
// r3 P2 fix: previously this deleted by (user_id, school_slug) alone,
// which would wipe child-bound shortlist rows for the same slug. The
// matching POST writes parent-wide rows (child_id = null); DELETE now
// mirrors that scope so the school-page ShortlistButton remains the
// inverse of itself and never touches child-bound rows added via the
// refresh-recommendations / in-room paths.
export async function DELETE(req: NextRequest) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slug = req.nextUrl.searchParams.get('slug')?.toLowerCase().trim()
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const { error } = await supabase
    .from('shortlisted_schools')
    .delete()
    .eq('user_id', user.id)
    .eq('school_slug', slug)
    .is('child_id', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── Helper: resolve active child, load profile, delegate to shared
// loadMatchReasonsBatch. Codex r1 Q6: only fall back to "first child" when
// there is exactly one active child. With multiple children and a stale
// active_child_id, we skip reasons rather than guess.
async function computeMatchReasonsForAdd(
  supabase: Awaited<ReturnType<typeof getAuthClient>>,
  userId:   string,
  slug:     string,
): Promise<MatchReasonsRecord | null> {
  const [profileRes, childrenRes] = await Promise.all([
    supabase
      .from('parent_profiles')
      .select('active_child_id')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('children')
      .select('id, child_profile')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: true }),
  ])
  if (profileRes.error || childrenRes.error) return null

  const activeChildren = (childrenRes.data ?? []) as Array<{ id: string; child_profile: unknown }>
  if (activeChildren.length === 0) return null

  const persisted = (profileRes.data as { active_child_id: string | null } | null)?.active_child_id ?? null
  let active: { id: string; child_profile: unknown } | null = null
  if (persisted) {
    active = activeChildren.find(c => c.id === persisted) ?? null
  }
  // Fallback rule (Codex r1 Q6): only use "the only child" when there's
  // exactly one. If active_child_id is null/stale AND there are 2+
  // children, skip reasons — we'd be guessing which child this add
  // belongs to.
  if (!active) {
    if (activeChildren.length === 1) active = activeChildren[0]
    else return null
  }

  const profile = (active.child_profile ?? null) as BriefProfile | null
  if (!profile) return null

  const reasonsBySlug = await loadMatchReasonsBatch(supabase, profile, [slug])
  return reasonsBySlug.get(slug) ?? null
}
