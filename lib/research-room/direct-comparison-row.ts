export type DirectComparisonSchool = {
  slug: string
  name: string
  city: string | null
  region: string | null
  boarding: boolean | null
  gender_split: string | null
  structured: Record<string, unknown> | null
}

export type DirectComparisonCell = {
  value: string | number | null
  note?: string
  source?: string
  checked_at?: string
  evidence_kind?: 'nana_database' | 'web_search'
}

type ModelResult = {
  slug: string
  value: string | number | null
  note: string | null
  destination: string | null
  distance: string | null
  travel_time: string | null
  source_url: string | null
  confidence: 'high' | 'medium' | 'low'
}

const MAX_VALUE_LENGTH = 80
const MAX_NOTE_LENGTH = 120

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return cleaned ? cleaned.slice(0, maxLength) : null
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function currencySymbol(currency: unknown): string {
  if (currency === 'GBP') return '£'
  if (currency === 'USD') return '$'
  if (currency === 'EUR') return '€'
  return typeof currency === 'string' && currency.trim() ? `${currency.trim()} ` : ''
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function sourceFromRecord(value: Record<string, unknown>): string | undefined {
  for (const key of ['source_url', 'url', 'source']) {
    const candidate = safeHttpsUrl(value[key])
    if (candidate) return candidate
  }
  return undefined
}

function formatTravelMinutes(value: number): string {
  const rounded = Math.round(value)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`
}

function airportCell(
  structured: Record<string, unknown>,
  query: string,
): DirectComparisonCell | null {
  const location = record(structured.location_profile)
  const airports = array(location?.airports)
  const parsed = airports.flatMap(item => {
    const airport = record(item)
    if (!airport) return []
    const label = cleanText(
      airport.name ?? airport.label ?? airport.code,
      50,
    )
    const minutes = finiteNumber(
      airport.minutes
      ?? airport.travel_minutes
      ?? airport.drive_minutes
      ?? airport.duration_minutes
      ?? airport.drive_time_min_estimate,
    )
    const distanceKm = finiteNumber(
      airport.distance_km
      ?? airport.distance_kilometres
      ?? airport.km,
    )
    const distanceMiles = finiteNumber(
      airport.distance_miles
      ?? airport.miles,
    )
    if (
      !label
      || (
        (minutes == null || minutes <= 0)
        && (distanceKm == null || distanceKm <= 0)
        && (distanceMiles == null || distanceMiles <= 0)
      )
    ) return []
    return [{ airport, label, minutes, distanceKm, distanceMiles }]
  })
  if (parsed.length === 0) return null
  const asksForHeathrow = /\b(heathrow|lhr)\b/i.test(query)
  const chosen = asksForHeathrow
    ? parsed.find(item => /heathrow|\blhr\b/i.test(item.label)) ?? parsed[0]
    : [...parsed].sort((a, b) => {
        const aDistance = a.distanceKm ?? (a.distanceMiles != null ? a.distanceMiles * 1.60934 : null)
        const bDistance = b.distanceKm ?? (b.distanceMiles != null ? b.distanceMiles * 1.60934 : null)
        if (aDistance != null && bDistance != null) return aDistance - bDistance
        if (aDistance != null) return -1
        if (bDistance != null) return 1
        return (a.minutes ?? Number.POSITIVE_INFINITY) - (b.minutes ?? Number.POSITIVE_INFINITY)
      })[0]

  const parts: string[] = []
  if (chosen.distanceKm != null && chosen.distanceKm > 0) {
    parts.push(`${Math.round(chosen.distanceKm)} km`)
  } else if (chosen.distanceMiles != null && chosen.distanceMiles > 0) {
    parts.push(`${Math.round(chosen.distanceMiles)} miles`)
  }
  if (chosen.minutes != null && chosen.minutes > 0) {
    parts.push(formatTravelMinutes(chosen.minutes))
  }
  return {
    value: parts.join(' · '),
    note: chosen.label,
    source: sourceFromRecord(chosen.airport),
    evidence_kind: 'nana_database',
  }
}

/**
 * Resolve high-confidence, common comparison requests directly from Nana's
 * structured school record. Returning null means the web researcher should
 * handle the criterion instead. The matching rules intentionally stay narrow:
 * an uncertain mapping is less useful than a visible "Needs checking".
 */
export function resolveTrustedComparisonCell(
  label: string,
  school: DirectComparisonSchool,
): DirectComparisonCell | null {
  const query = label.toLowerCase().replace(/\s+/g, ' ').trim()
  const structured = school.structured ?? {}

  if (/\b(airport|heathrow|lhr)\b/.test(query)) {
    return airportCell(structured, query)
  }

  if (/\b(a[- ]?level|a\*[\s–-]*a)\b/.test(query)) {
    const examResults = record(structured.exam_results)
    const aLevel = record(examResults?.a_level)
    const pct = finiteNumber(aLevel?.pct_a_star_a)
    return pct == null ? null : {
      value: `${Math.round(pct)}%`,
      note: 'A*–A grades',
      evidence_kind: 'nana_database',
    }
  }

  if (/\b(gcse|9[\s–-]*7)\b/.test(query)) {
    const examResults = record(structured.exam_results)
    const gcse = record(examResults?.gcse)
    const pct = finiteNumber(gcse?.pct_7_to_9)
    return pct == null ? null : {
      value: `${Math.round(pct)}%`,
      note: 'Grades 9–7',
      evidence_kind: 'nana_database',
    }
  }

  if (/\b(total pupils|school size|number of pupils|pupil count)\b/.test(query)) {
    const community = record(structured.student_community)
    const total = finiteNumber(community?.total_pupils)
    return total == null ? null : {
      value: `~${Math.round(total).toLocaleString('en-GB')}`,
      evidence_kind: 'nana_database',
    }
  }

  if (/\b(location|city|region)\b/.test(query)) {
    const location = [school.city, school.region].filter(Boolean).join(', ')
    return location ? { value: location, evidence_kind: 'nana_database' } : null
  }

  if (/\b(school type|boarding type|day or boarding)\b/.test(query)) {
    const gender = cleanText(school.gender_split, 30)
    return {
      value: school.boarding ? 'Day + boarding' : 'Day school',
      note: gender ?? undefined,
      evidence_kind: 'nana_database',
    }
  }

  if (/\b(bursary|bursaries|financial aid)\b/.test(query)) {
    const note = cleanText(structured.bursary_note, MAX_VALUE_LENGTH)
    return note ? { value: note, evidence_kind: 'nana_database' } : null
  }

  if (/\b(fee|fees|tuition|annual cost|school cost)\b/.test(query)) {
    const max = finiteNumber(structured.fees_max)
    const min = finiteNumber(structured.fees_min)
    const amount = max ?? min
    if (amount == null) return null
    const symbol = currencySymbol(structured.fees_currency)
    return {
      value: `${symbol}${Math.round(amount).toLocaleString('en-GB')}`,
      note: max != null ? 'Highest annual fee on file' : 'Annual fee on file',
      evidence_kind: 'nana_database',
    }
  }

  return null
}

export function compactSchoolResearchContext(school: DirectComparisonSchool): string {
  const structured = school.structured ?? {}
  const useful = {
    fees_min: structured.fees_min,
    fees_max: structured.fees_max,
    fees_currency: structured.fees_currency,
    exam_results: structured.exam_results,
    university_destinations: structured.university_destinations,
    admissions_format: structured.admissions_format,
    sports_profile: structured.sports_profile,
    student_community: structured.student_community,
    location_profile: structured.location_profile,
    bursary_note: structured.bursary_note,
  }
  const json = JSON.stringify(useful)
  return json.length > 5_000 ? `${json.slice(0, 5_000)}…` : json
}

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') return null
    url.hash = ''
    return url.toString().slice(0, 500)
  } catch {
    return null
  }
}

function sourceIsAllowed(source: string, allowedSources: Set<string>): boolean {
  if (allowedSources.size === 0) return false
  const normalized = source.replace(/\/$/, '')
  for (const candidate of Array.from(allowedSources)) {
    if (candidate.replace(/\/$/, '') === normalized) return true
  }
  return false
}

export function normalizeModelResults(
  raw: unknown,
  schools: DirectComparisonSchool[],
  trustedCells: Map<string, DirectComparisonCell>,
  allowedSourceUrls: Set<string>,
  checkedAt: string,
  criterion = '',
): Record<string, DirectComparisonCell> {
  const payload = record(raw)
  const results = array(payload?.results)
  const bySlug = new Map<string, ModelResult>()
  const isAirportCriterion = /\b(airport|heathrow|lhr)\b/i.test(criterion)

  for (const item of results) {
    const result = record(item)
    if (!result || typeof result.slug !== 'string') continue
    const confidence =
      result.confidence === 'high' || result.confidence === 'medium' || result.confidence === 'low'
        ? result.confidence
        : 'low'
    const rawDistance = cleanText(result.distance, 40)
    const rawTravelTime = cleanText(result.travel_time, 40)
    const distance = rawDistance
      && /\b(?:km|kilomet(?:er|re)s?|mi|miles?)\b/i.test(rawDistance)
      ? rawDistance
      : null
    const travelTime = rawTravelTime
      && /\b(?:min|mins|minute|minutes|hr|hrs|hour|hours)\b/i.test(rawTravelTime)
      ? rawTravelTime
      : null
    const destination = cleanText(result.destination, MAX_NOTE_LENGTH)
    const travelParts = [distance, travelTime].filter((part): part is string => Boolean(part))
    bySlug.set(result.slug, {
      slug: result.slug,
      value: isAirportCriterion && travelParts.length > 0
        ? travelParts.join(' · ').slice(0, MAX_VALUE_LENGTH)
        : typeof result.value === 'number'
          ? result.value
          : cleanText(result.value, MAX_VALUE_LENGTH),
      note: isAirportCriterion && destination
        ? destination
        : cleanText(result.note, MAX_NOTE_LENGTH),
      destination,
      distance,
      travel_time: travelTime,
      source_url: safeHttpsUrl(result.source_url),
      confidence,
    })
  }

  const cells: Record<string, DirectComparisonCell> = {}
  for (const school of schools) {
    const trusted = trustedCells.get(school.slug)
    if (trusted?.value != null) {
      cells[school.slug] = { ...trusted, checked_at: checkedAt }
      continue
    }

    const model = bySlug.get(school.slug)
    const source = safeHttpsUrl(model?.source_url)
    const hasReliableSource = Boolean(source && sourceIsAllowed(source, allowedSourceUrls))
    const usable =
      model
      && model.confidence !== 'low'
      && model.value != null
      && model.value !== ''
      && hasReliableSource

    cells[school.slug] = usable
      ? {
          value: model.value,
          ...(model.note ? { note: model.note } : {}),
          source: source!,
          checked_at: checkedAt,
          evidence_kind: 'web_search',
        }
      : { value: null }
  }
  return cells
}

export function countFilledCells(cells: Record<string, DirectComparisonCell>): number {
  return Object.values(cells).filter(cell => cell.value != null && cell.value !== '').length
}
