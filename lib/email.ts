// Thin wrapper around the Resend API — no SDK needed, existing codebase uses raw fetch.
// All functions fail silently so email errors never break the main request flow.

const FROM = 'Nanasays <noreply@nanasays.com>'
const RESEND_URL = 'https://api.resend.com/emails'

async function send(opts: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) return // not configured yet — skip silently

  try {
    await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [opts.to], subject: opts.subject, html: opts.html }),
    })
  } catch {
    // Never throw — email failure must not break auth/payment flows
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

function baseLayout(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F6F8FA;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FA;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1B3252;border-radius:14px 14px 0 0;padding:28px 36px;">
          <span style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Nanasays</span>
          <span style="font-size:11px;color:#34C3A0;font-weight:700;letter-spacing:0.1em;margin-left:10px;text-transform:uppercase;">UK Independent Schools</span>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;padding:36px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">
          ${content}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F6F8FA;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 14px 14px;padding:20px 36px;">
          <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
            Nanasays · UK Independent Schools Research<br>
            <a href="https://nanasays.com/privacy" style="color:#9CA3AF;">Privacy Policy</a> ·
            <a href="https://nanasays.com/terms" style="color:#9CA3AF;">Terms of Service</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendWelcomeEmail(to: string): Promise<void> {
  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:900;color:#1B3252;letter-spacing:-0.5px;">
      Welcome to Nanasays
    </h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
      You now have a free account. Here&rsquo;s what you can do:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      ${[
        ['🔍', 'Browse 140 UK schools', 'Every school profile is free — search by boarding type, sport, location, or fees range.'],
        ['📄', 'See the free report', 'Each school shows an overview, key facts, location, and a sports summary at no cost.'],
        ['🔒', 'Unlock the full dossier', 'One payment of £39 unlocks ISI inspection history, financial health, safeguarding record, policy analysis, and Nana chat across all 140 schools.'],
      ].map(([icon, title, desc]) => `
        <tr><td style="padding:10px 0;border-top:1px solid #F3F4F6;vertical-align:top;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:20px;width:36px;vertical-align:top;padding-top:2px;">${icon}</td>
            <td style="padding-left:10px;">
              <div style="font-size:14px;font-weight:700;color:#1B3252;margin-bottom:4px;">${title}</div>
              <div style="font-size:13px;color:#6B7280;line-height:1.5;">${desc}</div>
            </td>
          </tr></table>
        </td></tr>
      `).join('')}
    </table>
    <a href="https://nanasays.com/schools"
       style="display:inline-block;background:#34C3A0;color:#1B3252;padding:13px 26px;border-radius:9px;font-size:14px;font-weight:800;text-decoration:none;">
      Browse schools →
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#9CA3AF;line-height:1.5;">
      Questions? Reply to this email and we&rsquo;ll get back to you.
    </p>
  `)

  await send({
    to,
    subject: 'Welcome to Nanasays — here\'s how to get started',
    html,
  })
}

export async function sendPurchaseConfirmationEmail(to: string): Promise<void> {
  const html = baseLayout(`
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:#E8FAF6;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:28px;">✓</div>
    </div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:900;color:#1B3252;letter-spacing:-0.5px;text-align:center;">
      You&rsquo;re in. Reports unlocked.
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">
      Your one-time payment is confirmed. You now have full access to all 140 UK independent school reports — including every new school we add.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FA;border-radius:10px;padding:20px;margin:0 0 28px;border:1px solid #E5E7EB;">
      ${[
        ['Full fees breakdown', 'Day and boarding rates, year by year'],
        ['ISI inspection record', 'Verbatim inspector quotes + full history'],
        ['Financial health', 'Charity Commission filings, 3–5 year trend'],
        ['Safeguarding record', 'Regulatory status and any flagged concerns'],
        ['Policy analysis', 'Transparency ratings from 30–50 docs per school'],
        ['Nana AI chat', 'Ask anything — cited answers from the full research file'],
      ].map(([title, desc]) => `
        <tr><td style="padding:8px 0;border-top:1px solid #E5E7EB;">
          <span style="font-size:14px;font-weight:700;color:#34C3A0;">✓</span>
          <span style="font-size:14px;font-weight:700;color:#1B3252;margin-left:8px;">${title}</span>
          <span style="font-size:13px;color:#6B7280;margin-left:6px;">— ${desc}</span>
        </td></tr>
      `).join('')}
    </table>
    <a href="https://nanasays.com/schools"
       style="display:block;text-align:center;background:#1B3252;color:#fff;padding:14px 26px;border-radius:9px;font-size:15px;font-weight:800;text-decoration:none;margin-bottom:12px;">
      Start reading reports →
    </a>
    <p style="margin:0;font-size:13px;color:#9CA3AF;line-height:1.5;text-align:center;">
      Problems with your purchase? Email <a href="mailto:support@nanasays.com" style="color:#34C3A0;">support@nanasays.com</a>
    </p>
  `)

  await send({
    to,
    subject: 'You\'re in — your Nanasays reports are unlocked',
    html,
  })
}
