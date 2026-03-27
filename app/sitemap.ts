import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getAllCountrySlugs } from '@/lib/countryMeta'
import { ALL_REGION_STUBS } from '@/lib/regionData'
import { BLOG_POSTS } from '@/lib/blog'
import { getFilterCombinations, getSchoolPairs } from '@/lib/schools'

const BASE_URL = 'https://nanasays.school'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } }
  )

  // Fetch all school slugs in batches (Supabase default limit is 1000)
  const allSchools: { slug: string; updated_at: string | null }[] = []
  let from = 0
  while (true) {
    const { data } = await supabase
      .from('schools')
      .select('slug, updated_at')
      .not('slug', 'is', null)
      .range(from, from + 999)
    if (!data || data.length === 0) break
    allSchools.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  const schools = allSchools

  const schoolUrls: MetadataRoute.Sitemap = (schools || []).map(s => ({
    url: `${BASE_URL}/schools/${s.slug}`,
    lastModified: s.updated_at ? new Date(s.updated_at) : new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
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

  const filterCombos = await getFilterCombinations()
  const filterUrls: MetadataRoute.Sitemap = filterCombos.map(({ country, filter }) => ({
    url: `${BASE_URL}/schools/${country}/${filter}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }))

  const schoolPairs = await getSchoolPairs(500)
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
    ...filterUrls,
    ...compareUrls,
    ...blogUrls,
    ...schoolUrls,
  ]
}
