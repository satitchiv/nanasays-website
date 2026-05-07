import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'

// POST /api/research-room/write-action
//
// The single entry point for every chat-driven mutation in the Research
// Room. Takes pointers only — never row content — and delegates to one of
// three SECURITY DEFINER Postgres functions added in
// scripts/migrations/2026-05-06-research-room-write-actions.sql.
//
// The functions reconstruct the proposal from research_session_messages.
// parsed_answer, so neither this route NOR a direct PostgREST caller can
// inject arbitrary row content. See codex-review-rr-slice5-migration-v3
// for the trust-boundary justification.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AddRowBody         = { action: 'add_row';            message_id: string; proposal_id: string }
type UndoRowBody        = { action: 'undo_add_row';       row_id: string }
type RestoreRowBody     = { action: 'restore_row';        row_id: string }
// Slice 6: lens write actions. Both call confirm_lens_from_proposal
// under the hood; the lens_name_override lever is the only thing that
// differs at the route layer.
type CreateLensBody     = { action: 'create_lens';        message_id: string; proposal_id: string }
type SaveViewAsLensBody = { action: 'save_view_as_lens';  message_id: string; proposal_id: string; lens_name: string }
type Body = AddRowBody | UndoRowBody | RestoreRowBody | CreateLensBody | SaveViewAsLensBody

const UUID_RX        = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const PROPOSAL_ID_RX = /^[a-zA-Z0-9_-]{1,40}$/

function parseBody(raw: unknown): { body: Body | null; error?: string } {
  if (!raw || typeof raw !== 'object') return { body: null, error: 'body must be a JSON object' }
  const o = raw as Record<string, unknown>
  const action = o.action

  if (action === 'add_row') {
    if (typeof o.message_id !== 'string' || !UUID_RX.test(o.message_id))   return { body: null, error: 'message_id must be a UUID' }
    if (typeof o.proposal_id !== 'string' || !PROPOSAL_ID_RX.test(o.proposal_id)) return { body: null, error: 'proposal_id must match ^[a-zA-Z0-9_-]{1,40}$' }
    return { body: { action, message_id: o.message_id, proposal_id: o.proposal_id } }
  }

  if (action === 'undo_add_row' || action === 'restore_row') {
    if (typeof o.row_id !== 'string' || !UUID_RX.test(o.row_id)) return { body: null, error: 'row_id must be a UUID' }
    return { body: { action, row_id: o.row_id } as Body }
  }

  // Slice 6 — create_lens: proposal carries lens_name; override forbidden.
  if (action === 'create_lens') {
    if (typeof o.message_id !== 'string' || !UUID_RX.test(o.message_id))                return { body: null, error: 'message_id must be a UUID' }
    if (typeof o.proposal_id !== 'string' || !PROPOSAL_ID_RX.test(o.proposal_id as string)) return { body: null, error: 'proposal_id must match ^[a-zA-Z0-9_-]{1,40}$' }
    return { body: { action, message_id: o.message_id, proposal_id: o.proposal_id } }
  }

  // Slice 6 — save_view_as_lens: re-rank proposal with user-supplied
  // name (1..40 chars after btrim). RPC validates these bounds server-side.
  if (action === 'save_view_as_lens') {
    if (typeof o.message_id !== 'string' || !UUID_RX.test(o.message_id))                return { body: null, error: 'message_id must be a UUID' }
    if (typeof o.proposal_id !== 'string' || !PROPOSAL_ID_RX.test(o.proposal_id as string)) return { body: null, error: 'proposal_id must match ^[a-zA-Z0-9_-]{1,40}$' }
    if (typeof o.lens_name  !== 'string')                                               return { body: null, error: 'lens_name must be a string' }
    const trimmed = o.lens_name.trim()
    if (trimmed.length < 1 || trimmed.length > 40)                                      return { body: null, error: 'lens_name must be 1..40 chars (after trim)' }
    return { body: { action, message_id: o.message_id, proposal_id: o.proposal_id, lens_name: trimmed } }
  }

  return { body: null, error: 'action must be add_row | undo_add_row | restore_row | create_lens | save_view_as_lens' }
}

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

