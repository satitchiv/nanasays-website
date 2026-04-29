import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateICS } from '@/lib/ics'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
}

function parseEventDate(text: string): string | null {
  const m = text.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i
  )
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = MONTHS[m[2].toLowerCase()]
  return `${m[3]}-${month}-${day}`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug?.toLowerCase()
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  const { data } = await supabase
    .from('school_structured_data')
    .select('admissions_format')
    .eq('school_slug', slug)
    .maybeSingle()

  const { data: school } = await supabase
    .from('schools')
    .select('name_en, website')
    .eq('slug', slug)
    .maybeSingle()

  const openEvents: string[] = data?.admissions_format?.open_events ?? []
  const schoolName = school?.name_en ?? slug
  const schoolUrl = school?.website ?? `https://nanasays.com/schools/${slug}/report`

  // Find the first event that has a parseable date
  let eventDate: string | null = null
  let eventLabel = 'Open Day'
  for (const ev of openEvents) {
    const d = parseEventDate(ev)
    if (d) {
      eventDate = d
      // Use the text before the date as the label, trimmed
      eventLabel = ev.replace(/[—–-]\s*\w+day.*$/i, '').replace(/\(.*?\)/g, '').trim()
        || 'Open Day'
      break
    }
  }

  if (!eventDate) {
    return NextResponse.json(
      { error: 'no_date', message: 'No open day date found for this school yet.' },
      { status: 404 }
    )
  }

  const ics = generateICS(eventLabel, eventDate, schoolUrl, schoolName)
  const filename = `${slug}-open-day.ics`

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  })
}
