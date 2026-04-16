import Nav from '@/components/Nav'
import { getAllPublishedArticles, getDeadlines, getMostMentionedSchools, getSchoolDimensionCounts, getArticleSchoolsPool } from '@/lib/eduworld'
import NewsPageClient from '@/components/NewsPageClient'
import type { Metadata } from 'next'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'International Education News | NanaSays',
  description: 'The latest news on international schools, universities, scholarships, visas and education policy worldwide — curated daily for expat families.',
  alternates: { canonical: 'https://nanasays.school/news' },
  openGraph: {
    title: 'International Education News | NanaSays',
    description: 'The latest news on international schools, universities, scholarships, visas and education policy worldwide — curated daily for expat families.',
    images: [{ url: 'https://nanasays.school/og-image.jpg', width: 1200, height: 630 }],
  },
}

export default async function NewsPage() {
  const articles = await getAllPublishedArticles(40)
  const [deadlines, mentionedSchools, schoolCounts, schoolsPool] = await Promise.all([
    getDeadlines(3),
    getMostMentionedSchools(5),
    getSchoolDimensionCounts(),
    getArticleSchoolsPool(articles),
  ])

  return (
    <>
      <Nav />
      <NewsPageClient
        articles={articles}
        deadlines={deadlines}
        mentionedSchools={mentionedSchools}
        schoolCounts={schoolCounts}
        schoolsPool={schoolsPool}
      />
    </>
  )
}
