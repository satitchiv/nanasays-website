import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { BLOG_POSTS, CATEGORY_LABELS } from '@/lib/blog'
import { BLOG_CONTENT } from '@/lib/blog-content'
import { getSchoolsByCountry } from '@/lib/schools'

interface Props {
  params: { slug: string }
}

export async function generateStaticParams() {
  return BLOG_POSTS.map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = BLOG_POSTS.find(p => p.slug === params.slug)
  if (!post) return { title: 'Not Found' }
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { images: post.image ? [post.image] : [] },
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Suggest schools based on blog post category/topic
async function getSuggestedSchools(post: (typeof BLOG_POSTS)[0]) {
  try {
    if (post.slug.includes('bangkok') || post.slug.includes('thailand')) {
      return getSchoolsByCountry('Thailand', 3)
    }
    if (post.slug.includes('singapore')) {
      return getSchoolsByCountry('Singapore', 3)
    }
    if (post.slug.includes('kuala-lumpur') || post.slug.includes('malaysia')) {
      return getSchoolsByCountry('Malaysia', 3)
    }
    if (post.slug.includes('jakarta') || post.slug.includes('indonesia')) {
      return getSchoolsByCountry('Indonesia', 3)
    }
    if (post.slug.includes('ho-chi-minh') || post.slug.includes('vietnam')) {
      return getSchoolsByCountry('Vietnam', 3)
    }
    if (post.slug.includes('uk') || post.slug.includes('boarding')) {
      return getSchoolsByCountry('United Kingdom', 3)
    }
    return getSchoolsByCountry('Switzerland', 3)
  } catch {
    return []
  }
}

export default async function BlogPostPage({ params }: Props) {
  const post = BLOG_POSTS.find(p => p.slug === params.slug)
  if (!post) notFound()

  const suggested = await getSuggestedSchools(post)

  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    author: { '@type': 'Person', name: post.author },
    datePublished: post.publishedAt,
    publisher: { '@type': 'Organization', name: 'NanaSays', url: 'https://nanasays.school' },
    ...(post.image && { image: post.image }),
    url: `https://nanasays.school/blog/${post.slug}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://nanasays.school/blog/${post.slug}` },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema) }} />
      <Nav />
      <main style={{ paddingTop: 60 }}>

        {/* Hero */}
        <div style={{ position: 'relative', height: 360, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image}
            alt={post.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(11,20,38,.95) 0%, rgba(11,20,38,.5) 50%, rgba(11,20,38,.2) 100%)',
          }} />
          <div style={{ position: 'absolute', bottom: 40, left: '5%', right: '5%', maxWidth: 760, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Link href="/blog" style={{
                fontSize: 11, color: 'rgba(255,255,255,.55)', textDecoration: 'none',
                fontFamily: "'Nunito Sans', sans-serif",
              }}>
                Blog
              </Link>
              <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 11 }}>›</span>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 100,
                background: 'var(--teal)', color: '#fff', fontFamily: "'Nunito Sans', sans-serif",
              }}>
                {CATEGORY_LABELS[post.category]}
              </span>
            </div>
            <h1 style={{
              fontFamily: 'var(--font-nunito), Nunito, sans-serif',
              fontWeight: 900, fontSize: 'clamp(22px, 3.5vw, 34px)',
              color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.15,
              margin: '0 0 14px',
            }}>
              {post.title}
            </h1>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'rgba(255,255,255,.55)', fontFamily: "'Nunito Sans', sans-serif" }}>
              <span style={{ fontWeight: 700, color: 'rgba(255,255,255,.8)' }}>{post.author}</span>
              <span>{formatDate(post.publishedAt)}</span>
              <span>{post.readTime} min read</span>
            </div>
          </div>
        </div>

        {/* Article body */}
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '52px 5%' }}>

          {/* Lead excerpt */}
          <p style={{
            fontSize: 18, color: 'var(--body)', lineHeight: 1.75,
            fontWeight: 300, marginBottom: 40,
            borderLeft: '3px solid var(--teal)', paddingLeft: 20,
            fontFamily: "'Nunito Sans', sans-serif",
          }}>
            {post.excerpt}
          </p>

          {/* Article content */}
          {BLOG_CONTENT[post.slug] ? (
            <div
              className="blog-content"
              dangerouslySetInnerHTML={{ __html: BLOG_CONTENT[post.slug] }}
              style={{
                fontSize: 16,
                lineHeight: 1.8,
                color: 'var(--body)',
                fontFamily: "'Nunito Sans', sans-serif",
                marginBottom: 52,
              }}
            />
          ) : (
            <div style={{
              background: 'var(--navy)', borderRadius: 12, padding: '32px 36px',
              textAlign: 'center', marginBottom: 52,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'rgba(52,195,160,.18)', border: '1px solid rgba(52,195,160,.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 10,
              }}>
                Full article coming soon
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.55)', lineHeight: 1.6, margin: 0 }}>
                Nana is still writing this one. Check back soon — or explore the schools below while you wait.
              </p>
            </div>
          )}

          {/* Suggested schools */}
          {suggested.length > 0 && (
            <div>
              <div style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
                color: 'var(--teal-dk)', marginBottom: 20, fontWeight: 800,
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                paddingBottom: 10, borderBottom: '2px solid var(--border)',
              }}>
                Schools you might like
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {suggested.map((s: any) => (
                  <Link key={s.id} href={`/schools/${s.slug}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px',
                      background: '#fff', transition: 'border-color .15s, box-shadow .15s',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                          fontWeight: 800, fontSize: 15, color: 'var(--navy)', marginBottom: 3,
                        }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {[s.city, s.country].filter(Boolean).join(', ')}
                          {s.school_type ? ` · ${s.school_type}` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--teal-dk)', fontWeight: 700, flexShrink: 0 }}>
                        View →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Back link */}
          <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid var(--border)' }}>
            <Link href="/blog" style={{
              fontSize: 13, color: 'var(--teal-dk)', textDecoration: 'none', fontWeight: 700,
              fontFamily: "'Nunito Sans', sans-serif",
            }}>
              ← Back to all articles
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
