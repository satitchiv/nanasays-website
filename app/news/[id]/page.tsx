import { notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getArticleById, getRelatedArticles } from '@/lib/eduworld'
import { buildUtmUrl } from '@/lib/utm'
import Link from 'next/link'
import type { Metadata } from 'next'
import ArticleSchema from '@/components/ArticleSchema'
import FaqAccordion from '@/components/FaqAccordion'
import FaqSchema from '@/components/FaqSchema'
export const revalidate = 3600

interface Props {
  params: { id: string }
}

const CAT_COLORS: Record<string, string> = {
  'Visa & Immigration': '#2563eb',
  'Scholarships': '#059669',
  'Rankings & Results': '#7c3aed',
  'Fees & Funding': '#dc2626',
  'Education Policy': '#ea580c',
  'School News': '#0891b2',
  'University News': '#4f46e5',
  'Student Life': '#db2777',
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function decodeHtml(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
}

function cleanArticleBody(body: string): string {
  // Decode HTML entities
  let cleaned = decodeHtml(body)
  // Strip WordPress RSS footer: "The post X appeared first on Y."
  const wpIdx = cleaned.lastIndexOf('\nThe post ')
  if (wpIdx !== -1) cleaned = cleaned.slice(0, wpIdx)
  return cleaned.trim()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getArticleById(params.id)
  if (!article) return { title: 'Article Not Found | NanaSays' }
  return {
    title: `${article.english_headline} | NanaSays`,
    description: article.english_summary?.slice(0, 160) || undefined,
    alternates: { canonical: `https://nanasays.school/news/${params.id}` },
    openGraph: {
      title: article.english_headline,
      description: article.english_summary?.slice(0, 160) || undefined,
      type: 'article',
      ...(article.published_at && { publishedTime: article.published_at }),
      ...(article.featured_image_url && {
        images: [{ url: article.featured_image_url, width: 1200, height: 630 }],
      }),
    },
  }
}

export default async function ArticlePage({ params }: Props) {
  const [article, relatedArticles] = await Promise.all([
    getArticleById(params.id),
    getArticleById(params.id).then(a =>
      a ? getRelatedArticles(a.category, params.id) : []
    ),
  ])

  if (!article) notFound()

  const color = CAT_COLORS[article.category] || '#0891b2'
  const cleanBody = article.english_body ? cleanArticleBody(article.english_body) : ''
  const wordCount = cleanBody.split(' ').length || 0
  const readingTime = Math.max(1, Math.ceil(wordCount / 200))
  const paragraphs = cleanBody.split(/\n{2,}/).filter(Boolean)
  const articleFaqs = (article.faq_json || []).map((f: any) => ({
    question: f.q || f.question,
    answer: f.a || f.answer,
  })).filter((f: any) => f.question && f.answer)

  const bullets: string[] = article.bullets_json?.bullets || []
  const whoAffected: string | undefined = article.bullets_json?.who_affected
  const actionNeeded: string | undefined = article.bullets_json?.action_needed
  const hasRealAction = actionNeeded && !actionNeeded.toLowerCase().startsWith('no immediate action')

  return (
    <>
      <ArticleSchema article={article} />
      <Nav />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '80px 5% 60px' }}>

        {/* Breadcrumb */}
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 24, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Home</Link>
          <span>/</span>
          <Link href="/news" style={{ color: 'var(--muted)', textDecoration: 'none' }}>News</Link>
          {article.category && (
            <>
              <span>/</span>
              <span style={{ color }}>{article.category}</span>
            </>
          )}
        </div>

        {/* Category badge */}
        {article.category && (
          <div style={{ marginBottom: 14 }}>
            <span style={{
              display: 'inline-block', fontSize: 11, fontWeight: 700,
              color, textTransform: 'uppercase', letterSpacing: '0.08em',
              background: `${color}15`, borderRadius: 4, padding: '4px 10px',
              border: `1px solid ${color}30`,
            }}>
              {article.category}
            </span>
          </div>
        )}

        {/* Headline */}
        <h1 style={{
          fontSize: 28, fontWeight: 900, color: 'var(--navy)', lineHeight: 1.3,
          marginBottom: 16, fontFamily: 'var(--font-nunito), Nunito, sans-serif',
        }}>
          {article.english_headline}
        </h1>

        {/* Meta line */}
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', marginBottom: 28, flexWrap: 'wrap' }}>
          {article.published_at && (
            <span>
              {new Date(article.published_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </span>
          )}
          <span>{readingTime} min read</span>
        </div>

        {/* Hero image */}
        {article.featured_image_url ? (
          <div style={{ marginBottom: 32, borderRadius: 10, overflow: 'hidden' }}>
            <img
              src={article.featured_image_url}
              alt={article.english_headline}
              style={{ width: '100%', height: 360, objectFit: 'cover', display: 'block' }}
            />
          </div>
        ) : null}

        {/* Summary */}
        {article.english_summary && (
          <p style={{
            fontSize: 17, color: '#334', lineHeight: 1.75,
            fontWeight: 500, marginBottom: 28,
            paddingBottom: 24, borderBottom: '1px solid var(--border)',
          }}>
            {article.english_summary}
          </p>
        )}

        {/* Key Points + Who is Affected + Action Needed */}
        {bullets.length > 0 && (
          <div style={{
            background: `${color}0d`,
            border: `1px solid ${color}30`,
            borderRadius: 12,
            padding: '24px 28px',
            marginBottom: 28,
          }}>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color, marginBottom: 20 }}>
              Key Points
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {bullets.map((bullet: string, i: number) => (
                <li key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', fontSize: 15, lineHeight: 1.7 }}>
                  <span style={{
                    flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                    background: color, color: '#fff', fontSize: 12, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ color: '#334' }}>{bullet}</span>
                </li>
              ))}
            </ul>

            {/* Who is affected */}
            <div style={{ marginTop: 24, padding: '14px 18px', background: '#fff', borderRadius: 8, borderLeft: `4px solid ${color}` }}>
              <p style={{ fontSize: 11, fontWeight: 800, color, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Who is affected
              </p>
              <p style={{ fontSize: 14, color: '#444', lineHeight: 1.6, margin: 0 }}>
                {whoAffected || 'All families and students following international education developments.'}
              </p>
            </div>

            {/* Action needed */}
            <div style={{ marginTop: 10, padding: '14px 18px', background: hasRealAction ? '#fffbeb' : '#f8f8f8', borderRadius: 8, borderLeft: hasRealAction ? '4px solid #f59e0b' : '4px solid #ddd' }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: hasRealAction ? '#b45309' : '#888', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Action needed
              </p>
              <p style={{ fontSize: 14, color: '#444', lineHeight: 1.6, margin: 0 }}>
                {hasRealAction ? actionNeeded : 'Nothing required at this time — for your information only.'}
              </p>
            </div>
          </div>
        )}

        {/* Body */}
        {paragraphs.length > 0 && (
          <div style={{ marginBottom: 36 }}>
            {bullets.length > 0 && (
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 18, paddingTop: 4, borderTop: '2px solid var(--border)' }}>
                Full Article
              </p>
            )}
            {paragraphs.map((para: string, i: number) => (
              <p key={i} style={{ fontSize: 16, color: '#334', lineHeight: 1.85, marginBottom: 18 }}>
                {para}
              </p>
            ))}
          </div>
        )}

        {/* Source attribution */}
        {article.source_url && (
          <div style={{
            marginBottom: 28, padding: '14px 18px',
            background: 'var(--off)', borderRadius: 8,
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Originally published by <strong style={{ color: 'var(--navy)' }}>{article.source_name || 'original publisher'}</strong>
            </span>
            <a
              href={buildUtmUrl(article.source_url, 'news-source-link')}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, color: 'var(--teal-dk)', fontWeight: 600, textDecoration: 'none' }}
            >
              View original →
            </a>
          </div>
        )}

        {/* FAQ — only visible once faq_json is backfilled */}
        {articleFaqs.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Frequently asked questions
            </p>
            <FaqAccordion faqs={articleFaqs} />
            <FaqSchema faqs={articleFaqs} />
          </div>
        )}

        {/* Tags */}
        {article.tags?.length > 0 && (
          <div style={{ marginBottom: 28, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {article.tags.map((tag: string) => (
              <span key={tag} style={{
                fontSize: 12, fontWeight: 600, color: 'var(--muted)',
                background: 'var(--off)', border: '1px solid var(--border)',
                borderRadius: 20, padding: '5px 12px',
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Schools mentioned */}
        {article.schools_mentioned?.length > 0 && (
          <div style={{
            marginBottom: 28, padding: '16px 20px',
            background: 'var(--teal-bg)', borderRadius: 8,
            border: '1px solid rgba(52,195,160,.25)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Schools mentioned in this article
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {article.schools_mentioned.map((slug: string) => (
                <Link
                  key={slug}
                  href={`/schools/${slug}`}
                  style={{
                    fontSize: 14, color: 'var(--teal-dk)', fontWeight: 600,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  {humanizeSlug(slug)}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Attribution */}
        <div style={{
          marginBottom: 40, paddingTop: 20, borderTop: '1px solid var(--border)',
          fontSize: 12, color: 'var(--muted)',
        }}>
          Article sourced and edited by <Link href="/news" style={{ color: 'var(--teal-dk)', textDecoration: 'none', fontWeight: 600 }}>EduWorld Global</Link>.
          All news on NanaSays is curated for international families.
        </div>

        {/* Related articles */}
        {relatedArticles.length > 0 && (
          <div>
            <div style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
              color: 'var(--teal-dk)', marginBottom: 16, paddingBottom: 10,
              borderBottom: '2px solid var(--border)', fontWeight: 800,
              fontFamily: 'var(--font-nunito), Nunito, sans-serif',
            }}>
              Related Articles
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {relatedArticles.map((rel: any) => (
                <Link
                  key={rel.id}
                  href={`/news/${rel.id}`}
                  style={{
                    display: 'flex', gap: 14, textDecoration: 'none',
                    padding: '12px 0', borderBottom: '1px solid var(--border)',
                    alignItems: 'flex-start',
                  }}
                >
                  {rel.featured_image_url && (
                    <img
                      src={rel.featured_image_url}
                      alt=""
                      style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                    />
                  )}
                  <div>
                    {rel.category && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: CAT_COLORS[rel.category] || '#0891b2', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                        {rel.category}
                      </div>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', lineHeight: 1.35 }}>
                      {rel.english_headline}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  )
}
