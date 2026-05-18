import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'

// POST /api/research-room/write-action
//
// The single entry point for every chat-driven mutation in the Research
// Room. Takes pointers only — never row content — and delegates to one of
// the SECURITY DEFINER Postgres functions added in the Research Room
// migrations.
//
// The functions reconstruct the proposal from research_session_messages.
// parsed_answer, so neither this route NOR a direct PostgREST caller can
// inject arbitrary row content. See codex-review-rr-slice5-migration-v3
// for the trust-boundary justification.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// T4.19 misconfig warning at module load — surface ONCE if the topic-lens
// fill flag is on but the service key required for projection reads is
// missing. The route gracefully skips post-fill in this case (helper would
// also no-op), but a missing key is silent otherwise.
if (process.env.NANA_TOPIC_LENS_FACTS === 'on' && !process.env.SUPABASE_SERVICE_KEY) {
  console.warn(
    '[write-action] NANA_TOPIC_LENS_FACTS=on but SUPABASE_SERVICE_KEY is unset — ' +
    'T4.19 post-confirm projector-fill will be skipped on every confirm.',
  )
}

type AddRowBody          = { action: 'add_row';            message_id: string; proposal_id: string }
type UndoRowBody         = { action: 'undo_add_row';       row_id: string }
type RestoreRowBody      = { action: 'restore_row';        row_id: string }
type AddToLetterBody     = { action: 'add_to_letter';      message_id: string; proposal_id: string }
// Slice 6: lens write actions. Both call confirm_lens_from_proposal
// under the hood; the lens_name_override lever is the only thing that
// differs at the route layer.
type CreateLensBody      = { action: 'create_lens';        message_id: string; proposal_id: string }
type SaveViewAsLensBody  = { action: 'save_view_as_lens';  message_id: string; proposal_id: string; lens_name: string }
// Slice 6.5: topic lens. Calls create_topic_lens which atomically
// inserts a comparison_lenses row + N comparison_rows with
// created_by_lens_id set + flips active_lens_id.
type CreateTopicLensBody = { action: 'create_topic_lens';  message_id: string; proposal_id: string }
// Slice 8 Build 6: confirm propose_add_school. Calls confirm_add_school
// RPC, then best-effort writes match_reasons + refreshes seeded rows
// so the new column populates immediately on the parent's current view.
type AddSchoolBody       = { action: 'add_school';         message_id: string; proposal_id: string }
type Body = AddRowBody | UndoRowBody | RestoreRowBody | AddToLetterBody | CreateLensBody | SaveViewAsLensBody | CreateTopicLensBody | AddSchoolBody

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

  // Slice 7 — add_to_letter: pointer-only append into partner_briefs.
  // The RPC reconstructs the actual markdown from the persisted proposal.
  if (action === 'add_to_letter') {
    if (typeof o.message_id !== 'string' || !UUID_RX.test(o.message_id))                return { body: null, error: 'message_id must be a UUID' }
    if (typeof o.proposal_id !== 'string' || !PROPOSAL_ID_RX.test(o.proposal_id as string)) return { body: null, error: 'proposal_id must match ^[a-zA-Z0-9_-]{1,40}$' }
    return { body: { action, message_id: o.message_id, proposal_id: o.proposal_id } }
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

  // Slice 6.5 — create_topic_lens: same shape as create_lens (no override).
  // The RPC reads embedded_rows + base_lens_kind from the proposal.
  if (action === 'create_topic_lens') {
    if (typeof o.message_id !== 'string' || !UUID_RX.test(o.message_id))                return { body: null, error: 'message_id must be a UUID' }
    if (typeof o.proposal_id !== 'string' || !PROPOSAL_ID_RX.test(o.proposal_id as string)) return { body: null, error: 'proposal_id must match ^[a-zA-Z0-9_-]{1,40}$' }
    return { body: { action, message_id: o.message_id, proposal_id: o.proposal_id } }
  }

  // Slice 8 Build 6 — add_school: confirm a propose_add_school. The
  // RPC reads the slug from parsed_answer.proposed_actions[proposal_id]
  // so the route only carries pointers.
  if (action === 'add_school') {
    if (typeof o.message_id !== 'string' || !UUID_RX.test(o.message_id))                return { body: null, error: 'message_id must be a UUID' }
    if (typeof o.proposal_id !== 'string' || !PROPOSAL_ID_RX.test(o.proposal_id as string)) return { body: null, error: 'proposal_id must match ^[a-zA-Z0-9_-]{1,40}$' }
    return { body: { action, message_id: o.message_id, proposal_id: o.proposal_id } }
  }

  return { body: null, error: 'action must be add_row | undo_add_row | restore_row | add_to_letter | create_lens | save_view_as_lens | create_topic_lens | add_school' }
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

  if (body.action === 'add_to_letter') {
    const { data, error: rpcErr } = await supabase
      .rpc('confirm_add_to_letter', { p_message_id: body.message_id, p_proposal_id: body.proposal_id })
    if (rpcErr) return rpcErrorToResponse(rpcErr, 'confirm_add_to_letter')

    const result = Array.isArray(data) ? data[0] : data
    if (!result) return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })

    const { brief_id, status, brief_data } = result as { brief_id: string; status: string; brief_data: unknown }

    if (status === 'created_brief') {
      return NextResponse.json({ ok: true, status, brief_id, brief: brief_data }, { status: 201 })
    }
    if (status === 'fresh' || status === 'deduped') {
      return NextResponse.json({ ok: true, status, brief_id, brief: brief_data }, { status: 200 })
    }
    console.error('[write-action] unexpected confirm_add_to_letter status:', status)
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

  // Slice 6.5 — create_topic_lens: atomic bundled write. Inserts
  // comparison_lenses + N comparison_rows + flips active_lens_id.
  if (body.action === 'create_topic_lens') {
    const { data, error: rpcErr } = await supabase
      .rpc('create_topic_lens', {
        p_message_id:  body.message_id,
        p_proposal_id: body.proposal_id,
      })
    if (rpcErr) return rpcErrorToResponse(rpcErr, 'create_topic_lens')

    const result = Array.isArray(data) ? data[0] : data
    if (!result) return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })

    const { lens_id, status, lens_data } = result as { lens_id: string | null; status: string; lens_data: unknown }

    // T4.19 — post-confirm projector-fill for OLD topic-lens rows.
    // Fires on fresh / merged / deduped (all idempotent). Reads back the
    // lens's topic rows + the user's current shortlist, fills cells
    // missing/null for slugs that have school_fact_projections data.
    // Behind NANA_TOPIC_LENS_FACTS=on (also gates T4.18). Failures don't
    // block the response — telemetry returned for dev observability.
    //
    // Codex r3: short-circuit BEFORE the 3 DB lookups + service client
    // construction when the flag is off OR the service key is missing.
    // The helper itself also flag-gates, but doing it here too makes the
    // contract explicit and avoids 3 round-trips of wasted reads.
    let post_fill: unknown = null
    const t419_flag_on = process.env.NANA_TOPIC_LENS_FACTS === 'on'
    const t419_service_key = process.env.SUPABASE_SERVICE_KEY
    if (lens_id && t419_flag_on && t419_service_key &&
        (status === 'fresh' || status === 'merged' || status === 'deduped')) {
      try {
        const { data: msg } = await supabase
          .from('research_session_messages')
          .select('session_id, parsed_answer')
          .eq('id', body.message_id)
          .maybeSingle()
        const proposal = (msg?.parsed_answer as { proposed_actions?: Record<string, { topic_name?: unknown }> } | null)
          ?.proposed_actions?.[body.proposal_id]
        const topicName = typeof proposal?.topic_name === 'string' ? proposal.topic_name : null
        if (topicName && msg?.session_id) {
          const { data: ses } = await supabase
            .from('research_sessions')
            .select('child_id')
            .eq('id', msg.session_id)
            .maybeSingle()
          if (ses?.child_id) {
            const { data: short } = await supabase
              .from('shortlisted_schools')
              .select('school_slug')
              .eq('user_id', user.id)
              .eq('child_id', ses.child_id)
            const slugs = (short ?? []).map((s) => s.school_slug as string)
            if (slugs.length > 0) {
              const { applyPostConfirmTopicLensFill } = await import('@/lib/server/topic-lens-post-confirm-fill')
              // T4.19 needs a service-role client for the school_fact_projections
              // SELECT — that table has RLS enabled with no user-scoped policy.
              // Auth client stays on comparison_rows reads/updates (RLS allows owner).
              // (Service key existence already guarded above.)
              const supabaseService = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                t419_service_key,
              )
              post_fill = await applyPostConfirmTopicLensFill(supabase, supabaseService, user.id, lens_id, topicName, slugs)
              if (post_fill) {
                const t = post_fill as Record<string, number>
                console.log(
                  `[write-action] T4.19 post-confirm fill — lens=${lens_id} status=${status} ` +
                  `rows=${t.rows_examined} missing=${t.cells_missing} filled=${t.cells_filled} ` +
                  `unfilled=${t.cells_unfilled} preserved=${t.cells_preserved} oversized=${t.rows_oversized_skipped} ` +
                  `updated=${t.rows_updated} update_failed=${t.rows_update_failed} ` +
                  `schools_with_pack=${t.schools_with_pack} schools_without_pack=${t.schools_without_pack}`,
                )
              }
            }
          }
        }
      } catch (e) {
        // Never block the user-facing response on a fill failure.
        console.error('[write-action] T4.19 post-confirm fill threw:', e)
      }
    }

    if (status === 'fresh') {
      return NextResponse.json({ ok: true, status, lens_id, lens: lens_data, post_fill }, { status: 201 })
    }
    if (status === 'deduped') {
      return NextResponse.json({ ok: true, status, lens_id, lens: lens_data, post_fill }, { status: 200 })
    }
    // Slice 6.6 Tier 2: same lens_name in same session + lens has topic
    // rows → RPC merged the new schools' cells into existing topic rows
    // (and INSERTed any rows whose names were new). lens_data carries a
    // _merge_summary computed field with {rows_inserted, rows_updated}
    // so the UI can render "Tennis lens refreshed: 4 updated, 1 added."
    if (status === 'merged') {
      const merge_summary =
        lens_data && typeof lens_data === 'object' && '_merge_summary' in (lens_data as Record<string, unknown>)
          ? (lens_data as Record<string, unknown>)._merge_summary
          : null
      return NextResponse.json({ ok: true, status, lens_id, lens: lens_data, merge_summary, post_fill }, { status: 200 })
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
        detail: 'The topic-lens proposal has no rows to insert.',
      }, { status: 409 })
    }
    console.error('[write-action] unexpected create_topic_lens status:', status)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }

  // Slice 8 Build 6 — add_school: confirm a propose_add_school proposal.
  // Calls confirm_add_school RPC (which atomically inserts shortlisted_schools
  // + stamps actions[]); on success, best-effort writes match_reasons and
  // refreshes seeded comparison_rows so the new school's column populates
  // immediately. Codex r-step2 Q3 OK: do not 500 on seed failure — page
  // reload re-runs seedResearchSession via the page-load path.
  if (body.action === 'add_school') {
    const { data, error: rpcErr } = await supabase
      .rpc('confirm_add_school', { p_message_id: body.message_id, p_proposal_id: body.proposal_id })
    if (rpcErr) return rpcErrorToResponse(rpcErr, 'confirm_add_school')

    const result = Array.isArray(data) ? data[0] : data
    if (!result) return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })

    const { out_slug, out_status, out_session_id, out_child_id } = result as {
      out_slug:       string
      out_status:     string
      out_session_id: string
      out_child_id:   string
    }

    // 2026-05-18 — DB-level gender validation. The RPC skips both the
    // INSERT and the action stamp when the school is gender-incompatible,
    // so the LLM can re-propose a different school on the next turn
    // without a stale 'add_school' stamp pinning the message.
    if (out_status === 'rejected_gender_mismatch') {
      return NextResponse.json({
        ok: false,
        code: 'rejected_gender_mismatch',
        detail: 'That school doesn\'t match this child\'s gender.',
        school_slug: out_slug,
      }, { status: 409 })
    }

    if (out_status === 'added' || out_status === 'already_present' || out_status === 'already_confirmed' || out_status === 're_added') {
      // Best-effort side effects. Failures log but don't bubble — the
      // RPC's atomic write already succeeded.
      try {
        const { writeMatchReasonsForInRoomAdd } = await import('@/lib/research-room/write-match-reasons')
        await writeMatchReasonsForInRoomAdd(user.id, out_child_id, out_slug)
      } catch (e) {
        console.warn('[write-action] match_reasons after add_school failed:', e)
      }
      try {
        // Refresh seeded rows so the new column populates on the parent's
        // current view (without this they'd see '—' until next page load,
        // when seedResearchSession runs from page.tsx). reconcileSeededRows
        // covers general + brief rows; chat/topic-lens rows are out of
        // scope for v1 (documented in TASKS Build 6).
        const [{ loadShortlistContext, seedResearchSession }, { supabaseService }] = await Promise.all([
          import('@/lib/research-room/seed-rows'),
          import('@/lib/supabase-admin'),
        ])
        const svc = supabaseService()
        const ctx = await loadShortlistContext(svc, user.id, out_child_id)
        const { data: childRow } = await svc
          .from('children')
          .select('child_profile')
          .eq('id', out_child_id)
          .maybeSingle()
        const briefProfile = (childRow?.child_profile ?? null) as
          | import('@/lib/research-room/brief-predicates').BriefProfile
          | null
        await seedResearchSession(svc, user.id, out_session_id, ctx, briefProfile)
      } catch (e) {
        console.warn('[write-action] seedResearchSession after add_school failed:', e)
      }
      // 're_added' is also a fresh write (insert path) so return 201
      // to mirror the manual + Add school header button (created).
      const httpStatus = (out_status === 'added' || out_status === 're_added') ? 201 : 200
      return NextResponse.json({ ok: true, status: out_status, school_slug: out_slug }, { status: httpStatus })
    }
    console.error('[write-action] unexpected confirm_add_school status:', out_status)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ ok: false, code: 'invalid_payload' }, { status: 400 })
}
