// Proxy route that fetches an R2 image server-side and returns it with
// Content-Disposition: attachment so the browser saves it as a file.
// Needed because R2 doesn't allow cross-origin downloads from the browser directly.
//
// GET /api/download-image?url=<encoded-r2-url>&filename=slide-01.png

import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOST = process.env.R2_PUBLIC_URL
  ? new URL(process.env.R2_PUBLIC_URL).hostname
  : null

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')
  const filename = searchParams.get('filename') || 'image.png'

  if (!url) return new NextResponse('Missing url', { status: 400 })

  // Safety: only proxy our own R2 domain
  try {
    const parsed = new URL(url)
    if (ALLOWED_HOST && parsed.hostname !== ALLOWED_HOST) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }

  const res = await fetch(url)
  if (!res.ok) return new NextResponse('Image fetch failed', { status: 502 })

  const blob = await res.arrayBuffer()
  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
