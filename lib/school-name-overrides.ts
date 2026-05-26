import 'server-only'

// Shared school-name normalization + boarding/day classification +
// single-sex override layer.
//
// Why shared: the recommender (lib/recommend-shortlist.ts) and the
// comparison-table data mapper (lib/research-comparison.ts) both need
// to classify schools as full-boarding vs day-only. Codex flagged the
// drift risk of keeping these inlined twice.
//
// Why name-based (not slug-based): schools.slug has duplicates in the
// source data (4 Charterhouse slugs, 2 Bradfield slugs, etc.). A
// slug-keyed list misses variants. Normalizing the human name and
// matching against canonical sets avoids that. Slug-based variants
// (KNOWN_BOYS_ONLY_SLUGS) exist as escape hatches for normalize
// collisions (UCS → "university").

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
  'warwick',
  // 2026-05-26 — added after recommender eval battery flagged P0
  // boarding_hard_filter_violated on Open persona (girl, full-boarding,
  // anywhere) where Godolphin and Latymer (London day-only girls'
  // school) surfaced in shortlist. All GDST + similar London day-only
  // girls' schools added here.
  'godolphin and latymer', 'the godolphin and latymer',
  'channing', 'francis holland', 'city of london for girls',
  'north london collegiate', 'south hampstead high', 'putney high',
  'wimbledon high', 'sutton high', 'notting hill and ealing high',
  'streatham and clapham high', 'haberdashers girls',
  'guildford high',
])

// ── Single-sex override layer ───────────────────────────────────────
//
// Defence-in-depth against wrong/NULL schools.gender_split values.
// 2026-05-26 audit found multiple famous single-sex schools mistagged
// 'co-ed' in DB (Dulwich, Westminster, Winchester, Abingdon,
// Queenswood) and Godolphin and Latymer with gender_split=NULL.
// Without this override, the recommender's gender hard-filter passes
// these schools through to wrong-gender shortlists — confirmed across
// 14 P0 instances in the recommender eval battery (5/10 personas).
//
// Architecture (Codex r1, 2026-05-26):
//   1. Name-keyed sets + slug-keyed sets — slug variant exists for
//      schools whose normalized name would collide with unrelated
//      schools (UCS Hampstead → "university").
//   2. Year-aware exemption maps — when a school in a single-sex set
//      ADMITS the opposite gender at a specific year-of-entry, the
//      exemption fires and the helper defers to the column for that
//      year. Examples: Westminster/Winchester/UCS co-ed sixth-form
//      only; Abingdon co-ed Year 7+ from Sept 2026.
//   3. `getEffectiveSchoolGender(school, childYear)` is the single
//      source of truth. Used by Picker #1, Picker #2, AND the three
//      NONNEG_FILTERS predicates (must-be-coed, girls-only, boys-only)
//      so a wrong-tagged DB row can't slip past via the nonneg path.
//   4. `isGenderCompatible(...)` is the convenience wrapper for the
//      Picker filter boolean.

export const KNOWN_BOYS_ONLY_NAMES: ReadonlySet<string> = new Set<string>([
  'eton', 'harrow', 'winchester', 'westminster', 'dulwich',
  'tonbridge', 'radley', 'sherborne', 'st pauls', 'whitgift',
  'bedford', 'abingdon', 'hampton', 'merchant taylors',
  // Codex r1 P2 #5 (2026-05-26) — City of London School (boys 10-18,
  // independent of CLSG) + Haberdashers' Boys (separate from Habs
  // Girls on shared campus). Both boys-only at all year-of-entry
  // points the recommender exercises.
  'city of london', 'haberdashers boys',
  // 2026-05-26 — `kings canterbury` REMOVED per Codex r1 P1 #1: the
  // King's School Canterbury is co-ed Year 9-13 per admissions
  // policy. It remains in KNOWN_FULL_BOARDING_NAMES (orthogonal axis).
])

export const KNOWN_GIRLS_ONLY_NAMES: ReadonlySet<string> = new Set<string>([
  'wycombe abbey', 'cheltenham ladies', 'downe house', 'roedean',
  'benenden', 'queenswood', 'st marys ascot', 'st marys calne',
  'tudor hall', 'woldingham', 'headington', 'north london collegiate',
  'the godolphin and latymer', 'godolphin and latymer', 'godolphin',
  'st pauls girls', 'haberdashers girls', 'francis holland',
  'channing', 'city of london for girls', 'sherborne girls',
  'malvern st james', 'guildford high', 'putney high',
  'wimbledon high', 'south hampstead high', 'sutton high',
  'notting hill and ealing high', 'streatham and clapham high',
])

export const KNOWN_BOYS_ONLY_SLUGS: ReadonlySet<string> = new Set<string>([
  'university-college-school-uk',  // UCS Hampstead (collides with normalize "university")
])

export const KNOWN_GIRLS_ONLY_SLUGS: ReadonlySet<string> = new Set<string>([])

// Year-aware exemptions — when a school in a single-sex set above
// admits the opposite gender at a specific year-of-entry, list that
// year here. The helper falls back to the gender_split column for
// the school + year, so the override doesn't block legitimate
// admissions.
//
// Enum mirror — same shape as onboarding-fields.ts child_year:
//   'year-7' | 'year-9' | 'year-10' | 'sixth-form' | 'not-sure'
//
// 'not-sure' / null defer to the STRICTEST interpretation (treat as
// single-sex). Once the family confirms entry year and the exemption
// fires, the school re-enters the shortlist.
export type ChildYear = 'year-7' | 'year-9' | 'year-10' | 'sixth-form' | 'not-sure' | null

