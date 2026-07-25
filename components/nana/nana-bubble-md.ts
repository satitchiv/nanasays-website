/**
 * Pure markdown parsing helpers for NanaBubble's renderMd().
 *
 * Extracted from NanaBubble.tsx so node test runner can import without JSX
 * transform (.tsx requires React JSX runtime; .ts doesn't). Co-located rather
 * than placed in lib/ because the only consumer is NanaBubble.tsx.
 *
 * Bug history that drove the extraction:
 * - Original regex /(\*\*[^*]+\*\*)/g in NanaBubble.tsx forbade any `*` inside
 *   bold content. Failed on A-level notation like `**92% A-level A*-A**`
 *   because the `*` in `A*-A` broke the match — parents saw literal asterisks
 *   render in the verdict's "Why this fits" prose.
 * - Fixed regex /(\*\*[^\n]+?\*\*)/g — non-greedy match across any chars
 *   except newlines. Allows single `*` inside (A*-A) while still terminating
 *   at the first `**`. Multiple bold spans per line still work because the
 *   non-greedy quantifier stops at the FIRST closing `**`.
 */

export type MdSegment = { text: string; bold: boolean }

export function parseInlineBold(line: string): MdSegment[] {
  // split() with a capture-group regex includes the captured matches in the
  // output array, so adjacent plain text + bold + plain text falls out as
  // ['plain1', '**bold**', 'plain2'].
  const parts = line.split(/(\*\*[^\n]+?\*\*)/g)
  return parts.map(p =>
    p.startsWith('**') && p.endsWith('**') && p.length >= 4
      ? { text: p.slice(2, -2), bold: true }
      : { text: p, bold: false },
  )
}
