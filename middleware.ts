import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // /portal/demo/* is intentionally public — sales demo, no auth needed
  if (pathname.startsWith('/portal/demo')) {
    return NextResponse.next()
  }

  // All other /portal/* routes require a Supabase session cookie
  if (pathname.startsWith('/portal')) {
    const hasSession = [...req.cookies.getAll()].some(
      c => c.name.includes('auth-token') && c.value
    )
    if (!hasSession) {
      return NextResponse.redirect(new URL('/claim', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/portal/:path*'],
}
