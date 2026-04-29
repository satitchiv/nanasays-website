import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendPurchaseConfirmationEmail } from '@/lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Must read raw body — parsing JSON first breaks Stripe signature verification
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  // Idempotency: insert the event ID first — if it conflicts, we already processed it
  const { error: insertError } = await admin
    .from('stripe_events')
    .insert({ event_id: event.id })

  if (insertError?.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // ── Subscription started ──────────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode !== 'subscription') return NextResponse.json({ received: true })

    const userId = session.metadata?.supabase_user_id
    if (!userId) return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as Stripe.Subscription)?.id ?? null

    await admin
      .from('parent_profiles')
      .upsert({ id: userId, stripe_subscription_id: subscriptionId, subscription_status: 'active' }, { onConflict: 'id' })

    const customerEmail = session.customer_details?.email ?? session.customer_email
    if (customerEmail) await sendPurchaseConfirmationEmail(customerEmail)
  }

  // ── Subscription renewed / status changed ─────────────────────────────────
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const active = sub.status === 'active' || sub.status === 'trialing'
    await admin
      .from('parent_profiles')
      .update({ subscription_status: active ? 'active' : 'inactive' })
      .eq('stripe_subscription_id', sub.id)
  }

  // ── Subscription cancelled ────────────────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await admin
      .from('parent_profiles')
      .update({ subscription_status: 'cancelled' })
      .eq('stripe_subscription_id', sub.id)
  }

  return NextResponse.json({ received: true })
}
