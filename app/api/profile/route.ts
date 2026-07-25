import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendWelcomeEmail } from '@/lib/email'
import { recommendShortlist } from '@/lib/recommend-shortlist'
import { supabaseService } from '@/lib/supabase-admin'

export async function PATCH(req: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Hardcoded rather than derived from ONBOARDING_FIELD_NAMES because this
  // list also includes onboarding_complete (a flow flag, not a question).
  // Add new onboarding fields here AND to scripts/migrations/ as a column
  // on parent_profiles (the seed-select in /api/children would otherwise
  // 500). T4.16 Gap B (2026-05-09) added the 3 *_pref keys.
  // 2026-05-10 ISI deep extraction added lgbtq_pref + pastoral_pref.
  const allowed = [
    'child_year', 'boarding_pref', 'budget_range', 'top_priority', 'home_region',
    'child_gender', 'curriculum_pref', 'class_size_pref', 'sen_need',
    'ethos_pref', 'intl_pref', 'phone_pref',
    'lgbtq_pref', 'pastoral_pref',
    'onboarding_complete',
  ]
  const body = await req.json()
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  // Read the current onboarding_complete value BEFORE updating so we can
  // distinguish "transition from false → true" (fire welcome email +
  // recommender) from "PATCH retried with onboarding_complete:true again"
  // (no-op). Without this guard, a double-click would send the email
  // twice and run the recommender twice — Codex P1.
  let wasComplete = false
  if (update.onboarding_complete === true) {
    const { data: prior } = await supabase
      .from('parent_profiles')
      .select('onboarding_complete')
      .eq('id', user.id)
      .maybeSingle<{ onboarding_complete: boolean | null }>()
    wasComplete = prior?.onboarding_complete === true
  }

  const { error } = await supabase
    .from('parent_profiles')
    .update(update)
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const justCompleted = update.onboarding_complete === true && !wasComplete

  if (justCompleted && user.email) {
    await sendWelcomeEmail(user.email)
  }

  // Best-effort: auto-populate shortlist from onboarding answers so the
  // parent lands in /nana/research-room with a non-empty Comparison table.
  // Failures here must never fail the onboarding request.
  //
  // recommendShortlist reads schools_status / school_structured_data which
  // are RLS-locked from anon+authenticated. Use the service-role client so
  // the helper keeps working after Phase 1 RLS lockdown.
  if (justCompleted) {
    try {
      const result = await recommendShortlist(supabaseService(), user.id)
      console.log('[recommendShortlist]', user.id, result.reason, result.added.length)
    } catch (e) {
      console.error('[recommendShortlist] threw:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
