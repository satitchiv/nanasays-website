import type { SupabaseClient } from '@supabase/supabase-js'

export type TopicDemandReason =
  | 'unsupported_topic'
  | 'no_reliable_coverage'
  | 'partial_coverage'
  | 'shortlist_school_added'

export function normalizeTopicDemand(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\bsoccer\b/g, 'football')
    .replace(/\bplayers\b/g, 'player')
    .replace(/\bcoaches\b/g, 'coach')
    .replace(/\bclasses\b/g, 'class')
    .replace(/\bfees\b/g, 'fee')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function topicDemandKey(value: string): string {
  const normalized = normalizeTopicDemand(value)
  return normalized.split(' ').filter(Boolean).sort().join('-') || 'other-comparison-request'
}

export async function recordResearchRoomTopicRequest({
  supabase,
  requestKey,
  userId,
  childId,
  originalQuery,
  canonicalTopic,
  schoolSlugs,
  missingSchoolSlugs,
  reason,
  requestedAt = new Date().toISOString(),
}: {
  supabase: SupabaseClient
  requestKey: string
  userId: string
  childId: string
  originalQuery: string
  canonicalTopic: string
  schoolSlugs: string[]
  missingSchoolSlugs: string[]
  reason: TopicDemandReason
  requestedAt?: string
}): Promise<void> {
  const { error } = await supabase
    .from('research_room_topic_requests')
    .upsert({
      request_key: requestKey,
      user_id: userId,
      child_id: childId,
      original_query: originalQuery,
      topic_label: canonicalTopic,
      normalized_topic: normalizeTopicDemand(canonicalTopic),
      school_slugs: schoolSlugs,
      missing_school_slugs: missingSchoolSlugs,
      reason,
      requested_at: requestedAt,
      last_seen_at: requestedAt,
    }, { onConflict: 'request_key', ignoreDuplicates: true })
  if (error) throw new Error(`Research Room topic request record failed: ${error.message}`)
}
