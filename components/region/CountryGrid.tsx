'use client'

import { useState, useEffect, useRef } from 'react'
import type { RegionCountry } from '@/lib/regionData'

interface Props {
  countries: RegionCountry[]
}

function FlagImg({ code, name }: { code: string; name: string }) {
  return (
    <img
      src={`https://flagcdn.com/32x24/${code.toLowerCase()}.png`}
      alt={name}
      width={32}
      height={24}
      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))', display: 'block' }}
    />
  )
}

function CountryCard({ country, index }: { country: RegionCountry; index: number }) {
  const [hovered, setHovered] = useState(false)
  const cardRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) el.classList.add('ns-visible') },
      { threshold: 0.07 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const delay = [0, 0.08, 0.16, 0.22, 0.28, 0.08, 0.16, 0.22][index % 8]

  return (
    <a
      ref={cardRef}
      href={`/countries/${country.slug}`}
      className="ns-reveal"
      style={{
        background: country.isFeatured ? 'var(--teal-bg)' : 'var(--white)',
        border: country.isFeatured
          ? hovered ? '2px solid var(--teal)' : '2px solid rgba(52,195,160,.4)'
          : hovered ? '1px solid var(--teal)' : '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        textDecoration: 'none',
        display: 'block',
        transition: 'all .22s',
        boxShadow: hovered ? '0 10px 32px rgba(27,50,82,.18)' : 'none',
        transform: hovered ? 'translateY(-4px)' : 'none',
        opacity: 0,
        transitionDelay: `${delay}s`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Photo */}
      <div style={{ height: 130, position: 'relative', overflow: 'hidden', background: 'var(--off2)' }}>
        <img
          src={country.imageUrl}
          alt={country.name}
          loading="lazy"
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            transition: 'transform .35s',
            transform: hovered ? 'scale(1.06)' : 'scale(1)',
          }}
        />
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(27,50,82,.55) 0%, transparent 55%)',
        }} />
        {/* Flag — bottom left */}
        <div style={{ position: 'absolute', bottom: 9, left: 11 }}>
          <FlagImg code={country.flagCode} name={country.name} />
        </div>
        {/* School count badge — top right */}
        <div style={{
          position: 'absolute', top: 9, right: 9,
          background: country.isFeatured ? 'var(--teal)' : 'rgba(27,50,82,.82)',
          backdropFilter: 'blur(4px)',
          color: '#fff', fontSize: 10, fontWeight: 800,
          padding: '3px 9px', borderRadius: 100,
          fontFamily: "'Nunito', sans-serif",
          border: '1px solid rgba(255,255,255,.12)',
          whiteSpace: 'nowrap',
        }}>
          {country.schoolCount} schools
        </div>
        {/* Visited ribbon */}
        {country.hasVisitedRibbon && (
          <div style={{
            position: 'absolute', bottom: 9, right: 9,
            background: 'var(--teal)', color: '#fff',
            fontSize: 9, fontWeight: 800,
            padding: '3px 8px', borderRadius: 100,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Nana visited all
          </div>
        )}
      </div>
      {/* Card body */}
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{
          fontFamily: "'Nunito', sans-serif",
          fontSize: 15, fontWeight: 800,
          color: country.isFeatured ? 'var(--teal-dk)' : 'var(--navy)',
          marginBottom: 3,
        }}>
          {country.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginBottom: 9 }}>
          <strong style={{ color: 'var(--teal-dk)', fontWeight: 700 }}>{country.schoolCount}</strong>
          {' '}international schools · {country.cities}
        </div>
        <div style={{
          fontSize: 11, color: 'var(--teal-dk)', fontStyle: 'italic',
          fontWeight: 300, lineHeight: 1.5,
          paddingTop: 9,
          borderTop: country.isFeatured ? '1px solid rgba(52,195,160,.25)' : '1px solid var(--border)',
        }}>
          {country.nanaNote}
        </div>
      </div>
    </a>
  )
}

export default function CountryGrid({ countries }: Props) {
  const [query, setQuery] = useState('')

  const filtered = countries.filter(c => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.nanaNote.toLowerCase().includes(q)
  })

  return (
    <div>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end',
        justifyContent: 'space-between', flexWrap: 'wrap',
        gap: 16, marginBottom: 32,
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, color: 'var(--teal-dk)',
            textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8,
          }}>
            All Countries
          </div>
          <h2 style={{
            fontFamily: "'Nunito', sans-serif",
            fontSize: 'clamp(22px, 3vw, 32px)',
            fontWeight: 900, color: 'var(--navy)',
            letterSpacing: '-.5px', marginBottom: 6,
          }}>
            Choose a <span style={{ color: 'var(--teal-dk)' }}>country</span>
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 300, lineHeight: 1.6 }}>
            Select a country to browse its schools, fees, and Nana&apos;s honest take.
          </p>
        </div>

        {/* Search bar */}
        <SearchBar value={query} onChange={setQuery} />
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}>
          {filtered.map((country, i) => (
            <CountryCard key={country.slug} country={country} index={i} />
          ))}
        </div>
      ) : (
        <NoResults onReset={() => setQuery('')} />
      )}

      <style>{`
        .ns-reveal { opacity: 0; transform: translateY(14px); transition: opacity .5s ease, transform .5s ease, box-shadow .22s, border-color .22s; }
        .ns-visible { opacity: 1 !important; transform: translateY(0) !important; }
      `}</style>
    </div>
  )
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--white)',
      border: focused ? '1.5px solid var(--teal)' : '1.5px solid var(--border)',
      boxShadow: focused ? '0 0 0 3px rgba(52,195,160,.1)' : 'none',
      borderRadius: 10, padding: '9px 14px',
      transition: 'border-color .2s, box-shadow .2s',
      minWidth: 220,
    }}>
      <svg width="14" height="14" style={{ color: 'var(--muted)', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        placeholder="Search countries…"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, border: 'none', outline: 'none',
          fontFamily: "'Nunito Sans', sans-serif",
          fontSize: 13, color: 'var(--navy)', background: 'transparent',
        }}
      />
    </div>
  )
}

function NoResults({ onReset }: { onReset: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 20px' }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: 'var(--off)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <svg width="26" height="26" style={{ color: 'var(--muted)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <p style={{ fontFamily: "'Nunito', sans-serif", fontSize: 18, fontWeight: 900, color: 'var(--navy)', marginBottom: 6 }}>
        No countries found
      </p>
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>
        Try a different spelling, or{' '}
        <button onClick={onReset} style={{ color: 'var(--blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0 }}>
          clear the search
        </button>
        .
      </p>
    </div>
  )
}
