import { createClient } from '@supabase/supabase-js'

// Server-side only — EduWorld Supabase (separate from NanaSays DB)
function getDb() {
  return createClient(
    process.env.EDUWORLD_SUPABASE_URL!,
    process.env.EDUWORLD_SUPABASE_SERVICE_KEY!
  )
}

export async function getSchoolFeed(slug: string): Promise<any[]> {
  try {
    const { data } = await getDb()
      .from('school_feed_items')
      .select('*')
      .eq('nanasays_slug', slug)
      .order('published_at', { ascending: false })
      .limit(50)
    return data || []
  } catch {
    return []
  }
}

export async function getSchoolNews(slug: string): Promise<any[]> {
  try {
    const { data } = await getDb()
      .from('articles')
      .select('id,english_headline,english_summary,category,published_at,featured_image_url,tags')
      .eq('status', 'published')
      .contains('schools_mentioned', [slug])
      .order('published_at', { ascending: false })
      .limit(10)
    return data || []
  } catch {
    return []
  }
}

export async function getDeadlines(limit = 3): Promise<any[]> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await getDb()
      .from('school_feed_items')
      .select('id,nanasays_slug,source_name,title,detected_date,category,link')
      .eq('has_date', true)
      .gte('detected_date', today)
      .order('detected_date', { ascending: true })
      .limit(limit)
    return data || []
  } catch {
    return []
  }
}

export async function getMostMentionedSchools(limit = 5): Promise<any[]> {
  try {
    const db = getDb()
    const { data: articles } = await db
      .from('articles')
      .select('schools_mentioned')
      .eq('status', 'published')
      .not('schools_mentioned', 'is', null)

    if (!articles) return []

    const counts: Record<string, number> = {}
    for (const row of articles) {
      for (const slug of (row.schools_mentioned || [])) {
        counts[slug] = (counts[slug] || 0) + 1
      }
    }

    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)

    if (!top.length) return []

    const slugs = top.map(([s]) => s)
    const { data: sources } = await db
      .from('school_sources')
      .select('nanasays_slug,school_name')
      .in('nanasays_slug', slugs)

    const nameMap: Record<string, string> = {}
    for (const s of (sources || [])) {
      nameMap[s.nanasays_slug] = s.school_name
    }

    return top.map(([slug, count]) => ({
      nanasays_slug: slug,
      school_name: nameMap[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      mention_count: count,
    }))
  } catch {
    return []
  }
}

export async function getAllPublishedArticles(limit = 20, category?: string): Promise<any[]> {
  try {
    let query = getDb()
      .from('articles')
      .select('id,english_headline,english_summary,english_body,category,tags,published_at,featured_image_url,schools_mentioned,countries_mentioned,is_featured,is_breaking,view_count,bullets_json,faq_json')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit)

    if (category) query = query.eq('category', category)

    const { data } = await query
    return data || []
  } catch {
    return []
  }
}

export async function getArticleById(id: string): Promise<any | null> {
  try {
    const { data } = await getDb()
      .from('articles')
      .select('*')
      .eq('id', id)
      .single()
    return data || null
  } catch {
    return null
  }
}

export async function getRelatedArticles(category: string, excludeId: string): Promise<any[]> {
  try {
    const { data } = await getDb()
      .from('articles')
      .select('id,english_headline,english_summary,category,published_at,featured_image_url')
      .eq('status', 'published')
      .eq('category', category)
      .neq('id', excludeId)
      .order('published_at', { ascending: false })
      .limit(3)
    return data || []
  } catch {
    return []
  }
}

export async function getFollowerCount(slug: string): Promise<number> {
  try {
    const { count } = await getDb()
      .from('school_followers')
      .select('id', { count: 'exact', head: true })
      .eq('nanasays_slug', slug)
      .eq('confirmed', true)
      .eq('active', true)
    return count || 0
  } catch {
    return 0
  }
}

