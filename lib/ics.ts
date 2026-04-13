export function generateICS(title: string, date: string, url: string, school: string): string {
  const d = date.replace(/-/g, '')
  const uid = `${Date.now()}@nanasays.school`
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NanaSays//School Pulse//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${d}`,
    `SUMMARY:${title.replace(/[,;\\]/g, ' ')} — ${school.replace(/[,;\\]/g, ' ')}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
