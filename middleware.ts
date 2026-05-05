import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { isPaidModeOn } from '@/lib/paid-mode'

const PAID_ROUTE_PREFIXES = [
  '/unlock',
  '/checkout',
  '/my-reports',
  '/my-shortlist',
  '/login',
  '/signup',
  '/onboarding',
  '/nana/decision-hub',
  '/nana/research-room',
  '/nana/research',
  '/partners',
  '/claim',
  '/ask',
  '/portal',
  '/admin',
  '/demo',
  // Gated for security — RLS off + dangerouslySetInnerHTML on blog post bodies
  // = stored-XSS vector. Re-enable after RLS lockdown + HTML sanitization.
  '/blog',
  // Internal social-render surface; not user-facing in any mode.
  '/render',
]

const PAID_REPORT_PATTERN = /^\/schools\/[^/]+\/report(\/|$)/

function paidOffRedirectTarget(pathname: string): string {
  // /schools/:slug/report → /schools/:slug (free version of same school)
  // everything else → / (home)
  const reportMatch = pathname.match(/^\/schools\/([^/]+)\/report/)
  if (reportMatch) return `/schools/${reportMatch[1]}`
  return '/'
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public portal demo — no auth needed (only when paid mode is on; paid-off
  // hides the entire /portal/* surface as a paid B2B sales channel).
  if (pathname.startsWith('/portal/demo') && isPaidModeOn()) {
    return NextResponse.next()
  }

  // Paid mode off — redirect every paid surface to a free destination.
  // 307 (default for NextResponse.redirect) keeps it cache-safe so flipping
  // PAID_MODE back on doesn't fight stale browser caches.
  if (!isPaidModeOn()) {
    const isPaidRoute =
      PAID_ROUTE_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`)) ||
      PAID_REPORT_PATTERN.test(pathname)

    if (isPaidRoute) {
      const target = paidOffRedirectTarget(pathname)
      return NextResponse.redirect(new URL(target, req.url), 307)
    }
  }

  let response = NextResponse.next({ request: req })

  // Refresh Supabase session cookies on every request so they don't expire
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          response = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() validates the JWT server-side — safer than getSession()
  const { data: { user } } = await supabase.auth.getUser()

  // Report pages are publicly accessible — free content is SEO-indexed.
  // isPaid check inside the report page server component gates premium sections.

  // Onboarding gate: if a logged-in user hasn't completed onboarding,
  // redirect them to /onboarding when they land on gated pages.
  // Only runs on /my-reports and /schools/*/report — not on /onboarding itself
  // (to avoid a redirect loop) and not on API or auth routes.
  if (
    user &&
    !pathname.startsWith('/onboarding') &&
    (pathname === '/my-reports' || pathname === '/my-shortlist' || pathname.match(/^\/schools\/[^/]+\/report/))
  ) {
    const { data: profile } = await supabase
      .from('parent_profiles')
      .select('onboarding_complete')
      .eq('id', user.id)
      .maybeSingle()

    if (profile && profile.onboarding_complete === false) {
      return NextResponse.redirect(new URL('/onboarding', req.url))
    }
  }

  // Premium report pages must not appear in search results
  if (pathname.match(/^\/schools\/[^/]+\/report/)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  // Portal and auth routes pass through — handled by their own layouts
  return response
}

export const config = {
  matcher: [
    '/portal/:path*',
    '/auth/callback',
    '/schools/:slug/report',
    '/my-reports',
    '/my-shortlist',
    '/unlock',
    '/checkout/:path*',
    '/login',
    '/signup',
    '/onboarding',
    '/nana/:path*',
    '/partners',
    '/claim/:path*',
    '/ask',
    '/admin/:path*',
    '/demo/:path*',
    '/blog/:path*',
    '/render/:path*',
  ],
}