export async function getSchoolPulse(slug: string): Promise<any | null> {
  try {
    const db = getDb()
    const { data: items } = await db
      .from('school_feed_items')
      .select('*')
      .eq('nanasays_slug', slug)

    if (!items || items.length === 0) return null

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const updatesThisMonth = items.filter(i => {
      if (!i.published_at) return false
      const d = new Date(i.published_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length

    const updatesLastMonth = items.filter(i => {
      if (!i.published_at) return false
      const d = new Date(i.published_at)
      return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear()
    }).length

    // Activity rating based on last 90 days
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const recentCount = items.filter(i => i.published_at && new Date(i.published_at) > ninetyDaysAgo).length
    const avgPerMonth = recentCount / 3
    let activityRating: string | null = null
    if (avgPerMonth >= 4) activityRating = 'Very active'
    else if (avgPerMonth >= 2) activityRating = 'Active'
    else if (avgPerMonth >= 1) activityRating = 'Occasional'

    // Category breakdown
    const categoriesBreakdown: Record<string, number> = {}
    for (const i of items) {
      const c = i.category || 'Uncategorised'
      categoriesBreakdown[c] = (categoriesBreakdown[c] || 0) + 1
    }

    // Upcoming events
    const upcoming = items.filter(i => i.has_date && i.detected_date && i.detected_date > today)

    // Pinned item: future high-importance > recent high-importance > any upcoming
    const highItems = items.filter(i => i.importance === 'high')
    const futureHigh = highItems.filter(i => i.has_date && i.detected_date && i.detected_date > today)

    let pinnedItem = null
    if (futureHigh.length > 0) {
      pinnedItem = futureHigh.sort((a, b) => a.detected_date.localeCompare(b.detected_date))[0]
    } else if (highItems.length > 0) {
      pinnedItem = highItems.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))[0]
    } else if (upcoming.length > 0) {
      pinnedItem = upcoming.sort((a, b) => a.detected_date.localeCompare(b.detected_date))[0]
    }

    // News mentions + followers in parallel
    const [{ count: newsMentions }, { count: followersCount }] = await Promise.all([
      db.from('articles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .contains('schools_mentioned', [slug]),
      db.from('school_followers')
        .select('id', { count: 'exact', head: true })
        .eq('nanasays_slug', slug)
        .eq('confirmed', true)
        .eq('active', true),
    ])

    return {
      total_updates: items.length,
      updates_this_month: updatesThisMonth,
      updates_last_month: updatesLastMonth,
      activity_rating: activityRating,
      categories_breakdown: categoriesBreakdown,
      upcoming_events_count: upcoming.length,
      pinned_item: pinnedItem,
      news_mentions: newsMentions || 0,
      followers_count: followersCount || 0,
    }
  } catch {
    return null
  }
}

export async function getSchoolsWithFeeds(): Promise<{ nanasays_slug: string; update_count: number; activity_rating: string | null }[]> {
  try {
    const { data } = await getDb()
      .from('school_feed_items')
      .select('nanasays_slug')

    if (!data) return []

    const counts: Record<string, number> = {}
    for (const row of data) {
      if (row.nanasays_slug) {
        counts[row.nanasays_slug] = (counts[row.nanasays_slug] || 0) + 1
      }
    }

    return Object.entries(counts).map(([slug, count]) => ({
      nanasays_slug: slug,
      update_count: count,
      activity_rating: count >= 12 ? 'Very active' : count >= 6 ? 'Active' : count >= 3 ? 'Occasional' : null,
    }))
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
    const db = getDb()
    const [{ data: metrics }, { data: settings }] = await Promise.all([
      db.from('stat_bar_config')
        .select('metric_key,label,source,format,enabled,pinned,display_order,link_url,default_value')
        .order('display_order'),
      db.from('display_settings').select('*').eq('id', 1),
    ])
    const s = (settings?.[0] as any) || {}
    return { metrics: metrics || [], max_cards: s.max_stat_cards || 5 }
  } catch {
    return { metrics: [], max_cards: 5 }
  }
}
