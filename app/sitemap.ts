import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'
import { getAllCountrySlugs } from '@/lib/countryMeta'
import { ALL_REGION_STUBS } from '@/lib/regionData'
import { BLOG_POSTS } from '@/lib/blog'
import { getFilterCombinations } from '@/lib/schools'

const BASE_URL = 'https://nanasays.school'

export const revalidate = 86400 // regenerate sitemap once per day

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Step 1: fetch only indexable school slugs — mirrors isIndexable() in schools/[slug]/page.tsx
  // Uses get_indexable_school_slugs() RPC which applies the same 15-field quality score >= 4 filter
  // This keeps noindex pages out of the sitemap and avoids wasting Googlebot crawl budget
  const { data: rpcResult } = await supabase.rpc('get_indexable_school_slugs')
  const allSlugs: string[] = (rpcResult as any)?.slugs || []

  // Step 2: fetch filter combos
  const filterCombos = await getFilterCombinations()

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

  // compare pages removed from sitemap — thin content dilutes crawl budget
  // re-add once school data is fully enriched

  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    ...regionUrls,
    ...countryUrls,
    ...schoolUrls,   // schools first — most important
    ...filterUrls,
    ...blogUrls,
  ]
}
