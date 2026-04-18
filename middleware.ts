import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // /portal/demo/* is intentionally public — sales demo, no auth needed
  if (pathname.startsWith('/portal/demo')) {
    return NextResponse.next()
  }

  // All other portal and auth routes pass through to client-side auth.
  // Supabase magic links deliver the token as a URL hash (#access_token=...)
  // which is processed client-side only — the cookie is not set when middleware
  // runs, so server-side cookie checks here will always block magic link flows.
  // The portal layout handles auth client-side and redirects if no session.
  return NextResponse.next()
}

export const config = {
  matcher: ['/portal/:path*', '/auth/callback'],
}
