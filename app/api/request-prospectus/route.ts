import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { esc, isValidEmail, MAX_NAME, MAX_EMAIL } from '@/lib/sanitize'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, school_name, school_email, parent_name, parent_email } = body

    if (!school_id || !school_name || !school_email || !parent_name || !parent_email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!isValidEmail(parent_email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (String(parent_name).length > MAX_NAME || String(school_name).length > MAX_NAME) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 })
    }
    if (String(parent_email).length > MAX_EMAIL) {
      return NextResponse.json({ error: 'Email too long' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
    }

    // Branded email to the school — they receive a qualified lead
    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1B3252">
        <div style="background:#1B3252;border-radius:12px;padding:24px 28px;margin-bottom:28px">
          <div style="font-size:22px;font-weight:900;color:#34C3A0;letter-spacing:-0.02em;font-family:Nunito,sans-serif">NanaSays</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;letter-spacing:0.06em;text-transform:uppercase">International School Directory</div>
        </div>

        <div style="font-size:18px;font-weight:800;margin-bottom:8px;color:#1B3252">
          A parent found your school on NanaSays and requested your prospectus
        </div>
        <div style="font-size:14px;color:#6B7280;margin-bottom:28px;line-height:1.6">
          This is a qualified lead — they discovered ${esc(school_name)} while researching international schools on NanaSays and are actively interested.
        </div>

        <div style="background:#F6F8FA;border-radius:10px;padding:20px 22px;margin-bottom:24px;font-size:14px;line-height:1.9">
          <strong>Parent name:</strong> ${esc(parent_name)}<br/>
          <strong>Email:</strong> <a href="mailto:${esc(parent_email)}" style="color:#239C80;font-weight:700">${esc(parent_email)}</a><br/>
          <strong>School page:</strong> <a href="https://nanasays.school/schools/${esc(school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}" style="color:#239C80">View on NanaSays</a>
        </div>

        <div style="background:#E8FAF6;border:1px solid rgba(52,195,160,0.3);border-radius:10px;padding:16px 20px;margin-bottom:28px;font-size:13px;color:#1B3252;line-height:1.6">
          <strong>What to do next:</strong> Reply directly to ${esc(parent_name)} at <a href="mailto:${esc(parent_email)}" style="color:#239C80">${esc(parent_email)}</a> and attach your school prospectus or viewbook.
        </div>

        <div style="margin-top:32px;font-size:11px;color:#9CA3AF;border-top:1px solid #E2E8F0;padding-top:16px">
          NanaSays &middot; <a href="https://nanasays.school" style="color:#9CA3AF">nanasays.school</a> &middot; Sent on behalf of ${esc(parent_name)}
        </div>
      </div>
    `

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'NanaSays <noreply@nanasays.school>',
        to: [school_email],
        reply_to: parent_email,
        subject: `A parent found your school on NanaSays and requested your prospectus`,
        html,
      }),
    })

    // Log as outbound click for attribution tracking
    await supabase.from('outbound_clicks').insert({
      school_id,
      placement: 'request-prospectus',
      destination: school_email,
      session_id: null,
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
