// rr-8-build3-sibling-gender-year chat-quality (2026-05-21) —
// deterministic safety-net parser for sibling-basics answers.
//
// Why this exists. Browser smoke surfaced that the LLM occasionally
// emits null for child_gender / child_year even when the parent's
// answer is a clear fragment ("year 9", "son"). The LLM's strict-
// structured-output bias toward null + bullet-style extraction
// guidance buried in the question text makes it cautious. Codex's
// pithy framing: "the difference between 'the model should remember'
// and 'the product definitely remembers'."
//
// This parser runs alongside the LLM extraction. The merge layer
// invokes it; if the LLM emitted null for a basic but the parser
// found a clear value, the parser wins. If the LLM extracted a value
// AND the parser matches, no change (LLM already got it). If they
// disagree, the LLM wins (LLM has more context for ambiguous prose).
//
// Pure functions, no dependencies on schemas at import-time. Tests
// in sibling-basics-parser.test.mjs.

import type { BuildModeExtractionHTTP } from './build-mode-schemas.ts'

type ChildGender = NonNullable<BuildModeExtractionHTTP['child_gender']>
type ChildYear   = NonNullable<BuildModeExtractionHTTP['child_year']>

export type SiblingBasicsParseInput = {
  /** Lowercased + trimmed user message text. */
  userMessage: string
  /**
   * The PRIOR Nana turn's prose (lowercased + trimmed), used to gate
   * bare numeric answers like "9" — only count as a year when the
   * last Nana question explicitly asked about year. Pass null if
   * there's no prior Nana turn (first turn in session).
   */
  lastNanaProse: string | null
}

export type SiblingBasicsParseResult = {
  /** Extracted gender, only set when the parser is confident. */
  child_gender: ChildGender | null
  /** Extracted year, only set when the parser is confident. */
  child_year:   ChildYear | null
}

// ── Pattern catalogues ───────────────────────────────────────────────
//
// Each map's keys are normalized (lowercase, single-spaced) substrings
// to look for. Word-boundary regex on the user message is applied per
// entry so "year 12" doesn't false-positive on a longer "year 120" run.
// Order matters within a category: longer / more specific patterns
// first so "sixth form" beats "form", "year 12" beats bare "12", etc.

