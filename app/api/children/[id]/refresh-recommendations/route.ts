import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseService } from '@/lib/supabase-admin'
import { pickTopSchoolSlugs } from '@/lib/recommend-shortlist'
import {
  interpretChildNotes,
  isCacheValid,
  notesAreEmpty,
  type CachedInterpretation,
  type NotesInput,
  type ProfileContext,
} from '@/lib/interpret-child-notes'
import {
  loadMatchReasonsBatch,
  type MatchReasonsRecord,
} from '@/lib/research-room/match-reasons'
import type { BriefProfile } from '@/lib/research-room/brief-predicates'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

// POST /api/children/[id]/refresh-recommendations
//
// Explicit user action (Brief tab "↻ Refresh recommendations" button).
// Drops the existing (user_id, child_id) rows in shortlisted_schools and
// re-runs recommendShortlist for that child. Auto-rerun on profile edit
// is reserved for slice 4d (the fit-score lens) — don't blur the line.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const auth = await getAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ownership check via auth client (RLS-bound). Service client bypasses
  // RLS, so we verify the child belongs to this user before touching it.
  const { data: child, error: childErr } = await auth
    .from('children')
    .select('id, is_archived')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (childErr) return NextResponse.json({ error: childErr.message }, { status: 500 })
  if (!child) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (child.is_archived) {
    return NextResponse.json({ error: 'child is archived' }, { status: 400 })
  }

  const svc = supabaseService()

  // Slice 4d preview: refresh the cached note interpretation BEFORE running
  // the recommender, so recommendShortlist reads up-to-date signals from
  // child_profile. Cache key is a hash of the 4 free-text notes — if it
  // matches the cached hash we skip the LLM call entirely.
  const { data: childRow } = await svc
    .from('children')
    .select('child_profile')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<{ child_profile: Record<string, unknown> | null }>()

  const profile = (childRow?.child_profile ?? {}) as Record<string, unknown>
  const notes: NotesInput = {
    personality_notes: typeof profile.personality_notes === 'string' ? profile.personality_notes : null,
    anchors_notes:     typeof profile.anchors_notes     === 'string' ? profile.anchors_notes     : null,
    academic_notes:    typeof profile.academic_notes    === 'string' ? profile.academic_notes    : null,
    goals_notes:       typeof profile.goals_notes       === 'string' ? profile.goals_notes       : null,
  }
  const cached = (profile.notes_interpretation_v1 as CachedInterpretation | undefined) ?? null

  let interpretationStatus: 'cached' | 'refreshed' | 'cleared' | 'skipped' | 'race-aborted' = 'skipped'
  if (notesAreEmpty(notes)) {
    if (cached) {
      // Codex P1: drop stale interpretation atomically — only succeeds if
      // the row's notes are still empty (concurrent PATCH that re-populated
      // them would skip the clear and keep their interpretation).
      const { data: cleared, error: clrErr } = await svc.rpc(
        'children_clear_notes_interpretation',
        { p_child_id: id, p_user_id: user.id },
      )
      if (clrErr) {
        console.error('[refresh-recommendations] clear RPC failed:', clrErr.message)
      } else {
        interpretationStatus = cleared ? 'cleared' : 'race-aborted'
      }
    }
  } else if (isCacheValid(cached, notes)) {
    interpretationStatus = 'cached'
  } else {
    const ctx: ProfileContext = {
      child_year:    typeof profile.child_year    === 'string' ? profile.child_year    : null,
      home_region:   typeof profile.home_region   === 'string' ? profile.home_region   : null,
      boarding_pref: typeof profile.boarding_pref === 'string' ? profile.boarding_pref : null,
      budget_range:  typeof profile.budget_range  === 'string' ? profile.budget_range  : null,
      top_priority:  typeof profile.top_priority  === 'string' ? profile.top_priority  : null,
    }
    const fresh = await interpretChildNotes(notes, ctx, id)
    if (fresh) {
      // Codex P1: atomic JSONB key update with notes-text precondition.
      // Returns false if the user PATCHed any of the 4 notes between our
      // T0 read and now — in that case we drop the interpretation rather
      // than clobber the newer text. The recommender falls back to the
      // dropdown profile + (possibly stale) cached interpretation if any.
      const { data: stored, error: rpcErr } = await svc.rpc(
        'children_set_notes_interpretation',
        {
          p_child_id:             id,
          p_user_id:              user.id,
          p_expected_personality: notes.personality_notes ?? '',
          p_expected_anchors:     notes.anchors_notes     ?? '',
          p_expected_academic:    notes.academic_notes    ?? '',
          p_expected_goals:       notes.goals_notes       ?? '',
          p_interpretation:       fresh,
        },
      )
      if (rpcErr) {
        console.error('[refresh-recommendations] set RPC failed:', rpcErr.message)
      } else {
        interpretationStatus = stored ? 'refreshed' : 'race-aborted'
      }
    }
    // If LLM call returned null, just proceed without interpretation —
    // recommender falls back to dropdown profile only. Don't block refresh.
  }

  // Codex P2.1: compute first, then replace. Old flow was DELETE → run
  // recommender (which inserts). If the recommender threw or returned
  // 'no_matches', the user was left with zero schools. Now we compute the
  // new top 6 BEFORE touching shortlisted_schools — only replace if we
  // got a usable list.
  let pick: Awaited<ReturnType<typeof pickTopSchoolSlugs>>
  try {
    pick = await pickTopSchoolSlugs(svc, user.id, id)
  } catch (e) {
    console.error('[POST refresh-recommendations] pick threw:', e)
    return NextResponse.json({ error: 'recommender_failed' }, { status: 500 })
  }

  if (pick.slugs.length === 0) {
    // Don't touch the existing shortlist — leaving the user with their
    // previous schools is better than dropping them to zero on a
    // no_matches/incomplete result.
    return NextResponse.json({
      ok: true,
      added: [],
      reason: pick.reason,
      interpretation: interpretationStatus,
      note: 'shortlist_unchanged',
    })
  }

  // Slice 8 Build 2 r1: compute match_reasons per (child, school) pair via
  // the shared batch helper. Best-effort — failure logs and proceeds with
  // a reason-less upsert.
  let reasonsBySlug: Map<string, MatchReasonsRecord> = new Map()
  try {
    reasonsBySlug = await loadMatchReasonsBatch(svc, profile as BriefProfile, pick.slugs)
  } catch (e) {
    console.warn('[refresh-recommendations] match_reasons compute failed:', e)
  }

  // Upsert new rows first (idempotent thanks to NULLS NOT DISTINCT
  // unique constraint), THEN delete stale rows not in the new set. The
  // user's shortlist always has rows during the swap.
  const upsertRows = pick.slugs.map(slug => {
    const row: { user_id: string; school_slug: string; child_id: string; match_reasons?: unknown } = {
      user_id: user.id,
      school_slug: slug,
      child_id: id,
    }
    const reasons = reasonsBySlug.get(slug)
    if (reasons) row.match_reasons = reasons
    return row
  })
  const { error: upsertErr } = await svc
    .from('shortlisted_schools')
    .upsert(upsertRows, { onConflict: 'user_id,child_id,school_slug', ignoreDuplicates: true })
  if (upsertErr) {
    console.error('[POST refresh-recommendations] upsert failed:', upsertErr.message)
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  // Build 2 r1 (Codex P1 #2): null-only backfill UPDATE.
  //
  // `ignoreDuplicates: true` above means existing (user_id, child_id,
  // school_slug) rows are SKIPPED entirely — their match_reasons column
  // stays null even when we just computed a fresh value. Without this
  // pass, every shortlist row added before Build 2 shipped never gets
  // reasons populated.
  //
  // Per-slug UPDATE with `.is('match_reasons', null)` so we don't
  // overwrite reasons a parent might already have (preserves "richer
  // reason set" if any). N is at most 6 (top recommendations cap), so
  // sequential awaits are fine here.
  for (const slug of pick.slugs) {
    const reasons = reasonsBySlug.get(slug)
    if (!reasons) continue
    const { error: backfillErr } = await svc
      .from('shortlisted_schools')
      .update({ match_reasons: reasons })
      .eq('user_id', user.id)
      .eq('child_id', id)
      .eq('school_slug', slug)
      .is('match_reasons', null)
    if (backfillErr) {
      console.warn('[POST refresh-recommendations] match_reasons backfill failed:', slug, backfillErr.message)
    }
  }

  // Delete stale rows: same (user, child) but NOT in the new slug set.
  const { error: delErr } = await svc
    .from('shortlisted_schools')
    .delete()
    .eq('user_id', user.id)
    .eq('child_id', id)
    .not('school_slug', 'in', `(${pick.slugs.map(s => `"${s}"`).join(',')})`)
  if (delErr) {
    // Stale rows leaking is annoying but not user-breaking — log and continue.
    console.warn('[POST refresh-recommendations] stale-delete failed:', delErr.message)
  }

  return NextResponse.json({
    ok: true,
    added: pick.slugs,
    reason: 'inserted',
    interpretation: interpretationStatus,
  })
}

