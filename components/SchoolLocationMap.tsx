'use client'

import { useState } from 'react'

interface Props {
  lat: number
  lng: number
  schoolName: string
  address?: string
}

export default function SchoolLocationMap({ lat, lng, schoolName, address }: Props) {
  const [view, setView] = useState<'map' | 'street'>('map')

  const q = encodeURIComponent(address || `${lat},${lng}`)
  const mapSrc = `https://maps.google.com/maps?q=${q}&output=embed&z=15`
  // Street View deep-link — opens Google Maps in Street View mode, no API key needed
  const streetViewUrl = `https://www.google.com/maps/@${lat},${lng},3a,90y,0h,90t/data=!3m4!1e1`

  return (
    <div style={{ fontFamily: "'Nunito Sans', sans-serif" }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => setView('map')}
          style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: '1px solid #D8D1C2', cursor: 'pointer',
            background: view === 'map' ? '#2E5C4B' : '#FAF7F2',
            color: view === 'map' ? '#fff' : '#3A3A3A',
            transition: 'all .15s',
          }}
        >
          Map
        </button>
        <a
          href={streetViewUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: '1px solid #D8D1C2', cursor: 'pointer', textDecoration: 'none',
            background: '#FAF7F2', color: '#3A3A3A', display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          Street View ↗
        </a>
      </div>

      <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #D8D1C2' }}>
        <iframe
          src={mapSrc}
          width="100%"
          height="320"
          style={{ border: 0, display: 'block' }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`Map — ${schoolName}`}
        />
      </div>

      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#8B8680' }}>
        {address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
      </p>
    </div>
  )
}
