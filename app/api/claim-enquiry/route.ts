import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { first_name, email, job_title, school_name, country, message } = body

    if (!first_name || !email || !school_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888;width:110px">Name</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600">${first_name}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">Email</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px"><a href="mailto:${email}" style="color:#239C80">${email}</a></td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">Job title</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px">${job_title || '—'}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">School</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600">${school_name}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">Country</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px">${country || '—'}</td></tr>
            <tr><td style="padding:10px 0;font-size:13px;color:#888;vertical-align:top;padding-top:14px">Message</td><td style="padding:10px 0;font-size:14px;line-height:1.6;padding-top:14px">${message ? message.replace(/\n/g, '<br>') : '—'}</td></tr>
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
        subject: `School Claim Request — ${school_name} — ${first_name}`,
        html,
      }),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
