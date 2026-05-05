import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Children CRUD for the Research Room Brief tab.
// RLS on `children` table enforces auth.uid() = user_id, so the
// authenticated client is sufficient — no service-role needed here.

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

// GET /api/children — list active children (archived excluded by default)
export async function GET(req: NextRequest) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ children: [] }, { status: 401 })

  const includeArchived = req.nextUrl.searchParams.get('include_archived') === 'true'

  let q = supabase
    .from('children')
    .select('id, name, date_of_birth, child_profile, is_archived, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (!includeArchived) {
    q = q.eq('is_archived', false)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ children: data ?? [] })
}

// POST /api/children — create a new child { name, date_of_birth? }
export async function POST(req: NextRequest) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const dob = typeof body?.date_of_birth === 'string' ? body.date_of_birth.trim() : null

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (name.length > 80) return NextResponse.json({ error: 'name too long' }, { status: 400 })
  // Basic ISO-date sanity (YYYY-MM-DD). Trigger will reject malformed values
  // anyway; this is just a friendlier 400 vs a 500.
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return NextResponse.json({ error: 'date_of_birth must be YYYY-MM-DD' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('children')
    .insert({ user_id: user.id, name, date_of_birth: dob })
    .select('id, name, date_of_birth, child_profile, is_archived, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ child: data }, { status: 201 })
}
