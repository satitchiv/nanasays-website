import 'server-only'
import { supabaseService } from '@/lib/supabase-admin'
import { loadMatchReasonsBatch } from './match-reasons.ts'
import type { BriefProfile } from './brief-predicates.ts'

// Slice 8 Build 6 — extracted from app/api/research-room/shortlist/route.ts
// per Codex r-step2 Q2 NIT + Q9 P1. Shared between:
//   • /api/research-room/shortlist (manual + Add school header button)
//   • /api/research-room/write-action (chat-driven `add_school` branch)
//
// Reads the child's brief profile, computes match_reasons for the one
// slug just added, and writes via a null-only UPDATE so a parent's
// prior reasons (if any) aren't clobbered. Uses service-role because
// the upstream RPC owns the row insert and we just want a post-write
// annotation.
//
// Best-effort: any failure logs and returns. Never throws — callers
// treat the absence of match_reasons as a non-fatal annotation gap.

export async function writeMatchReasonsForInRoomAdd(
  userId:  string,
  childId: string,
  slug:    string,
): Promise<void> {
  const svc = supabaseService()
  const { data: childRow } = await svc
    .from('children')
    .select('child_profile')
    .eq('id', childId)
    .eq('user_id', userId)
    .maybeSingle<{ child_profile: BriefProfile | null }>()
  const profile = childRow?.child_profile ?? null
  if (!profile) return

  const reasonsBySlug = await loadMatchReasonsBatch(svc, profile, [slug])
  const reasons = reasonsBySlug.get(slug)
  if (!reasons) return

  const { error } = await svc
    .from('shortlisted_schools')
    .update({ match_reasons: reasons })
    .eq('user_id', userId)
    .eq('child_id', childId)
    .eq('school_slug', slug)
    .is('match_reasons', null)
  if (error) console.warn('[write-match-reasons] UPDATE:', error.message)
}
