// PATCH /admin/content/api/post/[id]/caption
//
// Updates copy_en and/or copy_th on a social_posts row. Used by the detail
// page's inline caption editor — both captions are always-editable
// textareas, and a Save button fires this when either is dirty.
//
// Scope is deliberately narrow: no status changes, no audit trail. If copy_en
// is edited after a Thai translation was generated, we leave copy_th +
// copy_th_generated_at alone — the UI shows the timestamp so the reviewer
// can decide whether to regenerate.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService, verifyAdmin } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid post id' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  const now = new Date().toISOString()

  if (typeof body.copy_en === 'string') {
    update.copy_en = body.copy_en
    // If the English changes WITHOUT a new Thai, the existing copy_th is now
    // stale relative to the new English. Clear it (and the audit fields) so
    // the UI shows "no Thai yet" and prompts regeneration — prevents an
    // EN/TH mismatch sitting in the approval queue unnoticed.
    if (typeof body.copy_th !== 'string') {
      update.copy_th = null
      update.copy_th_generated_at = null
      update.copy_th_model = null
    }
  }
  if (typeof body.copy_th === 'string') {
    update.copy_th = body.copy_th
    // A hand-edited Thai caption didn't come from Claude; stamping it with
    // the Claude model slug would be misleading. Mark the source as 'manual'
    // and refresh the timestamp so the detail page shows "translated just now · manual".
    update.copy_th_model = 'manual'
    update.copy_th_generated_at = now
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nothing to update (copy_en or copy_th required)' }, { status: 400 })
  }

  const svc = supabaseService()
  const { error } = await svc.from('social_posts').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
