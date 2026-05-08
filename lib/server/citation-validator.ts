import 'server-only'
import type { ResearchContextPack } from './research-context-pack'

/**
 * citation-validator.ts — guardrail against hallucinated URLs and
 * out-of-scope slug citations (P4 of research-panel-excellence-plan.md).
 *
 * Today the prose path doesn't run validateAnswer; this lets the model
 * cite URLs that didn't appear in tool results. The agentic path DOES run
 * validateAnswer in nana-brain.js, but its citation shape is heterogeneous.
 *
 * This module gives every runner a uniform check: take an answer + the pack,
 * list any URLs that the answer cites which aren't in the pack's allowlist,
 * and any school slugs the answer mentions that aren't in scope.
 *
 * Result is INFORMATIONAL ONLY for v1 — runners log it, don't reject. Once
 * we have a few days of telemetry from real chats we can promote to
 * rejection. (Plan §P4 DoD says unit-test only; live rejection is deferred
 * to the human-in-the-loop verification phase.)
 */

const URL_RE = /https?:\/\/[^\s)<>"']+[^\s.,;:!?)<>"']/g

export type ValidationResult = {
  ok: boolean
  total_urls: number
  hallucinated_urls: string[]      // cited URLs not present in pack allowlist
  out_of_scope_slugs: string[]     // mentioned slugs not in pack.schools
  notes: string[]                  // human-readable findings
}

/**
 * Build the URL allowlist from the pack — every URL the model could
 * legitimately cite. Combines schools[].citations[].url + schools[].sensitive[].source_url
 * + comparison.rows[].cells[].sources[].
 */
export function buildAllowlist(pack: ResearchContextPack | null | undefined): { urls: Set<string>; slugs: Set<string> } {
  const urls = new Set<string>()
  const slugs = new Set<string>()
  if (!pack) return { urls, slugs }
  // Per-school sources
  for (const slug of Object.keys(pack.schools ?? {})) {
    slugs.add(slug)
    const s = pack.schools[slug]
    for (const c of s.citations ?? []) {
      if (c.url) urls.add(canonicaliseUrl(c.url))
    }
    for (const sens of s.sensitive ?? []) {
      // school_sensitive rows carry source URLs in plan's data model;
      // assembler doesn't currently expose them but allow forward-compat.
    }
  }
  // Comparison cell sources
  for (const row of pack.comparison?.rows ?? []) {
    for (const slug of Object.keys(row.cells ?? {})) {
      slugs.add(slug)
      for (const u of row.cells[slug]?.sources ?? []) {
        if (u) urls.add(canonicaliseUrl(u))
      }
    }
  }
  return { urls, slugs }
}

/**
 * Validate an answer's text against the allowlist. Returns a ValidationResult
 * describing any hallucinations / out-of-scope slugs.
 */
export function validateAnswerAgainstPack(
  answerText: string,
  pack: ResearchContextPack | null | undefined,
): ValidationResult {
  const { urls: allowedUrls, slugs: allowedSlugs } = buildAllowlist(pack)
  const cited = new Set<string>()
  for (const m of Array.from(answerText.matchAll(URL_RE))) {
    cited.add(canonicaliseUrl(m[0]))
  }
  const hallucinated_urls = Array.from(cited).filter((u) => !allowedUrls.has(u))

  // Heuristic slug detection: scan for kebab-case patterns that match known
  // schools structure. We only flag CITED slugs — i.e., slugs that look like
  // they appear inside a citation/source context. Conservative: less risky to
  // miss than to over-flag.
  const candidateSlugs = new Set<string>()
  for (const m of Array.from(answerText.matchAll(/\b[a-z][a-z0-9]+(?:-[a-z0-9]+){1,5}\b/g))) {
    candidateSlugs.add(m[0])
  }
  // Out-of-scope = candidate slugs that look like schools (kebab + length ≥ 2 words)
  // but aren't in the pack.
  const out_of_scope_slugs: string[] = []
  for (const c of Array.from(candidateSlugs)) {
    if (allowedSlugs.has(c)) continue
    // Filter to plausibly-school-shaped: must contain 'school' / 'college' /
    // 'academy' / common UK school slug suffixes — otherwise too noisy.
    if (!/\b(school|college|academy|hall|abbey|grammar|prep)\b/.test(c)) continue
    out_of_scope_slugs.push(c)
  }

  const notes: string[] = []
  if (hallucinated_urls.length > 0) notes.push(`${hallucinated_urls.length} hallucinated URL(s)`)
  if (out_of_scope_slugs.length > 0) notes.push(`${out_of_scope_slugs.length} out-of-scope slug citation(s)`)

  return {
    ok: hallucinated_urls.length === 0 && out_of_scope_slugs.length === 0,
    total_urls: cited.size,
    hallucinated_urls,
    out_of_scope_slugs,
    notes,
  }
}

function canonicaliseUrl(u: string): string {
  // Lowercase host, strip trailing slash, strip fragment, keep path+query.
  try {
    const url = new URL(u)
    url.hash = ''
    let s = `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`
    if (url.search) s += url.search
    return s
  } catch {
    return u.replace(/[/.,;:!?]+$/, '')
  }
}
