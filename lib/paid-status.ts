import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function isUnlocked(): Promise<boolean> {
  return (await getUnlockedUser()).isPaid
}

/** Returns isPaid + the authenticated user's email (for watermarking). */
export async function getUnlockedUser(): Promise<{ isPaid: boolean; userEmail: string | null }> {
  if (process.env.NEXT_PUBLIC_DEV_UNLOCK === 'true') return { isPaid: true, userEmail: null }

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
  if (!user) return { isPaid: false, userEmail: null }

  const { data } = await supabase
    .from('parent_profiles')
    .select('subscription_status')
    .eq('id', user.id)
    .maybeSingle()

  return {
    isPaid: data?.subscription_status === 'active',
    userEmail: user.email ?? null,
  }
}
