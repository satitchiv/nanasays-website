import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'

// POST /api/research-room/active-lens
//
// Slice 6 — switch the active lens on a research session. Distinct from
// /api/research-room/write-action because this is NOT a chat-driven
// mutation — it doesn't reconstruct anything from parsed_answer. The
// route takes a session_id + lens_id (or null to clear) and calls the
// SECURITY DEFINER set_active_lens RPC, which validates ownership and
// the cross-session invariant.
//
// Used by:
//   - Lens picker UI (commit 5) when the parent switches between saved
//     custom lenses
//   - Future: clearing the active lens to fall back to base lens

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = { session_id: string; lens_id: string | null }

const UUID_RX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function parseBody(raw: unknown): { body: Body | null; error?: string } {
  if (!raw || typeof raw !== 'object') return { body: null, error: 'body must be a JSON object' }
  const o = raw as Record<string, unknown>
  if (typeof o.session_id !== 'string' || !UUID_RX.test(o.session_id)) {
    return { body: null, error: 'session_id must be a UUID' }
  }
  if (o.lens_id !== null && (typeof o.lens_id !== 'string' || !UUID_RX.test(o.lens_id))) {
    return { body: null, error: 'lens_id must be a UUID or null' }
  }
  return { body: { session_id: o.session_id, lens_id: o.lens_id as string | null } }
}

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

// Mirror the write-action route's same-origin check (Codex slice-5
// final-pass finding #4). SameSite=Lax cookies are the primary CSRF
// defence; this is belt-and-braces for a user-write endpoint.
async function isAllowedOrigin(): Promise<boolean> {
  const h = await headers()
  const origin = h.get('origin')
  if (!origin) return true
  const host = h.get('host')
  if (!host) return false
  try {
    const originHost = new URL(origin).host
    if (originHost === host) return true
  } catch { /* malformed Origin */ }
  return false
}

function rpcErrorToResponse(err: { code?: string; message?: string }, fallback: string): NextResponse {
  const code = err.code ?? ''
  if (code === '28000') return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })
  if (code === '42501') return NextResponse.json({ ok: false, code: 'forbidden' }, { status: 403 })
  if (code === '22023') return NextResponse.json({ ok: false, code: 'invalid_payload' }, { status: 400 })
  console.error('[active-lens]', fallback, err.code, err.message)
  return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
}

export async function POST(req: NextRequest) {
  if (!isResearchRoomEnabled()) {
    return NextResponse.json({ ok: false, code: 'feature_disabled' }, { status: 404 })
  }
  if (!(await isAllowedOrigin())) {
    return NextResponse.json({ ok: false, code: 'forbidden_origin' }, { status: 403 })
  }

  let raw: unknown
  try { raw = await req.json() }
  catch { return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 }) }

  const { body, error } = parseBody(raw)
  if (!body) return NextResponse.json({ ok: false, code: 'invalid_payload', detail: error }, { status: 400 })

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })

  // Same paid-status gate as write-action — lens activation is a paid
  // surface. Defence-in-depth: the RPC also re-checks ownership.
  const { isPaid } = await getUnlockedUser()
  if (!isPaid) return NextResponse.json({ ok: false, code: 'payment_required' }, { status: 402 })

  const { data, error: rpcErr } = await supabase
    .rpc('set_active_lens', {
      p_session_id: body.session_id,
      p_lens_id:    body.lens_id,
    })
  if (rpcErr) return rpcErrorToResponse(rpcErr, 'set_active_lens')

  const result = Array.isArray(data) ? data[0] : data
  if (!result) return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })

  const { session_id, active_lens_id } = result as { session_id: string; active_lens_id: string | null }
  return NextResponse.json({ ok: true, session_id, active_lens_id }, { status: 200 })
}
