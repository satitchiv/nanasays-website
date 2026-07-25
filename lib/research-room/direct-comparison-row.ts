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

function moneyValue(value: number, currency: unknown): string {
  return `${currencySymbol(currency)}${Math.round(value).toLocaleString('en-GB')}`
}

function joinValuesWithinLimit(values: string[], limit = MAX_VALUE_LENGTH): string | null {
  const joined: string[] = []
  for (const value of Array.from(new Set(values))) {
    const next = [...joined, value].join(' · ')
    if (next.length > limit) break
    joined.push(value)
  }
  return joined.length > 0 ? joined.join(' · ') : null
}

function feeRowCell(structured: Record<string, unknown>, boardingOnly: boolean): DirectComparisonCell | null {
  const feeTable = record(structured.fees_by_grade)
  const rows = array(feeTable?.rows)
  const candidates = rows.flatMap(item => {
    const row = record(item)
    if (!row) return []
    const phase = cleanText(row.phase ?? row.label ?? row.name, 60)
    if (boardingOnly && !/boarding|residential|7 nights/i.test(phase ?? '')) return []
    if (boardingOnly && /flexi/i.test(phase ?? '')) return []
    const rawAnnualAmount = finiteNumber(row.per_year)
    const rawTermAmount = finiteNumber(row.per_term)
    const annualAmount = rawAnnualAmount != null && rawAnnualAmount > 0 ? rawAnnualAmount : null
    const termAmount = rawTermAmount != null && rawTermAmount > 0 ? rawTermAmount : null
    const amount = annualAmount ?? termAmount
    if (amount == null) return []
    return [{
      amount,
      phase,
      period: annualAmount != null ? 'year' as const : 'term' as const,
    }]
  })
  if (candidates.length === 0) return null
  const annualCandidates = candidates.filter(candidate => candidate.period === 'year')
  const comparableCandidates = annualCandidates.length > 0 ? annualCandidates : candidates
  const chosen = comparableCandidates.sort((a, b) => b.amount - a.amount)[0]
  return {
    value: `${moneyValue(chosen.amount, feeTable?.currency ?? structured.fees_currency)} per ${chosen.period}`,
    note: chosen.phase ?? undefined,
    evidence_kind: 'nana_database',
  }
}

function registrationFeeCell(structured: Record<string, unknown>): DirectComparisonCell | null {
  const feeTable = record(structured.fees_by_grade)
  const extras = array(feeTable?.compulsory_extras)
  for (const item of extras) {
    const extra = record(item)
    if (!extra || !/registration|application|joining/i.test(String(extra.name ?? ''))) continue
    const amount = finiteNumber(extra.per_year ?? extra.amount ?? extra.value)
    if (amount != null && amount > 0) {
      return {
        value: moneyValue(amount, feeTable?.currency ?? structured.fees_currency),
        note: cleanText(extra.name, 60) ?? undefined,
        evidence_kind: 'nana_database',
      }
    }
  }

  const steps = array(record(structured.admissions_format)?.process_steps)
  for (const step of steps) {
    if (typeof step !== 'string' || !/registration|application|joining/i.test(step)) continue
    const match = step.match(/(?:£|GBP\s*)\s?([0-9][0-9,]{1,5})/i)
    if (!match) continue
    const amount = Number(match[1].replace(/,/g, ''))
    if (Number.isFinite(amount) && amount > 0) {
      return { value: moneyValue(amount, feeTable?.currency ?? structured.fees_currency), evidence_kind: 'nana_database' }
    }
  }
  return null
}

