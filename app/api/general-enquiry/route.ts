import { NextRequest, NextResponse } from 'next/server'
import { esc, isValidEmail, MAX_NAME, MAX_EMAIL, MAX_MESSAGE, MAX_SHORT } from '@/lib/sanitize'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { parent_name, parent_email, parent_phone, school_name, message } = body

    if (!parent_name || !parent_email || !school_name || !message) {
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
    if (String(message).length > MAX_MESSAGE) {
      return NextResponse.json({ error: 'Message too long (max 5000 chars)' }, { status: 400 })
    }
    if (parent_phone && String(parent_phone).length > MAX_SHORT) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
    }

    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1B3252">
        <div style="font-size:20px;font-weight:900;margin-bottom:4px">New Enquiry via NanaSays</div>
        <div style="font-size:13px;color:#6B7280;margin-bottom:28px">A parent has enquired about ${esc(school_name)}</div>

        <div style="background:#F6F8FA;border-radius:10px;padding:20px 22px;margin-bottom:24px;font-size:14px;line-height:1.7">
          <strong>School:</strong> ${esc(school_name)}<br/>
          <strong>From:</strong> ${esc(parent_name)}<br/>
          <strong>Email:</strong> <a href="mailto:${esc(parent_email)}" style="color:#239C80">${esc(parent_email)}</a><br/>
          ${parent_phone ? `<strong>Phone:</strong> ${esc(parent_phone)}<br/>` : ''}
        </div>

        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:20px 22px;margin-bottom:28px;font-size:14px;color:#374151;line-height:1.75;font-style:italic">
          &ldquo;${esc(message.trim())}&rdquo;
        </div>

        <div style="margin-top:32px;font-size:11px;color:#9CA3AF;border-top:1px solid #E2E8F0;padding-top:16px">
          NanaSays &middot; nanasays.school &middot; Public enquiry form — all schools.
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
        to: ['satitchiv@gmail.com'],
        subject: `New Enquiry — ${String(school_name).slice(0, 100)} — ${String(parent_name).slice(0, 100)}`,
        html,
      }),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
