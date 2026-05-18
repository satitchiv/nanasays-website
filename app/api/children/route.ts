import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseService } from '@/lib/supabase-admin'
import { ONBOARDING_FIELD_NAMES, FAMILY_CONSTANT_FIELD_NAMES } from '@/lib/onboarding-fields'

// Children CRUD for the Research Room Brief tab.
// RLS on `children` table enforces auth.uid() = user_id, so the
// authenticated client is sufficient for reads/writes. POST creates a
// new child with funnel_state='interview' so the parent is forced into
// the Build 7 fullscreen Build Mode interview before any recommendation
// fires. The interview's finalize step is the ONLY auto-recommender
// (2026-05-18) — the onboarding-time recommendShortlist() call that
// used to fire here was dropped because it ran on the thin 5-field
// profile before Nana had collected sports/goals/personality/free-text
// signal, producing weak picks that polluted the shortlist.

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

// GET /api/children — list active children (archived excluded by default)
export async function GET(req: NextRequest) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ children: [] }, { status: 401 })

  const includeArchived = req.nextUrl.searchParams.get('include_archived') === 'true'

  let q = supabase
    .from('children')
    .select('id, name, date_of_birth, child_profile, is_archived, funnel_state, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (!includeArchived) {
    q = q.eq('is_archived', false)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ children: data ?? [] })
}

// POST /api/children — create a new child { name, date_of_birth? }
export async function POST(req: NextRequest) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const dob = typeof body?.date_of_birth === 'string' ? body.date_of_birth.trim() : null

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (name.length > 80) return NextResponse.json({ error: 'name too long' }, { status: 400 })
  // Basic ISO-date sanity (YYYY-MM-DD). Trigger will reject malformed values
  // anyway; this is just a friendlier 400 vs a 500.
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return NextResponse.json({ error: 'date_of_birth must be YYYY-MM-DD' }, { status: 400 })
  }

  // Slice 8 Build 7 Phase C followup #3 (2026-05-16) — selective
  // inheritance. The first-EVER child still inherits ALL wizard answers
  // from parent_profiles (those answers ARE about this child).
  // Second/Nth siblings inherit only the 6 family-constant fields
  // (region, boarding, budget, curriculum, ethos, intl); child-specific
  // fields (year, gender, priority, class_size, sen, phone, lgbtq,
  // pastoral) start blank so Build Mode's interview tailors them per
  // child instead of cloning the prior child's identity.
  const svc = supabaseService()

  // Probe existing children to pick the right seed-field set. Count all
  // children, including archived: an archived child still proves
  // parent_profiles may contain child-specific answers from an older
  // child, so a new child must not be treated as wizard-fresh.
  // (Codex r1 P1 — was active-only, would re-bleed after archive-only-
  // child → add new child path.)
  const { count: existingChildCount, error: countErr } = await svc
    .from('children')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (countErr) {
    console.error('[POST /api/children] child count failed:', countErr.message)
    return NextResponse.json({ error: 'Failed to seed child profile' }, { status: 500 })
  }

  const isFirstChild = (existingChildCount ?? 0) === 0
  const seedFields = isFirstChild
    ? ONBOARDING_FIELD_NAMES
    : FAMILY_CONSTANT_FIELD_NAMES

  const { data: pp, error: ppErr } = await svc
    .from('parent_profiles')
    .select(seedFields.join(', '))
    .eq('id', user.id)
    .maybeSingle()

  if (ppErr) {
    console.error('[POST /api/children] parent_profiles seed read failed:', ppErr.message)
    return NextResponse.json({ error: 'Failed to seed child profile' }, { status: 500 })
  }

  const childProfile: Record<string, unknown> = {}
  if (pp) {
    for (const key of seedFields) {
      const v = (pp as unknown as Record<string, unknown>)[key]
      if (v != null) childProfile[key] = v
    }
  }
  // Mark as complete so the recommender's onboarding gate passes.
  childProfile.onboarding_complete = true

  const { data: created, error } = await supabase
    .from('children')
    .insert({
      user_id:       user.id,
      name,
      date_of_birth: dob,
      child_profile: childProfile,
      // Slice 8 Build 7: new children skip the 'onboarding' funnel
      // stage because by the time this POST fires the parent has
      // already filled name+DOB AND inherited the 5 onboarding
      // answers from parent_profiles. They're ready for the interview.
      // DB default is 'onboarding' as a safety net for unspecified
      // inserts.
      funnel_state:  'interview',
    })
    .select('id, name, date_of_birth, child_profile, is_archived, funnel_state, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Slice 8 Build 7 Phase C followup: always auto-set active_child_id to
  // the new child so Phase C's fullscreen gate fires (gate reads the
  // active child's funnel_state). Previously gated on isFirstChild —
  // dropped because 2nd/3rd/Nth child adds never triggered the funnel.
  const { error: activeErr } = await supabase
    .from('parent_profiles')
    .update({ active_child_id: created.id })
    .eq('id', user.id)
  if (activeErr) console.warn('[POST /api/children] active_child_id update failed:', activeErr.message)

  // 2026-05-18 — recommendShortlist() at child-creation time was removed.
  // The parent now lands in the Build 7 fullscreen interview with an
  // empty shortlist; Build Mode finalize's score-for-build-mode.ts is the
  // only auto-recommender and runs once the interview has captured the
  // rich Build Mode signal (sports/goals/personality/free-text). Parents
  // who want recommendations on demand can still hit
  // /api/children/[id]/refresh-recommendations from the Brief tab.

  return NextResponse.json({ child: created }, { status: 201 })
}
