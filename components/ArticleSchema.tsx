interface ArticleData {
  english_headline?: string
  english_summary?: string
  published_at?: string
  featured_image_url?: string
  source_name?: string
  schools_mentioned?: string[]
}

export default function ArticleSchema({ article }: { article: ArticleData }) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    publisher: {
      '@type': 'Organization',
      name: article.source_name || 'EduWorld Global',
    },
  }

  if (article.english_headline) schema.headline = article.english_headline
  if (article.english_summary) schema.description = article.english_summary
  if (article.published_at) {
    schema.datePublished = article.published_at
    schema.dateModified = article.published_at
  }
  if (article.featured_image_url) schema.image = { '@type': 'ImageObject', url: article.featured_image_url }
  schema.author = {
    '@type': 'Organization',
    name: article.source_name || 'EduWorld Global',
  }
  if (article.schools_mentioned?.length) {
    schema.about = article.schools_mentioned.map(s => ({
      '@type': 'School',
      name: s.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    }))
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
