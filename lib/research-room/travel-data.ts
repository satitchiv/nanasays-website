export type HeathrowTravelValue = {
  value: string
  note?: string
}

export type ResolvedHeathrowTravel = HeathrowTravelValue & {
  source: 'location_profile' | 'schools.distance_airport'
}

export function heathrowTravelFromAirports(
  value: unknown,
): HeathrowTravelValue | null {
  for (const raw of Array.isArray(value) ? value : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const airport = raw as Record<string, unknown>
    const name = String(airport.name ?? airport.label ?? airport.code ?? '')
    if (!/\b(heathrow|lhr)\b/i.test(name)) continue
    const exact = airport.minutes
      ?? airport.travel_minutes
      ?? airport.drive_minutes
      ?? airport.duration_minutes
    if (typeof exact === 'number' && exact > 0) {
      return { value: `${exact} min` }
    }
    if (typeof exact === 'string' && exact.trim()) {
      return { value: exact.trim() }
    }
    const estimate = airport.drive_time_min_estimate
    if (typeof estimate === 'number' && estimate > 0) {
      return {
        value: `~${Math.round(estimate)} min`,
        note: 'Estimated drive time',
      }
    }
    if (typeof estimate === 'string' && estimate.trim()) {
      return {
        value: `~${estimate.trim()}`,
        note: 'Estimated drive time',
      }
    }
  }
  return null
}

export function heathrowTravelFromText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const segment = value
    .split(';')
    .map(part => part.trim())
    .find(part => /\b(heathrow|lhr)\b/i.test(part))
  if (!segment) return null
  const duration = segment.match(
    /\b(\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)(?:\s+\d+\s*(?:minutes?|mins?))?)\b/i,
  )?.[1]
  return duration?.replace(/\bhrs?\b/i, 'hours').replace(/\bmins?\b/i, 'minutes') ?? null
}

export function resolveHeathrowTravel(
  airports: unknown,
  distanceAirport: unknown,
): ResolvedHeathrowTravel | null {
  const airportTravel = heathrowTravelFromAirports(airports)
  if (airportTravel && !airportTravel.note) {
    return { ...airportTravel, source: 'location_profile' }
  }
  const explicitText = heathrowTravelFromText(distanceAirport)
  if (explicitText) {
    return {
      value: explicitText,
      source: 'schools.distance_airport',
    }
  }
  return airportTravel
    ? { ...airportTravel, source: 'location_profile' }
    : null
}
