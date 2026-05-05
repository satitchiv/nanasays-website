import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { sendWelcomeEmail } from '@/lib/email'
import { isPaidModeOn } from '@/lib/paid-mode'

const ALLOWED_EXACT = new Set(['/my-reports', '/unlock', '/portal'])
const ALLOWED_PREFIXES = ['/schools/']

function defaultNext(): string {
  return isPaidModeOn() ? '/my-reports' : '/'
}

function validateNext(raw: string | null): string {
  if (!raw) return defaultNext()
  // Reject full URLs, protocol-relative, backslash tricks
  if (raw.includes('://') || raw.startsWith('//') || raw.includes('\\')) return defaultNext()
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`

  // Parse and normalize via WHATWG URL against a fixed origin so that path
  // traversal like `/schools/../../admin` resolves to its real destination
  // BEFORE allowlist checks. Reject anything that escapes same-origin.
  let pathname: string
  try {
    const u = new URL(prefixed, 'https://nanasays.school')
    if (u.origin !== 'https://nanasays.school') return defaultNext()
    pathname = u.pathname
  } catch {
    return defaultNext()
  }

  // When paid is off, paid destinations are unreachable — fall back to /.
  if (!isPaidModeOn() && (ALLOWED_EXACT.has(pathname) || pathname.startsWith('/my-reports'))) {
    return '/'
  }
  if (ALLOWED_EXACT.has(pathname)) return pathname
  if (ALLOWED_PREFIXES.some(p => pathname.startsWith(p))) return pathname
  return defaultNext()
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const next = validateNext(searchParams.get('next'))
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin

  if (!code) {
    return NextResponse.redirect(`${siteUrl}${isPaidModeOn() ? '/login' : '/'}?error=missing_code`)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${siteUrl}${isPaidModeOn() ? '/login' : '/'}?error=auth`)
  }

  // Send welcome email on first sign-up (created_at within 2 min = new user)
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email && user.created_at) {
    const isNew = new Date(user.created_at).getTime() > Date.now() - 2 * 60 * 1000
    if (isNew) sendWelcomeEmail(user.email) // fire-and-forget — never blocks redirect
  }

  return NextResponse.redirect(`${siteUrl}${next}`)
}
