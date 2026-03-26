'use client'

import { useState } from 'react'
import { ALL_REGION_STUBS } from '@/lib/regionData'

interface Props {
  currentSlug: string
}

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  )
}

export default function OtherRegions({ currentSlug }: Props) {
  return (
    <section style={{
      background: 'var(--white)',
      borderTop: '1px solid var(--border)',
      padding: '56px 5%',
    }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)',
            textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8,
          }}>
            Other Regions
          </div>
          <h2 style={{
            fontFamily: "'Nunito', sans-serif",
            fontSize: 'clamp(22px, 3vw, 32px)',
            fontWeight: 900, color: 'var(--navy)',
            letterSpacing: '-.5px', marginBottom: 6,
          }}>
            Explore <span style={{ color: 'var(--teal-dk)' }}>every region</span>
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 300, lineHeight: 1.6, maxWidth: 480 }}>
            Nana has reviewed schools in every corner of the world. Switch regions anytime.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 12, marginTop: 28,
        }}>
          {ALL_REGION_STUBS.map((region, i) => (
            <RegionCard
              key={region.slug}
              region={region}
              isActive={region.slug === currentSlug}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function RegionCard({
  region,
  isActive,
}: {
  region: typeof ALL_REGION_STUBS[number]
  isActive: boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <a
      href={`/regions/${region.slug}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px',
        background: isActive ? 'var(--navy)' : hovered ? 'var(--white)' : 'var(--off)',
        border: isActive
          ? '1px solid var(--navy)'
          : hovered ? '1px solid var(--teal)' : '1px solid var(--border)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all .18s',
        boxShadow: (!isActive && hovered) ? '0 4px 16px rgba(27,50,82,.08)' : 'none',
        textDecoration: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: isActive ? 'rgba(255,255,255,.12)' : 'var(--white)',
        border: isActive ? '1px solid rgba(255,255,255,.15)' : '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isActive ? 'rgba(255,255,255,.7)' : 'var(--teal)',
      }}>
        <GlobeIcon />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'Nunito', sans-serif",
          fontSize: 14, fontWeight: 800,
          color: isActive ? '#fff' : 'var(--navy)',
        }}>
          {region.name}
        </div>
        <div style={{
          fontSize: 11, fontWeight: 300, marginTop: 2,
          color: isActive ? 'rgba(255,255,255,.55)' : 'var(--muted)',
        }}>
          {isActive ? `${region.sub} · currently viewing` : region.sub}
        </div>
      </div>

      {/* Count */}
      <div style={{
        fontFamily: "'Nunito', sans-serif",
        fontSize: 16, fontWeight: 900, flexShrink: 0,
        color: isActive ? 'var(--teal)' : 'var(--navy)',
      }}>
        {region.count.toLocaleString()}
      </div>
    </a>
  )
}
