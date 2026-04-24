// GET /admin/content/api/plan/list
// Returns all plan items still in 'planned' / 'queued' / 'generating' / 'failed'
// status. The design_family column on social_content_plans is no longer used
// by any code — we leave the DB column in place but ignore it here.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin, supabaseService } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const svc = supabaseService()
  const { data, error } = await svc
    .from('social_content_plans')
    .select(`
      id, batch_id, scheduled_for, post_type, pillar_slug, school_id, school_ids,
      channel_slug, angle, reasoning, status, generated_post_id, error_message,
      created_at, created_by,
      headline, audience, pain_point, key_insight, proof_points, reader_takeaway,
      visual_direction, hashtags, risk_flags
    `)
    .in('status', ['planned', 'queued', 'generating', 'failed'])
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Hydrate school names
  const allSchoolIds = new Set<string>()
  for (const row of data || []) {
    if (row.school_id) allSchoolIds.add(row.school_id)
    for (const sid of row.school_ids || []) allSchoolIds.add(sid)
  }
  let schoolNames: Record<string, string> = {}
  if (allSchoolIds.size) {
    const { data: schools } = await svc
      .from('schools')
      .select('id, name')
      .in('id', Array.from(allSchoolIds))
    schoolNames = Object.fromEntries((schools || []).map(s => [s.id, s.name]))
  }

  return NextResponse.json({ ok: true, items: data, schoolNames })
}
