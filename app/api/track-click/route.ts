import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { school_id, school_slug, placement, destination } = await req.json()

    if (!school_id || !placement) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const userAgent = req.headers.get('user-agent') || ''

    // Anonymous session ID from cookie (if present) — fire-and-forget, no blocking
    const sessionId = req.cookies.get('ns_session')?.value || null

    // Insert — do not await to avoid blocking navigation
    void supabase.from('outbound_clicks').insert({
      school_id,
      school_slug: school_slug || null,
      placement,
      destination: destination || null,
      user_agent: userAgent,
      session_id: sessionId,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
