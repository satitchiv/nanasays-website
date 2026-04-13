import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getAllPublishedArticles, getDeadlines, getMostMentionedSchools } from '@/lib/eduworld'
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
  const [articles, deadlines, mentionedSchools] = await Promise.all([
    getAllPublishedArticles(40),
    getDeadlines(3),
    getMostMentionedSchools(5),
  ])

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 5% 44px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: '#34c3a0',
            textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8,
          }}>
            Education Intelligence
          </div>
          <h1 style={{
            fontSize: 32, fontWeight: 900, color: 'var(--navy)',
            fontFamily: 'var(--font-nunito), Nunito, sans-serif', marginBottom: 6,
          }}>
            International Education News
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, margin: 0 }}>
            Schools, scholarships, visas and policy — curated for international families
          </p>
        </div>

        {articles.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 0',
            color: 'var(--muted)', fontSize: 15,
          }}>
            <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.3 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'inline-block' }}>
                <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l6 6v10a2 2 0 0 1-2 2z"/>
              </svg>
            </div>
            <p style={{ marginBottom: 8 }}>No articles available right now.</p>
            <p style={{ fontSize: 13 }}>Check back soon — we publish new articles daily.</p>
          </div>
        ) : (
          <NewsPageClient
            articles={articles}
            deadlines={deadlines}
            mentionedSchools={mentionedSchools}
          />
        )}

        {/* Attribution */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
          News articles powered by EduWorld Global — international education intelligence.
        </div>
      </div>
      <Footer />
    </>
  )
}
