/**
 * /api/school-report
 * Generates a Deep School Report for a given school slug.
 *
 * SCAFFOLD ONLY — the full implementation requires:
 *   1. @anthropic-ai/sdk installed in website/package.json
 *   2. ANTHROPIC_API_KEY set in Netlify env vars
 *   3. Port of buildPrompt + data loaders from scripts/generate-report.js
 *
 * Current behaviour: returns a 501 Not Implemented with the scaffold contract,
 * so the preview page + Stripe paywall can be built against a stable API
 * shape before the full implementation lands.
 *
 * Contract (once implemented):
 *   POST /api/school-report
 *   Body: { slug: string, preview?: boolean }
 *   Auth: preview=true requires internal cookie; paid access requires
 *         orderId cookie or Stripe session match.
 *   Returns: { markdown: string, html: string, generatedAt: string, cachedTokens: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  const { slug, preview } = await req.json().catch(() => ({}))

  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 })
  }

  // Verify the school exists and has the data we need
  const [{ data: school }, { data: structured }, { data: sensitive }, { data: knowledge }] = await Promise.all([
    supabase.from('schools').select('slug, name, country, last_extracted_at').eq('slug', slug).single(),
    supabase.from('school_structured_data').select('*').eq('school_slug', slug).maybeSingle(),
    supabase.from('school_sensitive').select('*').eq('school_slug', slug),
    supabase.from('school_knowledge').select('source_type, category, source_url, title').eq('school_slug', slug),
  ])

  if (!school) return NextResponse.json({ error: `school "${slug}" not found` }, { status: 404 })

  // Data readiness check
  const readiness = {
    has_school_row: !!school,
    has_structured_data: !!structured,
    has_sensitive_records: (sensitive?.length ?? 0) > 0,
    has_knowledge_chunks: (knowledge?.length ?? 0) > 0,
    has_isi_chunks: knowledge?.some(k => k.source_type === 'pdf' && k.category === 'inspection_report') ?? false,
    last_extracted_at: school.last_extracted_at,
  }

  const isReady =
    readiness.has_school_row &&
    readiness.has_structured_data &&
    readiness.has_sensitive_records &&
    readiness.has_knowledge_chunks

  if (!isReady) {
    return NextResponse.json({
      error: 'school not ready for report generation',
      readiness,
      recommendation: 'run scripts/batch-uk-refresh.sh for this slug before attempting generation',
    }, { status: 412 })
  }

  // SCAFFOLD — full implementation pending ANTHROPIC_API_KEY + SDK install
  return NextResponse.json({
    error: 'Not implemented — generator port from scripts/generate-report.js pending',
    readiness,
    nextSteps: [
      'Install @anthropic-ai/sdk in website/package.json',
      'Add ANTHROPIC_API_KEY to Netlify env vars',
      'Port buildPrompt + loaders from scripts/generate-report.js to website/lib/deep-report/',
      'Replace this 501 with a real Claude Opus 4.7 call with prompt caching enabled',
    ],
    contract: {
      input: '{ slug: string, preview?: boolean }',
      output: '{ markdown: string, html: string, generatedAt: ISO8601, cachedTokens: number }',
      authRequired: preview ? 'internal cookie' : 'orderId cookie or Stripe session',
    },
  }, { status: 501 })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/school-report',
    status: 'scaffold',
    method: 'POST',
    body: { slug: 'string (required)', preview: 'boolean (optional)' },
  })
}
