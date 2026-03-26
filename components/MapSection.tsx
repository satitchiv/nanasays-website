'use client'

import { useEffect, useRef } from 'react'

const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Thailand': [15.87, 100.99],
  'United Kingdom': [51.5, -0.12],
  'Switzerland': [46.8, 8.23],
  'Singapore': [1.35, 103.82],
  'China': [35.86, 104.19],
  'Hong Kong': [22.33, 114.17],
  'Japan': [36.2, 138.25],
  'Taiwan': [23.7, 121.0],
  'Malaysia': [3.14, 101.69],
  'Indonesia': [-0.79, 113.92],
  'Philippines': [12.88, 121.77],
  'South Korea': [35.91, 127.77],
  'Vietnam': [14.06, 108.28],
  'Myanmar': [19.15, 96.49],
  'Cambodia': [12.57, 104.99],
  'Italy': [41.87, 12.57],
  'Germany': [51.17, 10.45],
  'Austria': [47.52, 14.55],
}

const COUNTRY_COUNTS: Record<string, number> = {
  'Thailand': 171, 'China': 165, 'Hong Kong': 134, 'Singapore': 112,
  'Switzerland': 109, 'Japan': 107, 'United Kingdom': 52,
  'Taiwan': 20, 'Malaysia': 20, 'Indonesia': 20, 'Philippines': 20,
  'South Korea': 20, 'Vietnam': 18, 'Myanmar': 7, 'Italy': 7,
  'Cambodia': 5, 'Germany': 3, 'Austria': 1,
}

const FEATURED = new Set(['Thailand', 'United Kingdom', 'Switzerland', 'Singapore', 'Japan', 'Hong Kong'])

function countryToSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')
}

export default function MapSection() {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<any>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (!mapRef.current || initRef.current) return
    initRef.current = true

    let map: any = null

    import('leaflet').then(L => {
      if (!mapRef.current) return

      const container = mapRef.current as any
      if (container._leaflet_id) {
        delete container._leaflet_id
      }

      map = L.map(mapRef.current, {
        center: [25, 55],
        zoom: 3,
        zoomControl: true,
        scrollWheelZoom: false,
        dragging: true,
      })
      leafletRef.current = map

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      Object.entries(COUNTRY_COORDS).forEach(([country, coords]) => {
        const count = COUNTRY_COUNTS[country] ?? 0
        const featured = FEATURED.has(country)
        const size = featured ? 16 : 11
        const color = featured ? '#34C3A0' : '#2D7DD2'
        const slug = countryToSlug(country)

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(27,50,82,0.35);cursor:pointer;transition:transform .15s;"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })

        const marker = L.marker(coords, { icon }).addTo(map)

        marker.bindPopup(`
          <div style="font-family:'Nunito Sans',sans-serif;padding:6px 2px;min-width:140px;">
            <strong style="color:#1B3252;font-size:14px;display:block;margin-bottom:4px;">${country}</strong>
            <span style="color:#6B7280;font-size:12px;">${count} schools</span>
            <a href="/countries/${slug}"
               style="display:block;margin-top:10px;padding:7px 12px;background:#1B3252;color:#fff;border-radius:7px;font-size:12px;font-weight:700;text-align:center;text-decoration:none;">
              Explore schools →
            </a>
          </div>
        `, { maxWidth: 180 })

        // Navigate on marker click (opens popup, then user can click the link)
        marker.on('mouseover', function (this: any) {
          this.openPopup()
        })
      })
    })

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove()
        leafletRef.current = null
      }
      initRef.current = false
    }
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={mapRef}
        style={{ height: 460, width: '100%', background: '#f0f4f8', cursor: 'grab' }}
      />
      <div style={{
        position: 'absolute', bottom: 16, right: 16, zIndex: 1000,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
        border: '1px solid var(--border)', borderRadius: 8,
        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 14,
        fontSize: 11, color: 'var(--muted)', fontFamily: "'Nunito Sans', sans-serif",
        boxShadow: '0 2px 12px rgba(27,50,82,.1)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#34C3A0', display: 'inline-block', border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
          Featured
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2D7DD2', display: 'inline-block', border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
          More countries
        </span>
        <span style={{ color: 'var(--border)' }}>·</span>
        <span>Hover a pin to explore</span>
      </div>
    </div>
  )
}
