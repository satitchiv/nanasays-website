import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Unsubscribe | NanaSays',
  robots: 'noindex',
}

async function doUnsubscribe(email: string, slug: string) {
  const EDUWORLD = process.env.EDUWORLD_URL || 'http://localhost:8001'
  try {
    await fetch(`${EDUWORLD}/api/schools/${slug}/unfollow?email=${encodeURIComponent(email)}`, {
      method: 'POST',
      cache: 'no-store',
    })
  } catch {
    // Fail silently — page still shows confirmation
  }
}

interface Props {
  searchParams?: { email?: string; slug?: string }
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const email = searchParams?.email || ''
  const slug = searchParams?.slug || ''

  if (email && slug) {
    await doUnsubscribe(email, slug)
  }

  return (
    <>
      <Nav />
      <div style={{
        maxWidth: 480, margin: '100px auto', padding: '0 5%',
        textAlign: 'center',
      }}>
        {email && slug ? (
          <>
            <div style={{ fontSize: 32, marginBottom: 16, color: 'var(--teal)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'inline-block' }}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>
              You've been unsubscribed
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
              You will no longer receive updates for this school.
              You can re-follow any time from the school's profile page.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', marginBottom: 12 }}>
              Invalid unsubscribe link
            </h1>
            <p style={{ fontSize: 14, color: 'var(--muted)' }}>
              This link appears to be invalid or expired.
            </p>
          </>
        )}
      </div>
      <Footer />
    </>
  )
}