function boardingEntryCell(
  structured: Record<string, unknown>,
  isBoardingSchool: boolean | null,
): DirectComparisonCell | null {
  const entryPoints = array(record(structured.admissions_format)?.entry_points)
  const entries = entryPoints.flatMap(item => {
    const entry = record(item)
    const raw = entry?.year
      ?? entry?.age
      ?? entry?.entry_point
      ?? entry?.label
      ?? (typeof item === 'string' ? item : null)
    const rawText = String(raw ?? '')
    const yearMatch = rawText.match(/\byears?\s*(\d{1,2})\b/i)
    const ageMatch = rawText.match(/\b(?:age|ages)?\s*(\d{1,2})\s*\+/i)
      ?? rawText.match(/\bages?\s*(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\b/i)
      ?? rawText.match(/^\s*(\d{1,2})\s*\+/)
    const numericMatch = rawText.match(/^\s*(\d{1,2})\s*$/)
    const year = yearMatch
      ? Number(yearMatch[1])
      : numericMatch && entry?.year != null
        ? Number(numericMatch[1])
        : null
    const age = ageMatch
      ? Number(ageMatch[1])
      : numericMatch && entry?.age != null
        ? Number(numericMatch[1])
        : null
    if (year == null && age == null) return []
    const text = typeof item === 'string'
      ? item
      : `${entry?.entry_point ?? ''} ${entry?.label ?? ''} ${entry?.note ?? ''} `
        + `${entry?.assessment ?? ''} ${entry?.boarding ?? ''}`
    return [{
      sortValue: year != null ? year + 4 : age!,
      value: year != null ? `Year ${year}` : `${age}+`,
      boarding: entry?.boarding === true || /boarding|board\b/i.test(text),
    }]
  })
  if (entries.length === 0) return null
  const boardingEntries = entries.filter(item => item.boarding)
  if (boardingEntries.length === 0 && isBoardingSchool !== true) return null
  const candidates = boardingEntries.length > 0 ? boardingEntries : entries
  const chosen = candidates.sort((a, b) => a.sortValue - b.sortValue)[0]
  return { value: chosen.value, evidence_kind: 'nana_database' }
}

function universityDestinationsCell(structured: Record<string, unknown>): DirectComparisonCell | null {
  const destinations = record(structured.university_destinations)
  const universities = array(
    destinations?.top_universities
      ?? destinations?.universities
      ?? destinations?.destinations,
  ).flatMap(item => {
    const destination = record(item)
    const name = typeof item === 'string'
      ? item
      : destination?.name ?? destination?.university ?? destination?.label
    const clean = cleanText(name, 40)
    return clean ? [clean] : []
  })
  if (universities.length > 0) {
    const value = joinValuesWithinLimit(universities.slice(0, 3))
    return value ? { value, evidence_kind: 'nana_database' } : null
  }
  const summary = cleanText(destinations?.summary ?? destinations?.headline, MAX_VALUE_LENGTH)
  return summary ? { value: summary, evidence_kind: 'nana_database' } : null
}

function sportsOpportunitiesCell(structured: Record<string, unknown>): DirectComparisonCell | null {
  const sports = record(structured.sports_profile)
  const values = [
    ...array(sports?.signature_sports),
    ...array(sports?.sports),
    ...array(sports?.facilities),
    ...array(sports?.teams_by_sport),
  ].flatMap(item => {
    const sport = record(item)
    const value = typeof item === 'string'
      ? item
      : sport?.sport ?? sport?.name ?? sport?.label ?? sport?.facility
    const clean = cleanText(value, 35)
    return clean ? [clean] : []
  })
  const value = joinValuesWithinLimit(Array.from(new Set(values)).slice(0, 4))
  return value ? { value, evidence_kind: 'nana_database' } : null
}

type VerifiedFootballProfile = {
  football: Record<string, unknown>
  source: string
  checkedAt?: string
}

function verifiedFootballProfile(
  structured: Record<string, unknown>,
): VerifiedFootballProfile | null {
  const sports = record(structured.sports_profile)
  const football = record(sports?.football)
  if (!football || football.not_found === true) return null

  // Failed extractor quality gates are retained in the raw JSON for later
  // repair, so publication must independently enforce the evidence threshold.
  const evidenceUrls = Array.from(new Set(
    array(football.evidence_urls).flatMap(value => {
      const url = safeHttpsUrl(value)
      return url ? [url] : []
    }),
  ))
  if (evidenceUrls.length < 2 || !cleanText(football.notes, MAX_NOTE_LENGTH)) return null

  return {
    football,
    source: evidenceUrls[0],
    checkedAt: cleanText(football.extracted_at, 40) ?? undefined,
  }
}

function footballTeamsVisible(football: Record<string, unknown>): number | null {
  const teams = record(football.school_teams_visible)
  const count = finiteNumber(teams?.value ?? football.school_teams_visible)
  return count != null && count >= 0 ? Math.round(count) : null
}

function footballFieldSource(
  football: Record<string, unknown>,
  fallback: string,
): string {
  const teams = record(football.school_teams_visible)
  const evidence = record(teams?.evidence)
  return safeHttpsUrl(evidence?.url) ?? fallback
}

function footballStrengthCell(structured: Record<string, unknown>): DirectComparisonCell | null {
  const verified = verifiedFootballProfile(structured)
  if (!verified) return null
  const tier = cleanText(verified.football.competitive_tier, 30)?.toLowerCase()
  if (!tier || tier === 'unknown') return null

  const labels: Record<string, string> = {
    'national-elite': 'National elite',
    'national-strong': 'National strong',
    regional: 'Regional',
    local: 'Local',
    standard: 'Standard',
  }
  const value = labels[tier] ?? tier.replace(
    /(^|-)([a-z])/g,
    (_match, prefix, letter) => `${prefix === '-' ? ' ' : ''}${letter.toUpperCase()}`,
  )
  const note = cleanText(verified.football.competitive_tier_reasoning, MAX_NOTE_LENGTH)

  return {
    value,
    note: note ?? undefined,
    source: verified.source,
    checked_at: verified.checkedAt,
    evidence_kind: 'nana_database',
  }
}

function footballOpportunitiesCell(structured: Record<string, unknown>): DirectComparisonCell | null {
  const verified = verifiedFootballProfile(structured)
  if (!verified) return null
  const programme = cleanText(verified.football.programme_classification, MAX_VALUE_LENGTH)
  const teams = footballTeamsVisible(verified.football)
  if (!programme && teams == null) return null

  return {
    value: programme ?? `${teams} ${teams === 1 ? 'team' : 'teams'} visible`,
    note: programme && teams != null
      ? `${teams} ${teams === 1 ? 'team' : 'teams'} visible`
      : undefined,
    source: footballFieldSource(verified.football, verified.source),
    checked_at: verified.checkedAt,
    evidence_kind: 'nana_database',
  }
}

function footballDevelopmentCell(structured: Record<string, unknown>): DirectComparisonCell | null {
  const verified = verifiedFootballProfile(structured)
  if (!verified) return null
  const headCoach = record(verified.football.head_coach)
  const headCoachName = cleanText(headCoach?.name, 50)
  const coachingCount = array(verified.football.coaching_staff).length
  const academy = verified.football.academy_scholarship === true
  const academyNotes = cleanText(verified.football.academy_scholarship_notes, MAX_NOTE_LENGTH)
  if (!headCoachName && coachingCount === 0 && !academy && !academyNotes) return null

  let value = 'Player pathway published'
  if (academy) value = 'Academy or scholarship pathway'
  else if (headCoachName) value = `Head coach: ${headCoachName}`
  else if (coachingCount > 0) {
    value = `${coachingCount} ${coachingCount === 1 ? 'coach' : 'coaches'} listed`
  }

  return {
    value,
    note: academyNotes ?? (
      academy && headCoachName
        ? `Head coach: ${headCoachName}`
        : undefined
    ),
    source: verified.source,
    checked_at: verified.checkedAt,
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

  if (/\b(boarding fee|boarding fees|boarding cost|residential fee|boarding tuition)\b/.test(query)) {
    return feeRowCell(structured, true) ?? (() => {
      if (school.boarding !== true) return null
      const amount = finiteNumber(structured.fees_max ?? structured.fees_min)
      return amount == null
        ? null
        : {
            value: moneyValue(amount, structured.fees_currency),
            note: 'Highest annual fee on file',
            evidence_kind: 'nana_database' as const,
          }
    })()
  }

  if (/\b(registration fee|application fee|joining fee|registration cost|application cost)\b/.test(query)) {
    return registrationFeeCell(structured)
  }

  if (/\b(lowest boarding entry|earliest boarding entry|youngest boarding|boarding start)\b/.test(query)) {
    return boardingEntryCell(structured, school.boarding)
  }

  if (/\b(university destinations?|leavers destinations?|university placements?|oxbridge placements?)\b/.test(query)) {
    return universityDestinationsCell(structured)
  }

  if (
    /\bfootball competitive level and results\b/.test(query)
    || /\bfootball strength and achievements\b/.test(query)
  ) {
    return footballStrengthCell(structured)
  }

  if (
    /\bfootball teams and playing opportunities\b/.test(query)
    || /\bfootball opportunities and programme depth\b/.test(query)
  ) {
    return footballOpportunitiesCell(structured)
  }

  if (
    /\bfootball coaching and elite pathway\b/.test(query)
    || /\bfootball coaching and player pathway\b/.test(query)
  ) {
    return footballDevelopmentCell(structured)
  }

  if (/\b(sports? opportunit(?:y|ies)?|sports? programme|sports? facilit(?:y|ies)|teams and activities)\b/.test(query)) {
    return sportsOpportunitiesCell(structured)
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
