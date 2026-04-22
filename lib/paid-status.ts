/**
 * Paid-unlock status for Deep Research pages.
 *
 * Phase 1 stub: a plain cookie (nanasays_unlocked=true) grants access.
 * In Phase 2 this will be replaced by a Supabase row per paid user
 * (keyed by email/Stripe customer id).
 *
 * The `?unlocked=true` query param also grants access — useful for
 * design review without going through the checkout stub.
 */

import { cookies } from 'next/headers'

export const UNLOCK_COOKIE = 'nanasays_unlocked'

export async function isUnlocked(queryParam?: string): Promise<boolean> {
  if (queryParam === 'true') return true
  const store = await cookies()
  return store.get(UNLOCK_COOKIE)?.value === 'true'
}
