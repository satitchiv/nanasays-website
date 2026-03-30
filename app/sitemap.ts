import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'
import { getAllCountrySlugs } from '@/lib/countryMeta'
import { ALL_REGION_STUBS } from '@/lib/regionData'
import { BLOG_POSTS } from '@/lib/blog'
import { getFilterCombinations, getSchoolPairs } from '@/lib/schools'

const BASE_URL = 'https://nanasays.school'

export const revalidate = 86400 // regenerate sitemap once per day

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Step 1: single RPC call — returns {slugs:[...]} object so PostgREST treats it as one scalar, not paginated rows
  const { data: rpcResult } = await supabase.rpc('get_international_school_slugs')
  const allSlugs: string[] = (rpcResult as any)?.slugs || []

  // Step 2: fetch filter combos and compare pairs in parallel
  const [filterCombos, schoolPairs] = await Promise.all([
    getFilterCombinations(),
    getSchoolPairs(500),
  ])

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

  const blogUrls: MetadataRoute.Sitemap = BLOG_POSTS.map(p => ({
    url: `${BASE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))

  const filterUrls: MetadataRoute.Sitemap = filterCombos.map(({ country, filter }) => ({
    url: `${BASE_URL}/schools/${country}/${filter}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }))

  const compareUrls: MetadataRoute.Sitemap = schoolPairs.map(({ slugA, slugB }) => ({
    url: `${BASE_URL}/compare/${slugA}-vs-${slugB}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    ...regionUrls,
    ...countryUrls,
    ...schoolUrls,   // schools first — most important
    ...filterUrls,
    ...compareUrls,
    ...blogUrls,
  ]
}
