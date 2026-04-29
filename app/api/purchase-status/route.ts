import { createSupabaseServer } from '@/lib/supabase-ssr'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Polled by the checkout success page to detect when the webhook has fired
export async function GET() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ purchased: false })
  }

  const { data } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'complete')
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ purchased: !!data })
}
