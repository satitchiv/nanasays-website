'use client'
import { useState, useEffect } from 'react'
import { generateICS } from '@/lib/ics'

interface FeedItem {
  id: string
  title: string
  link: string
  category: string | null
  importance: string
  has_date: boolean
  detected_date: string | null
}

interface Props {
  item: FeedItem
  schoolName: string
}

const FEED_CAT_COLORS: Record<string, string> = {
  Results:      '#7c3aed',
  Admissions:   '#059669',
  Scholarships: '#059669',
  Sport:        '#ea580c',
  Facilities:   '#0891b2',
  Community:    '#db2877',
  Events:       '#2563eb',
  Curriculum:   '#4f46e5',
  Leadership:   '#888780',
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - now.getTime()) / 86400000)
}

export default function PinnedActionCard({ item, schoolName }: Props) {
  const catColor = item.category ? (FEED_CAT_COLORS[item.category] || '#2563eb') : '#2563eb'
  const [days, setDays] = useState<number | null>(null)
  useEffect(() => {
    if (item.has_date && item.detected_date) {
      setDays(daysUntil(item.detected_date))
    }
  }, [item.detected_date, item.has_date])
  const showBadge = days !== null && days > 0

  function saveToCalendar() {
    if (!item.detected_date) return
    const ics = generateICS(item.title, item.detected_date, item.link, schoolName)
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'school-event.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{
      marginBottom: 16,
      padding: '16px 18px',
      background: '#eff6ff',
      borderRadius: 12,
      border: '2px solid #2563eb',
    }}>
      {/* Badges row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: '#2563eb',
          background: '#dbeafe', borderRadius: 10, padding: '3px 10px',
        }}>
          Pinned — action needed
        </span>
        {item.category && (
          <span style={{
            fontSize: 12, fontWeight: 600, color: catColor,
            background: `${catColor}15`, borderRadius: 10, padding: '3px 10px',
          }}>
            {item.category}
          </span>
        )}
        {showBadge && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: '#fff',
            background: days! <= 7 ? '#dc2626' : '#ea580c',
            borderRadius: 10, padding: '3px 10px',
          }}>
            {days} day{days !== 1 ? 's' : ''} away
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--navy)', lineHeight: 1.4, marginBottom: 14 }}>
        {item.title}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: '#2563eb', color: '#fff', textDecoration: 'none',
          }}
        >
          Register on school site
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
        {item.detected_date && (
          <button
            onClick={saveToCalendar}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700,
              background: '#fff', color: '#2563eb', border: '1px solid #bfdbfe',
              cursor: 'pointer',
            }}
          >
            Save to calendar
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
