'use client'

import { useEffect } from 'react'

interface Props {
  schoolId: string
}

export default function TrackView({ schoolId }: Props) {
  useEffect(() => {
    // Fire-and-forget — do not await, do not block render
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, event_type: 'view' }),
    }).catch(() => {/* ignore failures */})
  }, [schoolId])

  return null
}
