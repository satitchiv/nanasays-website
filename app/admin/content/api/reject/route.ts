import { NextRequest, NextResponse } from 'next/server'
import { supabaseService, verifyAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { post_id, note } = await req.json()
  if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 })
  if (!note) return NextResponse.json({ error: 'note is required for reject' }, { status: 400 })

  const svc = supabaseService()

  const { error: updateErr } = await svc
    .from('social_posts')
    .update({ status: 'rejected' })
    .eq('id', post_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await svc.from('social_approvals').insert({
    post_id, reviewer_id: auth.userId, decision: 'reject', note,
  })

  return NextResponse.json({ ok: true, status: 'rejected' })
}