// Codex r7 NIT.1: `y\s*N` (with optional space) covers both "y9"
// and "Y 9" — the user's first smoke had `Y 9` in mind but the prior
// regex was `y9` only. Same for `yr\s*N`.
const YEAR_PATTERNS: ReadonlyArray<[RegExp, ChildYear]> = [
  // Sixth Form first — covers Y12/Y13 + traditional sixth-form phrasings.
  [/\b(?:sixth\s*form|6th\s*form|lower\s*sixth|upper\s*sixth|l6|u6)\b/i,        'sixth-form'],
  [/\b(?:year\s*12|y\s*12|yr\s*12|12th\s*(?:year|grade))\b/i,                   'sixth-form'],
  [/\b(?:year\s*13|y\s*13|yr\s*13|13th\s*(?:year|grade))\b/i,                   'sixth-form'],
  // Year 10 — must come BEFORE Year 1 because "year 10" contains "year 1".
  [/\b(?:year\s*10|y\s*10|yr\s*10|10th\s*(?:year|grade))\b/i,                   'year-10'],
  // Year 9.
  [/\b(?:year\s*9|y\s*9|yr\s*9|9th\s*(?:year|grade)|ninth(?:\s*year)?)\b/i,     'year-9'],
  // Year 7.
  [/\b(?:year\s*7|y\s*7|yr\s*7|7th\s*(?:year|grade)|seventh(?:\s*year)?)\b/i,   'year-7'],
  // Deflections.
  [/\b(?:not\s*sure|don['’]?t\s*know|dunno|unclear|undecided|tbc|tbd|depends)\b/i, 'not-sure'],
]

// Two-tier gender patterns (Codex r7 P2.2):
//
//   GENDER_PATTERNS_STRONG fire ALWAYS — these are unambiguous answers
//   to a son/daughter question and very unlikely to false-positive
//   ("son", "boy", "daughter", "girl", "either", "skip"…). The
//   parser-prompt mismatch Codex caught was that the prior regex had
//   `she['’]?s` (only "she's", not bare "she"); strong patterns still
//   intentionally exclude bare pronouns to avoid casual mentions
//   ("she does ballet") corrupting gender.
//
//   GENDER_PATTERNS_PRONOUN fire ONLY when the prior Nana prose asked
//   about gender. Bare "she" / "he" / "him" answers ARE valid when
//   the parent is replying to "is yoyo your son or daughter?", but
//   would be too aggressive when applied to e.g. an interests turn
//   where the parent mentions "she does ballet".
const GENDER_PATTERNS_STRONG: ReadonlyArray<[RegExp, ChildGender]> = [
  // "boy" first so it matches before any of the deflection words that
  // mention "boys" / "either" / etc.
  [/\b(?:son|boy|lad|male|he['’]s|his)\b/i,    'boy'],
  [/\b(?:daughter|girl|lass|female|she['’]s|her)\b/i, 'girl'],
  // Deflections / open.
  [/\b(?:either|both|no\s*preference|doesn['’]?t\s*matter|don['’]?t\s*mind|open|co[-\s]?ed\s*only|show\s*me\s*both|keep\s*it\s*open)\b/i, 'either'],
  // Skip/refusal → mark as 'either' so the gate advances (no filter
  // applied to recommendations). Aligns with the prompt's DEFLECTION
  // mapping ("skip" → either).
  [/\b(?:skip|rather\s*not\s*say|leave\s*it\s*blank|next\s*question|pass|n\/a)\b/i, 'either'],
]

// Bare pronouns — only safe when context confirms Nana just asked
// about gender. See ASKED_ABOUT_GENDER_RE below.
const GENDER_PATTERNS_PRONOUN: ReadonlyArray<[RegExp, ChildGender]> = [
  [/\b(?:he|him)\b/i, 'boy'],
  [/\bshe\b/i,        'girl'],
]

const BARE_NUMBER_TO_YEAR: Readonly<Record<string, ChildYear>> = {
  '7':  'year-7',
  '9':  'year-9',
  '10': 'year-10',
  '12': 'sixth-form',
  '13': 'sixth-form',
}

// Did the LAST Nana turn ask about year group? Used to gate bare
// numeric answers like "9" → 'year-9'. Without this gate, a parent
// who says "I have 7 kids" or "she's been there 10 years" would get
// year mis-parsed. Codex r7 NIT.2 acknowledged the current set as
// sufficient; widening kept conservative to avoid false positives.
const ASKED_ABOUT_YEAR_RE   = /\b(?:year\s*group|what\s*year|which\s*year|going\s*into\s*year|school\s*year|entry\s*year|entering)\b/i

// Did the last Nana turn ask about gender? Gates GENDER_PATTERNS_PRONOUN
// so bare "she" / "he" / "him" only count as gender answers when the
// parent is genuinely replying to a gender question. Otherwise an
// off-topic "she sees a tutor" would mis-fire on an interests turn.
const ASKED_ABOUT_GENDER_RE = /\b(?:son\s*or\s*(?:a\s*)?daughter|boy\s*or\s*girl|son\/daughter|gender|girls?\s*and\s*boys|boys?\s*and\s*girls)\b/i

// ── Main entry ───────────────────────────────────────────────────────

/**
 * Parse a parent message for sibling-basics answers. Returns each
 * field as null unless the parser is CONFIDENT — false positives
 * here would write wrong data into the child profile, which is
 * worse than the LLM occasionally missing a value (the LLM has the
 * full DEFLECTION instructions to catch what the parser doesn't).
 *
 * Confidence rules:
 *   - Year: matches one of YEAR_PATTERNS, OR is a bare number whose
 *     value is in BARE_NUMBER_TO_YEAR AND the prior Nana turn asked
 *     about year (so "9" alone counts only when contextual).
 *   - Gender: matches one of GENDER_PATTERNS. Pronoun-only matches
 *     ("she", "him") are confident because the patterns include them
 *     directly; the user is replying to Nana's chat, so a bare pronoun
 *     IS the answer.
 */
export function parseSiblingBasicsAnswer(input: SiblingBasicsParseInput): SiblingBasicsParseResult {
  const msg = (input.userMessage ?? '').trim()
  if (msg.length === 0) {
    return { child_gender: null, child_year: null }
  }
  const lastProse = (input.lastNanaProse ?? '').trim()
  const askedAboutYear   = ASKED_ABOUT_YEAR_RE.test(lastProse)
  const askedAboutGender = ASKED_ABOUT_GENDER_RE.test(lastProse)

  // ── Year extraction ──
  let child_year: ChildYear | null = null
  for (const [pattern, value] of YEAR_PATTERNS) {
    if (pattern.test(msg)) {
      child_year = value
      break
    }
  }
  // Bare-number fallback — only when the prior Nana turn asked about year.
  if (child_year == null && askedAboutYear) {
    const bareMatch = msg.match(/^\s*(\d{1,2})\s*\.?\s*$/)
    if (bareMatch) {
      const mapped = BARE_NUMBER_TO_YEAR[bareMatch[1]]
      if (mapped) child_year = mapped
    }
  }

  // ── Gender extraction ──
  // Strong patterns fire always. Pronoun-only patterns ("she", "he",
  // "him") fire ONLY when the prior Nana prose asked about gender —
  // Codex r7 P2.2 — otherwise "she does ballet" on an interests turn
  // would mis-fire as gender.
  let child_gender: ChildGender | null = null
  for (const [pattern, value] of GENDER_PATTERNS_STRONG) {
    if (pattern.test(msg)) {
      child_gender = value
      break
    }
  }
  if (child_gender == null && askedAboutGender) {
    for (const [pattern, value] of GENDER_PATTERNS_PRONOUN) {
      if (pattern.test(msg)) {
        child_gender = value
        break
      }
    }
  }

  return { child_gender, child_year }
}
