import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { CATEGORY_LABELS } from '@/lib/blog'
import { getSchoolsByCountry } from '@/lib/schools'

export const revalidate = 3600 // ISR — new posts become available within 1 hour
export const dynamic = 'force-dynamic'  // never serve stale empty cache

interface Props {
  params: { slug: string }
}

interface DbPost {
  id: string
  slug: string
  title: string
  excerpt: string | null
  category: string | null
  country: string | null
  curriculum: string | null
  city: string | null
  hero_image: string | null
  word_count: number | null
  content: string
  published_at: string | null
}

async function getPost(slug: string): Promise<DbPost | null> {
  const { data } = await supabase
    .from('blog_posts')
    .select('id, slug, title, excerpt, category, country, curriculum, city, hero_image, word_count, content, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()
  return data ?? null
}

export async function generateStaticParams() {
  const { data } = await supabase
    .from('blog_posts')
    .select('slug')
    .eq('status', 'published')
  return (data ?? []).map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug)
  if (!post) return { title: 'Not Found' }
  return {
    title: { absolute: `${post.title} | NanaSays` },
    description: post.excerpt ?? undefined,
    alternates: { canonical: `https://nanasays.school/blog/${params.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      images: post.hero_image ? [{ url: post.hero_image, width: 1200, height: 630 }] : [],
    },
  }
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function readTime(wordCount: number | null): number {
  return Math.ceil((wordCount ?? 800) / 200)
}

function categoryLabel(category: string | null): string {
  return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? 'Guide'
}

interface RelatedPost {
  slug: string
  title: string
  category: string | null
  hero_image: string | null
  published_at: string | null
  word_count: number | null
}

async function getRelatedPosts(post: DbPost): Promise<RelatedPost[]> {
  const seen = new Set<string>([post.slug])
  const results: RelatedPost[] = []

  // Same country first
  if (post.country && results.length < 3) {
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, category, hero_image, published_at, word_count')
      .eq('status', 'published')
      .eq('country', post.country)
      .neq('slug', post.slug)
      .order('published_at', { ascending: false })
      .limit(3)
    for (const p of data ?? []) {
      if (!seen.has(p.slug) && results.length < 3) { seen.add(p.slug); results.push(p) }
    }
  }

  // Fill with same category
  if (post.category && results.length < 3) {
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, title, category, hero_image, published_at, word_count')
      .eq('status', 'published')
      .eq('category', post.category)
      .neq('slug', post.slug)
      .order('published_at', { ascending: false })
      .limit(3)
    for (const p of data ?? []) {
      if (!seen.has(p.slug) && results.length < 3) { seen.add(p.slug); results.push(p) }
    }
  }

  return results
}

async function getSuggestedSchools(post: DbPost) {
  try {
    // Use country field directly if available (DB posts have it)
    if (post.country) return getSchoolsByCountry(post.country, 3)
    // Fallback slug-based detection for legacy posts
    const slug = post.slug
    if (slug.includes('bangkok') || slug.includes('thailand')) return getSchoolsByCountry('Thailand', 3)
    if (slug.includes('singapore'))                              return getSchoolsByCountry('Singapore', 3)
    if (slug.includes('kuala-lumpur') || slug.includes('malaysia')) return getSchoolsByCountry('Malaysia', 3)
    if (slug.includes('jakarta') || slug.includes('indonesia')) return getSchoolsByCountry('Indonesia', 3)
    if (slug.includes('ho-chi-minh') || slug.includes('vietnam')) return getSchoolsByCountry('Vietnam', 3)
    if (slug.includes('uk') || slug.includes('boarding'))        return getSchoolsByCountry('United Kingdom', 3)
    return getSchoolsByCountry('Singapore', 3)
  } catch {
    return []
  }
}

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&q=80&auto=format&fit=crop'

export default async function BlogPostPage({ params }: Props) {
  const post = await getPost(params.slug)
  if (!post) notFound()

  const [suggested, relatedPosts] = await Promise.all([
    getSuggestedSchools(post),
    getRelatedPosts(post),
  ])

  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    author: { '@type': 'Person', name: 'Nana', url: 'https://nanasays.school/about' },
    datePublished: post.published_at,
    dateModified: post.published_at,
    publisher: {
      '@type': 'Organization',
      name: 'NanaSays',
      url: 'https://nanasays.school',
      logo: { '@type': 'ImageObject', url: 'https://nanasays.school/nana-logo.png' },
    },
    ...(post.hero_image && { image: { '@type': 'ImageObject', url: post.hero_image } }),
    url: `https://nanasays.school/blog/${post.slug}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://nanasays.school/blog/${post.slug}` },
    ...(post.word_count && { wordCount: post.word_count }),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema) }} />
      <Nav />
      <main style={{ paddingTop: 60 }}>

        {/* Hero */}
        <div style={{ position: 'relative', height: 360, overflow: 'hidden' }}>
          <Image
            src={post.hero_image || FALLBACK_IMAGE}
            alt={post.title}
            fill
            priority
            style={{ objectFit: 'cover' }}
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
                {categoryLabel(post.category)}
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
              <span style={{ fontWeight: 700, color: 'rgba(255,255,255,.8)' }}>Nana</span>
              <span>{formatDate(post.published_at)}</span>
              <span>{readTime(post.word_count)} min read</span>
            </div>
          </div>
        </div>

        {/* Article body */}
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '52px 5%' }}>

          {/* Lead excerpt */}
          {post.excerpt && (
            <p style={{
              fontSize: 18, color: 'var(--body)', lineHeight: 1.75,
              fontWeight: 300, marginBottom: 40,
              borderLeft: '3px solid var(--teal)', paddingLeft: 20,
              fontFamily: "'Nunito Sans', sans-serif",
            }}>
              {post.excerpt}
            </p>
          )}

          {/* Article content */}
          {post.content ? (
            <div
              className="blog-content"
              dangerouslySetInnerHTML={{ __html: post.content }}
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
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 10,
              }}>
                Full article coming soon
              </div>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.55)', lineHeight: 1.6, margin: 0 }}>
                Nana is still writing this one. Check back soon.
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

          {/* Related Articles */}
          {relatedPosts.length > 0 && (
            <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid var(--border)' }}>
              <h2 style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 18, fontWeight: 900, color: 'var(--navy)',
                letterSpacing: '-0.3px', marginBottom: 20,
              }}>
                Related Articles
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {relatedPosts.map(p => (
                  <Link key={p.slug} href={`/blog/${p.slug}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px',
                      background: '#fff', transition: 'border-color .15s, box-shadow .15s',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                          fontWeight: 800, fontSize: 14, color: 'var(--navy)', marginBottom: 3,
                          lineHeight: 1.35,
                        }}>
                          {p.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {categoryLabel(p.category)} · {Math.ceil((p.word_count ?? 800) / 200)} min read
                        </div>
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--teal-dk)', fontWeight: 700, flexShrink: 0 }}>
                        Read →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Back link */}
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
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
