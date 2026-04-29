import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
}

// GET /api/shortlist — return all shortlisted school slugs for the current user
export async function GET() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ slugs: [] })

  const { data } = await supabase
    .from('shortlisted_schools')
    .select('school_slug, added_at')
    .eq('user_id', user.id)
    .order('added_at', { ascending: false })

  return NextResponse.json({ slugs: (data ?? []).map((r: any) => r.school_slug) })
}

// POST /api/shortlist — add a school { slug }
export async function POST(req: NextRequest) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const slug = typeof body?.slug === 'string' ? body.slug.toLowerCase().trim() : ''
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const { error } = await supabase
    .from('shortlisted_schools')
    .insert({ user_id: user.id, school_slug: slug })

  // Ignore unique violation — idempotent add
  if (error && !error.message.includes('unique')) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE /api/shortlist?slug=xxx — remove a school
export async function DELETE(req: NextRequest) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slug = req.nextUrl.searchParams.get('slug')?.toLowerCase().trim()
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const { error } = await supabase
    .from('shortlisted_schools')
    .delete()
    .eq('user_id', user.id)
    .eq('school_slug', slug)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
