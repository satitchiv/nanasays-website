'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  schoolName: string
  /** Optional: where the "Try it out →" CTA should send the user. Defaults to /signup */
  ctaHref?: string
}

/**
 * Embeds the interactive feature carousel + pricing card for unpaid users
 * on the school detail page. The carousel showcases:
 *   - Reports tab (22-section dossier + Verdict)
 *   - Ask Nana tab (chat)
 *   - Compare tab (drag-reorder)
 *
 * The interactive content lives in /public/feature-school-embed.html and is
 * iframed here. The iframe posts its height back via postMessage so the
 * wrapper can size itself to the content.
 */
export default function SchoolFeatureEmbed({ schoolName, ctaHref = '/signup' }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(820)

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return
      if (e.data.type === 'nana-embed-height' && typeof e.data.height === 'number') {
        setHeight(Math.max(700, Math.min(e.data.height + 16, 1400)))
      }
      if (e.data.type === 'nana-embed-cta') {
        window.location.href = ctaHref
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [ctaHref])

  const src = `/feature-school-embed.html?school=${encodeURIComponent(schoolName)}`

  return (
    <section
      style={{
        margin: '32px 0',
        padding: '0 5%',
        maxWidth: 1100,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          color: 'var(--teal-dk)',
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        Make better decisions
      </div>
      <h2
        style={{
          fontFamily: 'var(--font-nunito), Nunito, sans-serif',
          fontSize: 'clamp(22px, 3vw, 32px)',
          fontWeight: 900,
          color: 'var(--navy)',
          letterSpacing: '-.5px',
          textAlign: 'center',
          marginBottom: 8,
          lineHeight: 1.2,
        }}
      >
        Smarter choices on <span style={{ color: 'var(--teal)' }}>100+ UK schools</span>
      </h2>
      <p
        style={{
          textAlign: 'center',
          fontSize: 15,
          color: 'var(--muted)',
          maxWidth: 520,
          margin: '0 auto 28px',
          lineHeight: 1.6,
          fontWeight: 400,
        }}
      >
        Unlock the full {schoolName} report, ask Nana anything, and compare with up to 5 schools side-by-side.
      </p>
      <iframe
        ref={iframeRef}
        src={src}
        title="Nanasays features"
        loading="lazy"
        style={{
          width: '100%',
          height: `${height}px`,
          border: 'none',
          background: 'transparent',
          display: 'block',
        }}
        scrolling="no"
      />
    </section>
  )
}
