// T4.18 — heuristic row_name → projection-field formatters.
//
// Used by topic-lens-projector-fill.ts to fill null cells in
// propose_create_topic_lens proposals when Nana's Pass-1 prose didn't
// feature a school but its school_fact_projections has data.
//
// Codex-blessed design 2026-05-08 (transcript: /tmp/codex-t418-design-result.txt).
//
// Rules:
//   - Rugby-only today; other dimensions return null (extend KNOWN_PROJECTION_VERSIONS).
//   - Rules ordered MOST-SPECIFIC FIRST so 'rugby tier' matches the tier rule
//     before any broader 'rugby' catch-all.
//   - Returns null on (a) unmatched row_name, (b) projection field missing,
//     (c) subfield null. Caller falls through to existing { value: null }.
//   - Per Codex: never emit a "see source" placeholder without a real value.

const HTTPS_URL_RE = /^https:\/\//

export type CellOut = { value: string; source?: string }

/** Capitalise first character; preserve rest (e.g. 'national-elite' → 'National-elite'). */
function capitalize(s: string): string {
  if (!s) return s
  return s[0].toUpperCase() + s.slice(1)
}

/** Pick the first valid HTTPS URL from evidence_urls, or undefined. */
function pickEvidenceUrl(projection: Record<string, any>): string | undefined {
  const urls = Array.isArray(projection?.evidence_urls) ? projection.evidence_urls : []
  for (const u of urls) {
    if (typeof u === 'string' && HTTPS_URL_RE.test(u)) return u.slice(0, 500)
  }
  return undefined
}

/** Format SOCS performance entry as "rank/total" (e.g. "85/305"). */
function formatSocs(socsPerf: any): string | null {
  if (!socsPerf || typeof socsPerf !== 'object') return null
  const rank = Number(socsPerf.rank)
  const total = Number(socsPerf.total)
  if (!Number.isFinite(rank) || !Number.isFinite(total)) return null
  return `${rank}/${total}`
}

/** Pick head coach name + notable; combine if both present. */
function formatHeadCoach(headCoach: any, coachingStaff: any): string | null {
  const head = headCoach && typeof headCoach === 'object' ? headCoach : null
  if (head?.name && typeof head.name === 'string') {
    const notable = typeof head.notable === 'string' && head.notable.trim().length > 0 ? ` — ${head.notable.trim()}` : ''
    return (head.name + notable).slice(0, 80)
  }
  // Fall back to first coaching_staff entry if no head_coach.
  const staff = Array.isArray(coachingStaff) ? coachingStaff : []
  const first = staff.find((c: any) => c && typeof c.name === 'string' && c.name.trim().length > 0)
  if (first) {
    const role = typeof first.role === 'string' && first.role.trim().length > 0 ? ` (${first.role.trim()})` : ''
    return (first.name + role).slice(0, 80)
  }
  return null
}

/** Pick top N alumni: name + known_for. Returns "Name (known_for); Name (known_for)". */
function formatTopAlumni(alumni: any, n: number): string | null {
  const list = Array.isArray(alumni) ? alumni : []
  const picked: string[] = []
  for (const a of list) {
    if (!a || typeof a.name !== 'string' || a.name.trim().length === 0) continue
    const knownFor = typeof a.known_for === 'string' && a.known_for.trim().length > 0
      ? ` (${a.known_for.trim()})`
      : ''
    picked.push((a.name.trim() + knownFor).slice(0, 60))
    if (picked.length >= n) break
  }
  if (picked.length === 0) return null
  return picked.join('; ').slice(0, 80)
}

/** Pick most relevant cup result. Prefer winner > finalist > other; prefer recent year. */
function formatRecentCup(cupResults: any): string | null {
  const list = Array.isArray(cupResults) ? cupResults : []
  if (list.length === 0) return null
  const RESULT_RANK: Record<string, number> = { winner: 3, finalist: 2, 'semi-finalist': 1 }
  const sorted = [...list]
    .filter((c: any) => c && typeof c.tournament === 'string')
    .sort((a: any, b: any) => {
      const ra = RESULT_RANK[String(a.result || '').toLowerCase()] ?? 0
      const rb = RESULT_RANK[String(b.result || '').toLowerCase()] ?? 0
      if (rb !== ra) return rb - ra
      const ya = Number(a.year) || 0
      const yb = Number(b.year) || 0
      return yb - ya
    })
  if (sorted.length === 0) return null
  const top = sorted[0]
  const yr = top.year ? ` ${top.year}` : ''
  const res = top.result ? ` ${top.result}` : ''
  return `${top.tournament}${yr}${res}`.trim().slice(0, 80)
}

