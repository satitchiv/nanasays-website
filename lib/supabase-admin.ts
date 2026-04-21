// Server-side helpers for admin routes.
// - supabaseService(): service-role client, bypasses RLS, for mutations
// - verifyAdmin(req):  checks the Authorization header and confirms the caller
//                      has role='admin' in social_reviewers

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function supabaseService(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function verifyAdmin(req: NextRequest): Promise<
  { ok: true; userId: string; displayName: string | null }
  | { ok: false; status: number; error: string }
> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing Authorization: Bearer <token>' }
  }
  const token = authHeader.slice(7)

  // Verify the JWT by calling Supabase with the user's token.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: 'Invalid or expired session' }
  }

  const userId = userData.user.id

  // Use service client to check role in social_reviewers.
  const svc = supabaseService()
  const { data: reviewer, error: reviewerErr } = await svc
    .from('social_reviewers')
    .select('role, display_name')
    .eq('user_id', userId)
    .maybeSingle()

  if (reviewerErr) {
    return { ok: false, status: 500, error: `Reviewer lookup failed: ${reviewerErr.message}` }
  }
  if (!reviewer || reviewer.role !== 'admin') {
    return { ok: false, status: 403, error: 'Not an admin' }
  }

  return { ok: true, userId, displayName: reviewer.display_name }
}
