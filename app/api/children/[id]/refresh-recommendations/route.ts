import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseService } from '@/lib/supabase-admin'
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
// 2026-05-24 Yoko slice option (b) — Refresh button now uses the richer
// Build Mode scorer (Picker #2) instead of the onboarding scorer (Picker
// #1, `pickTopSchoolSlugs`). Reason: parents edit notes/nonneg/etc in the
// Brief tab and expect Refresh to honor those edits — but Picker #1 only
// reads the 5 wizard fields. Picker #2 reads the full Build Mode
// interview output (sports/arts/nonneg/notes/intent/etc.) — same as
// what Build Mode finalize uses. Mirrors the overlay + classifier flow
// in app/api/research-room/build-mode/finalize/route.ts:378-490.
import { scoreForBuildMode } from '@/lib/research-room/score-for-build-mode'
import { classifyBuildModeIntent, CLASSIFICATION_VERSION, FALLBACK_INTENT } from '@/lib/server/research-room/classify-build-mode-intent'
import { writeIntentFocusCacheIfChanged } from '@/lib/research-room/intent-cache-writer'
// Codex r1 finding 3 — schema-validate child_profile via the same zod
// schema finalize uses, so malformed interests_sports / nonnegotiables /
// etc. can't sneak past into the scorer.
import {
  BuildModeExtractionHTTPSchema,
  type BuildModeExtractionHTTP,
} from '@/lib/server/research-room/build-mode-schemas'

// Constant top-N for Refresh button shortlist. Mirrors prior
// pickTopSchoolSlugs cap (6) so existing UX is unchanged in count.
const REFRESH_TOP_N = 6

// Mirror of finalize route's overlay helper. Child value wins when set,
// else parent value. Used to compose the BriefProfile passed to the scorer.
function pickInherited(childVal: unknown, parentVal: unknown): string | null {
  if (typeof childVal  === 'string' && childVal)  return childVal
  if (typeof parentVal === 'string' && parentVal) return parentVal
  return null
}

