import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email    = searchParams.get('email')
  const schoolId = searchParams.get('school_id')
  const token    = searchParams.get('token')

  // Validate secret token
  if (!token || token !== process.env.ADMIN_APPROVE_TOKEN) {
    return new NextResponse(html('Unauthorised', 'Invalid or missing token.', false), {
      status: 401, headers: { 'Content-Type': 'text/html' },
    })
  }

  if (!email || !schoolId) {
    return new NextResponse(html('Missing info', 'Email or school ID not provided.', false), {
      status: 400, headers: { 'Content-Type': 'text/html' },
    })
  }

  // Fetch school to confirm it exists
  const { data: school, error: schoolErr } = await supabase
    .from('schools')
    .select('id, name, admin_email')
    .eq('id', schoolId)
    .single()

  if (schoolErr || !school) {
    return new NextResponse(html('School not found', `No school found with ID: ${schoolId}`, false), {
      status: 404, headers: { 'Content-Type': 'text/html' },
    })
  }

  // Already claimed by a different email — warn but allow override
  const alreadyClaimed = school.admin_email && school.admin_email !== email

  // Set admin_email immediately — ownership is granted at approval time, not link-click time
  const { error: updateErr } = await supabase
    .from('schools')
    .update({ admin_email: email, claimed_at: new Date().toISOString() })
    .eq('id', schoolId)

  if (updateErr) {
    return new NextResponse(html('Database error', `Could not update school: ${updateErr.message}`, false), {
      status: 500, headers: { 'Content-Type': 'text/html' },
    })
  }

  // Build redirect URL from the incoming request origin so it works locally AND on production
  const origin = new URL(req.url).origin
  const redirectTo = `${origin}/auth/callback`

  const { error: inviteErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  }).then(async ({ data, error }) => {
    if (error) return { error }
    // Send via Resend
    const link = data.properties?.action_link
    if (!link) return { error: new Error('No magic link generated') }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'NanaSays <noreply@nanasays.school>',
        to: [email],
        subject: `Your NanaSays portal is ready — ${school.name}`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1B3252">
            <div style="background:#1B3252;padding:24px 28px;border-radius:10px 10px 0 0">
              <div style="font-size:20px;font-weight:900;color:#34C3A0;margin-bottom:4px">nana<span style="color:#fff">says</span></div>
              <div style="font-size:13px;color:rgba(255,255,255,0.6)">School Portal Access</div>
            </div>
            <div style="border:1px solid #E2E8F0;border-top:none;border-radius:0 0 10px 10px;padding:32px 28px">
              <h2 style="font-size:20px;font-weight:800;margin:0 0 12px;color:#1B3252">You're approved</h2>
              <p style="font-size:14px;color:#6B7280;line-height:1.7;margin:0 0 24px">
                Your portal for <strong style="color:#1B3252">${school.name}</strong> is ready.
                Click the button below to enter — the link is valid for 24 hours.
              </p>
              <a href="${link}"
                 style="display:inline-block;padding:14px 32px;background:#34C3A0;color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:15px">
                Enter your portal
              </a>
              <p style="margin-top:24px;font-size:12px;color:#9CA3AF;line-height:1.6">
                This link logs you in automatically — no password needed.<br>
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
            <div style="margin-top:16px;font-size:11px;color:#9CA3AF;text-align:center">
              NanaSays &middot; nanasays.school
            </div>
          </div>
        `,
      }),
    })

    if (!emailRes.ok) return { error: new Error('Failed to send invite email') }
    return { error: null }
  })

  if (inviteErr) {
    return new NextResponse(html('Failed', `Could not send invite: ${inviteErr.message}`, false), {
      status: 500, headers: { 'Content-Type': 'text/html' },
    })
  }

  const warning = alreadyClaimed
    ? `<p style="color:#b45309;font-size:13px;margin-top:12px">Note: this school was previously claimed by ${school.admin_email}. The new invite goes to ${email}.</p>`
    : ''

  return new NextResponse(html(
    'Invite sent',
    `Magic link sent to <strong>${email}</strong> for <strong>${school.name}</strong>.<br><br>They will receive an email with a one-click login button.${warning}`,
    true
  ), { status: 200, headers: { 'Content-Type': 'text/html' } })
}

function html(title: string, body: string, success: boolean) {
  const color = success ? '#34C3A0' : '#c0392b'
  const bg    = success ? '#E8FAF6' : '#fdecea'
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title} — NanaSays</title></head>
<body style="font-family:-apple-system,sans-serif;background:#F6F8FA;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:40px">
  <div style="max-width:440px;width:100%;background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:40px;text-align:center;box-shadow:0 2px 24px rgba(0,0,0,0.06)">
    <div style="width:52px;height:52px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
      <span style="font-size:24px">${success ? '✓' : '✕'}</span>
    </div>
    <h2 style="color:#1B3252;font-size:20px;margin:0 0 12px">${title}</h2>
    <p style="color:#6B7280;font-size:14px;line-height:1.7;margin:0">${body}</p>
    <a href="mailto:satitchiv@gmail.com" style="display:inline-block;margin-top:24px;font-size:12px;color:#34C3A0">Back to inbox</a>
  </div>
</body></html>`
}
