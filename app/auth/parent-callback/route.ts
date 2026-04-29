import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_EXACT = new Set(['/my-reports', '/unlock', '/portal'])
const ALLOWED_PREFIXES = ['/schools/']

function validateNext(raw: string | null): string {
  if (!raw) return '/my-reports'
  // Reject full URLs, protocol-relative, backslash tricks
  if (raw.includes('://') || raw.startsWith('//') || raw.includes('\\')) return '/my-reports'
  const clean = raw.startsWith('/') ? raw : `/${raw}`
  if (ALLOWED_EXACT.has(clean)) return clean
  if (ALLOWED_PREFIXES.some(p => clean.startsWith(p))) return clean
  return '/my-reports'
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const next = validateNext(searchParams.get('next'))
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/login?error=missing_code`)
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
    return NextResponse.redirect(`${siteUrl}/login?error=auth`)
  }

  return NextResponse.redirect(`${siteUrl}${next}`)
}
