// POST /api/download-zip
// Body: { urls: string[], filename?: string }
// Fetches all R2 images server-side, zips them, returns nanasays-social.zip

import { NextRequest, NextResponse } from 'next/server'
import { zipSync } from 'fflate'
import { isPaidModeOn } from '@/lib/paid-mode'

const ALLOWED_HOST = process.env.R2_PUBLIC_URL
  ? new URL(process.env.R2_PUBLIC_URL).hostname
  : null

const MAX_URLS = 50
const MAX_BYTES_PER_FILE = 25 * 1024 * 1024 // 25 MB
const MAX_TOTAL_BYTES = 250 * 1024 * 1024 // 250 MB across all files
const FETCH_TIMEOUT_MS = 10_000

export async function POST(req: NextRequest) {
  if (!isPaidModeOn()) {
    return new NextResponse('Not available', { status: 410 })
  }

  // Fail-closed if R2 host isn't configured.
  if (!ALLOWED_HOST) {
    return new NextResponse('Service misconfigured (R2_PUBLIC_URL unset)', { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const urls: string[] = Array.isArray(body.urls) ? body.urls : []
  const rawZipName: string = typeof body.filename === 'string' ? body.filename : 'nanasays-social'
  const zipName = rawZipName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'nanasays-social'

  if (!urls.length) return new NextResponse('No urls', { status: 400 })
  if (urls.length > MAX_URLS) return new NextResponse(`Too many urls (max ${MAX_URLS})`, { status: 400 })

  // Safety: validate every URL is on the allowlisted R2 host + https.
  for (const url of urls) {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:') {
        return new NextResponse('Only https URLs allowed', { status: 400 })
      }
      if (parsed.hostname !== ALLOWED_HOST) {
        return new NextResponse('Forbidden host', { status: 403 })
      }
    } catch {
      return new NextResponse('Invalid url', { status: 400 })
    }
  }

  // Fetch images sequentially so total-byte cap is enforced strictly. Parallel
  // would let us buffer up to MAX_URLS * MAX_BYTES_PER_FILE before rejecting.
  let totalBytes = 0
  const results: { name: string; buf: Uint8Array }[] = []
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      // redirect: 'manual' so allowlisted R2 hosts can't redirect to internal targets.
      res = await fetch(url, { signal: controller.signal, redirect: 'manual' })
    } finally {
      clearTimeout(timeout)
    }
    if (res.status >= 300 && res.status < 400) {
      return new NextResponse(`Redirects not allowed (slide ${i + 1})`, { status: 502 })
    }
    if (!res.ok) return new NextResponse(`Failed to fetch slide ${i + 1}`, { status: 502 })

    const lengthHeader = res.headers.get('content-length')
    if (lengthHeader && parseInt(lengthHeader, 10) > MAX_BYTES_PER_FILE) {
      return new NextResponse(`Slide ${i + 1} exceeds size cap`, { status: 413 })
    }
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES_PER_FILE) {
      return new NextResponse(`Slide ${i + 1} exceeds size cap`, { status: 413 })
    }
    totalBytes += buf.byteLength
    if (totalBytes > MAX_TOTAL_BYTES) {
      return new NextResponse('Total payload too large', { status: 413 })
    }
    const name = `slide-${String(i + 1).padStart(2, '0')}.png`
    results.push({ name, buf: new Uint8Array(buf) })
  }

  // Build zip: files go into a folder named after zipName
  const files: Record<string, Uint8Array> = {}
  for (const { name, buf } of results) {
    files[`${zipName}/${name}`] = buf
  }

  const zipped = zipSync(files, { level: 0 }) // level 0 = store (PNGs don't compress)

  return new NextResponse(zipped as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}.zip"`,
    },
  })
}