// Map a Postgres EXCEPTION raised by the RPC (auth/forbidden/validation)
// to an HTTP response. The RPC raises with structured ERRCODEs; we never
// surface raw exception messages to the client.
// Origin check — Codex final-pass finding #4. SameSite=Lax cookies are
// the primary CSRF defence; this is the belt-and-braces check for a
// user-write endpoint. Allow same-origin (Origin === Host) and the
// Vercel preview pattern; reject everything else with a 403.
async function isAllowedOrigin(): Promise<boolean> {
  const h = await headers()
  const origin = h.get('origin')
  // Same-origin POSTs from same-tab JS may omit Origin in old browsers.
  // Modern fetch always sets it; the auth cookie + JWT path still requires
  // SameSite=Lax to have allowed the request in the first place.
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
  if (code === '40001') return NextResponse.json({ ok: false, code: 'transient' }, { status: 503 })
  console.error('[write-action]', fallback, err.code, err.message)
  return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
}

export async function POST(req: NextRequest) {
  // Mirror the page-level gates so a direct route hit can't bypass them.
  // Codex final-pass finding #10.
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

  // Same paid-status check the page does. Without this an authenticated
  // free-tier user could hit the route directly. Defence in depth: the
  // SECURITY DEFINER RPCs still re-check ownership, but the paid gate is
  // a product invariant the route owns.
  const { isPaid } = await getUnlockedUser()
  if (!isPaid) return NextResponse.json({ ok: false, code: 'payment_required' }, { status: 402 })

  if (body.action === 'add_row') {
    // Round-4 fix (Codex F1): cross-lens collision pre-check. The RPC's
    // duplicate_name only fires for same-lens collisions; without this
    // guard a chat proposal whose row_name matches a seeded General row
    // creates a chat row that the loader hides via base-wins de-dup —
    // user sees "✓ Added" with no visible row and no × affordance.
    //
    // Reading parsed_answer here is allowed by RLS (user owns the session),
    // and the small race window between this check and the RPC insert is
    // bounded (only the user writes to their session).
    {
      const { data: msgRow, error: msgErr } = await supabase
        .from('research_session_messages')
        .select('session_id, parsed_answer')
        .eq('id', body.message_id)
        .maybeSingle()
      if (msgErr) {
        console.error('[write-action] cross-lens precheck — message lookup', msgErr)
      } else if (msgRow) {
        type ProposalLite = { row_name?: unknown; lens_kind?: unknown }
        const proposals = ((msgRow.parsed_answer as { proposed_actions?: Record<string, ProposalLite> } | null)?.proposed_actions) ?? {}
        const proposal = proposals[body.proposal_id]
        const proposedName  = typeof proposal?.row_name === 'string' ? proposal.row_name.trim().toLowerCase() : null
        const proposedLens  = proposal?.lens_kind === 'general' || proposal?.lens_kind === 'child_fit' ? proposal.lens_kind : 'chat'
        if (proposedName && proposedLens === 'chat') {
          const { data: collisions } = await supabase
            .from('comparison_rows')
            .select('id, row_name')
            .eq('session_id', msgRow.session_id)
            .in('lens_kind', ['general', 'child_fit'])
            .is('undone_at', null)
          const collision = (collisions ?? []).find(
            (r: { row_name: string }) => r.row_name.trim().toLowerCase() === proposedName,
          )
          if (collision) {
            return NextResponse.json({
              ok: false,
              code: 'duplicate_name',
              existing_row_id: collision.id,
              suggest: ['view_existing', 'cancel'],
            }, { status: 409 })
          }
        }
      }
    }

    const { data, error: rpcErr } = await supabase
      .rpc('confirm_add_row', { p_message_id: body.message_id, p_proposal_id: body.proposal_id })
    if (rpcErr) return rpcErrorToResponse(rpcErr, 'confirm_add_row')

    const result = Array.isArray(data) ? data[0] : data
    if (!result) return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })

    const { row_id, status, row_data } = result as { row_id: string; status: string; row_data: unknown }

    if (status === 'fresh') {
      return NextResponse.json({ ok: true, status, row_id, row: row_data }, { status: 201 })
    }
    if (status === 'restored') {
      // Auto-restored from a previously-undone row. UI treats it the
      // same as fresh — the row is now visible in the comparison table.
      return NextResponse.json({ ok: true, status, row_id, row: row_data }, { status: 200 })
    }
    if (status === 'deduped') {
      return NextResponse.json({ ok: true, status, row_id, row: row_data }, { status: 200 })
    }
    if (status === 'duplicate_name') {
      return NextResponse.json({
        ok: false,
        code: 'duplicate_name',
        existing: row_data,
        existing_row_id: row_id,
        suggest: ['merge', 'replace', 'cancel'],
      }, { status: 409 })
    }
    console.error('[write-action] unexpected confirm_add_row status:', status)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }

  if (body.action === 'undo_add_row') {
    // Codex post-round-5 hardening: only chat-added rows are user-removable.
    // The UI already hides × for non-chat rows in ComparisonView, but the
    // RPC accepts any owned row id — defence-in-depth refusal at the route
    // prevents a future UI bug or a direct PostgREST hit from soft-deleting
    // seeded General/child_fit rows. Slice 5.5f-bis would gate this when
    // a "Restore hidden seeded rows" affordance ships.
    {
      const { data: row, error: rowErr } = await supabase
        .from('comparison_rows')
        .select('lens_kind')
        .eq('id', body.row_id)
        .maybeSingle()
      if (rowErr) {
        console.error('[write-action] undo precheck — row lookup', rowErr)
        return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
      }
      if (!row) {
        return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 })
      }
      if (row.lens_kind !== 'chat') {
        return NextResponse.json({
          ok: false,
          code: 'forbidden_seeded_row',
          detail: 'Seeded comparison rows are not user-removable in this slice.',
        }, { status: 403 })
      }
    }

    const { data, error: rpcErr } = await supabase.rpc('undo_add_row', { p_row_id: body.row_id })
    if (rpcErr) return rpcErrorToResponse(rpcErr, 'undo_add_row')

    const result = Array.isArray(data) ? data[0] : data
    if (!result) return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })

    const { row_id, status } = result as { row_id: string; status: string }
    if (status === 'not_found')       return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 })
    if (status === 'already_undone')  return NextResponse.json({ ok: true, status, row_id }, { status: 200 })
    if (status === 'undone')          return NextResponse.json({ ok: true, status, row_id }, { status: 200 })
    console.error('[write-action] unexpected undo_add_row status:', status)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }

  if (body.action === 'restore_row') {
    const { data, error: rpcErr } = await supabase.rpc('restore_row', { p_row_id: body.row_id })
    if (rpcErr) return rpcErrorToResponse(rpcErr, 'restore_row')

    const result = Array.isArray(data) ? data[0] : data
    if (!result) return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })

    const { row_id, status } = result as { row_id: string; status: string }
    if (status === 'not_found')       return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 })
    if (status === 'already_active')  return NextResponse.json({ ok: true, status, row_id }, { status: 200 })
    if (status === 'restored')        return NextResponse.json({ ok: true, status, row_id }, { status: 200 })
    if (status === 'duplicate_name')  return NextResponse.json({
      ok: false,
      code: 'duplicate_name',
      existing_row_id: row_id,
      suggest: ['view_existing', 'cancel'],
    }, { status: 409 })
    console.error('[write-action] unexpected restore_row status:', status)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }

  // Slice 6 — create_lens / save_view_as_lens both call the same RPC.
  // The RPC discriminates by proposal.kind: propose_create_lens forbids
  // override, propose_re_rank requires it. The route maps both action
  // strings to one RPC call with the appropriate override argument.
  if (body.action === 'create_lens' || body.action === 'save_view_as_lens') {
    const override = body.action === 'save_view_as_lens' ? body.lens_name : null
    const { data, error: rpcErr } = await supabase
      .rpc('confirm_lens_from_proposal', {
        p_message_id:         body.message_id,
        p_proposal_id:        body.proposal_id,
        p_lens_name_override: override,
      })
    if (rpcErr) return rpcErrorToResponse(rpcErr, 'confirm_lens_from_proposal')

    const result = Array.isArray(data) ? data[0] : data
    if (!result) return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })

    const { lens_id, status, lens_data } = result as { lens_id: string | null; status: string; lens_data: unknown }

    if (status === 'fresh') {
      return NextResponse.json({ ok: true, status, lens_id, lens: lens_data }, { status: 201 })
    }
    if (status === 'deduped') {
      // Same proposal already saved; RPC re-flipped active_lens_id so UX
      // is "now active".
      return NextResponse.json({ ok: true, status, lens_id, lens: lens_data }, { status: 200 })
    }
    if (status === 'duplicate_name') {
      return NextResponse.json({
        ok: false,
        code: 'duplicate_name',
        existing: lens_data,
        existing_lens_id: lens_id,
        suggest: ['rename', 'cancel'],
      }, { status: 409 })
    }
    if (status === 'empty_after_resolution') {
      return NextResponse.json({
        ok: false,
        code: 'empty_after_resolution',
        detail: 'The rows referenced by this proposal are no longer active.',
      }, { status: 409 })
    }
    console.error('[write-action] unexpected confirm_lens_from_proposal status:', status)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ ok: false, code: 'invalid_payload' }, { status: 400 })
}
