import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public portal demo — no auth needed
  if (pathname.startsWith('/portal/demo')) {
    return NextResponse.next()
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
  ],
}
