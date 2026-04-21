// POST /api/download-zip
// Body: { urls: string[], filename?: string }
// Fetches all R2 images server-side, zips them, returns nanasays-social.zip

import { NextRequest, NextResponse } from 'next/server'
import { zipSync } from 'fflate'

const ALLOWED_HOST = process.env.R2_PUBLIC_URL
  ? new URL(process.env.R2_PUBLIC_URL).hostname
  : null

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const urls: string[] = body.urls || []
  const zipName: string = body.filename || 'nanasays-social'

  if (!urls.length) return new NextResponse('No urls', { status: 400 })

  // Safety: only allow our R2 domain
  for (const url of urls) {
    try {
      const parsed = new URL(url)
      if (ALLOWED_HOST && parsed.hostname !== ALLOWED_HOST) {
        return new NextResponse('Forbidden', { status: 403 })
      }
    } catch {
      return new NextResponse('Invalid url', { status: 400 })
    }
  }

  // Fetch all images in parallel
  const results = await Promise.all(
    urls.map(async (url, i) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch slide ${i + 1}`)
      const buf = await res.arrayBuffer()
      const name = `slide-${String(i + 1).padStart(2, '0')}.png`
      return { name, buf: new Uint8Array(buf) }
    })
  )

  // Build zip: files go into a folder named after zipName
  const files: Record<string, Uint8Array> = {}
  for (const { name, buf } of results) {
    files[`${zipName}/${name}`] = buf
  }

  const zipped = zipSync(files, { level: 0 }) // level 0 = store (PNGs don't compress)

  return new NextResponse(zipped, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}.zip"`,
    },
  })
}
