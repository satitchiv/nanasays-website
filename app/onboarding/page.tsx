import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isUnlocked } from '@/lib/paid-status'
import { ONBOARDING_FIELDS } from '@/lib/onboarding-fields'
import OnboardingForm from './OnboardingForm'
import './onboarding.css'

export const metadata = { title: 'Set up your profile' }

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const unlocked = await isUnlocked()
  if (!unlocked) redirect('/unlock')

  // Pre-fill the form with the parent's current answers when they
  // revisit /onboarding to edit. First-time users get an empty form.
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()

  let initialAnswers: Record<string, string> = {}
  if (user) {
    const fieldNames = ONBOARDING_FIELDS.map(f => f.field)
    const { data: profile } = await supabase
      .from('parent_profiles')
      .select(fieldNames.join(', '))
      .eq('id', user.id)
      .maybeSingle()
    if (profile) {
      const p = profile as Record<string, unknown>
      for (const field of fieldNames) {
        const v = p[field]
        if (typeof v === 'string' && v) initialAnswers[field] = v
      }
    }
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-logo">
        nana<span>says</span>
      </div>
      <div className="onboarding-card">
        <OnboardingForm initialAnswers={initialAnswers} />
      </div>
    </div>
  )
}