/** Format academy/pathway summary. */
function formatAcademy(academyZone: any, scholarship: any, scholarshipNotes: any): string | null {
  if (academyZone && typeof academyZone === 'object' && typeof academyZone.external_partner === 'string' && academyZone.external_partner.trim().length > 0) {
    return `Academy: ${academyZone.external_partner.trim()}`.slice(0, 80)
  }
  if (scholarship === true) {
    if (typeof scholarshipNotes === 'string' && scholarshipNotes.trim().length > 0) {
      return scholarshipNotes.trim().slice(0, 80)
    }
    return 'Sport scholarship offered'
  }
  return null
}

type FormatterRule = {
  match: RegExp
  format: (p: Record<string, any>) => string | null
}

/** Most-specific rules first (per Codex). */
const RUGBY_RULES: FormatterRule[] = [
  // SOCS rank — must come before any broad 'rank' regex.
  {
    match: /\bsocs\b.*\b(rank|performance)\b/i,
    format: (p) => formatSocs(p?.socs?.performance?.[0]),
  },
  // DMT rank
  {
    match: /\b(dmt|daily\s*mail|trophy)\b.*\b(rank|ranking)\b/i,
    format: (p) => {
      const r = p?.dmt_ranking?.current_rank
      return Number.isFinite(Number(r)) ? String(r) : null
    },
  },
  // Tier / strength / standing — broad match for the tier label
  {
    match: /\b(competitive\s*tier|rugby\s*(strength|standing|tier|grade))\b/i,
    format: (p) => {
      const t = p?.competitive_tier
      return typeof t === 'string' && t.trim().length > 0 ? capitalize(t.trim()) : null
    },
  },
  // Director of rugby / head coach
  {
    match: /\b(director\s*of\s*rugby|head\s*coach|coach)\b/i,
    format: (p) => formatHeadCoach(p?.head_coach, p?.coaching_staff),
  },
  // Notable alumni / pro players
  {
    match: /\b(notable\s*)?alumni|pro\s*player|england\s*international\b/i,
    format: (p) => formatTopAlumni(p?.notable_alumni, 2),
  },
  // Recent results / cups / tournaments / success
  {
    match: /\b(recent|cup|tournament|trophy|success|result)\b/i,
    format: (p) => formatRecentCup(p?.cup_results),
  },
  // Academy / pathway / scholarship
  {
    match: /\b(academy|pathway|scholarship)\b/i,
    format: (p) => formatAcademy(p?.academy_zone, p?.academy_scholarship, p?.academy_scholarship_notes),
  },
  // Team count / number of teams (allow words between "number of" and "teams"
  // so "Number of rugby teams" matches; constrained to ≤ 24 chars between).
  {
    match: /\b(team\s*count|teams\s*visible|number\s*of[\s\w]{0,24}teams|how\s*many[\s\w]{0,24}teams)\b/i,
    format: (p) => {
      const n = p?.school_teams_visible?.value
      return Number.isFinite(Number(n)) ? String(n) : null
    },
  },
]

/**
 * Try to format a single cell from a projection.
 *
 * Returns null when:
 *   - dimension is not 'rugby' (other dims unsupported until their projector lands)
 *   - no rule matches the row_name
 *   - the matched rule's projection field is missing/null
 */
export function formatProjectionCell(
  dimension: string,
  rowName: string,
  projection: Record<string, any> | null | undefined,
): CellOut | null {
  if (!projection || typeof projection !== 'object') return null
  if (dimension !== 'rugby') return null
  const rn = String(rowName || '').toLowerCase()
  if (!rn) return null

  for (const rule of RUGBY_RULES) {
    if (!rule.match.test(rn)) continue
    const value = rule.format(projection)
    if (typeof value !== 'string' || value.length === 0) return null
    const out: CellOut = { value: value.slice(0, 80) }
    const url = pickEvidenceUrl(projection)
    if (url) out.source = url
    return out
  }
  return null
}
