// Slice 8 Build 7 — Build Mode skip endpoint.
//
// Flips children.funnel_state to 'comparison' for the parent's
// specified child, marking that the parent has explicitly bailed
// out of the funnel.
//
// SECURITY MODEL — "best-effort server-driven" (NOT "server-controlled"):
//   `children` has RLS `FOR ALL USING (auth.uid() = user_id) WITH CHECK
//   (auth.uid() = user_id)`, which lets a signed-in parent UPDATE
//   their OWN children rows directly via the browser Supabase client
//   (PostgREST). That includes funnel_state, which means a determined
//   parent CAN re-set their own funnel_state to 'interview' or
//   'onboarding' by bypassing this route. The blast radius is THEIR
//   OWN funnel UX only (RLS prevents cross-parent access).
//
//   This endpoint is the *happy-path canonical writer* for the skip
//   transition. UX, telemetry, and audit logs route through here.
//   If real-world abuse appears, a follow-up migration can REVOKE
//   UPDATE on funnel_state from authenticated and force all writes
//   through the service role (= server-only).
//
// Codex r9 design lock: skip uses funnel_state=comparison as the
// single source of truth (no separate skipped_at column).

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 10

const RequestSchema = z.object({
  childId: z.string().uuid(),
})

function jsonError(status: number, code: string) {
  return NextResponse.json({ ok: false, code }, { status })
}

// CSRF guard, mirroring the pattern at extract/route.ts:68-79.
// SameSite=Lax cookies don't catch cross-origin fetches; this does.
async function isAllowedOrigin(): Promise<boolean> {
  const h = await headers()
  const origin = h.get('origin')
  if (!origin) return true
  const host = h.get('host')
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  if (!isResearchRoomEnabled()) return jsonError(404, 'feature_disabled')
  if (!(await isAllowedOrigin())) return jsonError(403, 'forbidden_origin')

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError(401, 'unauthorized')

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) return jsonError(402, 'payment_required')

  const rateOk = await checkRateLimit(req, 'chat')
  if (!rateOk) return jsonError(429, 'rate_limited')

  let body: { childId: string }
  try {
    const json = await req.json()
    body = RequestSchema.parse(json)
  } catch {
    return jsonError(400, 'bad_request')
  }

  // RLS on `children` enforces auth.uid() = user_id; the explicit
  // .eq('user_id', user.id) is belt-and-braces. No WHERE-clause guard
  // on current funnel_state — skip is valid from ANY state. Re-running
  // on an already-'comparison' row is a no-op write; idempotent.
  // updated_at bumped manually to mirror /api/children/[id] PATCH
  // convention — funnel transitions are real state changes.
  const { error: updateError, count } = await supabase
    .from('children')
    .update(
      { funnel_state: 'comparison', updated_at: new Date().toISOString() },
      { count: 'exact' },
    )
    .eq('id', body.childId)
    .eq('user_id', user.id)

  if (updateError) {
    console.error('[build-mode/skip] update failed:', updateError.message)
    return jsonError(500, 'update_failed')
  }

  // count === 0 means the child either doesn't exist or belongs to
  // a different user. Both surface as 404 — never leak existence.
  if (!count || count === 0) {
    return jsonError(404, 'child_not_found')
  }

  return NextResponse.json({ ok: true, funnel_state: 'comparison' })
}
