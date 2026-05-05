import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

// PATCH /api/children/[id] — update fields { name?, date_of_birth?, is_archived?, child_profile? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const update: Record<string, unknown> = {}

  if (typeof body?.name === 'string') {
    const n = body.name.trim()
    if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    if (n.length > 80) return NextResponse.json({ error: 'name too long' }, { status: 400 })
    update.name = n
  }
  if (typeof body?.date_of_birth === 'string') {
    const d = body.date_of_birth.trim()
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: 'date_of_birth must be YYYY-MM-DD' }, { status: 400 })
    }
    update.date_of_birth = d || null
  }
  if (typeof body?.is_archived === 'boolean') {
    update.is_archived = body.is_archived
  }
  if (body?.child_profile && typeof body.child_profile === 'object' && !Array.isArray(body.child_profile)) {
    update.child_profile = body.child_profile
  }
  // Always bump updated_at on any patch.
  update.updated_at = new Date().toISOString()

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('children')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)  // RLS-enforced too, but explicit for clarity
    .select('id, name, date_of_birth, child_profile, is_archived, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ child: data })
}

// DELETE /api/children/[id] — soft-archive (set is_archived = true)
// Hard delete is intentionally not exposed — slice 3 spec requires
// session/row history to remain readable after archival.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('children')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
