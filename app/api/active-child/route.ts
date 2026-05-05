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

// POST /api/active-child  body: { child_id: string | null }
//
// Sets parent_profiles.active_child_id. Cross-table ownership trigger
// (enforce_active_child_same_user) backstops a malicious caller trying
// to set someone else's child as active. Pass null to clear.
export async function POST(req: NextRequest) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const childId = body?.child_id

  if (childId !== null && (typeof childId !== 'string' || !UUID_RE.test(childId))) {
    return NextResponse.json({ error: 'child_id must be a uuid or null' }, { status: 400 })
  }

  const { error } = await supabase
    .from('parent_profiles')
    .update({ active_child_id: childId })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
