import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_id, parent_name, parent_email, child_age, entry_year, message } = body

    if (!school_id || !parent_name || !parent_email || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify the school is an active Partner
    const { data: school } = await supabase
      .from('schools')
      .select('name, admin_email, is_partner, partner_expires')
      .eq('id', school_id)
      .single()

    const isActive = school?.is_partner && school?.partner_expires
      && new Date(school.partner_expires) > new Date()

    if (!isActive) {
      return NextResponse.json({ error: 'This school does not accept direct enquiries' }, { status: 403 })
    }

    const { error } = await supabase.from('enquiries').insert({
      school_id,
      parent_name: parent_name.trim(),
      parent_email: parent_email.trim().toLowerCase(),
      child_age: child_age?.trim() || null,
      entry_year: entry_year?.trim() || null,
      message: message.trim(),
      is_read: false,
    })

    if (error) {
      return NextResponse.json({ error: 'Failed to send enquiry' }, { status: 500 })
    }

    // Fire-and-forget email notification to school — never block the 200 on this
    if (school.admin_email && process.env.RESEND_API_KEY) {
      const details = [
        child_age ? `Child's age: ${child_age}` : null,
        entry_year ? `Target entry: ${entry_year}` : null,
      ].filter(Boolean).join('\n')

      const html = `
        <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1B3252">
          <div style="font-size:20px;font-weight:900;margin-bottom:4px">New enquiry on NanaSays</div>
          <div style="font-size:13px;color:#6B7280;margin-bottom:28px">A parent has sent an enquiry about ${school.name}</div>

          <div style="background:#F6F8FA;border-radius:10px;padding:20px 22px;margin-bottom:24px;font-size:14px;line-height:1.7">
            <strong>From:</strong> ${parent_name}<br/>
            <strong>Email:</strong> <a href="mailto:${parent_email}" style="color:#239C80">${parent_email}</a><br/>
            ${details ? details.split('\n').map(d => `<strong>${d.split(':')[0]}:</strong>${d.split(':').slice(1).join(':')}<br/>`).join('') : ''}
          </div>

          <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:20px 22px;margin-bottom:28px;font-size:14px;color:#374151;line-height:1.75;font-style:italic">
            &ldquo;${message.trim()}&rdquo;
          </div>

          <a href="https://nanasays.school/portal/enquiries" style="display:inline-block;padding:12px 28px;background:#34C3A0;color:#fff;text-decoration:none;border-radius:9px;font-weight:800;font-size:13px">
            View in portal &rarr;
          </a>

          <div style="margin-top:32px;font-size:11px;color:#9CA3AF;border-top:1px solid #E2E8F0;padding-top:16px">
            NanaSays &middot; nanasays.school &middot; You are receiving this because you are a Partner school.
          </div>
        </div>
      `

      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'NanaSays <noreply@nanasays.school>',
          to: [school.admin_email],
          subject: `New enquiry from ${parent_name} — ${school.name}`,
          html,
        }),
      }).catch(() => {}) // fire-and-forget, never throws
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
