// Tab A Step 10 v2 Commit 3 (2026-05-26). Pure projection helper for
// school_pdfs rows → compact `{title, url}[]` for the chatbot context pack.
//
// Same .mjs-imported-from-.ts pattern as project-meta-fees.mjs.
//
// Why a whitelist+exclude filter instead of "newest N":
//   Pre-flight DB check on 2026-05-26 found that most UK schools' PDF
//   archives are bureaucratic policy dumps (Fire Risk Assessment, GDPR,
//   Health & Safety, Privacy Policy, …). Surfacing those to Nana would
//   mean she'd offer parents "their Health-and-Safety Policy 2025-26"
//   instead of "their prospectus." Cheaper to render no PDF block at all
//   than render the wrong thing.
//
//   Whitelist matches parent-facing doc keywords; exclude rejects policy
//   noise even if a whitelist word slips through ("Admissions Policy"
//   has both "admissions" and "policy" — we want to drop it).
//
// Codex r1 P1 (security): titles/URLs are sanitized to strip control
// characters that would otherwise let DB content break the per-school
// line in the prompt and inject fake instructions.

const PARENT_RELEVANT_RE = /prospectus|brochure|fees|scholarship|bursary|admissions|curriculum|handbook|open[- ]?day|application/i

// Codex r1 P2 + bonus: expanded after r1 found schools mix admission /
// application names with bureaucratic dumps. Each excluded family was
// chosen because: parent-irrelevant + appears in real DB rows.
const EXCLUDE_RE = /policy|risk[- ]?assessment|complaints?|anti[- ]?bullying|behavio(u)?r|equality|data[- ]?protection|cookie|medical|attendance|exclusions?|safeguarding|safety|first[- ]?aid|\bfire\b|accessibility|gdpr|privacy|gender[- ]?pay|terms[- ]?and[- ]?conditions|code[- ]?of[- ]?conduct/i

const PDF_CAP = 4

// Strip control characters + collapse whitespace before any string
// lands in the prompt. Embedded \n in a filename or URL would
// otherwise break the per-school line.
function sanitizeForPrompt(s) {
  // \uHHHH form keeps the source readable without the Unicode `u` flag
  // (ES2018+). Strips C0 controls (NUL through US) + DEL.
  return s.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Project an array of school_pdfs rows into `{title, url}[]` for the pack.
 * Returns null when no row survives the whitelist+exclude filter.
 *
 * @param {Array<{filename?: unknown, url?: unknown, readable?: unknown, status?: unknown}> | null | undefined} rows
 * @returns {Array<{title: string, url: string}> | null}
 */
export function projectSchoolPdfs(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null

  const out = []
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    if (r.readable !== true) continue
    if (r.status !== 'ingested') continue
    const rawFilename = typeof r.filename === 'string' ? r.filename : ''
    if (!rawFilename) continue
    if (EXCLUDE_RE.test(rawFilename)) continue
    if (!PARENT_RELEVANT_RE.test(rawFilename)) continue
    // Codex r1 P1: URL must parse via WHATWG URL AND contain no
    // whitespace/control chars (an embedded \n in the URL would break
    // the prompt line). http/https only.
    const rawUrl = typeof r.url === 'string' ? r.url : ''
    if (!rawUrl || /\s/.test(rawUrl)) continue
    let safeUrl
    try {
      const u = new URL(rawUrl)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      // Codex r2 Q4: reject userinfo URLs.
      if (u.username || u.password) continue
      safeUrl = u.toString()
    } catch {
      continue
    }
    const title = titleFromFilename(rawFilename)
    if (!title) continue
    out.push({ title, url: safeUrl })
    if (out.length >= PDF_CAP) break
  }
  return out.length > 0 ? out : null
}

/**
 * Turn a filename like "15a-Music-Scholarship-Leaflet-2026.pdf" into
 * "Music Scholarship Leaflet". Strips numeric prefix, year suffix, and
 * separators. Sanitises control chars (Codex r1 P1) so a malicious
 * filename can't break the prompt line.
 *
 * @param {string} filename
 * @returns {string}
 */
export function titleFromFilename(filename) {
  let t = sanitizeForPrompt(String(filename)).replace(/\.pdf$/i, '')
  // Strip leading "15a-" / "3b-" style numeric+alpha prefix.
  t = t.replace(/^\d+[a-z]?[-_]/i, '')
  // Strip year + version suffix like "-2025-26-Final-Signed" or "-2025-V2"
  // or "-2025". Up to 4 trailing "-tag" segments after the year.
  t = t.replace(/[-_]20\d{2}([-_](?:\d{1,2}|V\d+|Final|Signed|WEB))*\s*$/i, '')
  // Normalise separators.
  t = t.replace(/[-_]+/g, ' ').trim()
  // Collapse runs of spaces.
  t = t.replace(/\s{2,}/g, ' ')
  if (!t) return ''
  return t.length > 80 ? t.slice(0, 79).trimEnd() + '…' : t
}
