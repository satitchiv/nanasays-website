/**
 * GET /api/demo-token-info
 *
 * Validates a demo token (passed via `x-demo-token` header) and returns the
 * non-sensitive metadata the frontend needs to scope its UI:
 *   - allowed_slugs: text[] | null  (null = all schools)
 *   - prospect_name: string         (display in header for confidence)
 *   - expires_at: ISO string | null
 *   - revoked: boolean
 *
 * Never returns the plaintext token, the token hash, or any database IDs.
 * Token validation logic mirrors /api/school-chat exactly so behaviour is
 * consistent (expired/revoked/invalid → 401/403).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-demo-token') || req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing demo token' }, { status: 400 })
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { data: row, error } = await supabase
    .from('demo_tokens')
    .select('prospect_name, allowed_slugs, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: 'Invalid demo token' }, { status: 401 })
  }
  if (row.revoked_at) {
    return NextResponse.json({ error: 'This demo token has been revoked.' }, { status: 403 })
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This demo token has expired.' }, { status: 403 })
  }

  return NextResponse.json({
    prospect_name: row.prospect_name,
    allowed_slugs: row.allowed_slugs,           // null = all schools allowed
    expires_at:    row.expires_at,
  })
}
