export type TopicDemandRequest = {
  id: string
  request_key: string
  user_id: string
  topic_label: string
  normalized_topic: string
  requested_at: string
  status: 'open' | 'promoted' | 'dismissed'
  promoted_topic_id: string | null
}

export type TopicCatalogEntry = {
  id: string
  label: string
  normalized_topic: string
  demand_count: number
  unique_parent_count: number
  verified_school_count: number
  verified_coverage_percent: number
  status: 'approved' | 'retired'
}

export type TopicPromotion = {
  id: string
  label: string
  normalized_topic: string
  demand_count: number
  unique_parent_count: number
  verified_school_count: number
  verified_coverage_percent: number
}

export type TopicDemandPlan = {
  promotions: TopicPromotion[]
  requestsToPromote: string[]
  requestsConsidered: number
  requestsAlreadyPromoted: number
  requestsBelowThreshold: number
  candidatesWithoutVerifiedCoverage: number
}

export function demandTopicId(normalizedTopic: string): string {
  const slug = normalizedTopic
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `demand-${slug || 'other-comparison-request'}`
}

export function planTopicDemandPromotions({
  requests,
  existingCatalog,
  coverageByTopic,
  minRequests = 3,
  minUniqueParents = 2,
  minVerifiedSchools = 10,
}: {
  requests: TopicDemandRequest[]
  existingCatalog: TopicCatalogEntry[]
  coverageByTopic: Map<string, { verified_school_count: number; verified_coverage_percent: number }>
  minRequests?: number
  minUniqueParents?: number
  minVerifiedSchools?: number
}): TopicDemandPlan {
  const existing = new Map(existingCatalog.map(entry => [entry.id, entry]))
  const groups = new Map<string, TopicDemandRequest[]>()
  for (const request of requests) {
    if (request.status === 'dismissed') continue
    const key = request.normalized_topic.trim()
    if (!key) continue
    const group = groups.get(key) ?? []
    group.push(request)
    groups.set(key, group)
  }

  const promotions: TopicPromotion[] = []
  const requestsToPromote: string[] = []
  let requestsBelowThreshold = 0
  let candidatesWithoutVerifiedCoverage = 0
  let requestsAlreadyPromoted = 0

  for (const [normalizedTopic, group] of Array.from(groups.entries())) {
    const id = demandTopicId(normalizedTopic)
    const known = existing.get(id)
    if (known?.status === 'approved') {
      requestsAlreadyPromoted += group.length
      continue
    }

    const parentIds = new Set(group.map(request => request.user_id))
    if (group.length < minRequests || parentIds.size < minUniqueParents) {
      requestsBelowThreshold += group.length
      continue
    }

    const coverage = coverageByTopic.get(normalizedTopic)
    if (!coverage || coverage.verified_school_count < minVerifiedSchools) {
      candidatesWithoutVerifiedCoverage += group.length
      continue
    }

    const labelCounts = new Map<string, number>()
    for (const request of group) {
      labelCounts.set(request.topic_label, (labelCounts.get(request.topic_label) ?? 0) + 1)
    }
    const label = Array.from(labelCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].length - right[0].length || left[0].localeCompare(right[0]))[0]?.[0]
      ?? normalizedTopic

    promotions.push({
      id,
      label,
      normalized_topic: normalizedTopic,
      demand_count: group.length,
      unique_parent_count: parentIds.size,
      verified_school_count: coverage.verified_school_count,
      verified_coverage_percent: coverage.verified_coverage_percent,
    })
    requestsToPromote.push(...group.map(request => request.id))
  }

  return {
    promotions,
    requestsToPromote,
    requestsConsidered: requests.length,
    requestsAlreadyPromoted,
    requestsBelowThreshold,
    candidatesWithoutVerifiedCoverage,
  }
}
