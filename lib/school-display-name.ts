export type SchoolDisplayNameRow = {
  slug?: string | null
  name?: string | null
  city?: string | null
  region?: string | null
  country?: string | null
}

const GENERIC_REGIONS = new Set([
  'england',
  'scotland',
  'wales',
  'northern ireland',
  'united kingdom',
  'uk',
  'great britain',
])

function clean(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim()
  return trimmed || null
}

export function normaliseSchoolNameTokens(name: string | null | undefined): string[] {
  const raw = clean(name)
  if (!raw) return []

  return raw
    .toLowerCase()
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bst\./g, 'st')
    .replace(/['’]s\b/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .filter((token, index) => !(index === 0 && token === 'the'))
}

export function schoolNamePrefixKey(name: string | null | undefined): string | null {
  const tokens = normaliseSchoolNameTokens(name)
  if (!tokens.length) return null
  if ((tokens[0] === 'st' || tokens[0] === 'saint') && tokens[1]) {
    return `st ${tokens[1]}`
  }
  return tokens[0]
}

export function schoolNameSearchPrefix(name: string | null | undefined): string | null {
  const cleaned = clean(name)
  if (!cleaned) return null
  // Codex r2 P2-3 + r3 Q5: skip a leading "The" so "The King's School" searches
  // "King's%", matching the leading-article strip in normaliseSchoolNameTokens.
  // Bare "The" alone returns null — no useful prefix to search by.
  const words = cleaned.split(/\s+/)
  if (words.length === 1 && words[0]?.toLowerCase() === 'the') return null
  const idx = words[0]?.toLowerCase() === 'the' && words.length > 1 ? 1 : 0
  const first = words[idx]
  if (!first) return null
  return first.replace(/[%_]/g, '')
}

export function schoolLocalityLabel(school: SchoolDisplayNameRow): string | null {
  const region = clean(school.region)
  const city = clean(school.city)
  const specificRegion = region && !GENERIC_REGIONS.has(region.toLowerCase()) ? region : null

  if (specificRegion) return specificRegion
  if (city) return city

  const slug = clean(school.slug)?.toLowerCase() ?? ''
  const name = clean(school.name)?.toLowerCase() ?? ''
  if (slug.split('-').includes('london') || /\blondon\b/.test(name)) return 'London'

  return null
}

export function hasSchoolNamePrefixCollision(
  school: SchoolDisplayNameRow,
  peers: SchoolDisplayNameRow[],
): boolean {
  const key = schoolNamePrefixKey(school.name)
  if (!key) return false
  const ownSlug = clean(school.slug)

  return peers.some(peer => {
    if (!peer?.name) return false
    if (ownSlug && clean(peer.slug) === ownSlug) return false
    return schoolNamePrefixKey(peer.name) === key
  })
}

export function disambiguateSchoolDisplayName(
  school: SchoolDisplayNameRow,
  peers: SchoolDisplayNameRow[],
): string {
  const name = clean(school.name) ?? 'this school'
  if (!hasSchoolNamePrefixCollision(school, peers)) return name

  const locality = schoolLocalityLabel(school)
  return locality ? `${name} — ${locality}` : name
}
