import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertUserId } from './school-name-overrides'

export type FunnelState = 'onboarding' | 'interview' | 'comparison'

export type Child = {
  id:            string
  name:          string
  date_of_birth: string | null
  child_profile: Record<string, unknown>
  is_archived:   boolean
  funnel_state:  FunnelState
  created_at:    string
  updated_at:    string
}

// Load active (non-archived) children for the parent. Used by the
// Research Room server page to seed the ChildSelector and Brief tab.
//
// Slice 8 Build 7: SELECT includes funnel_state so the page-level
// gate (Phase C) can decide between onboarding-mode, interview-mode
// (fullscreen), or comparison-mode UI.
export async function loadActiveChildren(
  supabase: SupabaseClient,
  userId: string,
): Promise<Child[]> {
  assertUserId(userId, 'loadActiveChildren')
  const { data, error } = await supabase
    .from('children')
    .select('id, name, date_of_birth, child_profile, is_archived, funnel_state, created_at, updated_at')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`loadActiveChildren: ${error.message}`)
  }
  return (data ?? []) as Child[]
}
