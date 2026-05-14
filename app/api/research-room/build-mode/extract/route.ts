// Slice 8 Step 0.4 — Build Mode extract route.
//
// Allowlisted JSONB merge of LLM-extracted fields onto child_profile,
// plus absolute-target build_mode_progress merge on the session row.
// Both writes atomic via the build_mode_apply_extraction RPC.
//
// Trust boundary lives here: auth.getUser() + Zod allowlist
// (`BuildModeExtractionSchema_HTTP`). The RPC is service-role only —
// the route calls it via supabaseService() after auth + validation.

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { supabaseService } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// HTTP-side allowlist (`.optional()` for PATCH semantics). Keep field
// name + type parity with the LLM-side schema in build-mode-llm.ts
// (which uses `.nullable()` because zodResponseFormat rejects optional).
export const BuildModeExtractionSchema_HTTP = z.object({
  personality_notes: z.string().optional(),
  anchors_notes:     z.string().optional(),
  academic_notes:    z.string().optional(),
  goals_notes:       z.string().optional(),
  nonnegotiables:    z.array(z.string()).optional(),
  child_wants:       z.string().optional(),
  goal_orientation:  z.enum(['university_track', 'discovery', 'sport_career']).optional(),
  interests_sports:  z.array(z.object({
    sport: z.string(),
    level: z.string(),
  })).optional(),
  interests_arts:    z.array(z.object({
    art:   z.string(),
    level: z.string(),
  })).optional(),
}).strict()

const ProgressTargetsSchema = z.record(z.string(), z.number().min(0).max(1))

const RequestSchema = z.object({
  child_id:   z.string().uuid(),
  session_id: z.string().uuid(),
  fields:     BuildModeExtractionSchema_HTTP,
  progress:   z.object({
    targets: ProgressTargetsSchema,
    mode:    z.enum(['detailed', 'minimal']).optional(),
  }).optional(),
})

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

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

// SQLSTATE-first mapping from the build_mode_apply_extraction RPC's
// RAISE EXCEPTION codes. Message used only to distinguish our two
// custom 404 variants (child_not_found vs session_not_found).
function mapRpcError(err: { code?: string; message?: string }): NextResponse {
  const code = err.code ?? ''
  const msg  = (err.message ?? '').toLowerCase()
  if (code === '28000') return NextResponse.json({ ok: false, code: 'unauthorized' },          { status: 401 })
  if (code === '23514') return NextResponse.json({ ok: false, code: 'session_child_mismatch' }, { status: 409 })
  if (code === '22023') return NextResponse.json({ ok: false, code: 'invalid_payload' },       { status: 400 })
  if (code === '42501') return NextResponse.json({ ok: false, code: 'forbidden' },             { status: 403 })
  if (code === '40001') return NextResponse.json({ ok: false, code: 'transient' },             { status: 503 })
  if (code === 'P0002') {
    if (msg.includes('child_not_found'))   return NextResponse.json({ ok: false, code: 'child_not_found' },   { status: 404 })
    if (msg.includes('session_not_found')) return NextResponse.json({ ok: false, code: 'session_not_found' }, { status: 404 })
    return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 })
  }
  console.error('[build-mode-extract] unmapped RPC error', err.code, err.message)
  return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
}

export async function POST(req: NextRequest) {
  if (!isResearchRoomEnabled()) {
    return NextResponse.json({ ok: false, code: 'feature_disabled' }, { status: 404 })
  }
  if (!(await isAllowedOrigin())) {
    return NextResponse.json({ ok: false, code: 'forbidden_origin' }, { status: 403 })
  }

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })
  }

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) {
    return NextResponse.json({ ok: false, code: 'payment_required' }, { status: 402 })
  }

  let body: z.infer<typeof RequestSchema>
  try {
    const raw = await req.json()
    body = RequestSchema.parse(raw)
  } catch (e) {
    if (e instanceof z.ZodError) {
      const rejected = e.issues
        .filter(i => i.code === 'unrecognized_keys')
        .flatMap(i => (i as z.ZodIssue & { keys?: string[] }).keys ?? [])
      return NextResponse.json({
        ok:              false,
        code:            'invalid_request',
        zod:             e.flatten(),
        rejected_fields: rejected,
      }, { status: 400 })
    }
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const svc = supabaseService()
  const { data, error } = await svc.rpc('build_mode_apply_extraction', {
    p_user_id:    user.id,
    p_child_id:   body.child_id,
    p_session_id: body.session_id,
    p_fields:     body.fields,
    p_targets:    body.progress?.targets ?? null,
    p_mode:       body.progress?.mode    ?? null,
  })

  if (error) {
    return mapRpcError(error)
  }

  type RpcResult = {
    ok: boolean
    written_field_count: number
    progress_total: number | null
    progress_targets: Record<string, number> | null
  }
  const result = (data ?? {}) as RpcResult

  return NextResponse.json({
    ok:                  true,
    written_field_count: result.written_field_count ?? 0,
    progress_total:      result.progress_total      ?? null,
    progress_targets:    result.progress_targets    ?? null,
  })
}
