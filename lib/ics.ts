export function generateICS(title: string, date: string, url: string, school: string): string {
  const d = date.replace(/-/g, '')
  // DTEND for an all-day event must be the day AFTER DTSTART (RFC 5545 §3.6.1)
  const dtEnd = nextDay(date).replace(/-/g, '')
  const uid = `${Date.now()}@nanasays.school`
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NanaSays//School Pulse//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${title.replace(/[,;\\]/g, ' ')} — ${school.replace(/[,;\\]/g, ' ')}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
