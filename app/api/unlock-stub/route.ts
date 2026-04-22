import { NextRequest, NextResponse } from 'next/server'
import { UNLOCK_COOKIE } from '@/lib/paid-status'

export const dynamic = 'force-dynamic'

// Phase 1 stub: sets the unlock cookie and redirects back to the page the
// user came from (with a ?just_unlocked=true flag so the destination can
// show a success banner). In Phase 2 the real Stripe webhook will set this
// same cookie after a successful payment.
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const fromRaw = formData.get('from')
  const from = typeof fromRaw === 'string' && fromRaw.startsWith('/') ? fromRaw : '/my-reports'

  const url = new URL(from, req.url)
  url.searchParams.set('just_unlocked', 'true')

  const res = NextResponse.redirect(url, 303)
  res.cookies.set(UNLOCK_COOKIE, 'true', {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year — lifetime access per the offer
  })
  return res
}
