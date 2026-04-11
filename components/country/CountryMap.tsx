'use client'

import { useEffect, useRef } from 'react'
import { CITY_COORDS } from '@/lib/cityCoords'
import type { SchoolListItem } from '@/lib/types'

interface Props {
  schools: SchoolListItem[]
  center: [number, number]
  zoom: number
  hoveredSchoolId: string | null
  selectedSchoolId: string | null
  onSchoolClick: (id: string) => void
}

function getCoords(school: SchoolListItem): [number, number] | null {
  if (school.latitude && school.longitude) return [school.latitude, school.longitude]
  if (school.city) {
    const c = CITY_COORDS[school.city]
    if (c) return c
  }
  return null
}

export default function CountryMap({ schools, center, zoom, hoveredSchoolId, selectedSchoolId, onSchoolClick }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  // Map from school id → { marker, school }
  const markersRef = useRef<Record<string, { marker: any; school: SchoolListItem }>>({})

  // Init map once
  useEffect(() => {
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return

      const container = mapRef.current as any
      if (container._leaflet_id) delete container._leaflet_id

      const map = L.default.map(mapRef.current, {
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

      schools.forEach(school => {
        const coords = getCoords(school)
        if (!coords) return

        const icon = makePin(L.default, false, false)
        const marker = L.default.marker(coords, { icon }).addTo(map)

        marker.bindPopup(`
          <div style="padding:8px 10px;font-family:'Nunito Sans',sans-serif;min-width:180px;max-width:240px;">
            <div style="font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;color:#1B3252;line-height:1.3;margin-bottom:3px;">${school.name}</div>
            <div style="font-size:11px;color:#6B7280;margin-bottom:10px;">${school.city ?? ''}</div>
            <a href="/schools/${school.slug}" style="display:block;text-align:center;padding:8px 12px;background:#1B3252;color:#fff;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;font-family:'Nunito Sans',sans-serif;">View profile →</a>
          </div>
        `, { maxWidth: 260 })

        marker.on('click', () => onSchoolClick(school.id))
        markersRef.current[school.id] = { marker, school }
      })

      // If a school was already selected when map first mounts (e.g. tapped image before map loaded)
      if (selectedSchoolId) {
        const entry = markersRef.current[selectedSchoolId]
        if (entry) {
          const coords = getCoords(entry.school)
          if (coords) {
            map.setView(coords, Math.max(zoom, 13))
            entry.marker.openPopup()
          }
        }
      }
    })

    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        markersRef.current = {}
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Hover — highlight pin
  useEffect(() => {
    import('leaflet').then(L => {
      Object.entries(markersRef.current).forEach(([id, { marker }]) => {
        const isHovered = id === hoveredSchoolId
        const isSelected = id === selectedSchoolId
        marker.setIcon(makePin(L.default, isHovered, isSelected))
        marker.setZIndexOffset(isSelected ? 2000 : isHovered ? 1000 : 0)
      })
    })
  }, [hoveredSchoolId, selectedSchoolId])

  // Click from list — pan to school, open popup
  useEffect(() => {
    if (!selectedSchoolId || !mapInstanceRef.current) return
    // On mobile the map column is display:none (offsetWidth=0) — skip to avoid Leaflet crash
    if (!mapRef.current || mapRef.current.offsetWidth === 0) return
    const entry = markersRef.current[selectedSchoolId]
    if (!entry) return
    const coords = getCoords(entry.school)
    if (!coords) return
    mapInstanceRef.current.flyTo(coords, Math.max(zoom, 13), { duration: 0.6 })
    entry.marker.openPopup()
  }, [selectedSchoolId, zoom])

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
}

function makePin(L: any, isHovered: boolean, isSelected: boolean) {
  const size = isSelected ? 16 : isHovered ? 14 : 10
  const bg = isSelected ? '#2D7DD2' : isHovered ? '#34C3A0' : '#1B3252'
  const border = isSelected ? 3 : 2
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;
      height:${size}px;
      background:${bg};
      border:${border}px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,.35);
      cursor:pointer;
      transition:all .15s;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}
