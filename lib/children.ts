import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertUserId } from './school-name-overrides'

export type Child = {
  id:            string
  name:          string
  date_of_birth: string | null
  child_profile: Record<string, unknown>
  is_archived:   boolean
  created_at:    string
  updated_at:    string
}

// Load active (non-archived) children for the parent. Used by the
// Research Room server page to seed the ChildSelector and Brief tab.
export async function loadActiveChildren(
  supabase: SupabaseClient,
  userId: string,
): Promise<Child[]> {
  assertUserId(userId, 'loadActiveChildren')
  const { data, error } = await supabase
    .from('children')
    .select('id, name, date_of_birth, child_profile, is_archived, created_at, updated_at')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`loadActiveChildren: ${error.message}`)
  }
  return (data ?? []) as Child[]
}
