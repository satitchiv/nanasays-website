import 'server-only'

/**
 * pack-redactors.ts — privacy primitives for the Research Context Pack.
 *
 * Pure functions, no I/O. Every value that goes into the pack must pass
 * through one of these so a future Claude (or a stray console.log) cannot
 * leak free-text PII or child-identifying info into a model prompt.
 *
 * Design (per ~/notes/research-panel-excellence-plan.md §6):
 *   - whitelist > deny-list — caller specifies what to KEEP
 *   - never strips a value into a misleading shorter form (we either keep or null)
 *   - PII detectors are conservative: false positives are fine (over-redaction
 *     is safe), false negatives leak data
 *
 * No model calls. No DB calls. No imports beyond stdlib + 'server-only'.
 */

// ── Patterns ───────────────────────────────────────────────────────────────
// Conservative PII detectors. Each is intentionally over-broad.

const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g
const UK_PHONE_RE = /\b(?:\+?44\s?(?:\(0\))?\s?\d{2,4}|0\d{2,4})\s?\d{3,4}\s?\d{3,4}\b/g
const UK_POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g

// Redact obvious child first-names if a known-name list is provided. We don't
// keep a global list — the caller passes the child's name(s) so we can blank
// them in free text. If no name passed, no redaction happens for names.

// ── Public functions ───────────────────────────────────────────────────────

/**
 * Strip emails / UK phone numbers / UK postcodes / explicit child names
 * from a free-text string. Replacement is a fixed-width sentinel so the
 * model knows something was redacted (not silently dropped).
 *
 * Use this on every free-text field that could carry PII before it lands
 * in the pack: comparison row notes, partner brief snippets, recent message
 * tails, child profile signals.
 */
export function redactPii(input: string | null | undefined, opts: { childNames?: string[] } = {}): string {
  if (!input) return ''
  let s = String(input)
  s = s.replace(EMAIL_RE, '[email]')
  s = s.replace(UK_PHONE_RE, '[phone]')
  s = s.replace(UK_POSTCODE_RE, '[postcode]')
  if (opts.childNames && opts.childNames.length > 0) {
    for (const name of opts.childNames) {
      const trimmed = String(name).trim()
      if (!trimmed || trimmed.length < 2) continue
      // Word-boundary match, case-insensitive. We escape regex metachars.
      const safe = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`\\b${safe}\\b`, 'gi')
      s = s.replace(re, '[child]')
    }
  }
  return s
}

/**
 * Reduce a `children.child_profile` JSONB row to a minimised summary suitable
 * for the pack. Per plan §6.3, ONLY:
 *   - age_band derived from DOB (never DOB itself)
 *   - gender_pref_for_school
 *   - top 5 fit_signals (PII-stripped)
 *   - top 5 dealbreakers (PII-stripped)
 *
 * Anything else in the JSONB is dropped on the floor.
 */
export type MinimisedChild = {
  id: string
  age_band: '4-6' | '7-10' | '11-13' | '14-16' | '17-18' | 'unknown'
  gender_pref_for_school: 'boys' | 'girls' | 'co-ed' | null
  fit_signals: string[]
  dealbreakers: string[]
}

export function minimiseChildProfile(input: {
  id: string
  date_of_birth?: string | null
  child_profile?: Record<string, unknown> | null
  name?: string | null
}): MinimisedChild {
  const profile = (input.child_profile ?? {}) as Record<string, unknown>
  const childNames = input.name ? [input.name] : []

  const age_band = ageBandFromDob(input.date_of_birth ?? null)

  const rawGenderPref = (profile.gender_pref_for_school ??
    profile.school_gender ??
    profile.gender_preference ??
    null) as string | null
  const gender_pref_for_school = (() => {
    if (!rawGenderPref) return null
    const v = String(rawGenderPref).toLowerCase()
    if (v.startsWith('boy')) return 'boys' as const
    if (v.startsWith('girl')) return 'girls' as const
    if (v.startsWith('co') || v === 'mixed') return 'co-ed' as const
    return null
  })()

  const fit_signals = takeTopN(profile.fit_signals ?? profile.preferences ?? [], 5).map((s) =>
    redactPii(s, { childNames }),
  )
  const dealbreakers = takeTopN(profile.dealbreakers ?? profile.must_avoid ?? [], 5).map((s) =>
    redactPii(s, { childNames }),
  )

  return { id: input.id, age_band, gender_pref_for_school, fit_signals, dealbreakers }
}

/**
 * Whitelist a `comparison_rows.cell_data` cell to ONLY safe fields per
 * plan §6.2. Specifically: keep `value`, `score`, `sources` (max 3 URL
 * strings). Drop `note` / `justification` / `internal_*` unconditionally.
 */
