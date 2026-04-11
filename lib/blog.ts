// All blog data comes from the Supabase blog_posts table.
// Query: supabase.from('blog_posts').select(...).eq('status', 'published')
import type { BlogPost } from './types'

export const CATEGORY_LABELS: Record<BlogPost['category'], string> = {
  thai: 'Spotlight',
  guide: 'Parent Guide',
  picks: "Nana's Picks",
  visa: 'Visa & Entry',
  scholar: 'Scholarships',
}
