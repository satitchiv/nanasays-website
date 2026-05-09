import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseService } from '@/lib/supabase-admin'
import { recommendShortlist } from '@/lib/recommend-shortlist'
import { ONBOARDING_FIELD_NAMES } from '@/lib/onboarding-fields'

// Children CRUD for the Research Room Brief tab.
// RLS on `children` table enforces auth.uid() = user_id, so the
// authenticated client is sufficient for reads/writes. The recommender
// fired on POST uses the service-role client because schools_status /
// school_structured_data are RLS-locked from anon.

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
    .select('id, name, date_of_birth, child_profile, is_archived, created_at, updated_at')
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

  // Copy ALL 9 onboarding fields from parent_profiles into the new
  // child_profile. Slice 3.3 model: every field is per-child, no
  // family-level enforcement. New children inherit the parent's
  // onboarding answers as a starting template; can be tweaked
  // independently from the Brief tab.
  const svc = supabaseService()
  const { data: pp, error: ppErr } = await svc
    .from('parent_profiles')
    .select(ONBOARDING_FIELD_NAMES.join(', '))
    .eq('id', user.id)
    .maybeSingle()

  if (ppErr) {
    console.error('[POST /api/children] parent_profiles seed read failed:', ppErr.message)
    return NextResponse.json({ error: 'Failed to seed child profile' }, { status: 500 })
  }

  const childProfile: Record<string, unknown> = {}
  if (pp) {
    for (const key of ONBOARDING_FIELD_NAMES) {
      const v = (pp as unknown as Record<string, unknown>)[key]
      if (v != null) childProfile[key] = v
    }
  }
  // Mark as complete so the recommender's onboarding gate passes.
  childProfile.onboarding_complete = true

  // Check whether this is the user's FIRST non-archived child — if so
  // we'll auto-set them as active_child_id after insert.
  const { count: existingCount } = await supabase
    .from('children')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_archived', false)
  const isFirstChild = (existingCount ?? 0) === 0

  const { data: created, error } = await supabase
    .from('children')
    .insert({ user_id: user.id, name, date_of_birth: dob, child_profile: childProfile })
    .select('id, name, date_of_birth, child_profile, is_archived, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-set as active_child_id when this is the first child added.
  // Subsequent children don't auto-promote — parent picks via dropdown.
  if (isFirstChild) {
    const { error: activeErr } = await supabase
      .from('parent_profiles')
      .update({ active_child_id: created.id })
      .eq('id', user.id)
    if (activeErr) console.warn('[POST /api/children] active_child_id update failed:', activeErr.message)
  }

  // Best-effort: run the recommender for this new child. Failures
  // never fail the create — the child still exists and the parent
  // can re-trigger via the Brief tab later.
  try {
    const result = await recommendShortlist(svc, user.id, created.id)
    console.log('[POST /api/children recommendShortlist]', user.id, created.id, result.reason, result.added.length)
  } catch (e) {
    console.error('[POST /api/children recommendShortlist] threw:', e)
  }

  return NextResponse.json({ child: created }, { status: 201 })
}
