'use client'

import { useEffect, useRef } from 'react'
import { CITY_COORDS } from '@/lib/cityCoords'
import type { SchoolListItem } from '@/lib/types'

interface Props {
  schools: SchoolListItem[]
  center: [number, number]
  zoom: number
  hoveredCity: string | null
}

function getCityGroups(schools: SchoolListItem[]) {
  const groups: Record<string, { count: number; schools: string[] }> = {}
  for (const s of schools) {
    const city = s.city ?? 'Unknown'
    if (!groups[city]) groups[city] = { count: 0, schools: [] }
    groups[city].count++
    groups[city].schools.push(s.slug)
  }
  return groups
}

export default function CountryMap({ schools, center, zoom, hoveredCity }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const initRef = useRef(false)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<Record<string, any>>({})

  useEffect(() => {
    if (initRef.current || !mapRef.current) return
    initRef.current = true

    const container = mapRef.current as any
    if (container._leaflet_id) delete container._leaflet_id

    import('leaflet').then(L => {
      const map = L.default.map(mapRef.current!, {
        center,
        zoom,
        scrollWheelZoom: false,
        zoomControl: true,
      })

      L.default.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map)

      mapInstanceRef.current = map
      const cityGroups = getCityGroups(schools)

      Object.entries(cityGroups).forEach(([city, { count }]) => {
        const coords = CITY_COORDS[city]
        if (!coords) return

        const isTeal = count >= 3
        const icon = makePin(L.default, city, count, isTeal, false)
        const marker = L.default.marker(coords, { icon }).addTo(map)
        marker.bindPopup(`
          <div style="padding:10px;font-family:'Nunito Sans',sans-serif;min-width:140px;">
            <div style="font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;color:#1B3252;margin-bottom:4px;">${city}</div>
            <div style="font-size:11px;color:#6B7280;">${count} school${count !== 1 ? 's' : ''}</div>
          </div>
        `, { maxWidth: 180 })
        markersRef.current[city] = { marker, count, isTeal }
      })
    })

    return () => {
      initRef.current = false
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        markersRef.current = {}
      }
    }
  }, []) // intentionally empty — only init once

  // Handle hover highlight
  useEffect(() => {
    import('leaflet').then(L => {
      Object.entries(markersRef.current).forEach(([city, { marker, count, isTeal }]) => {
        const isActive = city === hoveredCity
        marker.setIcon(makePin(L.default, city, count, isTeal, isActive))
        if (isActive) marker.setZIndexOffset(1000)
        else marker.setZIndexOffset(0)
      })
    })
  }, [hoveredCity])

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
}

function makePin(L: any, city: string, count: number, isTeal: boolean, isActive: boolean) {
  const bg = isActive ? '#2D7DD2' : isTeal ? '#34C3A0' : '#1B3252'
  const label = count > 1 ? `${city} (${count})` : city
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};color:#fff;font-family:'Nunito',sans-serif;font-size:10px;font-weight:800;padding:4px 9px;border-radius:8px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.25);border:2px solid #fff;cursor:pointer;transition:transform .15s;">${label}</div>`,
    iconSize: undefined,
    iconAnchor: [30, 18],
  })
}
