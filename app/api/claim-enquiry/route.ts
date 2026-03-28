import { NextRequest, NextResponse } from 'next/server'
import { esc, isValidEmail, MAX_NAME, MAX_EMAIL, MAX_MESSAGE, MAX_SHORT } from '@/lib/sanitize'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { first_name, email, job_title, school_name, country, message } = body

    if (!first_name || !email || !school_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (String(first_name).length > MAX_NAME || String(school_name).length > MAX_NAME) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 })
    }
    if (String(email).length > MAX_EMAIL) {
      return NextResponse.json({ error: 'Email too long' }, { status: 400 })
    }
    if (message && String(message).length > MAX_MESSAGE) {
      return NextResponse.json({ error: 'Message too long (max 5000 chars)' }, { status: 400 })
    }
    if (job_title && String(job_title).length > MAX_SHORT) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 })
    }
    if (country && String(country).length > MAX_SHORT) {
      return NextResponse.json({ error: 'Field too long' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
    }

    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1B3252">
        <div style="background:#1B3252;padding:24px 28px;border-radius:10px 10px 0 0">
          <div style="font-size:18px;font-weight:900;color:#34C3A0;margin-bottom:4px">School Claim Request</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.6)">${school_name}</div>
        </div>
        <div style="border:1px solid #E2E8F0;border-top:none;border-radius:0 0 10px 10px;padding:24px 28px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888;width:110px">Name</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600">${esc(first_name)}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">Email</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px"><a href="mailto:${esc(email)}" style="color:#239C80">${esc(email)}</a></td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">Job title</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px">${esc(job_title) || '—'}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">School</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600">${esc(school_name)}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">Country</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px">${esc(country) || '—'}</td></tr>
            <tr><td style="padding:10px 0;font-size:13px;color:#888;vertical-align:top;padding-top:14px">Message</td><td style="padding:10px 0;font-size:14px;line-height:1.6;padding-top:14px">${message ? esc(message).replace(/\n/g, '<br>') : '—'}</td></tr>
          </table>
        </div>
        <div style="margin-top:16px;font-size:11px;color:#9CA3AF;text-align:center">
          NanaSays &middot; nanasays.school &middot; School claim form
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
        subject: `School Claim Request — ${String(school_name).slice(0, 100)} — ${String(first_name).slice(0, 100)}`,
        html,
      }),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
