import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i

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

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug?.toLowerCase()
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ content: null })

  const { data } = await supabase
    .from('visit_notes')
    .select('content, updated_at')
    .eq('user_id', user.id)
    .eq('school_slug', slug)
    .maybeSingle()

  return NextResponse.json({ content: data?.content ?? null, updatedAt: data?.updated_at ?? null })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug?.toLowerCase()
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const content = typeof body?.content === 'string' ? body.content.slice(0, 10000) : ''

  const { error } = await supabase
    .from('visit_notes')
    .upsert(
      { user_id: user.id, school_slug: slug, content, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,school_slug' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
