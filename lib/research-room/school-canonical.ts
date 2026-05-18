// Pure helpers + DB-passive loader (takes a client, does not construct
// one). The DB-constructing canonicalizeSlug() lives in
// school-canonical-server.ts because it imports supabase-admin which is
// 'server-only' — keeping this file pure means tests can run under
// plain node without the Next path alias.
import type { SupabaseClient } from '@supabase/supabase-js'

// 2026-05-18 — extracted from SchoolAdder.tsx browser-side picker after
// Codex deep-investigation flagged 8 distinct bugs in the in-browser flow.
// Most material: school_structured_data is RLS-locked from anon, so the
// browser richness query silently returned permission_denied, leaving the
// `-uk wins` tiebreaker to pick the data-poor twin for ~79 duplicate-name
// UK school groups (CLC, Reed's, Wellington, Kings College Taunton, …).
//
// This module runs server-side with the service-role client. It powers
// two callers:
//   • /api/research-room/search-schools — popup search results.
//   • /api/research-room/shortlist (action:add) — canonicalize-on-write
//     as belt-and-braces against programmatic / legacy callers. The
//     Build Mode propose→confirm path (write-action) does NOT route
//     through here — tracked as a separate followup in TASKS.md.
//
// The `-uk wins` heuristic from the old browser picker has been DROPPED:
// Reed's School has the rich data on the `-uk` slug while CLC has it on
// the bare slug, so the suffix is not a reliable signal. Richness alone
// drives canonicalization.

export type Hit = {
  slug:    string
  name:    string
  region:  string | null
  country: string | null
}

export type Group = { name: string; primary: Hit; alternates: Hit[] }

// Richness map: slug → integer score 0..10. Higher = more populated
// downstream fields actually used by the comparison-table cell builders.
// Includes school_notion_backfill so Notion-only schools score above 0.
//
// Codex r1 P1: original draft selected a non-existent top-level
// `boarding_pct` column; the entire structured query would have errored
// and the catch path returned an empty Map, silently reproducing the
// original picker bug. Column list now matches the live schema
// (verified 2026-05-18 via information_schema) and the signal list is
// aligned with Codex's recommended comparison-row coverage.
export type Richness = Map<string, number>

// Sentinel thrown when any richness query errored AND zero slugs ended
// up with a score (see loadRichness). Search route maps this to a 5xx
// so we fail closed instead of falling back to an empty Map and
// reproducing the original `-uk wins` bug.
export class RichnessUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RichnessUnavailableError'
  }
}

// Normalise a school name for duplicate-group keying.
//   • lowercase
//   • collapse whitespace
//   • strip curly + straight apostrophes (so "Reed's" and "Reeds" group)
//   • strip ampersands / commas to fold "King Edward's, Bath" variants
export function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[,&]/g, ' ')
    .replace(/\s+/g, ' ')
}

