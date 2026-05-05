import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendWelcomeEmail } from '@/lib/email'
import { recommendShortlist } from '@/lib/recommend-shortlist'

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

  const allowed = [
    'child_year', 'boarding_pref', 'budget_range', 'top_priority', 'home_region',
    'child_gender', 'curriculum_pref', 'class_size_pref', 'sen_need',
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

  const { error } = await supabase
    .from('parent_profiles')
    .update(update)
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (update.onboarding_complete === true && user.email) {
    await sendWelcomeEmail(user.email)
  }

  // Best-effort: auto-populate shortlist from onboarding answers so the
  // parent lands in /nana/research-room with a non-empty Comparison table.
  // Failures here must never fail the onboarding request.
  if (update.onboarding_complete === true) {
    try {
      const result = await recommendShortlist(supabase, user.id)
      console.log('[recommendShortlist]', user.id, result.reason, result.added.length)
    } catch (e) {
      console.error('[recommendShortlist] threw:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
