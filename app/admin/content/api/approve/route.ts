import { NextRequest, NextResponse } from 'next/server'
import { supabaseService, verifyAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { post_id, note } = await req.json()
  if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 })

  const svc = supabaseService()

  const { data: post, error: fetchErr } = await svc
    .from('social_posts')
    .select('id, status')
    .eq('id', post_id)
    .single()
  if (fetchErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  // Update status — the bump_usage_on_approval trigger fires automatically.
  const { error: updateErr } = await svc
    .from('social_posts')
    .update({ status: 'approved' })
    .eq('id', post_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Audit row
  await svc.from('social_approvals').insert({
    post_id, reviewer_id: auth.userId, decision: 'approve', note,
  })

  return NextResponse.json({ ok: true, status: 'approved' })
}