// Load richness scores for the given candidate slugs.
//
// Codex r1 P1 #2 + Q2: column list verified against the live schema
// (2026-05-18 information_schema), and signals aligned with the cell
// builders in seed-rows.ts so a "rich" twin under richness is also the
// one rendering in the comparison table.
//
// Codex r5 P2/P3: chunked into RICHNESS_CHUNK_SIZE-slug batches because
// Supabase/PostgREST encodes `.in()` filters in the GET URL. At limit
// 500 with ~30-char slugs that's a ~15KB URL — past the 8KB default
// cap on most hosting setups. Worst-case slug length in the corpus is
// 50 chars (verified 2026-05-18: longest is
// `bangkok-international-preparatory-secondary-school` at 50). At
// 100-slug chunks that caps each URL at ~5KB plus overhead — well
// under 8KB.
//
// Throws RichnessUnavailableError whenever ANY of the two queries errored
// AND no slug ended up with a score. Codex r2 P1: the looser "both
// returned 0 rows" gate had an escape hatch (structured errors + notion
// returns rows with null parsed → notion.length > 0 → no throw, but m
// empty → original bug). Search route maps this to a 503; canonicalize
// backstop catches it and falls through to the submitted slug.
const RICHNESS_CHUNK_SIZE = 100

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function loadRichness(
  svc:   SupabaseClient,
  slugs: string[],
): Promise<Richness> {
  const m: Richness = new Map()
  if (slugs.length === 0) return m

  let anyError: { message?: string } | null = null
  const batches = chunk(slugs, RICHNESS_CHUNK_SIZE)

  // Structured-data scoring. Errors on any individual chunk are noted
  // but not fatal; we still process whatever data did come back from
  // the other chunks. RichnessUnavailableError below catches the
  // total-failure case.
  for (const batch of batches) {
    const { data: structured, error: e1 } = await svc
      .from('school_structured_data')
      .select('school_slug, sports_profile, fees_min, fees_max, fees_by_grade, facilities, university_destinations, exam_results, curriculum, admissions_format, student_community, location_profile')
      .in('school_slug', batch)
    if (e1) {
      console.warn('[school-canonical] structured richness chunk failed:', e1.message)
      anyError = e1
    }
    for (const row of (structured ?? []) as Array<{
      school_slug:             string
      sports_profile:          unknown
      fees_min:                number | null
      fees_max:                number | null
      fees_by_grade:           unknown
      facilities:              unknown[] | null
      university_destinations: unknown
      exam_results:            unknown
      curriculum:              unknown[] | null
      admissions_format:       unknown
      student_community:       unknown
      location_profile:        unknown
    }>) {
      let score = 0
      if (row.sports_profile != null)                                         score++
      // Any fees field counts once — three slots smear the signal otherwise.
      if (row.fees_min != null || row.fees_max != null || row.fees_by_grade != null) score++
      if (Array.isArray(row.facilities) && row.facilities.length > 0)         score++
      if (row.university_destinations != null)                                score++
      if (row.exam_results != null)                                           score++
      if (Array.isArray(row.curriculum) && row.curriculum.length > 0)         score++
      if (row.admissions_format != null)                                      score++
      if (row.student_community != null)                                      score++
      if (row.location_profile != null)                                       score++
      m.set(row.school_slug, score)
    }
  }

  // Notion sidecar bonus. Same chunking.
  for (const batch of batches) {
    const { data: notion, error: e2 } = await svc
      .from('school_notion_backfill')
      .select('school_slug, parsed')
      .in('school_slug', batch)
    if (e2) {
      console.warn('[school-canonical] notion richness chunk failed:', e2.message)
      anyError = e2
    }
    for (const row of (notion ?? []) as Array<{ school_slug: string; parsed: Record<string, unknown> | null }>) {
      if (row.parsed && typeof row.parsed === 'object' && Object.keys(row.parsed).length > 0) {
        m.set(row.school_slug, (m.get(row.school_slug) ?? 0) + 1)
      }
    }
  }

  if (m.size === 0 && anyError) {
    throw new RichnessUnavailableError(
      `richness queries failed for ${slugs.length} slug(s): ${anyError.message ?? ''}`.trim(),
    )
  }

  return m
}

// Pick the canonical record from a duplicate-name group.
//
// Codex 2026-05-18 deep review:
//   • Richness dominates — handles Reed's (`-uk` is rich) AND CLC (bare slug is rich).
//   • Country-populated next — purely metadata; covers ties between two empty rows.
//   • Lexical slug last — deterministic, no semantic claim.
// The `-uk` suffix heuristic has been REMOVED (was unsafe).
export function pickPrimary(entries: Hit[], richness: Richness): Hit {
  if (entries.length === 1) return entries[0]
  const sorted = [...entries].sort((a, b) => {
    const ra = richness.get(a.slug) ?? 0
    const rb = richness.get(b.slug) ?? 0
    if (ra !== rb) return rb - ra
    const ca = a.country ? 1 : 0
    const cb = b.country ? 1 : 0
    if (ca !== cb) return cb - ca
    return a.slug.localeCompare(b.slug)
  })
  return sorted[0]
}

export function groupByName(hits: Hit[], richness: Richness): Group[] {
  const map = new Map<string, Hit[]>()
  for (const h of hits) {
    const key = normName(h.name)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(h)
  }
  const groups: Group[] = []
  // Iterate in insertion order so the caller's name-asc SQL ordering is preserved.
  Array.from(map.values()).forEach((entries: Hit[]) => {
    const primary = pickPrimary(entries, richness)
    const alternates = entries
      .filter((e: Hit) => e.slug !== primary.slug)
      .sort((a: Hit, b: Hit) => (richness.get(b.slug) ?? 0) - (richness.get(a.slug) ?? 0))
    groups.push({ name: primary.name, primary, alternates })
  })
  return groups
}

