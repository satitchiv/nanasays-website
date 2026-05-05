// Proxy route that fetches an R2 image server-side and returns it with
// Content-Disposition: attachment so the browser saves it as a file.
// Needed because R2 doesn't allow cross-origin downloads from the browser directly.
//
// GET /api/download-image?url=<encoded-r2-url>&filename=slide-01.png

import { NextRequest, NextResponse } from 'next/server'
import { isPaidModeOn } from '@/lib/paid-mode'

const ALLOWED_HOST = process.env.R2_PUBLIC_URL
  ? new URL(process.env.R2_PUBLIC_URL).hostname
  : null

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB hard cap on a single image
const FETCH_TIMEOUT_MS = 10_000

export async function GET(req: NextRequest) {
  if (!isPaidModeOn()) {
    return new NextResponse('Not available', { status: 410 })
  }

  // Fail-closed if R2 host isn't configured — never let an unconfigured
  // server be turned into an open proxy / SSRF gadget.
  if (!ALLOWED_HOST) {
    return new NextResponse('Service misconfigured (R2_PUBLIC_URL unset)', { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')
  const filename = (searchParams.get('filename') || 'image.png').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80)

  if (!url) return new NextResponse('Missing url', { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }
  if (parsed.protocol !== 'https:') {
    return new NextResponse('Only https URLs allowed', { status: 400 })
  }
  if (parsed.hostname !== ALLOWED_HOST) {
    return new NextResponse('Forbidden host', { status: 403 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res: Response
  try {
    // redirect: 'manual' so an attacker can't smuggle a redirect to an internal
    // host through the allowlisted R2 origin (e.g. via a 302 chain).
    res = await fetch(url, { signal: controller.signal, redirect: 'manual' })
  } catch {
    clearTimeout(timeout)
    return new NextResponse('Image fetch failed', { status: 502 })
  }
  clearTimeout(timeout)

  if (res.status >= 300 && res.status < 400) {
    return new NextResponse('Redirects not allowed', { status: 502 })
  }
  if (!res.ok) return new NextResponse('Image fetch failed', { status: 502 })

  const lengthHeader = res.headers.get('content-length')
  if (lengthHeader && parseInt(lengthHeader, 10) > MAX_BYTES) {
    return new NextResponse('Image too large', { status: 413 })
  }

  const blob = await res.arrayBuffer()
  if (blob.byteLength > MAX_BYTES) {
    return new NextResponse('Image too large', { status: 413 })
  }

  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('content-type') || 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
