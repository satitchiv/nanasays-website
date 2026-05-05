import 'server-only'

// Shared school-name normalization + boarding/day classification.
//
// Why shared: the recommender (lib/recommend-shortlist.ts) and the
// comparison-table data mapper (lib/research-comparison.ts) both need
// to classify schools as full-boarding vs day-only. Codex flagged the
// drift risk of keeping these inlined twice.
//
// Why name-based (not slug-based): schools.slug has duplicates in the
// source data (4 Charterhouse slugs, 2 Bradfield slugs, etc.). A
// slug-keyed list misses variants. Normalizing the human name and
// matching against canonical sets avoids that.

export function normalizeSchoolName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/['‘’]/g, '')              // apostrophes (ASCII + curly)
    .replace(/[^a-z0-9 ]/g, ' ')        // other punct → space
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(school|college)\b/g, '') // strip suffixes
    .replace(/\s+/g, ' ')
    .trim()
}

export const KNOWN_FULL_BOARDING_NAMES: ReadonlySet<string> = new Set<string>([
  'eton', 'harrow', 'winchester', 'rugby', 'tonbridge',
  'sherborne', 'sherborne girls', 'marlborough', 'repton',
  'uppingham', 'oundle', 'stowe', 'radley', 'wellington',
  'bradfield', 'bedales', 'cheltenham', 'cheltenham ladies',
  'clifton', 'cranleigh', 'lancing', 'roedean', 'wycombe abbey',
  'st marys ascot', 'st marys calne', 'benenden', 'downe house',
  'queenswood', 'tudor hall', 'woldingham', 'headington',
  'malvern', 'malvern st james', 'bromsgrove', 'worth',
  'stonyhurst', 'ampleforth', 'sedbergh', 'pocklington',
  'queen ethelburgas collegiate', 'rossall', 'oakham',
  'ellesmere', 'concord', 'gordonstoun', 'loretto', 'fettes',
  'glenalmond', 'merchiston castle', 'strathallan', 'millfield',
  'shrewsbury', 'sevenoaks', 'felsted', 'kings canterbury',
  'kings ely', 'st edwards oxford', 'leys', 'kent canterbury',
  'kings taunton', 'taunton', 'monkton combe', 'mount kelly',
  'kingswood bath', 'wells cathedral', 'dauntseys', 'canford',
  'bryanston', 'eastbourne', 'ardingly', 'hurstpierpoint',
  'caterham', 'shiplake', 'reeds', 'reading blue coat',
  'mill hill foundation', 'st leonards', 'st edmunds canterbury',
  'denstone', 'milton abbey', 'haileybury',
  'charterhouse', 'bishops stortford', 'hurtwood house',
  'queen annes', 'queen annes caversham',
])

export const KNOWN_DAY_ONLY_NAMES: ReadonlySet<string> = new Set<string>([
  'westminster', 'st pauls', 'st pauls girls', 'dulwich',
  'highgate', 'alleyns', 'kings wimbledon', 'haberdashers boys',
  'city of london', 'whitgift', 'jeannine manuel', 'dwight london',
])

// Defensive UUID check — server-side helpers accept an arbitrary
// userId plus a service-role client, so a missing/blank value would
// silently leak. Throw early with a clear message instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertUserId(userId: unknown, fnName: string): asserts userId is string {
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    throw new Error(`${fnName}: expected uuid userId, got ${typeof userId === 'string' ? `"${userId}"` : typeof userId}`)
  }
}
