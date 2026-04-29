import Stripe from 'stripe'
import { createSupabaseServer } from '@/lib/supabase-ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rateLimit'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, 'checkout')) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
  }

  // Always verify the user server-side — never trust client-sent IDs
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Read `from` param for post-payment redirect (allowlisted)
  const body = await req.json().catch(() => ({}))
  const fromRaw: string = body.from ?? '/my-reports'
  const from = fromRaw.startsWith('/') && !fromRaw.includes('//') ? fromRaw : '/my-reports'

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Service-role client for DB writes (bypasses RLS)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  // Create or reuse Stripe customer — idempotency key prevents duplicates
  let stripeCustomerId: string | null = null

  const { data: profile } = await admin
    .from('parent_profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  stripeCustomerId = profile?.stripe_customer_id ?? null

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create(
      { email: user.email, metadata: { supabase_user_id: user.id } },
      { idempotencyKey: `customer:create:${user.id}` }
    )
    stripeCustomerId = customer.id

    // Compare-and-set: only write if still null (prevents race condition)
    const { data: updated } = await admin
      .from('parent_profiles')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', user.id)
      .is('stripe_customer_id', null)
      .select('id').limit(1)

    // If 0 rows updated, another request won the race — re-read the winner
    if (!updated?.length) {
      const { data: refetched } = await admin
        .from('parent_profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single()
      stripeCustomerId = refetched?.stripe_customer_id ?? stripeCustomerId
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId ?? undefined,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    mode: 'subscription',
    success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/unlock`,
    metadata: { supabase_user_id: user.id, from },
    subscription_data: { metadata: { supabase_user_id: user.id } },
  })

  return NextResponse.json({ url: session.url })
}