// Mirror of finalize route's WRITABLE filter (route.ts:144). Keeps the
// scorer-visible child_profile shape stable.
const WRITABLE_PROFILE_KEYS = [
  'personality_notes', 'anchors_notes', 'academic_notes', 'goals_notes',
  'child_wants', 'nonnegotiables', 'goal_orientation',
  'interests_sports', 'interests_arts', 'child_gender', 'child_year',
] as const

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

  // Codex P2.1: compute first, then replace (preserved from prior flow).
  // 2026-05-24 Yoko slice option (b) — swap Picker #1 (pickTopSchoolSlugs)
  // for Picker #2 (scoreForBuildMode). This lets Refresh honor Build Mode
  // interview output (sports/arts/nonneg/notes/intent), so parents who
  // edit notes and click Refresh see results that reflect those edits.
  // Mirrors finalize route's overlay + classifier pattern at route.ts:378-490.

  // 1) Load parent_profiles for the overlay (mirror of finalize route)
  const { data: parentRow } = await svc
    .from('parent_profiles')
    .select('home_region, child_gender, child_year, boarding_pref, budget_range, top_priority, curriculum_pref, class_size_pref, sen_need, ethos_pref, lgbtq_pref, pastoral_pref')
    .eq('id', user.id)
    .maybeSingle()

  // 2) Compose the BriefProfile via child_profile → parent_profiles overlay
  //    (mirror of finalize:383-389 + Codex r1 finding 1 extension).
  //    Codex r1: original 4-field overlay missed Brief-tab-editable fields
  //    (top_priority / class_size_pref / sen_need / lgbtq_pref / pastoral_pref
  //    / ethos_pref). Without these, Refresh used stale parent values for
  //    fields the parent had edited per-child. Extended to cover every
  //    scorer-consumed BriefProfile field child-first.
  const briefProfile: BriefProfile | null = parentRow == null ? null : {
    ...parentRow,
    boarding_pref:   pickInherited(profile.boarding_pref,   parentRow.boarding_pref),
    home_region:     pickInherited(profile.home_region,     parentRow.home_region),
    budget_range:    pickInherited(profile.budget_range,    parentRow.budget_range),
    curriculum_pref: pickInherited(profile.curriculum_pref, parentRow.curriculum_pref),
    top_priority:    pickInherited(profile.top_priority,    parentRow.top_priority),
    class_size_pref: pickInherited(profile.class_size_pref, parentRow.class_size_pref),
    sen_need:        pickInherited(profile.sen_need,        parentRow.sen_need),
    lgbtq_pref:      pickInherited(profile.lgbtq_pref,      parentRow.lgbtq_pref),
    pastoral_pref:   pickInherited(profile.pastoral_pref,   parentRow.pastoral_pref),
    ethos_pref:      pickInherited(profile.ethos_pref,      parentRow.ethos_pref),
  } as BriefProfile

  // 3) Resolve child gender + year (prefer child_profile, fall back to parent)
  const childGender = (typeof profile.child_gender === 'string' && profile.child_gender)
    ? profile.child_gender as string
    : (parentRow?.child_gender ?? null)
  const childYear = (typeof profile.child_year === 'string' && profile.child_year)
    ? profile.child_year as string
    : (parentRow?.child_year ?? null)

  // 4) Build the scorer-visible child_profile via the SAME schema-validated
  //    pattern finalize uses (route.ts:142). Codex r1 finding 3 — malformed
  //    interests_sports / nonnegotiables in child_profile must not reach
  //    the scorer. safeParse + legacy-data retry-without-basics fallback.
  const filteredProfile: Record<string, unknown> = {}
  for (const k of WRITABLE_PROFILE_KEYS) {
    if (k in profile && profile[k] != null) filteredProfile[k] = profile[k]
  }
  let childInput: Partial<BuildModeExtractionHTTP>
  const parsed = BuildModeExtractionHTTPSchema.safeParse(filteredProfile)
  if (parsed.success) {
    childInput = parsed.data
  } else {
    // Legacy-data hardening: strip basics (child_gender/child_year) and retry.
    // Same fallback as finalize:149.
    const { child_gender: _g, child_year: _y, ...withoutBasics } = filteredProfile
    const retry = BuildModeExtractionHTTPSchema.safeParse(withoutBasics)
    childInput = retry.success ? retry.data : {}
    if (!retry.success) {
      console.warn('[refresh-recommendations] childInput schema parse failed twice; using empty')
    }
  }

  // 5) Classify Build Mode intent from prose (5 fields). Mirrors finalize:461.
  //    Classifier never throws — falls back to FALLBACK_INTENT on any error.
  const strOrNull = (v: unknown): string | null => typeof v === 'string' ? v : null
  const buildModeIntent = await classifyBuildModeIntent({
    academic_notes:    strOrNull(profile.academic_notes),
    goals_notes:       strOrNull(profile.goals_notes),
    personality_notes: strOrNull(profile.personality_notes),
    child_wants:       strOrNull(profile.child_wants),
    anchors_notes:     strOrNull(profile.anchors_notes),
  })

  // Sport-gate fix (2026-05-24, Codex r3 P2): mirror finalize's cache-write
  // so editing prose + clicking Refresh updates the cached drill_focus too.
  // Without this, the next page-load seed would read stale/missing cache and
  // fall back to wizard → sport rows soft-delete. Skip write on classifier
  // fallback (Codex r5 P1).
  const intentCacheable = buildModeIntent !== FALLBACK_INTENT
  const { updatedProfile: profileWithCache } = await writeIntentFocusCacheIfChanged({
    svc,
    childId:         id,
    rawChildProfile: profile as Record<string, unknown>,
    drillFocus:      buildModeIntent.parent_drill_focus,
    sportFocus:      buildModeIntent.sport_focus,
    version:         CLASSIFICATION_VERSION,
    cacheable:       intentCacheable,
  })

  // 6) Score with the rich Picker #2. excludeSlugs=[] because the Refresh
  //    button is an atomic replace; no need to exclude the current list.
  let pickResult: Awaited<ReturnType<typeof scoreForBuildMode>>
  try {
    pickResult = await scoreForBuildMode(
      svc,
      {
        parent:       briefProfile,
        child:        childInput,
        excludeSlugs: [],
        childGender,
        childYear,
        intent:       buildModeIntent,
      },
      REFRESH_TOP_N,
    )
  } catch (e) {
    console.error('[POST refresh-recommendations] scoreForBuildMode threw:', e)
    return NextResponse.json({ error: 'recommender_failed' }, { status: 500 })
  }

  // Codex r1 finding 2 — fetch_failed must surface as 500, not silent 200.
  // The downstream "shortlist_unchanged" path is for legitimate
  // no_candidates / incomplete scenarios; backend DB errors are different.
  if (pickResult.reason === 'fetch_failed') {
    console.error('[POST refresh-recommendations] scoreForBuildMode returned fetch_failed (DB error)')
    return NextResponse.json({ error: 'recommender_failed' }, { status: 500 })
  }

  // Adapt pickResult to the shape downstream code expects (slug list +
  // reason string). Maintains backwards compat with prior pickTopSchoolSlugs
  // contract so match_reasons + upsert + delete logic stays unchanged.
  const pick = {
    slugs: pickResult.candidates.map(c => c.slug),
    reason: pickResult.reason === 'ok' ? 'inserted' : pickResult.reason,
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
    // Codex r4 P2 #2 (2026-05-24): thread the cache-merged profile so match
    // reasons see the freshly cached drill_focus.
    // Phase 2.8.5 (Codex r1 chip-bundle P1): pass includeEmpty so slugs
    // whose chips just dropped to zero (e.g. brief switched from tennis to
    // academic — Harrow's "strong tennis" chip no longer qualifies under
    // Phase 2.8.3's national-tier floor) get an OVERWRITE with empty
    // reasons, clearing the stale chip. Without this, the per-slug UPDATE
    // loop below silently skips zero-reason slugs and the old chip text
    // persists across briefs.
    reasonsBySlug = await loadMatchReasonsBatch(svc, profileWithCache as BriefProfile, pick.slugs, { includeEmpty: true })
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

  // Build 2 r1 (Codex P1 #2): backfill UPDATE — Phase 2.8.5 (2026-05-25)
  // raised scope from null-only to "always refresh".
  //
  // `ignoreDuplicates: true` above means existing (user_id, child_id,
  // school_slug) rows are SKIPPED entirely — their match_reasons column
  // stays null OR stale when we just computed a fresh value. Without this
  // pass, every shortlist row added before Build 2 shipped never gets
  // reasons populated.
  //
  // Phase 2.8.5: the prior `.is('match_reasons', null)` filter meant
  // that once a row had ANY match_reasons set (from a prior Refresh),
  // the chip text never refreshed even when the brief changed. Live
  // smoke 2026-05-25 surfaced "strong tennis" stuck on Harrow after a
  // rugby Refresh + on every school after an academic Refresh. Removed
  // the .is(null) guard so chips track the current brief. Trade-off:
  // we cannot today distinguish "parent manually edited chips" from
  // "system wrote chips" — but the schema has no manual-chip concept,
  // so blanket refresh is the honest behaviour.
  //
  // Per-slug UPDATE because upsert(ignoreDuplicates: true) won't touch
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
      // Phase 2.8.5: `.is('match_reasons', null)` filter dropped here so
      // returning slugs (already in shortlist from prior Refresh) get
      // fresh chips for the current brief.
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

