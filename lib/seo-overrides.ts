import { supabase } from './supabase'

export type SeoPageType = 'school' | 'country'

export type ActiveSeoOverride = {
  seo_title: string
  meta_description: string
  source_query: string
  change_id: string
  applied_at: string
}

/**
 * Public pages only read active overrides. An empty table or a read failure
 * deliberately falls back to the existing generated metadata.
 */
export async function getActiveSeoOverride(pageType: SeoPageType, slug: string): Promise<ActiveSeoOverride | null> {
  const { data, error } = await supabase
    .from('seo_overrides')
    .select('seo_title,meta_description,source_query,change_id,applied_at')
    .eq('page_type', pageType)
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) return null
  return data as ActiveSeoOverride
}
