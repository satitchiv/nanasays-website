import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { firstName, email, jobTitle, school, country, message, recaptchaToken } = body

    if (!firstName || !email || !school) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify reCAPTCHA (test secret always passes; replace with real key in env)
    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY ?? '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WpepXr'
    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${recaptchaSecret}&response=${recaptchaToken}`,
    })
    const verifyData = await verifyRes.json()
    if (!verifyData.success) {
      return NextResponse.json({ error: 'reCAPTCHA check failed. Please try again.' }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'satitchiv@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
        <div style="background:#1B3252;padding:28px 32px;border-radius:10px 10px 0 0">
          <h2 style="color:#34C3A0;margin:0;font-size:22px">New partner enquiry — NanaSays</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:28px 32px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888;width:120px">First name</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600">${firstName}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">Email</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px"><a href="mailto:${email}" style="color:#1B3252">${email}</a></td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">Job title</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px">${jobTitle || '—'}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">School</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:600">${school}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888">Country</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px">${country || '—'}</td></tr>
            <tr><td style="padding:10px 0;font-size:13px;color:#888;vertical-align:top;padding-top:14px">Message</td><td style="padding:10px 0;font-size:14px;line-height:1.6;padding-top:14px">${message ? message.replace(/\n/g, '<br>') : '—'}</td></tr>
          </table>
        </div>
        <p style="font-size:11px;color:#aaa;margin-top:16px;text-align:center">Sent from nanasays.school/partners</p>
      </div>
    `

    await transporter.sendMail({
      from: '"NanaSays Partners" <satitchiv@gmail.com>',
      to: 'satitchiv@gmail.com',
      replyTo: email,
      subject: `Partner enquiry: ${firstName} — ${school}`,
      html,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Contact form error:', err)
    return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 })
  }
}