// Swap only fires when there is a clear richer twin (gap >= this value).
// Lives here so both the pure tests and the server wrapper can see it.
export const MIN_RICHNESS_GAP_FOR_SWAP = 2

// Expand a search query into apostrophe-aware variants. Users type
// "kings" or "kings college" without the apostrophe, but
// `name ILIKE '%kings%'` doesn't match "King's College" (apostrophe
// between g and s breaks the substring). For the common possessive
// pattern, also try a variant with an apostrophe inserted before the
// trailing `s` of any whitespace-bounded token:
//   "kings"         → ["kings", "king's"]
//   "kings college" → ["kings college", "king's college"]
//   "saint marys school" → ["saint marys school", "saint mary's school"]
//   "eton"          → ["eton"]                  (no trailing-s token)
//   "king's"        → ["king's"]                (already apostrophic)
//
// Search route runs one Postgrest query per variant in parallel and
// unions+dedupes by slug. The grouping logic already collapses
// "King's College" and "Kings College" if both existed via normName.
//
// Codex r7 P2: per-token instead of whole-query — typing "kings c"
// or "kings college" used to lose the variant. Now each token that
// looks possessive gets independently expanded; the first such token
// produces the variant query (we cap at the FIRST possessive token to
// avoid combinatorial explosion on long queries — multi-token possessive
// queries like "kings boys" → "king's boys" still work because the
// first `s`-ending token of length >= 3 is expanded).
//
// Heuristic — only the trailing-s possessive case per token. Anything
// else (em-dashes, ampersands, commas, mid-word apostrophes) is
// untouched. A migration-backed normalized column would handle all
// punctuation; tracked separately in TASKS.
export function expandApostropheVariants(q: string): string[] {
  if (!q) return [q]
  if (/['’]/.test(q)) return [q]
  const tokens = q.split(/(\s+)/)  // keep whitespace separators for re-join
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (/\s/.test(t)) continue
    if (t.length >= 3 && /s$/i.test(t)) {
      const replaced = tokens.slice()
      replaced[i] = t.slice(0, -1) + "'" + t.slice(-1)
      return [q, replaced.join('')]
    }
  }
  return [q]
}

// Rank groups for display. With 25,000+ UK schools in the table, a
// short substring query like "eton" matches 95+ schools (Alfreton,
// Appleton, Carleton, …) and "Eton College" buries ~30 rows deep
// alphabetically. Plain name-asc ordering gives the 8 visible slots
// to state primaries the parent never wants to see.
//
// Ranking key (high → low):
//   1. PREFIX MATCH — group name (normalized) starts with the query
//      (normalized). Normalization strips apostrophes/commas/ampersands
//      so "kings" prefix-matches "King's College School Wimbledon".
//   2. MAX RICHNESS in the group — favours independents we have data
//      for over state schools we don't.
//   3. NAME ASC (localeCompare) — deterministic tiebreaker.
//
// Pure function. Query is trimmed, lowercased, and stripped of control
// bytes before prefix-matching so the helper defends its own ranking
// semantics regardless of caller hygiene (Codex r5 #4).
//
// Codex r7 P1: prefix-match now goes through normName so "King's …"
// shares the prefix tier with "Kingswood …" for query "kings".
// Previously rich `King's College` got demoted to substring tier and
// lost to richness-0 `Kings Ash Academy`.
export function rankGroups(groups: Group[], query: string, richness: Richness): Group[] {
  // eslint-disable-next-line no-control-regex
  const cleaned = query.replace(/[\x00-\x1f\x7f]/g, '').trim()
  // Use normName on both sides so apostrophes/commas/ampersands don't
  // block the prefix match.
  const q = normName(cleaned)
  function maxRichness(g: Group): number {
    let m = richness.get(g.primary.slug) ?? 0
    for (const alt of g.alternates) {
      const r = richness.get(alt.slug) ?? 0
      if (r > m) m = r
    }
    return m
  }
  function prefixMatch(g: Group): boolean {
    return normName(g.name).startsWith(q)
  }
  return [...groups].sort((a, b) => {
    const pa = prefixMatch(a) ? 1 : 0
    const pb = prefixMatch(b) ? 1 : 0
    if (pa !== pb) return pb - pa
    const ra = maxRichness(a)
    const rb = maxRichness(b)
    if (ra !== rb) return rb - ra
    return a.name.localeCompare(b.name)
  })
}