export type SafeCell = {
  value: string | number | null
  score: number | null
  sources: string[]
}

export function safeCell(cell: Record<string, unknown> | null | undefined): SafeCell {
  if (!cell || typeof cell !== 'object') return { value: null, score: null, sources: [] }
  // Codex 2026-05-08: runtime-check value type. Earlier version cast unknown
  // to string|number which let object-valued payloads through (e.g. `{secret}`).
  // Now: only string/number/null pass; everything else becomes null.
  const valueRaw = cell.value
  const value: string | number | null =
    typeof valueRaw === 'string'
      ? valueRaw.slice(0, 500) // also cap length defensively
      : typeof valueRaw === 'number' && Number.isFinite(valueRaw)
        ? valueRaw
        : null
  const scoreRaw = cell.score as unknown
  const score = typeof scoreRaw === 'number' && Number.isFinite(scoreRaw) ? scoreRaw : null
  // sources — accept array of strings OR single string
  let sources: string[] = []
  const src = cell.sources ?? cell.source ?? null
  if (Array.isArray(src)) {
    sources = src
      .filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
      .slice(0, 3)
  } else if (typeof src === 'string' && /^https?:\/\//.test(src)) {
    sources = [src]
  }
  return { value, score, sources }
}

/**
 * Sanitize a recent-messages list. Keeps:
 *   - role
 *   - PII-stripped content (truncated to 400 chars per turn)
 *   - 1-line proposed_actions summary (NOT raw JSON)
 *   - turn_idx / timestamp
 */
export type SafeRecentMessage = {
  role: 'user' | 'assistant'
  content: string
  proposed_actions_summary: string | null
  turn_idx: number
  timestamp: string
}

export function safeRecentMessages(
  raw: Array<{
    role?: string
    question?: string | null
    content?: string | null
    parsed_answer?: any
    actions?: any
    created_at?: string
    turn_idx?: number
  }>,
  opts: { childNames?: string[] } = {},
): SafeRecentMessage[] {
  return raw.map((m, i) => {
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    // For DB rows from research_session_messages, we have question + parsed_answer.
    // For freshly-built rows from the route, we have role + content.
    const contentRaw = (m.content ??
      (role === 'user' ? m.question : answerPreview(m.parsed_answer)) ??
      '') as string
    const content = redactPii(contentRaw, opts).slice(0, 400)
    const proposed_actions_summary = summariseActions(m.actions ?? m.parsed_answer?.proposed_actions)
    return {
      role,
      content,
      proposed_actions_summary,
      turn_idx: typeof m.turn_idx === 'number' ? m.turn_idx : i,
      timestamp: typeof m.created_at === 'string' ? m.created_at : new Date(0).toISOString(),
    }
  })
}

// ── Internals ──────────────────────────────────────────────────────────────

function ageBandFromDob(dob: string | null): MinimisedChild['age_band'] {
  if (!dob) return 'unknown'
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return 'unknown'
  const ageYears = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  if (ageYears < 7) return '4-6'
  if (ageYears < 11) return '7-10'
  if (ageYears < 14) return '11-13'
  if (ageYears < 17) return '14-16'
  return '17-18'
}

function takeTopN(input: unknown, n: number): string[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .slice(0, n)
}

function summariseActions(actions: unknown): string | null {
  if (!actions) return null
  const arr = Array.isArray(actions) ? actions : null
  if (!arr || arr.length === 0) return null
  const kinds = arr
    .map((a) => (a && typeof a === 'object' ? String((a as any).kind ?? '') : ''))
    .filter(Boolean)
  if (kinds.length === 0) return null
  // Keep it as a 1-line tally, never the raw payloads.
  const tally: Record<string, number> = {}
  for (const k of kinds) tally[k] = (tally[k] ?? 0) + 1
  return Object.entries(tally)
    .map(([k, n]) => `${k}×${n}`)
    .join(', ')
}

function answerPreview(parsed: any): string {
  if (!parsed || typeof parsed !== 'object') return ''
  if (parsed.format === 'prose_v1' && typeof parsed.prose === 'string') {
    return parsed.prose.slice(0, 400)
  }
  if (parsed.sections?.short_answer) return String(parsed.sections.short_answer)
  return ''
}

// ── Token estimation (char/3.5 heuristic per plan §6.5) ───────────────────

/**
 * Rough token estimate. Plan §6.5 says use char-count / 3.5 as a cheap
 * proxy; tokenize via tiktoken only when we're within 5% of the cap.
 */
export function estimateTokens(s: unknown): number {
  if (s === null || s === undefined) return 0
  const str = typeof s === 'string' ? s : JSON.stringify(s)
  return Math.ceil(str.length / 3.5)
}
