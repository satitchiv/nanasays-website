import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendWelcomeEmail } from '@/lib/email'

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

  const allowed = ['child_year', 'boarding_pref', 'budget_range', 'top_priority', 'home_region', 'onboarding_complete']
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

  return NextResponse.json({ ok: true })
}