const BOYS_ONLY_NAME_YEAR_EXEMPT: ReadonlyMap<string, ReadonlySet<ChildYear>> = new Map<string, ReadonlySet<ChildYear>>([
  // Abingdon — admits girls Year 7 + Sixth Form from Sept 2026, Year 9
  // from Sept 2028 (per Abingdon's own co-education page). All three
  // exempted now so families searching ahead see legitimate co-ed
  // admissions. When those cohorts go live, schools.gender_split for
  // abingdon-school should be backfilled to 'co-ed' and the row's
  // single-sex override becomes redundant.
  ['abingdon',    new Set<ChildYear>(['year-7', 'year-9', 'sixth-form'])],
  // Westminster — co-ed sixth-form only (16+ entry).
  ['westminster', new Set<ChildYear>(['sixth-form'])],
  // Winchester — co-ed sixth-form only.
  ['winchester',  new Set<ChildYear>(['sixth-form'])],
])

const BOYS_ONLY_SLUG_YEAR_EXEMPT: ReadonlyMap<string, ReadonlySet<ChildYear>> = new Map<string, ReadonlySet<ChildYear>>([
  ['university-college-school-uk', new Set<ChildYear>(['sixth-form'])],
])

const GIRLS_ONLY_NAME_YEAR_EXEMPT: ReadonlyMap<string, ReadonlySet<ChildYear>> = new Map()
const GIRLS_ONLY_SLUG_YEAR_EXEMPT: ReadonlyMap<string, ReadonlySet<ChildYear>> = new Map()

// ── Effective-gender helpers ────────────────────────────────────────

export type EffectiveGender = 'boys-only' | 'girls-only' | 'co-ed' | 'unknown'

type SchoolGenderShape = {
  slug?:         string | null
  name?:         string | null
  gender_split?: string | null
}

function isExempt(
  exemptMap: ReadonlyMap<string, ReadonlySet<ChildYear>>,
  key:       string,
  year:      ChildYear,
): boolean {
  if (!year || year === 'not-sure') return false   // strict interpretation
  const yearsSet = exemptMap.get(key)
  return yearsSet ? yearsSet.has(year) : false
}

export function getEffectiveSchoolGender(
  school:    SchoolGenderShape,
  childYear: ChildYear = null,
): EffectiveGender {
  const normalized = normalizeSchoolName(school.name ?? '')
  const slug       = (school.slug ?? '').toLowerCase()

  // Override layer — boys-only.
  // Codex r2 P1 #1 (2026-05-26): when exemption fires, return 'co-ed'
  // explicitly. Previously fell through to column, which after the
  // 2026-05-26 gender_split backfill always says 'boys' for these
  // schools — defeating the exemption. The exemption captures the
  // school's REAL co-ed status at that year of entry (Westminster /
  // Winchester / UCS sixth-form; Abingdon Year 7+SF Sept 2026); the
  // column captures TODAY's predominant gender for ranker scoring.
  // Both are valid view-points; effective-gender for THIS year of
  // entry must trust the exemption.
  const isBoysOnlyByName = KNOWN_BOYS_ONLY_NAMES.has(normalized)
  const isBoysOnlyBySlug = KNOWN_BOYS_ONLY_SLUGS.has(slug)
  if (isBoysOnlyByName || isBoysOnlyBySlug) {
    const exempted =
      (isBoysOnlyByName && isExempt(BOYS_ONLY_NAME_YEAR_EXEMPT, normalized, childYear)) ||
      (isBoysOnlyBySlug && isExempt(BOYS_ONLY_SLUG_YEAR_EXEMPT, slug,       childYear))
    return exempted ? 'co-ed' : 'boys-only'
  }

  // Override layer — girls-only (same exemption pattern).
  const isGirlsOnlyByName = KNOWN_GIRLS_ONLY_NAMES.has(normalized)
  const isGirlsOnlyBySlug = KNOWN_GIRLS_ONLY_SLUGS.has(slug)
  if (isGirlsOnlyByName || isGirlsOnlyBySlug) {
    const exempted =
      (isGirlsOnlyByName && isExempt(GIRLS_ONLY_NAME_YEAR_EXEMPT, normalized, childYear)) ||
      (isGirlsOnlyBySlug && isExempt(GIRLS_ONLY_SLUG_YEAR_EXEMPT, slug,       childYear))
    return exempted ? 'co-ed' : 'girls-only'
  }

  // Column fallback (no override matched). NULL → 'unknown' (callers
  // decide whether unknown passes or fails — default is to pass, NOT
  // penalise schools with missing data).
  const g = (school.gender_split ?? '').trim().toLowerCase()
  if (!g) return 'unknown'
  if (/co-?ed|coed|mixed/.test(g)) return 'co-ed'
  if (/girls/.test(g))             return 'girls-only'
  if (/boys/.test(g))              return 'boys-only'
  return 'unknown'
}

export function isGenderCompatible(
  school:      SchoolGenderShape,
  childGender: 'boy' | 'girl' | null | undefined,
  childYear:   ChildYear = null,
): boolean {
  if (!childGender) return true
  const eff = getEffectiveSchoolGender(school, childYear)
  if (eff === 'unknown' || eff === 'co-ed') return true
  if (childGender === 'girl' && eff === 'boys-only')  return false
  if (childGender === 'boy'  && eff === 'girls-only') return false
  return true
}

// ── Misc ────────────────────────────────────────────────────────────

// Defensive UUID check — server-side helpers accept an arbitrary
// userId plus a service-role client, so a missing/blank value would
// silently leak. Throw early with a clear message instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertUserId(userId: unknown, fnName: string): asserts userId is string {
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    throw new Error(`${fnName}: expected uuid userId, got ${typeof userId === 'string' ? `"${userId}"` : typeof userId}`)
  }
}
