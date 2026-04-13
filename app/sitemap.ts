import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'
import { getAllCountrySlugs } from '@/lib/countryMeta'
import { ALL_REGION_STUBS } from '@/lib/regionData'
import { getFilterCombinations } from '@/lib/schools'

const BASE_URL = 'https://nanasays.school'

export const revalidate = 86400 // regenerate sitemap once per day

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Step 1: indexable school slugs — mirrors isIndexable() in schools/[slug]/page.tsx
  const { data: rpcResult } = await supabase.rpc('get_indexable_school_slugs')
  const allSlugs: string[] = (rpcResult as any)?.slugs || []

  // Step 2: filter combos — add these back, they qualify (5+ schools threshold)
  const filterCombos = await getFilterCombinations()

  // Step 3: blog posts from Supabase (single source of truth)
  const { data: blogData } = await supabase
    .from('blog_posts')
    .select('slug, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  const publishedPosts = blogData ?? []

  // Step 4: news articles from Supabase
  const { data: newsData } = await supabase
    .from('articles')
    .select('id, published_at')
    .not('english_headline', 'is', null)
    .order('published_at', { ascending: false })
    .limit(2000)
  const publishedNews = newsData ?? []

  const schoolUrls: MetadataRoute.Sitemap = allSlugs.map((slug: string) => ({
    url: `${BASE_URL}/schools/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8 as const,
  }))

  const countrySlugs = getAllCountrySlugs()
  const countryUrls: MetadataRoute.Sitemap = countrySlugs.map(slug => ({
    url: `${BASE_URL}/countries/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  const regionUrls: MetadataRoute.Sitemap = ALL_REGION_STUBS.map(r => ({
    url: `${BASE_URL}/regions/${r.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  const blogUrls: MetadataRoute.Sitemap = publishedPosts.map(p => ({
    url: `${BASE_URL}/blog/${p.slug}`,
    lastModified: p.published_at ? new Date(p.published_at) : new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))

  const filterUrls: MetadataRoute.Sitemap = filterCombos.map(({ country, filter }) => ({
    url: `${BASE_URL}/schools/${country}/${filter}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }))

  const newsUrls: MetadataRoute.Sitemap = publishedNews.map(a => ({
    url: `${BASE_URL}/news/${a.id}`,
    lastModified: a.published_at ? new Date(a.published_at) : new Date(),
    changeFrequency: 'never' as const,
    priority: 0.5,
  }))

  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.5 },
    { url: `${BASE_URL}/methodology`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.5 },
    { url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/news`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    ...regionUrls,
    ...countryUrls,
    ...schoolUrls,
    ...filterUrls,
    ...blogUrls,
    ...newsUrls,
  ]
}
