import type { BlogPost } from './types'

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'best-boarding-schools-uk-international-families',
    title: 'The 8 Best UK Boarding Schools for International Families in 2025',
    excerpt: 'From Surrey countryside to central London — Nana ranks the schools with the strongest international communities, EAL support, and visa track records.',
    category: 'picks',
    readTime: 7,
    author: 'Nana',
    publishedAt: '2025-03-10',
    image: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&q=80&auto=format&fit=crop',
  },
  {
    slug: 'ib-vs-igcse-parents-guide',
    title: 'IB vs IGCSE: Which Is Right for Your Child?',
    excerpt: 'Parents ask this every week. Here is the honest breakdown — university acceptance, workload, and what admissions officers actually say.',
    category: 'guide',
    readTime: 9,
    author: 'Nana',
    publishedAt: '2025-03-01',
    image: 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=800&q=80&auto=format&fit=crop',
  },
  {
    slug: 'singapore-international-school-guide-2025',
    title: 'Singapore International Schools: The 2025 Parent Guide',
    excerpt: 'SAS, UWCSEA, Tanglin, AIS — ranked by curriculum, fees, and what current parents actually say about day-to-day life on campus.',
    category: 'guide',
    readTime: 11,
    author: 'Nana',
    publishedAt: '2025-02-20',
    image: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800&q=80&auto=format&fit=crop',
  },
]

export const CATEGORY_LABELS: Record<BlogPost['category'], string> = {
  thai: 'Spotlight',
  guide: 'Parent Guide',
  picks: "Nana's Picks",
  visa: 'Visa & Entry',
  scholar: 'Scholarships',
}
