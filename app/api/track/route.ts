import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { school_id, event_type } = await req.json()

    if (!school_id || !event_type) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    if (!['impression', 'view', 'enquiry_open'].includes(event_type)) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    // Get IP for dedup — use X-Forwarded-For header (Netlify/Cloudflare) or fallback
    const forwarded = req.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'

    // SHA-256 hash — never store raw IP (GDPR)
    const ipHash = createHash('sha256').update(ip + process.env.NEXT_PUBLIC_SUPABASE_URL).digest('hex')

    // Dedup: skip if same (ip_hash, school_id, event_type) within last 60 minutes
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: existing } = await supabase
      .from('school_analytics')
      .select('id')
      .eq('school_id', school_id)
      .eq('event_type', event_type)
      .eq('ip_hash', ipHash)
      .gte('created_at', since)
      .limit(1)

    if (existing && existing.length > 0) {
      // Duplicate within window — skip silently
      return NextResponse.json({ ok: true, deduped: true })
    }

    await supabase.from('school_analytics').insert({
      school_id,
      event_type,
      ip_hash: ipHash,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
