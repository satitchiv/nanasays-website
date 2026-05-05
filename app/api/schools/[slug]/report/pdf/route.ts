/**
 * GET /api/schools/[slug]/report/pdf
 *
 * Renders the /schools/[slug]/report page via headless Chrome (Puppeteer) and
 * returns a PDF. Used by the "Download PDF" button on the report page.
 *
 * Strategy:
 *   - Take the incoming request's host+protocol and construct the internal URL
 *     of the report page. This way the PDF reflects exactly what the user sees
 *     in their browser (dev vs production, Tailscale vs localhost, etc.).
 *   - Launch headless Chrome, emulate "print" media, emit A4 PDF with custom
 *     header + footer + page numbers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { renderPdf, defaultHeader, defaultFooter } from '@/lib/pdf'
import { supabaseService } from '@/lib/supabase-admin'
import { getUnlockedUser } from '@/lib/paid-status'
import { isPaidModeOn } from '@/lib/paid-mode'
import { checkRateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // 60s timeout for Vercel; Mac Mini has no limit

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!isPaidModeOn()) {
    return NextResponse.json({ error: 'PDF generation is not available.' }, { status: 410 })
  }

  // Server-side subscription check — never trust client `unlocked=true`.
  const { isPaid } = await getUnlockedUser()
  if (!isPaid) {
    return NextResponse.json({ error: 'Subscription required.' }, { status: 403 })
  }

  if (!checkRateLimit(req, 'report-pdf')) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const { slug } = await params

  // Fetch the school name for the PDF header + filename (service role).
  const { data: school } = await supabaseService()
    .from('schools').select('name').eq('slug', slug).maybeSingle()
  if (!school) return new Response('School not found', { status: 404 })

  // Build internal URL to the report page — use the same host the user hit.
  // The Puppeteer browser carries the request's cookies via supabase auth, so
  // RLS sees the same authenticated user. We always force `?unlocked=true`
  // because we already verified `isPaid` above; the report page's own gate
  // will additionally re-check.
  const url = new URL(req.url)
  const reportUrl = `${url.protocol}//${url.host}/schools/${slug}/report?unlocked=true`

  try {
    const pdf = await renderPdf({
      url: reportUrl,
      waitForSelector: '#sources',  // last section — guarantees full render
      headerTemplate: defaultHeader(school.name),
      footerTemplate: defaultFooter(),
      // Forward the user's session cookie so the rendered report page's
      // own getUnlockedUser() check sees the authenticated paid user.
      cookieHeader: req.headers.get('cookie') || undefined,
    })

    const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-')
    return new Response(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeSlug}-deep-report.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[pdf] failed for ${slug}:`, message)
    return new Response(`PDF generation failed: ${message}`, { status: 500 })
  }
}
