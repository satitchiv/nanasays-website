/**
 * computeDossierStats — per-school volume metrics for the Deep Research
 * overview card (pages / tables / words / sources).
 *
 * Derived from real data in school_structured_data + school_sensitive so each
 * school's stats reflect how much analysis actually exists for it. Not a
 * precise page count — a credibility signal sized to the data.
 */

export type DossierStats = {
  pages: number
  tables: number
  words: number
  sources: number
}

function countWords(value: unknown, acc: { n: number }): void {
  if (typeof value === 'string') {
    // Only count meaningful strings (skip URLs, ids, slugs)
    if (value.length > 20 && !/^https?:\/\//.test(value) && !/^[a-f0-9-]{8,}$/i.test(value)) {
      acc.n += value.split(/\s+/).filter(w => w.length > 2).length
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach(v => countWords(v, acc))
    return
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(v => countWords(v, acc))
  }
}

function extractSourceUrls(value: unknown, sources: Set<string>): void {
  if (!value) return
  if (Array.isArray(value)) {
    value.forEach(v => extractSourceUrls(v, sources))
    return
  }
  if (typeof value !== 'object') return
  const obj = value as Record<string, unknown>
  for (const [k, v] of Object.entries(obj)) {
    if ((k === 'source_url' || k === 'url' || k === 'reportUrl') && typeof v === 'string' && /^https?:\/\//.test(v)) {
      sources.add(v)
    } else if ((k === 'source_urls' || k === 'sources') && Array.isArray(v)) {
      v.forEach(u => {
        if (typeof u === 'string' && /^https?:\/\//.test(u)) sources.add(u)
      })
    } else {
      extractSourceUrls(v, sources)
    }
  }
}

export function computeDossierStats(structured: unknown, sensitive: unknown[] = []): DossierStats {
  const wordAcc = { n: 0 }
  countWords(structured, wordAcc)
  sensitive.forEach(row => {
    if (row && typeof row === 'object') countWords((row as Record<string, unknown>).details, wordAcc)
  })
  const words = wordAcc.n

  // Tables: count structured sub-sections that render as a table or grid
  const s = (structured ?? {}) as Record<string, any>
  let tables = 0
  if (s.university_destinations?.top_universities?.length) tables++
  if (s.exam_results?.gcse) tables++
  if (s.exam_results?.a_level || s.exam_results?.ib) tables++
  if (s.sports_profile?.sport_categories) tables++
  if (s.sports_profile?.coaching_staff?.length) tables++
  if (s.sports_profile?.competitions_entered?.length) tables++
  if (s.sports_profile?.teams_by_sport?.length) tables++
  if (s.student_community?.nationalities || s.student_community) tables++
  if (s.wellbeing_staffing?.team?.length) tables++
  if (s.fees_by_grade) tables++
  if (s.admissions_format) tables++
  if (s.scholarships_available) tables++
  if (s.location_profile) tables++

  // Sensitive (regulatory) tables
  const hasSource = (name: string) => sensitive.some((r: any) => r?.source === name)
  if (hasSource('charity_commission')) tables += 2 // financial + charity meta
  if (hasSource('isi')) tables++
  if (hasSource('companies_house')) tables++
  if (hasSource('dfe_prohibition')) tables++

  // Sources — unique URLs pulled from everywhere
  const sources = new Set<string>()
  extractSourceUrls(structured, sources)
  sensitive.forEach((row: any) => {
    if (row?.source_url) sources.add(row.source_url)
    extractSourceUrls(row?.details, sources)
  })

  // Pages — PDF estimate. Baseline 15 covers the 22-section TOC skeleton
  // (short sections still take ~0.5 page each). Content-rich schools scale up
  // from there via words (1p per ~500 narrative words) and tables (0.8p each).
  const pages = 15 + Math.ceil(words / 500) + Math.ceil(tables * 0.8)

  return {
    pages,
    tables,
    words: Math.round(words / 100) * 100,
    sources: sources.size,
  }
}
