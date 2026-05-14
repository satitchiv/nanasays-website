// Slice 8 Build 2 r2 — shared UK region buckets.
//
// Source of truth for "which schools.region values belong in each
// home_region enum bucket." Consumed by:
//   1. lib/recommend-shortlist.ts  — filters candidates by region
//   2. lib/research-room/brief-predicates.ts — match-reasons "X region" + brief seeds
//
// Codex r2 P2 #5: previously the recommender and brief-predicates each had
// their own region map and were drifting apart (e.g. 'North Somerset' was
// south-west in the recommender but unmapped in brief-predicates). Pulling
// both into this module guarantees they stay in lock-step.
//
// home_region enum values from onboarding-fields.ts:29 (7 buckets total).

export type HomeRegion =
  | 'london'
  | 'south-east'
  | 'south-west'
  | 'midlands'
  | 'north'
  | 'scotland-wales'
  | 'overseas'

export const REGION_BUCKETS: Record<HomeRegion, readonly string[]> = {
  london: [
    'London', 'Greater London',
    'Hammersmith', 'Brook Green', 'South Kensington',
    'Royal Borough of Kensington and Chelsea',
    'Notting Hill, Royal Borough of Kensington and Chelsea',
    'Marylebone, Central London',
    'North West London, Camden',
    'Wimbledon', 'Wandsworth', 'Battersea',
    'Richmond', 'Barnes and Kew', 'Bromley', 'Kentish Town', 'E10',
  ],
  'south-east': [
    'Berkshire', 'West Berkshire', 'Buckinghamshire',
    'Hampshire', 'Hertfordshire',
    'Kent', 'Kent/Sussex borders', 'Dartford',
    'Surrey', 'East Sussex', 'West Sussex',
    'Oxfordshire', 'South Oxfordshire',
    'Bedfordshire', 'Middlesex', 'Essex', 'Isle of Wight',
  ],
  'south-west': [
    'Bristol', 'Cornwall', 'Devon', 'Dorset',
    'Gloucestershire', 'Somerset', 'North Somerset', 'Wiltshire',
  ],
  midlands: [
    'Derbyshire', 'Herefordshire', 'Leicestershire', 'Lincolnshire',
    'Northamptonshire', 'Nottinghamshire', 'Rutland',
    'Shropshire', 'Staffordshire', 'South Staffordshire',
    'Warwickshire', 'West Midlands', 'Worcestershire',
  ],
  north: [
    'Cheshire', 'Cumbria', 'County Durham', 'Greater Manchester',
    'Lancashire', 'Merseyside', 'Northumberland',
    'East Yorkshire', 'North Yorkshire', 'West Yorkshire', 'Yorkshire',
  ],
  'scotland-wales': [
    'Scotland', 'Wales', 'Northern Ireland',
    'Angus', 'Argyll and Bute', 'Clackmannanshire', 'East Lothian',
    'Fife', 'Moray', 'Perthshire', 'Stirling',
    'Carmarthenshire', 'Conwy', 'Denbighshire', 'Monmouthshire',
    'Powys', 'South Wales', 'Vale of Glamorgan',
    'Co Down', 'County Tyrone',
  ],
  overseas: [],
}

// Pre-built lowercase Set for fast case-insensitive membership tests.
const ALIAS_SETS: Record<HomeRegion, ReadonlySet<string>> = (() => {
  const out = {} as Record<HomeRegion, ReadonlySet<string>>
  for (const [bucket, list] of Object.entries(REGION_BUCKETS) as [HomeRegion, readonly string[]][]) {
    out[bucket] = new Set(list.map(s => s.toLowerCase().trim()))
  }
  return out
})()

/**
 * Returns true when schools.region falls in the bucket for the given
 * home_region enum value. Case-insensitive on both sides, exact match
 * required (no substring containment — that caused the 'north' false-
 * positive on 'North Somerset' fixed in Build 2 r1).
 */
export function regionInBucket(
  homeRegion: string | null | undefined,
  schoolRegion: string | null | undefined,
): boolean {
  if (!homeRegion || !schoolRegion) return false
  const aliases = ALIAS_SETS[homeRegion.toLowerCase().trim() as HomeRegion]
  if (!aliases) return false
  return aliases.has(schoolRegion.toLowerCase().trim())
}
