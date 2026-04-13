const EDUWORLD = process.env.EDUWORLD_URL || 'http://localhost:8001'

export async function getSchoolFeed(slug: string): Promise<any[]> {
  try {
    const res = await fetch(`${EDUWORLD}/api/schools/${slug}/feed`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function getSchoolNews(slug: string): Promise<any[]> {
  try {
    const res = await fetch(`${EDUWORLD}/api/schools/${slug}/news`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function getDeadlines(limit = 3): Promise<any[]> {
  try {
    const res = await fetch(`${EDUWORLD}/api/deadlines?limit=${limit}`, {
      next: { revalidate: 1800 },
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function getMostMentionedSchools(limit = 5): Promise<any[]> {
  try {
    const res = await fetch(`${EDUWORLD}/api/schools/most-mentioned?limit=${limit}`, {
      next: { revalidate: 1800 },
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function getAllPublishedArticles(limit = 20, category?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) })
    if (category) params.set('category', category)
    const res = await fetch(`${EDUWORLD}/api/articles/published?${params}`, {
      next: { revalidate: 1800 },
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function getArticleById(id: string): Promise<any | null> {
  try {
    const res = await fetch(`${EDUWORLD}/api/news/${id}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getRelatedArticles(category: string, excludeId: string): Promise<any[]> {
  try {
    const res = await fetch(
      `${EDUWORLD}/api/articles/published?category=${encodeURIComponent(category)}&limit=4`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data || []).filter((a: any) => a.id !== excludeId).slice(0, 3)
  } catch {
    return []
  }
}

export async function getFollowerCount(slug: string): Promise<number> {
  try {
    const res = await fetch(`${EDUWORLD}/api/schools/${slug}/followers/count`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return 0
    const data = await res.json()
    return data.count || 0
  } catch {
    return 0
  }
}

export async function getSchoolPulse(slug: string): Promise<any | null> {
  try {
    const res = await fetch(`${EDUWORLD}/api/schools/${slug}/pulse`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getSchoolsWithFeeds(): Promise<{ nanasays_slug: string; update_count: number; activity_rating: string | null }[]> {
  try {
    const res = await fetch(`${EDUWORLD}/api/schools/with-feeds`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export type StatBarMetric = {
  metric_key: string
  label: string
  source: 'nanasays' | 'pulse' | 'custom'
  format: 'number' | 'percent' | 'currency_usd' | 'year' | 'text'
  enabled: boolean
  pinned: boolean
  display_order: number
  link_url: string | null
  default_value: string | null
}

export type StatBarConfig = {
  metrics: StatBarMetric[]
  max_cards: number
}

export async function getStatBarConfig(): Promise<StatBarConfig> {
  try {
    const res = await fetch(`${EDUWORLD}/api/stat-bar-config`, { next: { revalidate: 3600 } })
    if (!res.ok) return { metrics: [], max_cards: 5 }
    return await res.json()
  } catch { return { metrics: [], max_cards: 5 } }
}
