// PATCH /admin/content/api/plan/item/[id] — edit angle / scheduled_for / school_id / channel_slug + strategy brief fields
// DELETE /admin/content/api/plan/item/[id] — mark as skipped (or hard delete if never generated)

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin, supabaseService } from '@/lib/supabase-admin'

const EDITABLE_FIELDS = [
  'angle', 'scheduled_for', 'school_id', 'channel_slug',
  'headline', 'audience', 'pain_point', 'key_insight', 'proof_points',
  'reader_takeaway', 'visual_direction', 'hashtags', 'risk_flags',
] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of EDITABLE_FIELDS) {
    if (k in body) patch[k] = body[k]
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  const svc = supabaseService()
  const { data, error } = await svc
    .from('social_content_plans')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const svc = supabaseService()
  const { data: current } = await svc
    .from('social_content_plans')
    .select('status, generated_post_id')
    .eq('id', id)
    .single()

  if (!current) return NextResponse.json({ error: 'Plan item not found' }, { status: 404 })

  if (current.generated_post_id) {
    // Already linked to a post — just mark as skipped, keep for audit
    const { error } = await svc
      .from('social_content_plans')
      .update({ status: 'skipped', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'marked_skipped' })
  }

  // Never generated — hard delete
  const { error } = await svc.from('social_content_plans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: 'deleted' })
}
