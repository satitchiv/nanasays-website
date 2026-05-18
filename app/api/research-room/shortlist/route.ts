import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { writeMatchReasonsForInRoomAdd } from '@/lib/research-room/write-match-reasons'
import { canonicalizeSlug } from '@/lib/research-room/school-canonical-server'

// POST /api/research-room/shortlist
//
// In-room shortlist mutations (slice 6.6 Phase A). Direct-manipulation
// add / remove for the comparison-view column header. Mirrors the
// active-lens route's trust pattern (direct params, not LLM-originated
// content reconstruction) and gates: feature flag + paid + origin.
//
// Two SECURITY DEFINER RPCs back this:
//   - add_school_to_shortlist(child_id, school_slug)
//   - remove_school_from_shortlist(child_id, school_slug)
// Both validate auth + child ownership + slug shape; add also school-exists.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AddBody    = { action: 'add';    child_id: string; school_slug: string; skip_canonicalize: boolean }
type RemoveBody = { action: 'remove'; child_id: string; school_slug: string }
type Body       = AddBody | RemoveBody

const UUID_RX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const SLUG_RX = /^[a-z0-9-]{1,80}$/

function parseBody(raw: unknown): { body: Body | null; error?: string } {
  if (!raw || typeof raw !== 'object') return { body: null, error: 'body must be a JSON object' }
  const o = raw as Record<string, unknown>
  const action = o.action

  if (action !== 'add' && action !== 'remove') {
    return { body: null, error: 'action must be add | remove' }
  }
  if (typeof o.child_id !== 'string' || !UUID_RX.test(o.child_id)) {
    return { body: null, error: 'child_id must be a UUID' }
  }
  if (typeof o.school_slug !== 'string' || !SLUG_RX.test(o.school_slug.toLowerCase())) {
    return { body: null, error: 'school_slug must match ^[a-z0-9-]{1,80}$' }
  }
  if (action === 'add') {
    return {
      body: {
        action:            'add',
        child_id:          o.child_id,
        school_slug:       o.school_slug.toLowerCase(),
        // Default false → canonicalize-on-add fires. Only the popup's
        // alternate-row click sets this to true. Codex r2 Q9: the
        // legacy `confirmed_choice` alias was dropped — nothing
        // deployed ever sent it; the rename happened in the same branch.
        skip_canonicalize: o.skip_canonicalize === true,
      },
    }
  }
  return {
    body: {
      action:      'remove',
      child_id:    o.child_id,
      school_slug: o.school_slug.toLowerCase(),
    },
  }
}

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

// Origin check — same belt-and-braces as write-action / active-lens.
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
  console.error('[research-room/shortlist]', fallback, err.code, err.message)
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
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }
  const { body, error } = parseBody(raw)
  if (!body) return NextResponse.json({ ok: false, code: 'invalid_payload', detail: error }, { status: 400 })

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) return NextResponse.json({ ok: false, code: 'payment_required' }, { status: 402 })

  if (body.action === 'add') {
    // 2026-05-18 — canonicalize-on-add backstop. Defends against
    // programmatic / legacy callers that submit a data-poor duplicate
    // slug. Skipped when skip_canonicalize:true — SchoolAdder sets it
    // when the user expands a duplicate group and deliberately picks
    // an alternate. See lib/research-room/school-canonical.ts.
    //
    // Codex r1 P1 #1: Build Mode's confirm_add_school RPC path
    // (via /api/research-room/write-action) constructs its slug from a
    // pre-saved proposal_id and bypasses this route entirely, so this
    // backstop does NOT cover LLM-originated propose_add_school adds.
    // Tracked as a separate followup (see TASKS.md).
    let writeSlug = body.school_slug
    if (!body.skip_canonicalize) {
      try {
        const { canonical, swapped, reason } = await canonicalizeSlug(body.school_slug)
        if (swapped) {
          console.info('[shortlist] canonicalized', body.school_slug, '→', canonical, reason)
          writeSlug = canonical
        }
      } catch (e) {
        // Canonicalization is best-effort. If it fails we fall through
        // to the submitted slug and let the RPC produce its normal
        // school-not-found / validation errors.
        console.warn('[shortlist] canonicalize failed:', e)
      }
    }

    const { data, error: rpcErr } = await supabase
      .rpc('add_school_to_shortlist', {
        p_child_id:    body.child_id,
        p_school_slug: writeSlug,
      })
    if (rpcErr) return rpcErrorToResponse(rpcErr, 'add_school_to_shortlist')

    const result = Array.isArray(data) ? data[0] : data
    if (!result) return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })

    // RPC OUT columns are out_slug + out_status (renamed in
    // 2026-05-10-fix-shortlist-rpc-ambiguity.sql to avoid the
    // school_slug name colliding with the table column).
    const { out_slug, out_status } = result as { out_slug: string; out_status: string }
    // 2026-05-18 — DB-level gender validation. The RPC rejects schools whose
    // gender_split is incompatible with the child's child_gender BEFORE
    // INSERT (no row written, no side effects). Surface a 409 so the UI
    // can show "School is girls-only; this child is a boy" instead of a
    // generic 500.
    if (out_status === 'rejected_gender_mismatch') {
      return NextResponse.json({
        ok: false,
        code: 'rejected_gender_mismatch',
        detail: 'This school does not match this child\'s gender.',
        school_slug: out_slug,
      }, { status: 409 })
    }
    if (out_status === 'added' || out_status === 'already_present') {
      // Build 2 r1 (Codex P2 #6) + r2 Q5: compute match_reasons and write
      // via a null-only UPDATE. Runs on BOTH 'added' (fresh row) AND
      // 'already_present' — the UPDATE's `.is('match_reasons', null)`
      // clause means prior non-null reasons are preserved, so it's safe
      // to re-fire on already_present to backfill null rows. Best-effort:
      // failure logs and doesn't affect the user-facing response.
      try {
        await writeMatchReasonsForInRoomAdd(user.id, body.child_id, out_slug)
      } catch (e) {
        console.warn('[research-room/shortlist] match_reasons write failed:', e)
      }
      return NextResponse.json({ ok: true, status: out_status, school_slug: out_slug }, { status: out_status === 'added' ? 201 : 200 })
    }
    console.error('[research-room/shortlist] unexpected add status:', out_status)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }

  // body.action === 'remove'
  const { data, error: rpcErr } = await supabase
    .rpc('remove_school_from_shortlist', {
      p_child_id:    body.child_id,
      p_school_slug: body.school_slug,
    })
  if (rpcErr) return rpcErrorToResponse(rpcErr, 'remove_school_from_shortlist')

  const result = Array.isArray(data) ? data[0] : data
  if (!result) return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })

  const { out_slug, out_status } = result as { out_slug: string; out_status: string }
  if (out_status === 'removed' || out_status === 'not_present') {
    return NextResponse.json({ ok: true, status: out_status, school_slug: out_slug }, { status: 200 })
  }
  console.error('[research-room/shortlist] unexpected remove status:', out_status)
  return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
}

// Slice 8 Build 6 r-step2 Q2/Q9 — writeMatchReasonsForInRoomAdd was
// extracted to lib/research-room/write-match-reasons.ts so the new
// add_school write-action branch can share the same null-only UPDATE
// behaviour.
