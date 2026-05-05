// Route handler that serves a post's html_content as a bare HTML document.
// Used by admin preview iframes — returns the exact HTML Claude generated.
//
// GET /api/render-html/[postId]

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isPaidModeOn } from '@/lib/paid-mode'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
// Service-role only. Anon-key fallback removed — render-html serves arbitrary
// HTML (potential XSS surface), so it must never run with public-key access.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(
  _req: NextRequest,
  { params }: { params: { postId: string } },
) {
  if (!isPaidModeOn()) {
    return new NextResponse('Not available', { status: 410 })
  }
  if (!SUPABASE_KEY) {
    return new NextResponse('Service misconfigured', { status: 503 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from('social_posts')
    .select('html_content')
    .eq('id', params.postId)
    .single()

  if (error || !data?.html_content) {
    return new NextResponse('<p>No HTML content for this post.</p>', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return new NextResponse(data.html_content as string, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex',
    },
  })
}
