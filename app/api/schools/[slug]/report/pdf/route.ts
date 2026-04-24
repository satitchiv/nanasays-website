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

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderPdf, defaultHeader, defaultFooter } from '@/lib/pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // 60s timeout for Vercel; Mac Mini has no limit

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Fetch the school name for the PDF header + filename
  const { data: school } = await supabase
    .from('schools').select('name').eq('slug', slug).maybeSingle()
  if (!school) return new Response('School not found', { status: 404 })

  // Build internal URL to the report page — use the same host the user hit.
  // Forward the unlock state (via ?unlocked=true query or nanasays_unlocked cookie)
  // so Puppeteer renders the paid view, not the locked preview.
  const url = new URL(req.url)
  const unlocked =
    url.searchParams.get('unlocked') === 'true' ||
    req.cookies.get('nanasays_unlocked')?.value === 'true'
  const reportUrl = `${url.protocol}//${url.host}/schools/${slug}/report${unlocked ? '?unlocked=true' : ''}`

  try {
    const pdf = await renderPdf({
      url: reportUrl,
      waitForSelector: '#sources',  // last section — guarantees full render
      headerTemplate: defaultHeader(school.name),
      footerTemplate: defaultFooter(),
    })

    const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-')
    return new Response(pdf, {
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
