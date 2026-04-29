'use client'

import { useEffect, useRef } from 'react'
import { CITY_COORDS } from '@/lib/cityCoords'
import './shortlist-map.css'

export interface SchoolPin {
  slug: string
  name: string
  city: string
  feesDisplay?: string
}

// UK region → approximate centre coords for fallback
const UK_REGION_COORDS: Record<string, [number, number]> = {
  'London':       [51.5074, -0.1278],
  'South East':   [51.2, -0.5],
  'South West':   [51.0, -2.5],
  'East':         [52.2, 0.5],
  'East Midlands':[52.8, -1.0],
  'West Midlands':[52.4, -1.9],
  'Yorkshire':    [53.8, -1.5],
  'North West':   [53.5, -2.5],
  'North East':   [54.9, -1.6],
  'Scotland':     [56.5, -4.0],
  'Wales':        [52.2, -3.5],
}

function resolveCoords(city: string): [number, number] | null {
  if (CITY_COORDS[city]) return CITY_COORDS[city]
  // Partial match — e.g. "Wiltshire" contains "Marlborough" area context
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (city.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(city.toLowerCase())) {
      return coords
    }
  }
  // Region fallback
  for (const [region, coords] of Object.entries(UK_REGION_COORDS)) {
    if (city.toLowerCase().includes(region.toLowerCase())) return coords
  }
  // Default UK centre
  return [52.5, -1.5]
}

export default function ShortlistMap({ schools }: { schools: SchoolPin[] }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<any>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (!mapRef.current || initRef.current || schools.length === 0) return
    initRef.current = true

    let map: any = null

    import('leaflet').then(L => {
      if (!mapRef.current) return
      const container = mapRef.current as any
      if (container._leaflet_id) delete container._leaflet_id

      // Centre on mean of all pin coords
      const allCoords = schools.map(s => resolveCoords(s.city) ?? [52.5, -1.5] as [number, number])
      const meanLat = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length
      const meanLng = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length

      map = L.map(mapRef.current, {
        center: [meanLat, meanLng],
        zoom: 7,
        zoomControl: true,
        scrollWheelZoom: false,
      })
      leafletRef.current = map

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      schools.forEach(school => {
        const coords = resolveCoords(school.city)
        if (!coords) return

        const icon = L.divIcon({
          className: '',
          html: `<div class="shortlist-pin"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        })

        const marker = L.marker(coords, { icon }).addTo(map)
        const feeLine = school.feesDisplay ? `<div class="shortlist-popup-fees">${school.feesDisplay}</div>` : ''
        marker.bindPopup(
          `<div class="shortlist-popup">
            <div class="shortlist-popup-name">${school.name}</div>
            ${feeLine}
            <a href="/schools/${school.slug}/report" class="shortlist-popup-link">View report →</a>
          </div>`,
          { maxWidth: 200 }
        )
      })

      // Fit bounds if multiple schools
      if (schools.length > 1) {
        const bounds = L.latLngBounds(
          schools.map(s => resolveCoords(s.city) ?? [52.5, -1.5])
        )
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 })
      }
    })

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove()
        leafletRef.current = null
        initRef.current = false
      }
    }
  }, [schools])

  if (schools.length === 0) {
    return (
      <div className="shortlist-map-empty">
        Save schools to your shortlist to see them on the map.
      </div>
    )
  }

  return <div ref={mapRef} className="shortlist-map" />
}
