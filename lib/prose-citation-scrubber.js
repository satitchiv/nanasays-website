/**
 * lib/prose-citation-scrubber.js
 *
 * Pure (no transport / no DB / no server-only deps) helpers for cleaning
 * `[source](URL)` markdown out of model-produced prose. Shared by:
 *   - lib/server/prose-runner.js  (server-side, post-extractMeta, STRICT mode)
 *   - components/nana/NanaBubble.tsx (client-side, mid-stream, LAX mode)
 *
 * Lives at the top of `lib/` (not `lib/server/`) so a 'use client' component
 * can import it. Adding any server-only dep here will break the client
 * import — keep this module pure.
 *
 * 2026-05-25 PM extraction (Codex r5 P1.2 endorsed): scrubInvalidCitations
 * was inline in prose-runner.js when it landed for the proximity slice. The
 * server scrub catches fake URLs in the FINAL payload, but the client sees
 * the stream as it arrives — for ~1s mid-stream parents saw bogus
 * `[source](https://rankSchools)` text flash before the final payload
 * arrived clean. Sharing the helper lets the bubble apply the SAME
 * deterministic strip on `streamBuf` as the runner applies on the final
 * prose, so the flash disappears.
 *
 * MODE DISTINCTION
 *
 *   STRICT (`scrubInvalidCitations`) — server-side, post-extract. The
 *   caller has the trusted allowedUrls set (citation provenance from the
 *   agentic loop). ANY inline `[source](X)` not in the allow-list OR with
 *   a forbidden-host (tool name like "rankSchools") is stripped.
 *
 *   LAX (`scrubForbiddenCitations`) — client-side, mid-stream. The bubble
 *   doesn't have the final citations list yet (the meta block arrives at
 *   the end). We can only strip URLs we KNOW are bogus — i.e. those whose
 *   host matches FORBIDDEN_CITATION_HOSTS (tool names). Real URLs are
 *   passed through until the final payload arrives and the chip strip
 *   re-renders with validated citations.
 */

// Inline `[source](X)` matcher — captures both shapes the model produces:
//   - Parenthesized form: "Eton is X ([source](...))" → typical
//   - Bare form:          "Eton [source](...)"        → Codex r3 P1
// Codex r4 P1.1: regex captures ANY non-space, non-paren target inside the
// `()` — not just `https?://`. The replacer validates the target via
// `new URL()` and drops non-URL shapes like `[source](slug-name)` or
// `[source](rankSchools)` (which the system-prompt forbids but the earlier
// https-only regex didn't catch at all). Outer "(...)" wrapper stays
// optional. Leading whitespace + whole match consumed when invalid so
// trailing punctuation stays clean.
export const INLINE_SOURCE_RE = /\s*\(?\[source\]\(([^\s)]+)\)\)?/gi;

// Tool names the agentic loop exposes — when the model accidentally writes
// one as a citation host, that's always wrong. Lower-case for case-insensitive
// comparison against `new URL(x).hostname.toLowerCase()`.
export const FORBIDDEN_CITATION_HOSTS = new Set([
  'rankschools',
  'getschoolfacts',
  'compareschools',
  'filterschools',
  'searchschooltext',
  'searchsafeguarding',
]);

/**
 * STRICT scrub — used server-side post-extractMeta. Drops every inline
 * `[source](URL)` whose URL is NOT in the trusted allow-list, OR whose host
 * is a tool name. Empty allowedUrls means "strip ALL inline citations"
 * (Codex r2 P1 strict semantics: when tools returned no URLs, the model
 * MUST NOT cite anything).
 *
 * @param {string} prose
 * @param {Set<string>|string[]} allowedUrls
 * @returns {string}
 */
export function scrubInvalidCitations(prose, allowedUrls) {
  if (typeof prose !== 'string' || prose.length === 0) return prose;
  const allowed = allowedUrls instanceof Set
    ? allowedUrls
    : new Set((Array.isArray(allowedUrls) ? allowedUrls : []).map(u => String(u)));
  return prose.replace(INLINE_SOURCE_RE, (match, url) => {
    let host = '';
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      // Malformed URL — drop the whole citation.
      return '';
    }
    if (FORBIDDEN_CITATION_HOSTS.has(host)) return '';
    // Strict allow-list — every URL MUST be in the tools' citations.
    if (!allowed.has(url)) return '';
    // Preserve original shape (parenthesized OR bare) — don't reformat.
    return match;
  });
}

/**
 * LAX scrub — used client-side on mid-stream `streamBuf`. The bubble doesn't
 * have the final allow-list yet (meta arrives at the end of the stream), so
 * we can't enforce strict allowlist semantics here. But we CAN drop the
 * tool-name hosts deterministically — those are always bogus regardless of
 * what the final allow-list will contain. Real URLs pass through; once the
 * stream finishes, the bubble re-renders from `parsed.prose` (already
 * server-scrubbed via scrubInvalidCitations).
 *
 * Also drops malformed `[source](X)` shapes (non-URL targets like
 * `[source](slug-name)`) for the same reason: those can never become
 * valid in the final payload.
 *
 * @param {string} prose
 * @returns {string}
 */
export function scrubForbiddenCitations(prose) {
  if (typeof prose !== 'string' || prose.length === 0) return prose;
  return prose.replace(INLINE_SOURCE_RE, (match, url) => {
    let host = '';
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      // Malformed URL — drop the whole citation (it can never validate later).
      return '';
    }
    if (FORBIDDEN_CITATION_HOSTS.has(host)) return '';
    // Real-looking URL — leave it. Final payload will re-render with strict
    // allow-list applied server-side.
    return match;
  });
}
