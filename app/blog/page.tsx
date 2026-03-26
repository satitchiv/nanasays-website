import type { Metadata } from 'next'
import Link from 'next/link'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { BLOG_POSTS, CATEGORY_LABELS } from '@/lib/blog'

export const metadata: Metadata = {
  title: "From Nana's Desk — International School Guides",
  description: "Honest guides for international school families. Curriculum comparisons, school rankings, and advice from Nana.",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function BlogPage() {
  const [featured, ...rest] = BLOG_POSTS

  return (
    <>
      <Nav />
      <main style={{ paddingTop: 60 }}>

        {/* Hero band */}
        <div style={{ background: 'var(--navy)', padding: '56px 5%' }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--teal)', marginBottom: 12 }}>
              From Nana&apos;s Desk
            </div>
            <h1 style={{
              fontFamily: 'var(--font-nunito), Nunito, sans-serif',
              fontWeight: 900, fontSize: 'clamp(28px, 4vw, 44px)',
              color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1, margin: '0 0 14px',
            }}>
              Guides for international school families
            </h1>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,.6)', lineHeight: 1.6, maxWidth: 520, margin: 0 }}>
              Curriculum breakdowns, country guides, and honest school rankings — written by Nana.
            </p>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '52px 5%' }}>

          {/* Featured post */}
          <Link href={`/blog/${featured.slug}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 48 }}>
            <div style={{
              borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)',
              transition: 'box-shadow .2s',
            }}>
              <div style={{ position: 'relative', height: 280, overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={featured.image}
                  alt={featured.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(11,20,38,.85) 0%, rgba(11,20,38,.2) 60%, transparent 100%)',
                }} />
                <div style={{ position: 'absolute', bottom: 24, left: 28, right: 28 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 100,
                    background: 'var(--teal)', color: '#fff',
                    fontFamily: "'Nunito Sans', sans-serif",
                  }}>
                    {CATEGORY_LABELS[featured.category]}
                  </span>
                  <h2 style={{
                    fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                    fontWeight: 900, fontSize: 22, color: '#fff',
                    letterSpacing: '-0.3px', lineHeight: 1.2,
                    margin: '10px 0 0',
                  }}>
                    {featured.title}
                  </h2>
                </div>
              </div>
              <div style={{ background: '#fff', padding: '20px 28px' }}>
                <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.65, margin: '0 0 14px' }}>
                  {featured.excerpt}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--muted)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{featured.author}</span>
                  <span>{formatDate(featured.publishedAt)}</span>
                  <span>{featured.readTime} min read</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--teal-dk)', fontWeight: 700 }}>Read article →</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Remaining posts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 24 }}>
            {rest.map(post => (
              <Link key={post.slug} href={`/blog/${post.slug}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)',
                  background: '#fff', height: '100%', display: 'flex', flexDirection: 'column',
                  transition: 'box-shadow .2s, border-color .2s',
                }}>
                  <div style={{ height: 180, overflow: 'hidden', position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.image}
                      alt={post.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <div style={{ position: 'absolute', top: 12, left: 12 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 100,
                        background: 'var(--navy)', color: '#fff',
                        fontFamily: "'Nunito Sans', sans-serif",
                      }}>
                        {CATEGORY_LABELS[post.category]}
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{
                      fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                      fontWeight: 800, fontSize: 16, color: 'var(--navy)',
                      letterSpacing: '-0.2px', lineHeight: 1.3,
                      margin: '0 0 10px',
                    }}>
                      {post.title}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 14px', flex: 1 }}>
                      {post.excerpt}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                      <span>{formatDate(post.publishedAt)} · {post.readTime} min read</span>
                      <span style={{ color: 'var(--teal-dk)', fontWeight: 700 }}>Read →</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
