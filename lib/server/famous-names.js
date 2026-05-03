/**
 * famous-names.js
 *
 * Bare-form aliases for famous one-word school names that detectMentionedSlugs
 * (in nana-brain.js) skips on purpose:
 *   - Words shorter than 5 chars (filters out "eton")
 *   - Single distinctive word (filters out "harrow")
 * Both filters exist to avoid false positives like "worth" / "reading".
 * This curated table accepts the bare form for a small set of unambiguous
 * famous names where the false-positive risk is hand-checked.
 *
 * Always-merge contract: callers pass the existing slug list from
 * detectMentionedSlugs and we merge famous-name hits in question-position
 * order, capping at 4 to match the rest of the routing pipeline. Running
 * only on an empty list (the previous behaviour) missed cases like
 * "Compare Wycombe Abbey and Eton" where the primary detector found Wycombe
 * Abbey via the 2-word rule but Eton was below the 5-char filter.
 */

export const FAMOUS_SHORT_NAMES = Object.freeze({
  eton:         'eton-college',
  harrow:       'harrow-school',
  charterhouse: 'charterhouse',
  marlborough:  'marlborough-college',
  sherborne:    'sherborne-school',
  stowe:        'stowe-school',
  uppingham:    'uppingham-school',
  winchester:   'winchester-college',
  malvern:      'malvern-college',
  ampleforth:   'ampleforth-college',
  radley:       'radley-college',
  tonbridge:    'tonbridge-school',
  // Reed's: known DB duplicate (reeds-school is empty, reeds-school-uk has data
  // per schools_status.has_substantial_chunks). Point at the data-rich slug.
  // See memory reference_known_slug_duplicates.
  reeds:        'reeds-school-uk',
  bedales:      'bedales',
});

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * expandFamousShortNames(question, existing)
 *
 * Merges the existing slug list (from detectMentionedSlugs) with any
 * famous-short-name hits in the question. Famous hits are sorted by their
 * position in the question (so the 4-cap preserves user order, not
 * dictionary order) and appended after existing hits.
 *
 * @param {string}   question  raw question text
 * @param {string[]} existing  slugs already detected upstream
 * @returns {string[]}         merged + dedup + cap-4 slug list
 */
export function expandFamousShortNames(question, existing = []) {
  const safeExisting = Array.isArray(existing) ? existing.filter(Boolean) : [];
  if (typeof question !== 'string' || !question) return safeExisting.slice(0, 4);

  // Strip apostrophes BEFORE word-boundary matching so "Reed's" → "reeds"
  // (the apostrophe acts as a word boundary, blocking `\breeds\b` from
  // matching "reed's" otherwise). Codex P1: include both ASCII (U+0027)
  // and curly (U+2018, U+2019) — typed values can render identically but
  // have different codepoints.
  const lower = question.toLowerCase().replace(/['‘’]/g, '');
  const hits = [];
  for (const [name, slug] of Object.entries(FAMOUS_SHORT_NAMES)) {
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    const m = re.exec(lower);
    if (m) hits.push({ slug, index: m.index });
  }
  hits.sort((a, b) => a.index - b.index);

  const merged = new Set(safeExisting);
  for (const h of hits) {
    if (merged.size >= 4) break;
    merged.add(h.slug);
  }
  return [...merged];
}
